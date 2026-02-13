const express = require('express');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireRole } = require('../../core/rbac/requireRole');
const usageService = require('./usage.service');

const router = express.Router();

router.use(requireAuth);

router.post('/usage/record', requireRole(['operator']), (req, res, next) => {
  try {
    const event = usageService.recordUsage(req.body || {}, req.auth);
    return res.status(201).json(event);
  } catch (error) {
    return next(error);
  }
});

router.get('/usage/summary', requireRole(['viewer']), (req, res, next) => {
  try {
    const result = usageService.getUsageSummary(req.query || {});
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.get('/usage/per-model', requireRole(['viewer']), (req, res, next) => {
  try {
    const result = usageService.getUsagePerModel(req.query || {});
    return res.json({ items: result });
  } catch (error) {
    return next(error);
  }
});

router.get('/usage/per-session', requireRole(['viewer']), (req, res, next) => {
  try {
    const result = usageService.getUsagePerSession(req.query || {});
    return res.json({ items: result });
  } catch (error) {
    return next(error);
  }
});

router.get('/usage/per-key', requireRole(['viewer']), (req, res, next) => {
  try {
    const result = usageService.getUsagePerKey(req.query || {});
    return res.json({ items: result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
