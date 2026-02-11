const { env } = require('../config/env');
const { getDb } = require('./sqlite');

function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'viewer')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jti TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('openai', 'anthropic', 'google', 'openrouter', 'custom')),
      name TEXT,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      masked_key TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      daily_limit_usd REAL DEFAULT NULL,
      limit_mode TEXT DEFAULT 'off' CHECK(limit_mode IN ('off', 'alert', 'block')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      session_id TEXT,
      api_key_id INTEGER,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      event_time TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_lookup ON refresh_tokens(jti, token_hash, revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_usage_events_event_time ON usage_events(event_time);
    CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(provider, model);
    CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_key ON usage_events(api_key_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_provider_default
      ON api_keys(provider)
      WHERE is_default = 1 AND is_active = 1;
  `);
}

function seedAdminUser(db) {
  if (!env.ADMIN_PASS_HASH) {
    return;
  }

  const statement = db.prepare(`
    INSERT INTO users (username, pass_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, 'admin', 1, datetime('now'), datetime('now'))
    ON CONFLICT(username)
    DO UPDATE SET
      pass_hash = excluded.pass_hash,
      role = 'admin',
      is_active = 1,
      updated_at = datetime('now')
  `);

  statement.run(env.ADMIN_USER, env.ADMIN_PASS_HASH);
}

function runMigrations() {
  const db = getDb();
  createTables(db);
  seedAdminUser(db);
}

module.exports = {
  runMigrations
};
