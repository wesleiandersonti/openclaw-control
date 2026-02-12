const { Pool } = require('pg');
const { env } = require('../config/env');

let pool;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = env.DATABASE_URL || process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
  }

  pool = new Pool({
    connectionString,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
    process.exit(-1);
  });

  return pool;
}

async function query(text, params) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Migration helper for PostgreSQL
async function runMigrations() {
  const pool = getPool();
  
  // Check if migrations table exists
  const checkTable = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'migrations'
    );
  `);
  
  if (!checkTable.rows[0].exists) {
    await pool.query(`
      CREATE TABLE migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
  
  // Run migrations
  const migrations = [
    {
      name: '001_create_organizations',
      sql: `
        CREATE TABLE IF NOT EXISTS organizations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          plan VARCHAR(50) CHECK(plan IN ('free','pro','enterprise')) DEFAULT 'enterprise',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX idx_organizations_slug ON organizations(slug);
      `
    },
    {
      name: '002_create_users',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          role VARCHAR(50) CHECK(role IN ('org_admin','admin','operator','viewer')) DEFAULT 'operator',
          is_active BOOLEAN DEFAULT true,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          last_login_at BIGINT,
          UNIQUE(org_id, email)
        );
        CREATE INDEX idx_users_org ON users(org_id);
        CREATE INDEX idx_users_email ON users(email);
      `
    },
    {
      name: '003_create_workspaces',
      sql: `
        CREATE TABLE IF NOT EXISTS workspaces (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX idx_workspaces_org ON workspaces(org_id);
      `
    },
    {
      name: '004_create_workspace_members',
      sql: `
        CREATE TABLE IF NOT EXISTS workspace_members (
          id SERIAL PRIMARY KEY,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(50) CHECK(role IN ('workspace_admin','member','viewer')) DEFAULT 'member',
          joined_at BIGINT NOT NULL,
          UNIQUE(workspace_id, user_id)
        );
        CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
        CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
      `
    },
    {
      name: '005_create_api_keys',
      sql: `
        CREATE TABLE IF NOT EXISTS api_keys (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
          provider VARCHAR(50) NOT NULL CHECK(provider IN ('openai', 'anthropic', 'google', 'openrouter', 'custom')),
          name VARCHAR(255),
          encrypted_key TEXT NOT NULL,
          iv VARCHAR(255) NOT NULL,
          auth_tag VARCHAR(255) NOT NULL,
          masked_key VARCHAR(255) NOT NULL,
          key_hash VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          is_default BOOLEAN DEFAULT false,
          daily_limit_usd DECIMAL(10,4),
          limit_mode VARCHAR(50) DEFAULT 'off' CHECK(limit_mode IN ('off', 'alert', 'block')),
          created_by INTEGER,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          UNIQUE(org_id, key_hash)
        );
        CREATE INDEX idx_api_keys_org ON api_keys(org_id);
      `
    },
    {
      name: '006_create_projects',
      sql: `
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) CHECK(status IN ('active','paused','completed')) DEFAULT 'active',
          budget_usd DECIMAL(10,4),
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          closed_at BIGINT
        );
        CREATE INDEX idx_projects_org ON projects(org_id);
      `
    },
    {
      name: '007_create_kanban',
      sql: `
        CREATE TABLE IF NOT EXISTS kanban_boards (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
          project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX idx_kanban_boards_org ON kanban_boards(org_id);

        CREATE TABLE IF NOT EXISTS kanban_columns (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          board_id INTEGER NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          position INTEGER NOT NULL,
          auto_execute BOOLEAN DEFAULT false,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX idx_kanban_columns_org ON kanban_columns(org_id);
        CREATE INDEX idx_kanban_columns_board ON kanban_columns(board_id);

        CREATE TABLE IF NOT EXISTS kanban_tasks (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
          board_id INTEGER NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
          column_id INTEGER NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
          title VARCHAR(500) NOT NULL,
          description TEXT,
          priority VARCHAR(50) DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
          status VARCHAR(50) DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'done')),
          session_id VARCHAR(255),
          api_key_id INTEGER,
          provider VARCHAR(50),
          model VARCHAR(100),
          ai_result TEXT,
          ai_cost_usd DECIMAL(10,6) DEFAULT 0,
          due_date BIGINT,
          position INTEGER NOT NULL,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
        CREATE INDEX idx_kanban_tasks_org ON kanban_tasks(org_id);
        CREATE INDEX idx_kanban_tasks_board ON kanban_tasks(board_id);
      `
    },
    {
      name: '008_create_usage_events',
      sql: `
        CREATE TABLE IF NOT EXISTS usage_events (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
          provider VARCHAR(50) NOT NULL,
          model VARCHAR(100) NOT NULL,
          session_id VARCHAR(255),
          api_key_id INTEGER,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cost_usd DECIMAL(10,6) DEFAULT 0,
          event_time BIGINT NOT NULL,
          created_by INTEGER NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX idx_usage_events_org ON usage_events(org_id);
        CREATE INDEX idx_usage_events_time ON usage_events(event_time);
      `
    },
    {
      name: '009_create_audit_log',
      sql: `
        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
          user_id INTEGER,
          user_name VARCHAR(255),
          user_role VARCHAR(50),
          action VARCHAR(100) NOT NULL,
          target_type VARCHAR(100) NOT NULL,
          target_id VARCHAR(255),
          metadata JSONB,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX idx_audit_log_org ON audit_log(org_id);
        CREATE INDEX idx_audit_log_created ON audit_log(created_at);
      `
    }
  ];

  for (const migration of migrations) {
    const exists = await pool.query(
      'SELECT 1 FROM migrations WHERE name = $1',
      [migration.name]
    );
    
    if (exists.rows.length === 0) {
      console.log(`[pg-migrate] Running: ${migration.name}`);
      await pool.query(migration.sql);
      await pool.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migration.name]
      );
    }
  }
  
  console.log('[pg-migrate] All migrations completed');
}

module.exports = {
  getPool,
  query,
  transaction,
  closePool,
  runMigrations
};
