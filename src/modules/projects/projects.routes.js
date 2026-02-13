const express = require('express');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireRole } = require('../../core/rbac/requireRole');
const { HttpError } = require('../../core/errors/httpError');
const projectsService = require('./projects.service');

const router = express.Router();

router.use(requireAuth);

function parseId(idParam) {
  const id = Number.parseInt(idParam, 10);
  if (Number.isNaN(id) || id <= 0) {
    throw new HttpError(400, 'invalid id');
  }
  return id;
}

// ==================== PROJECTS ====================

// GET /api/projects - Listar projetos
router.get('/projects', (req, res, next) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    const result = projectsService.getAllProjects(filters);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// POST /api/projects - Criar projeto
router.post('/projects', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const project = projectsService.createProject(req.body || {});
    return res.status(201).json(project);
  } catch (error) {
    return next(error);
  }
});

// GET /api/projects/:id - Obter projeto
router.get('/projects/:id', (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const project = projectsService.getProjectById(id);
    return res.json(project);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/projects/:id - Atualizar projeto
router.patch('/projects/:id', requireRole(['admin', 'operator']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const project = projectsService.updateProject(id, req.body || {});
    return res.json(project);
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/projects/:id - Deletar projeto
router.delete('/projects/:id', requireRole(['admin']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = projectsService.deleteProject(id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// GET /api/projects/:id/stats - Estatísticas do projeto
router.get('/projects/:id/stats', (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const stats = projectsService.getProjectStats(id);
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
