const express = require('express');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { env } = require('../../config/env');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireRole } = require('../../core/rbac/requireRole');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/system/health', requireAuth, requireRole(['viewer']), (req, res) => {
  const memory = process.memoryUsage();
  const dbPath = path.isAbsolute(env.DB_PATH) ? env.DB_PATH : path.resolve(process.cwd(), env.DB_PATH);

  let disk = null;
  try {
    const stat = fs.statfsSync(path.dirname(dbPath));
    const totalBytes = Number(stat.bsize) * Number(stat.blocks);
    const freeBytes = Number(stat.bsize) * Number(stat.bavail);
    disk = {
      path: dbPath,
      totalBytes,
      freeBytes,
      usedBytes: totalBytes - freeBytes
    };
  } catch (error) {
    disk = {
      path: dbPath,
      error: 'disk stats unavailable'
    };
  }

  res.json({
    status: 'ok',
    uptimeSec: Math.floor(process.uptime()),
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external
    },
    cpu: {
      cores: os.cpus().length,
      loadAvg: os.loadavg()
    },
    disk
  });
});

module.exports = router;
