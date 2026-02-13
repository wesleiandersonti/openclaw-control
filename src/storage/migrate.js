const { env } = require('../config/env');
const { getDb } = require('./sqlite');
const bcrypt = require('bcrypt');

function createTables(db) {
  db.exec(`
    -- ============================================
    -- ENTERPRISE SAAS CORE TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      plan TEXT CHECK(plan IN ('free','pro','enterprise')) DEFAULT 'enterprise',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

    -- Check if we need to migrate legacy users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      role TEXT CHECK(role IN ('org_admin','admin','operator','viewer')) DEFAULT 'operator',
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER,
      UNIQUE(org_id, email),
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(org_id);

    CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT CHECK(role IN ('workspace_admin','member','viewer')) DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      UNIQUE(workspace_id, user_id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      role TEXT CHECK(role IN ('org_admin','admin','operator','viewer')) DEFAULT 'operator',
      workspace_id INTEGER,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      accepted_at INTEGER,
      accepted_by INTEGER,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(accepted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    CREATE INDEX IF NOT EXISTS idx_invites_org ON invites(org_id);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jti TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      org_id INTEGER NOT NULL,
      workspace_id INTEGER,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti);

    -- ============================================
    -- BILLING (Placeholders)
    -- ============================================

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      limits_json TEXT NOT NULL,
      price_monthly_usd REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL UNIQUE,
      plan_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('active','past_due','canceled')) DEFAULT 'active',
      current_period_start INTEGER NOT NULL,
      current_period_end INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);

    -- ============================================
    -- BUSINESS ENTITIES WITH ORG_ID
    -- ============================================

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      workspace_id INTEGER,
      provider TEXT NOT NULL CHECK(provider IN ('openai', 'anthropic', 'google', 'openrouter', 'custom')),
      name TEXT,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      masked_key TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      daily_limit_usd REAL DEFAULT NULL,
      limit_mode TEXT DEFAULT 'off' CHECK(limit_mode IN ('off', 'alert', 'block')),
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(org_id, key_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_org_default
      ON api_keys(org_id, provider)
      WHERE is_default = 1 AND is_active = 1;

    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      workspace_id INTEGER,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      session_id TEXT,
      api_key_id INTEGER,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      event_time INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
      FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_events_org ON usage_events(org_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_workspace ON usage_events(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_time ON usage_events(event_time);

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      workspace_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('active','paused','completed')) DEFAULT 'active',
      budget_usd REAL DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      closed_at INTEGER,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);

    CREATE TABLE IF NOT EXISTS kanban_boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      workspace_id INTEGER,
      project_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_boards_org ON kanban_boards(org_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_boards_project ON kanban_boards(project_id);

    CREATE TABLE IF NOT EXISTS kanban_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      board_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      auto_execute INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_columns_org ON kanban_columns(org_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_columns_board ON kanban_columns(board_id);

    CREATE TABLE IF NOT EXISTS kanban_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      workspace_id INTEGER,
      board_id INTEGER NOT NULL,
      column_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'done')),
      session_id TEXT,
      api_key_id INTEGER,
      provider TEXT,
      model TEXT,
      ai_result TEXT DEFAULT NULL,
      ai_cost_usd REAL DEFAULT 0,
      due_date INTEGER,
      position INTEGER NOT NULL,
      created_by INTEGER,
      assigned_to INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
      FOREIGN KEY(board_id) REFERENCES kanban_boards(id) ON DELETE CASCADE,
      FOREIGN KEY(column_id) REFERENCES kanban_columns(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_org ON kanban_tasks(org_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_workspace ON kanban_tasks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_board ON kanban_tasks(board_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column ON kanban_tasks(column_id);

    CREATE TABLE IF NOT EXISTS kanban_task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      created_by INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES kanban_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_task_logs_org ON kanban_task_logs(org_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_task_logs_task ON kanban_task_logs(task_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_id INTEGER NOT NULL,
      workspace_id INTEGER,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(org_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  `);
}

function seedInitialData(db) {
  // Only seed if no organizations exist (fresh install)
  const orgCount = db.prepare('SELECT COUNT(*) as count FROM organizations').get();
  if (orgCount.count > 0) {
    return;
  }

  console.log('[migrate] Seeding initial enterprise data...');

  const now = Date.now();

  // Create default plan
  db.prepare(`
    INSERT INTO plans (name, slug, limits_json, price_monthly_usd, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'Enterprise',
    'enterprise',
    JSON.stringify({
      max_users: -1,
      max_workspaces: -1,
      max_api_keys: -1,
      max_projects: -1,
      monthly_budget_usd: -1
    }),
    0,
    now
  );

  // If env has admin credentials, create initial org
  if (env.ADMIN_USER && env.ADMIN_PASS_HASH) {
    const orgSlug = 'default-org';
    
    // Create organization
    const orgResult = db.prepare(`
      INSERT INTO organizations (name, slug, plan, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('Default Organization', orgSlug, 'enterprise', now, now);

    const orgId = orgResult.lastInsertRowid;

    // Create org_admin user
    db.prepare(`
      INSERT INTO users (org_id, email, password_hash, first_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orgId, env.ADMIN_USER, env.ADMIN_PASS_HASH, 'Admin', 'org_admin', 1, now, now);

    // Create default workspace
    db.prepare(`
      INSERT INTO workspaces (org_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(orgId, 'Default Workspace', 'Initial workspace', now, now);

    console.log('[migrate] Created default organization and admin user');
  }
}

function runMigrations() {
  const db = getDb();
  createTables(db);
  seedInitialData(db);
}

module.exports = {
  runMigrations
};
