const { getDb } = require('../../storage/sqlite');
const { HttpError } = require('../../core/errors/httpError');
const llmService = require('../llm/llm.service');
const projectsService = require('../projects/projects.service');

const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES = ['open', 'in_progress', 'done'];

function validatePriority(priority) {
  if (!priority || !VALID_PRIORITIES.includes(priority)) {
    throw new HttpError(400, `priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  return priority;
}

function validateStatus(status) {
  if (!status || !VALID_STATUSES.includes(status)) {
    throw new HttpError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  return status;
}

function getTimestamp() {
  return Date.now();
}

// ==================== BOARDS ====================

function getAllBoards() {
  const db = getDb();
  const boards = db.prepare('SELECT * FROM kanban_boards ORDER BY created_at DESC').all();
  return { items: boards };
}

function getBoardById(boardId) {
  const db = getDb();
  const board = db.prepare('SELECT * FROM kanban_boards WHERE id = ?').get(boardId);
  if (!board) {
    throw new HttpError(404, 'board not found');
  }
  return board;
}

function createBoard(data) {
  const db = getDb();
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new HttpError(400, 'name is required');
  }
  
  // Check project status if projectId is provided
  if (data.projectId) {
    const projectStatus = projectsService.checkProjectStatus(data.projectId);
    if (projectStatus.isCompleted) {
      throw new HttpError(403, 'cannot create board in a completed project');
    }
  }

  const result = db.prepare(`
    INSERT INTO kanban_boards (name, description, project_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(data.name.trim(), data.description || null, data.projectId || null, getTimestamp());

  return getBoardById(result.lastInsertRowid);
}

function deleteBoard(boardId) {
  const db = getDb();
  const board = getBoardById(boardId);
  
  db.prepare('DELETE FROM kanban_boards WHERE id = ?').run(boardId);
  return { success: true, deletedId: boardId };
}

// ==================== COLUMNS ====================

function getColumnsByBoard(boardId) {
  const db = getDb();
  getBoardById(boardId);
  
  const columns = db.prepare(`
    SELECT * FROM kanban_columns 
    WHERE board_id = ? 
    ORDER BY position ASC
  `).all(boardId);
  
  return { items: columns };
}

function createColumn(data) {
  const db = getDb();
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new HttpError(400, 'name is required');
  }
  
  if (!data.boardId || isNaN(Number(data.boardId))) {
    throw new HttpError(400, 'boardId is required');
  }
  
  getBoardById(data.boardId);
  
  const maxPosition = db.prepare(`
    SELECT COALESCE(MAX(position), 0) as maxPos 
    FROM kanban_columns 
    WHERE board_id = ?
  `).get(data.boardId);
  
  const position = data.position !== undefined ? Number(data.position) : maxPosition.maxPos + 1;
  const autoExecute = data.autoExecute ? 1 : 0;
  
  const result = db.prepare(`
    INSERT INTO kanban_columns (board_id, name, position, auto_execute)
    VALUES (?, ?, ?, ?)
  `).run(data.boardId, data.name.trim(), position, autoExecute);

  return db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(result.lastInsertRowid);
}

function updateColumn(columnId, data) {
  const db = getDb();
  
  const column = db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(columnId);
  if (!column) {
    throw new HttpError(404, 'column not found');
  }
  
  const updates = [];
  const params = [];
  
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new HttpError(400, 'name cannot be empty');
    }
    updates.push('name = ?');
    params.push(data.name.trim());
  }
  
  if (data.autoExecute !== undefined) {
    updates.push('auto_execute = ?');
    params.push(data.autoExecute ? 1 : 0);
  }
  
  if (updates.length === 0) {
    return column;
  }
  
  params.push(columnId);
  
  db.prepare(`
    UPDATE kanban_columns 
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);
  
  return db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(columnId);
}

function moveColumn(columnId, newPosition) {
  const db = getDb();
  
  const column = db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(columnId);
  if (!column) {
    throw new HttpError(404, 'column not found');
  }
  
  db.prepare(`
    UPDATE kanban_columns 
    SET position = ?
    WHERE id = ?
  `).run(Number(newPosition), columnId);
  
  return db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(columnId);
}

function deleteColumn(columnId) {
  const db = getDb();
  
  const column = db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(columnId);
  if (!column) {
    throw new HttpError(404, 'column not found');
  }
  
  db.prepare('DELETE FROM kanban_columns WHERE id = ?').run(columnId);
  return { success: true, deletedId: columnId };
}

// ==================== TASKS ====================

function getTasksByBoard(boardId, filters = {}) {
  const db = getDb();
  getBoardById(boardId);
  
  let query = `
    SELECT t.*, c.name as column_name
    FROM kanban_tasks t
    JOIN kanban_columns c ON t.column_id = c.id
    WHERE t.board_id = ?
  `;
  const params = [boardId];
  
  if (filters.status) {
    query += ' AND t.status = ?';
    params.push(filters.status);
  }
  
  if (filters.priority) {
    query += ' AND t.priority = ?';
    params.push(filters.priority);
  }
  
  query += ' ORDER BY t.position ASC';
  
  const tasks = db.prepare(query).all(...params);
  return { items: tasks };
}

function getTaskById(taskId) {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.*, c.name as column_name
    FROM kanban_tasks t
    JOIN kanban_columns c ON t.column_id = c.id
    WHERE t.id = ?
  `).get(taskId);
  
  if (!task) {
    throw new HttpError(404, 'task not found');
  }
  return task;
}

function createTaskLog(taskId, action, oldValue, newValue) {
  const db = getDb();
  db.prepare(`
    INSERT INTO kanban_task_logs (task_id, action, old_value, new_value, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(taskId, action, oldValue || null, newValue || null, getTimestamp());
}

function createTask(data) {
  const db = getDb();
  
  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    throw new HttpError(400, 'title is required');
  }
  
  if (!data.boardId || isNaN(Number(data.boardId))) {
    throw new HttpError(400, 'boardId is required');
  }
  
  if (!data.columnId || isNaN(Number(data.columnId))) {
    throw new HttpError(400, 'columnId is required');
  }
  
  const board = getBoardById(data.boardId);
  
  // Check project status if board belongs to a project
  if (board.project_id) {
    const projectStatus = projectsService.checkProjectStatus(board.project_id);
    if (projectStatus.isCompleted) {
      throw new HttpError(403, 'cannot create tasks in a completed project');
    }
  }
  
  const column = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND board_id = ?').get(data.columnId, data.boardId);
  if (!column) {
    throw new HttpError(404, 'column not found in this board');
  }
  
  const maxPosition = db.prepare(`
    SELECT COALESCE(MAX(position), 0) as maxPos 
    FROM kanban_tasks 
    WHERE column_id = ?
  `).get(data.columnId);
  
  const now = getTimestamp();
  const priority = data.priority ? validatePriority(data.priority) : 'medium';
  const status = data.status ? validateStatus(data.status) : 'open';
  const position = data.position !== undefined ? Number(data.position) : maxPosition.maxPos + 1;
  
  const result = db.prepare(`
    INSERT INTO kanban_tasks (
      board_id, column_id, title, description, priority, status,
      session_id, api_key_id, provider, model, due_date, position,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.boardId,
    data.columnId,
    data.title.trim(),
    data.description || null,
    priority,
    status,
    data.sessionId || null,
    data.apiKeyId || null,
    data.provider || null,
    data.model || null,
    data.dueDate || null,
    position,
    now,
    now
  );
  
  const taskId = result.lastInsertRowid;
  createTaskLog(taskId, 'created', null, JSON.stringify({ title: data.title, columnId: data.columnId }));
  
  return getTaskById(taskId);
}

function updateTask(taskId, data) {
  const db = getDb();
  const task = getTaskById(taskId);
  
  const updates = [];
  const params = [];
  const logs = [];
  
  if (data.title !== undefined) {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      throw new HttpError(400, 'title cannot be empty');
    }
    updates.push('title = ?');
    params.push(data.title.trim());
    if (task.title !== data.title.trim()) {
      logs.push({ action: 'title_changed', old: task.title, new: data.title.trim() });
    }
  }
  
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description || null);
    if (task.description !== data.description) {
      logs.push({ action: 'description_changed', old: task.description, new: data.description });
    }
  }
  
  if (data.priority !== undefined) {
    validatePriority(data.priority);
    updates.push('priority = ?');
    params.push(data.priority);
    if (task.priority !== data.priority) {
      logs.push({ action: 'priority_changed', old: task.priority, new: data.priority });
    }
  }
  
  if (data.status !== undefined) {
    validateStatus(data.status);
    updates.push('status = ?');
    params.push(data.status);
    if (task.status !== data.status) {
      logs.push({ action: 'status_changed', old: task.status, new: data.status });
    }
  }
  
  if (data.dueDate !== undefined) {
    updates.push('due_date = ?');
    params.push(data.dueDate || null);
  }
  
  if (data.sessionId !== undefined) {
    updates.push('session_id = ?');
    params.push(data.sessionId || null);
  }
  
  if (data.apiKeyId !== undefined) {
    updates.push('api_key_id = ?');
    params.push(data.apiKeyId || null);
  }
  
  if (data.provider !== undefined) {
    updates.push('provider = ?');
    params.push(data.provider || null);
  }
  
  if (data.model !== undefined) {
    updates.push('model = ?');
    params.push(data.model || null);
  }
  
  if (data.aiResult !== undefined) {
    updates.push('ai_result = ?');
    params.push(data.aiResult || null);
    if (data.aiResult && !task.ai_result) {
      logs.push({ action: 'ai_execution', old: null, new: 'AI result generated' });
    }
  }
  
  if (data.aiCostUsd !== undefined) {
    updates.push('ai_cost_usd = ?');
    params.push(data.aiCostUsd || 0);
  }
  
  if (updates.length === 0) {
    return task;
  }
  
  updates.push('updated_at = ?');
  params.push(getTimestamp());
  params.push(taskId);
  
  db.prepare(`
    UPDATE kanban_tasks 
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);
  
  logs.forEach(log => {
    createTaskLog(taskId, log.action, log.old, log.new);
  });
  
  return getTaskById(taskId);
}

async function executeTaskAI(taskId, actor) {
  const db = getDb();
  const task = getTaskById(taskId);
  
  // Only execute if task has required fields
  if (!task.provider || !task.model || !task.description) {
    return { executed: false, reason: 'missing required fields' };
  }
  
  // Check project status
  const projectId = projectsService.getProjectIdByBoard(task.board_id);
  if (projectId) {
    const projectStatus = projectsService.checkProjectStatus(projectId);
    if (projectStatus.isPaused) {
      throw new HttpError(403, 'project is paused - AI execution blocked');
    }
    if (projectStatus.isCompleted) {
      throw new HttpError(403, 'project is completed - AI execution blocked');
    }
  }
  
  try {
    // Check daily limit
    const { checkDailyLimit } = require('../limits/limits.service');
    const { getDefaultKeyWithSecret } = require('../keys/keys.service');
    const keyData = getDefaultKeyWithSecret(task.provider);
    const limitCheck = checkDailyLimit(keyData);
    
    if (!limitCheck.allowed) {
      return { executed: false, reason: 'daily limit exceeded' };
    }
    
    // Execute LLM
    const result = await llmService.chatCompletion({
      provider: task.provider,
      model: task.model,
      messages: [
        { role: 'system', content: 'You execute tasks. Be concise and helpful.' },
        { role: 'user', content: task.description }
      ],
      sessionId: task.session_id
    }, actor);
    
    // Update task with AI result
    db.prepare(`
      UPDATE kanban_tasks 
      SET ai_result = ?, ai_cost_usd = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      result.content,
      result.usage?.costUsd || 0,
      'done',
      getTimestamp(),
      taskId
    );
    
    // Create log
    createTaskLog(taskId, 'auto_ai_execution', null, JSON.stringify({ 
      costUsd: result.usage?.costUsd || 0,
      columnId: task.column_id 
    }));
    
    return { 
      executed: true, 
      costUsd: result.usage?.costUsd || 0,
      content: result.content
    };
    
  } catch (error) {
    console.error('[kanban] Auto AI execution failed:', error);
    createTaskLog(taskId, 'auto_ai_execution_failed', null, error.message);
    return { executed: false, reason: error.message };
  }
}

async function moveTask(taskId, newColumnId, newPosition, actor) {
  const db = getDb();
  const task = getTaskById(taskId);
  
  if (newColumnId !== undefined) {
    const column = db.prepare('SELECT * FROM kanban_columns WHERE id = ? AND board_id = ?').get(newColumnId, task.board_id);
    if (!column) {
      throw new HttpError(404, 'column not found in this board');
    }
    
    if (task.column_id !== newColumnId) {
      createTaskLog(taskId, 'moved', JSON.stringify({ columnId: task.column_id }), JSON.stringify({ columnId: newColumnId }));
    }
    
    db.prepare(`
      UPDATE kanban_tasks 
      SET column_id = ?, position = ?, updated_at = ?
      WHERE id = ?
    `).run(newColumnId, Number(newPosition), getTimestamp(), taskId);
    
    // Check if target column has auto_execute enabled
    if (column.auto_execute === 1 && task.column_id !== newColumnId) {
      // Execute AI automatically
      await executeTaskAI(taskId, actor || { username: 'system', role: 'system' });
    }
  } else {
    db.prepare(`
      UPDATE kanban_tasks 
      SET position = ?, updated_at = ?
      WHERE id = ?
    `).run(Number(newPosition), getTimestamp(), taskId);
  }
  
  return getTaskById(taskId);
}

function deleteTask(taskId) {
  const db = getDb();
  const task = getTaskById(taskId);
  
  db.prepare('DELETE FROM kanban_tasks WHERE id = ?').run(taskId);
  return { success: true, deletedId: taskId };
}

function getTaskLogs(taskId) {
  const db = getDb();
  getTaskById(taskId);
  
  const logs = db.prepare(`
    SELECT * FROM kanban_task_logs 
    WHERE task_id = ? 
    ORDER BY created_at DESC
  `).all(taskId);
  
  return { items: logs };
}

module.exports = {
  // Boards
  getAllBoards,
  getBoardById,
  createBoard,
  deleteBoard,
  
  // Columns
  getColumnsByBoard,
  createColumn,
  updateColumn,
  moveColumn,
  deleteColumn,
  
  // Tasks
  getTasksByBoard,
  getTaskById,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getTaskLogs,
  
  // AI
  executeTaskAI
};
