const express = require('express');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireRole } = require('../../core/rbac/requireRole');
const { HttpError } = require('../../core/errors/httpError');
const keysService = require('./keys.service');

const router = express.Router();

function parseId(idParam) {
  const id = Number.parseInt(idParam, 10);
  if (Number.isNaN(id) || id <= 0) {
    throw new HttpError(400, 'invalid id');
  }

  return id;
}

router.use(requireAuth);

router.get('/keys', (req, res, next) => {
  try {
    const keys = keysService.listKeys(req.query.provider);
    return res.json({ items: keys });
  } catch (error) {
    return next(error);
  }
});

router.post('/keys', requireRole(['admin']), (req, res, next) => {
  try {
    const key = keysService.createKey(req.body || {}, req.auth);
    return res.status(201).json(key);
  } catch (error) {
    return next(error);
  }
});

router.patch('/keys/:id/toggle', requireRole(['admin']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const key = keysService.toggleKey(id, req.body && req.body.isActive, req.auth);
    return res.json(key);
  } catch (error) {
    return next(error);
  }
});

router.delete('/keys/:id', requireRole(['admin']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = keysService.deleteKey(id, req.auth);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/keys/:id/default', requireRole(['admin']), (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const key = keysService.setDefaultKey(id, req.auth);
    return res.json(key);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
