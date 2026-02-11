const crypto = require('node:crypto');

require('dotenv').config();

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function devMasterKey() {
  return crypto.createHash('sha256').update('openclaw-control-dev-key').digest('base64');
}

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInteger(process.env.PORT, 7000),
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  JWT_ACCESS_TTL_MIN: parseInteger(process.env.JWT_ACCESS_TTL_MIN, 15),
  JWT_REFRESH_TTL_DAYS: parseInteger(process.env.JWT_REFRESH_TTL_DAYS, 7),
  KEY_ENC_MASTER_B64: process.env.KEY_ENC_MASTER_B64 || devMasterKey(),
  DB_PATH: process.env.DB_PATH || './data/app.db',
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS_HASH: process.env.ADMIN_PASS_HASH || '',
  OPENCLAW_URL: process.env.OPENCLAW_URL || 'http://127.0.0.1:18789',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:7000'
});

module.exports = { env };
