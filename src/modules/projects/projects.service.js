const { getDb } = require('../../storage/sqlite');
const { HttpError } = require('../../core/errors/httpError');

const VALID_PROJECT_STATUSES = ['active', 'paused', 'completed'];

function validateStatus(status) {
  if (!status || !VALID_PROJECT_STATUSES.includes(status)) {
    throw new HttpError(400, `status must be one of: ${VALID_PROJECT_STATUSES.join(', ')}`);
  }
  return status;
}

function getTimestamp() {
  return Date.now();
}

// ==================== PROJECTS ====================

function getAllProjects(filters = {}) {
  const db = getDb();
  let query = 'SELECT * FROM projects';
  const params = [];
  
  if (filters.status) {
    query += ' WHERE status = ?';
    params.push(filters.status);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const projects = db.prepare(query).all(...params);
  return { items: projects };
}

function getProjectById(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    throw new HttpError(404, 'project not found');
  }
  return project;
}

function createProject(data) {
  const db = getDb();
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new HttpError(400, 'name is required');
  }
  
  const result = db.prepare(`
    INSERT INTO projects (name, description, status, budget_usd, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.name.trim(),
    data.description || null,
    'active',
    data.budgetUsd || null,
    getTimestamp()
  );
  
  return getProjectById(result.lastInsertRowid);
}

function updateProject(projectId, data) {
  const db = getDb();
  const project = getProjectById(projectId);
  
  const updates = [];
  const params = [];
  
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new HttpError(400, 'name cannot be empty');
    }
    updates.push('name = ?');
    params.push(data.name.trim());
  }
  
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description || null);
  }
  
  if (data.status !== undefined) {
    validateStatus(data.status);
    updates.push('status = ?');
    params.push(data.status);
    
    // Set closed_at if status is completed
    if (data.status === 'completed') {
      updates.push('closed_at = ?');
      params.push(getTimestamp());
    }
  }
  
  if (data.budgetUsd !== undefined) {
    updates.push('budget_usd = ?');
    params.push(data.budgetUsd || null);
  }
  
  if (updates.length === 0) {
    return project;
  }
  
  params.push(projectId);
  
  db.prepare(`
    UPDATE projects 
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);
  
  return getProjectById(projectId);
}

function deleteProject(projectId) {
  const db = getDb();
  const project = getProjectById(projectId);
  
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  return { success: true, deletedId: projectId };
}

// ==================== STATS ====================

function getProjectStats(projectId) {
  const db = getDb();
  getProjectById(projectId);
  
  // Get all boards for this project
  const boards = db.prepare('SELECT id FROM kanban_boards WHERE project_id = ?').all(projectId);
  const boardIds = boards.map(b => b.id);
  
  if (boardIds.length === 0) {
    const project = getProjectById(projectId);
    return {
      projectId,
      totalTasks: 0,
      totalAiExecutions: 0,
      totalCostUsd: 0,
      budgetUsd: project.budget_usd || null,
      budgetUsedPercent: project.budget_usd ? 0 : null
    };
  }
  
  const placeholders = boardIds.map(() => '?').join(',');
  
  // Get total tasks
  const tasksCount = db.prepare(`
    SELECT COUNT(*) as count FROM kanban_tasks WHERE board_id IN (${placeholders})
  `).get(...boardIds);
  
  // Get total AI executions (tasks with ai_result)
  const aiExecutions = db.prepare(`
    SELECT COUNT(*) as count FROM kanban_tasks 
    WHERE board_id IN (${placeholders}) AND ai_result IS NOT NULL
  `).get(...boardIds);
  
  // Get total cost
  const costs = db.prepare(`
    SELECT COALESCE(SUM(ai_cost_usd), 0) as total FROM kanban_tasks 
    WHERE board_id IN (${placeholders})
  `).get(...boardIds);
  
  const project = getProjectById(projectId);
  const totalCostUsd = costs.total || 0;
  
  let budgetUsedPercent = null;
  if (project.budget_usd && project.budget_usd > 0) {
    budgetUsedPercent = (totalCostUsd / project.budget_usd) * 100;
  }
  
  return {
    projectId,
    totalTasks: tasksCount.count || 0,
    totalAiExecutions: aiExecutions.count || 0,
    totalCostUsd,
    budgetUsd: project.budget_usd || null,
    budgetUsedPercent
  };
}

// ==================== PROJECT STATUS CHECK ====================

function checkProjectStatus(projectId) {
  const project = getProjectById(projectId);
  return {
    status: project.status,
    isActive: project.status === 'active',
    isPaused: project.status === 'paused',
    isCompleted: project.status === 'completed'
  };
}

function getProjectIdByBoard(boardId) {
  const db = getDb();
  const board = db.prepare('SELECT project_id FROM kanban_boards WHERE id = ?').get(boardId);
  return board?.project_id || null;
}

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectStats,
  checkProjectStatus,
  getProjectIdByBoard
};
