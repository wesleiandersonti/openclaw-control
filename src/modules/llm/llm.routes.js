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

router.post('/llm/chat/stream', requireRole(['operator']), async (req, res, next) => {
  const clientClosed = { value: false };

  req.on('close', () => {
    clientClosed.value = true;
  });

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const pingInterval = setInterval(() => {
      if (clientClosed.value) {
        clearInterval(pingInterval);
        return;
      }

      try {
        res.write(': ping\n\n');
      } catch (error) {
        clearInterval(pingInterval);
      }
    }, 15000);

    const onDelta = (text) => {
      if (clientClosed.value) {
        return;
      }

      try {
        const event = {
          event: 'delta',
          data: JSON.stringify({ text }),
        };
        res.write(`event: ${event.event}\ndata: ${event.data}\n\n`);
      } catch (error) {
        console.error('[llm:stream] error writing delta:', error.message);
      }
    };

    const result = await llmService.chatStream(req.body || {}, req.auth, onDelta);

    clearInterval(pingInterval);

    if (!clientClosed.value) {
      const doneEvent = {
        event: 'done',
        data: JSON.stringify({
          content: result.content,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          sessionId: result.sessionId,
          timestamp: result.timestamp,
        }),
      };
      res.write(`event: ${doneEvent.event}\ndata: ${doneEvent.data}\n\n`);
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      return next(error);
    }

    try {
      const errorEvent = {
        event: 'error',
        data: JSON.stringify({
          error: error.message || 'streaming failed',
          status: error.status || 500,
        }),
      };
      res.write(`event: ${errorEvent.event}\ndata: ${errorEvent.data}\n\n`);
      res.end();
    } catch (writeError) {
      console.error('[llm:stream] error writing error event:', writeError.message);
    }
  }
});

module.exports = router;
