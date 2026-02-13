const express = require('express');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireRole } = require('../../core/rbac/requireRole');
const authService = require('./auth.service');

const router = express.Router();

router.post('/auth/login', async (req, res, next) => {
  try {
    const result = await authService.login(req.body || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/refresh', (req, res, next) => {
  try {
    const result = authService.refresh(req.body || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/logout', (req, res, next) => {
  try {
    const result = authService.logout(req.body || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const result = await authService.login(req.body || {});
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res, next) => {
  try {
    if (req.body && req.body.refreshToken) {
      authService.logout(req.body);
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin', requireAuth, requireRole(['admin']), (req, res) => {
  res.json({ message: 'Admin access granted' });
});

module.exports = router;
