const express = require('express');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireRole } = require('../../core/rbac/requireRole');
const { HttpError } = require('../../core/errors/httpError');
const kanbanService = require('./kanban.service');

const router = express.Router();

router.use(requireAuth);

function parseId(idParam) {
  const id = Number.parseInt(idParam, 10);
  if (Number.isNaN(id) || id <= 0) {
    throw new HttpError(400, 'invalid id');
  }
  return id;
}

// ==================== BOARDS ====================

// GET /api/kanban/boards - Listar todos os boards
router.get('/kanban/boards', (req, res, next) => {
  try {
    const result = kanbanService.getAllBoards();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// POST /api/kanban/boards - Criar novo board
router.post('/kanban/boards', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const board = kanbanService.createBoard(req.body || {});
    return res.status(201).json(board);
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/kanban/boards/:id - Deletar board
router.delete('/kanban/boards/:id', requireRole(['admin']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = kanbanService.deleteBoard(id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// ==================== COLUMNS ====================

// GET /api/kanban/columns?boardId=1 - Listar colunas de um board
router.get('/kanban/columns', (req, res, next) => {
  try {
    if (!req.query.boardId) {
      throw new HttpError(400, 'boardId is required');
    }
    const boardId = parseId(req.query.boardId);
    const result = kanbanService.getColumnsByBoard(boardId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// POST /api/kanban/columns - Criar nova coluna
router.post('/kanban/columns', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const column = kanbanService.createColumn(req.body || {});
    return res.status(201).json(column);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/kanban/columns/:id - Atualizar coluna (nome, auto_execute)
router.patch('/kanban/columns/:id', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const column = kanbanService.updateColumn(id, req.body || {});
    return res.json(column);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/kanban/columns/:id/move - Mover coluna (atualizar position)
router.patch('/kanban/columns/:id/move', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (req.body.position === undefined) {
      throw new HttpError(400, 'position is required');
    }
    const column = kanbanService.moveColumn(id, req.body.position);
    return res.json(column);
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/kanban/columns/:id - Deletar coluna
router.delete('/kanban/columns/:id', requireRole(['admin']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = kanbanService.deleteColumn(id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// ==================== TASKS ====================

// GET /api/kanban/tasks?boardId=1 - Listar tarefas de um board
router.get('/kanban/tasks', (req, res, next) => {
  try {
    if (!req.query.boardId) {
      throw new HttpError(400, 'boardId is required');
    }
    const boardId = parseId(req.query.boardId);
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.priority) filters.priority = req.query.priority;
    const result = kanbanService.getTasksByBoard(boardId, filters);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// POST /api/kanban/tasks - Criar nova tarefa
router.post('/kanban/tasks', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const task = kanbanService.createTask(req.body || {});
    return res.status(201).json(task);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/kanban/tasks/:id - Atualizar tarefa
router.patch('/kanban/tasks/:id', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const task = kanbanService.updateTask(id, req.body || {});
    return res.json(task);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/kanban/tasks/:id/move - Mover tarefa (atualizar column_id + position)
router.patch('/kanban/tasks/:id/move', requireRole(['admin', 'operator']), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (req.body.position === undefined) {
      throw new HttpError(400, 'position is required');
    }
    const task = await kanbanService.moveTask(id, req.body.columnId, req.body.position, req.auth);
    return res.json(task);
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/kanban/tasks/:id - Deletar tarefa
router.delete('/kanban/tasks/:id', requireRole(['admin']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = kanbanService.deleteTask(id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// GET /api/kanban/tasks/:id/logs - Listar logs de uma tarefa
router.get('/kanban/tasks/:id/logs', (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = kanbanService.getTaskLogs(id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
