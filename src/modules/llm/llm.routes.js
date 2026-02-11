const express = require('express');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireRole } = require('../../core/rbac/requireRole');
const llmService = require('./llm.service');

const router = express.Router();

router.use(requireAuth);

router.post('/llm/chat', requireRole(['operator']), async (req, res, next) => {
  try {
    const result = await llmService.chatCompletion(req.body || {}, req.auth);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
