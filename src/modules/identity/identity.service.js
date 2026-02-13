const { getDb } = require('../../storage/sqlite');
const { HttpError } = require('../../core/errors/httpError');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

const SALT_ROUNDS = 12;
const INVITE_EXPIRY_HOURS = 48;

function getTimestamp() {
  return Date.now();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ==================== ORGANIZATIONS ====================

function createOrganization(data) {
  const db = getDb();
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new HttpError(400, 'organization name is required');
  }
  
  // Generate slug from name
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + crypto.randomBytes(4).toString('hex');

  const now = getTimestamp();
  
  const result = db.prepare(`
    INSERT INTO organizations (name, slug, plan, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.name.trim(), slug, data.plan || 'enterprise', now, now);

  return {
    id: result.lastInsertRowid,
    name: data.name.trim(),
    slug,
    plan: data.plan || 'enterprise'
  };
}

function getOrganizationById(orgId) {
  const db = getDb();
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
  if (!org) {
    throw new HttpError(404, 'organization not found');
  }
  return org;
}

// ==================== USERS ====================

async function createUser(data) {
  const db = getDb();
  
  if (!data.email || !data.password) {
    throw new HttpError(400, 'email and password are required');
  }
  
  if (!data.orgId) {
    throw new HttpError(400, 'organization is required');
  }
  
  // Check if email already exists in org
  const existing = db.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').get(data.orgId, data.email.toLowerCase());
  if (existing) {
    throw new HttpError(409, 'email already registered in this organization');
  }
  
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  const now = getTimestamp();
  
  const result = db.prepare(`
    INSERT INTO users (org_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.orgId,
    data.email.toLowerCase(),
    passwordHash,
    data.firstName || null,
    data.lastName || null,
    data.role || 'operator',
    1,
    now,
    now
  );

  return getUserById(result.lastInsertRowid);
}

function getUserById(userId) {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.*, o.name as org_name, o.slug as org_slug, o.plan as org_plan
    FROM users u
    JOIN organizations o ON u.org_id = o.id
    WHERE u.id = ?
  `).get(userId);
  
  if (!user) {
    throw new HttpError(404, 'user not found');
  }
  
  // Remove sensitive data
  delete user.password_hash;
  return user;
}

function getUserByEmail(email, orgId) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ? AND org_id = ?').get(email.toLowerCase(), orgId);
}

async function validatePassword(user, password) {
  if (!user || !user.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

function updateLastLogin(userId) {
  const db = getDb();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(getTimestamp(), userId);
}

// ==================== WORKSPACES ====================

function createWorkspace(data) {
  const db = getDb();
  
  if (!data.name || !data.orgId) {
    throw new HttpError(400, 'name and organization are required');
  }
  
  const now = getTimestamp();
  
  const result = db.prepare(`
    INSERT INTO workspaces (org_id, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.orgId, data.name.trim(), data.description || null, now, now);

  return {
    id: result.lastInsertRowid,
    org_id: data.orgId,
    name: data.name.trim(),
    description: data.description || null
  };
}

function getWorkspacesByOrg(orgId) {
  const db = getDb();
  return db.prepare('SELECT * FROM workspaces WHERE org_id = ? ORDER BY created_at DESC').all(orgId);
}

function getWorkspacesByUser(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT w.*, wm.role as member_role
    FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
    ORDER BY w.created_at DESC
  `).all(userId);
}

function addWorkspaceMember(workspaceId, userId, role = 'member') {
  const db = getDb();
  const now = getTimestamp();
  
  try {
    db.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?)
    `).run(workspaceId, userId, role, now);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      throw new HttpError(409, 'user is already a member of this workspace');
    }
    throw error;
  }
}

// ==================== INVITES ====================

function createInvite(data) {
  const db = getDb();
  
  if (!data.email || !data.orgId || !data.createdBy) {
    throw new HttpError(400, 'email, organization and creator are required');
  }
  
  // Check if email already exists in org
  const existing = db.prepare('SELECT id FROM users WHERE org_id = ? AND email = ?').get(data.orgId, data.email.toLowerCase());
  if (existing) {
    throw new HttpError(409, 'user already exists in this organization');
  }
  
  const token = generateToken();
  const now = getTimestamp();
  const expiresAt = now + (INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
  
  const result = db.prepare(`
    INSERT INTO invites (org_id, email, role, workspace_id, token, expires_at, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.orgId,
    data.email.toLowerCase(),
    data.role || 'operator',
    data.workspaceId || null,
    token,
    expiresAt,
    now,
    data.createdBy
  );

  return {
    id: result.lastInsertRowid,
    token,
    email: data.email.toLowerCase(),
    expiresAt
  };
}

function getInviteByToken(token) {
  const db = getDb();
  const invite = db.prepare(`
    SELECT i.*, o.name as org_name
    FROM invites i
    JOIN organizations o ON i.org_id = o.id
    WHERE i.token = ? AND i.accepted_at IS NULL
  `).get(token);
  
  if (!invite) {
    throw new HttpError(404, 'invite not found or already accepted');
  }
  
  if (invite.expires_at < getTimestamp()) {
    throw new HttpError(410, 'invite has expired');
  }
  
  return invite;
}

function acceptInvite(token, password) {
  const db = getDb();
  
  const invite = getInviteByToken(token);
  const now = getTimestamp();
  
  // Create user
  const userResult = db.prepare(`
    INSERT INTO users (org_id, email, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    invite.org_id,
    invite.email,
    bcrypt.hashSync(password, SALT_ROUNDS),
    invite.role,
    1,
    now,
    now
  );
  
  const userId = userResult.lastInsertRowid;
  
  // Mark invite as accepted
  db.prepare(`
    UPDATE invites SET accepted_at = ?, accepted_by = ? WHERE id = ?
  `).run(now, userId, invite.id);
  
  // Add to workspace if specified
  if (invite.workspace_id) {
    addWorkspaceMember(invite.workspace_id, userId, 'member');
  }
  
  return getUserById(userId);
}

// ==================== REGISTRATION ====================

async function registerOrganization(data) {
  const db = getDb();
  
  if (!data.orgName || !data.email || !data.password) {
    throw new HttpError(400, 'organization name, email and password are required');
  }
  
  const transaction = db.transaction(() => {
    // Create organization
    const org = createOrganization({ name: data.orgName, plan: 'enterprise' });
    
    // Create first user as org_admin
    const passwordHash = bcrypt.hashSync(data.password, SALT_ROUNDS);
    const now = getTimestamp();
    
    const userResult = db.prepare(`
      INSERT INTO users (org_id, email, password_hash, first_name, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(org.id, data.email.toLowerCase(), passwordHash, data.firstName || null, 'org_admin', 1, now, now);
    
    // Create default workspace
    const workspaceResult = db.prepare(`
      INSERT INTO workspaces (org_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(org.id, 'Default Workspace', 'Initial workspace', now, now);
    
    // Add user to workspace
    db.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?)
    `).run(workspaceResult.lastInsertRowid, userResult.lastInsertRowid, 'workspace_admin', now);
    
    return {
      orgId: org.id,
      userId: userResult.lastInsertRowid
    };
  });
  
  const result = transaction();
  return getUserById(result.userId);
}

module.exports = {
  // Organizations
  createOrganization,
  getOrganizationById,
  
  // Users
  createUser,
  getUserById,
  getUserByEmail,
  validatePassword,
  updateLastLogin,
  
  // Workspaces
  createWorkspace,
  getWorkspacesByOrg,
  getWorkspacesByUser,
  addWorkspaceMember,
  
  // Invites
  createInvite,
  getInviteByToken,
  acceptInvite,
  
  // Registration
  registerOrganization
};
