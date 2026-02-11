const path = require('node:path');
const express = require('express');
const { env } = require('./config/env');
const { applySecurity } = require('./config/security');
const { isHttpError } = require('./core/errors/httpError');
const { runMigrations } = require('./storage/migrate');
const authRoutes = require('./modules/auth/auth.routes');
const keysRoutes = require('./modules/keys/keys.routes');
const usageRoutes = require('./modules/usage/usage.routes');
const systemRoutes = require('./modules/system/system.routes');
const llmRoutes = require('./modules/llm/llm.routes');
const kanbanRoutes = require('./modules/kanban/kanban.routes');
const projectsRoutes = require('./modules/projects/projects.routes');

function createApp() {
  const app = express();

  applySecurity(app);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(express.static(path.resolve(__dirname, '../public')));

  app.use('/api', systemRoutes);
  app.use('/api', authRoutes);
  app.use('/api', keysRoutes);
  app.use('/api', usageRoutes);
  app.use('/api', llmRoutes);
  app.use('/api', kanbanRoutes);
  app.use('/api', projectsRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  app.use((error, req, res, next) => {
    if (isHttpError(error)) {
      const payload = { error: error.message };
      if (error.details) {
        payload.details = error.details;
      }
      return res.status(error.status).json(payload);
    }

    console.error('[server] unexpected error', error);
    return res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

function startServer() {
  runMigrations();

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`OpenClaw Control running at http://localhost:${env.PORT}`);
  });

  return app;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};
