const { getDb } = require('../../storage/sqlite');
const { HttpError } = require('../../core/errors/httpError');

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

  const result = db.prepare(`
    INSERT INTO kanban_boards (name, description, created_at)
    VALUES (?, ?, ?)
  `).run(data.name.trim(), data.description || null, getTimestamp());

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
  
  const result = db.prepare(`
    INSERT INTO kanban_columns (board_id, name, position)
    VALUES (?, ?, ?)
  `).run(data.boardId, data.name.trim(), position);

  return db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(result.lastInsertRowid);
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
  
  getBoardById(data.boardId);
  
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

function moveTask(taskId, newColumnId, newPosition) {
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
  moveColumn,
  deleteColumn,
  
  // Tasks
  getTasksByBoard,
  getTaskById,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getTaskLogs
};
