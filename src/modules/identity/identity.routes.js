const express = require('express');
const { requireAuth } = require('../../middlewares/requireAuth');
const { requireOrgRole } = require('../../core/rbac/requireOrgRole');
const { HttpError } = require('../../core/errors/httpError');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../core/auth/jwt');
const identityService = require('./identity.service');
const { getDb } = require('../../storage/sqlite');

const router = express.Router();

// ==================== AUTH ====================

// POST /api/auth/register-org - Criar organização e primeiro usuário
router.post('/auth/register-org', async (req, res, next) => {
  try {
    const user = await identityService.registerOrganization(req.body);
    
    // Generate tokens
    const accessToken = signAccessToken({
      sub: String(user.id),
      orgId: String(user.org_id),
      role: user.role,
      email: user.email
    });
    
    const refreshToken = signRefreshToken({
      sub: String(user.id),
      orgId: String(user.org_id),
      role: user.role,
      type: 'refresh'
    });
    
    res.status(201).json({
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login - Login por email/senha
router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    
    if (!email || !password) {
      throw new HttpError(400, 'email and password are required');
    }
    
    // For multi-tenant, we need org identifier. For now, search by email across all orgs
    // In production, you'd require org_slug or email format like user@org
    const db = getDb();
    const user = db.prepare(`
      SELECT u.*, o.slug as org_slug
      FROM users u
      JOIN organizations o ON u.org_id = o.id
      WHERE u.email = ? AND u.is_active = 1
    `).get(email.toLowerCase());
    
    if (!user) {
      throw new HttpError(401, 'invalid credentials');
    }
    
    const valid = await identityService.validatePassword(user, password);
    if (!valid) {
      throw new HttpError(401, 'invalid credentials');
    }
    
    // Update last login
    identityService.updateLastLogin(user.id);
    
    // Get user's workspaces
    const workspaces = identityService.getWorkspacesByUser(user.id);
    const defaultWorkspace = workspaces[0];
    
    // Generate tokens
    const accessToken = signAccessToken({
      sub: String(user.id),
      orgId: String(user.org_id),
      role: user.role,
      email: user.email,
      workspaceId: defaultWorkspace ? String(defaultWorkspace.id) : null
    });
    
    const refreshToken = signRefreshToken({
      sub: String(user.id),
      orgId: String(user.org_id),
      role: user.role,
      type: 'refresh'
    });
    
    // Remove sensitive data
    delete user.password_hash;
    
    res.json({
      user,
      workspaces,
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh - Refresh token
router.post('/auth/refresh', (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    
    if (!refreshToken) {
      throw new HttpError(400, 'refresh token is required');
    }
    
    const decoded = verifyRefreshToken(refreshToken);
    
    if (decoded.type !== 'refresh') {
      throw new HttpError(401, 'invalid refresh token');
    }
    
    const newAccessToken = signAccessToken({
      sub: decoded.sub,
      orgId: decoded.orgId,
      role: decoded.role,
      email: decoded.email,
      workspaceId: decoded.workspaceId
    });
    
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout - Logout
router.post('/auth/logout', requireAuth, (req, res) => {
  // In a full implementation, revoke the refresh token
  res.json({ success: true });
});

// GET /api/auth/me - Current user
router.get('/auth/me', requireAuth, (req, res, next) => {
  try {
    const user = identityService.getUserById(req.auth.userId);
    const workspaces = identityService.getWorkspacesByUser(user.id);
    
    res.json({
      user,
      workspaces
    });
  } catch (error) {
    next(error);
  }
});

// ==================== INVITES ====================

// POST /api/auth/invite - Criar convite (org_admin/admin only)
router.post('/auth/invite', requireAuth, requireOrgRole(['org_admin', 'admin']), (req, res, next) => {
  try {
    const invite = identityService.createInvite({
      orgId: req.auth.orgId,
      email: req.body.email,
      role: req.body.role || 'operator',
      workspaceId: req.body.workspaceId || null,
      createdBy: req.auth.userId
    });
    
    res.status(201).json(invite);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/accept-invite - Aceitar convite
router.post('/auth/accept-invite', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    
    if (!token || !password) {
      throw new HttpError(400, 'token and password are required');
    }
    
    const user = await identityService.acceptInvite(token, password);
    
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/invite/:token - Verificar convite
router.get('/auth/invite/:token', (req, res, next) => {
  try {
    const invite = identityService.getInviteByToken(req.params.token);
    
    res.json({
      email: invite.email,
      orgName: invite.org_name,
      role: invite.role,
      expiresAt: invite.expires_at
    });
  } catch (error) {
    next(error);
  }
});

// ==================== WORKSPACES ====================

// GET /api/workspaces - Listar workspaces do usuário
router.get('/workspaces', requireAuth, (req, res, next) => {
  try {
    const workspaces = identityService.getWorkspacesByUser(req.auth.userId);
    res.json({ items: workspaces });
  } catch (error) {
    next(error);
  }
});

// POST /api/workspaces - Criar workspace (org_admin/admin only)
router.post('/workspaces', requireAuth, requireOrgRole(['org_admin', 'admin']), (req, res, next) => {
  try {
    const workspace = identityService.createWorkspace({
      orgId: req.auth.orgId,
      name: req.body.name,
      description: req.body.description
    });
    
    // Add creator as workspace admin
    identityService.addWorkspaceMember(workspace.id, req.auth.userId, 'workspace_admin');
    
    res.status(201).json(workspace);
  } catch (error) {
    next(error);
  }
});

// POST /api/workspaces/:id/members - Adicionar membro ao workspace
router.post('/workspaces/:id/members', requireAuth, requireOrgRole(['org_admin', 'admin']), (req, res, next) => {
  try {
    identityService.addWorkspaceMember(
      parseInt(req.params.id),
      req.body.userId,
      req.body.role || 'member'
    );
    
    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ==================== LEGACY COMPATIBILITY ====================

// POST /api/login - Legacy endpoint for backward compatibility
router.post('/login', async (req, res, next) => {
  try {
    const { user, pass } = req.body || {};
    
    // Try new auth first
    try {
      const db = getDb();
      const dbUser = db.prepare(`
        SELECT u.*, o.slug as org_slug
        FROM users u
        JOIN organizations o ON u.org_id = o.id
        WHERE u.email = ? AND u.is_active = 1
      `).get(user.toLowerCase());
      
      if (dbUser) {
        const valid = await identityService.validatePassword(dbUser, pass);
        if (valid) {
          identityService.updateLastLogin(dbUser.id);
          
          const workspaces = identityService.getWorkspacesByUser(dbUser.id);
          
          const accessToken = signAccessToken({
            sub: String(dbUser.id),
            orgId: String(dbUser.org_id),
            role: dbUser.role,
            email: dbUser.email
          });
          
          const refreshToken = signRefreshToken({
            sub: String(dbUser.id),
            orgId: String(dbUser.org_id),
            role: dbUser.role,
            type: 'refresh'
          });
          
          delete dbUser.password_hash;
          
          return res.json({
            ok: true,
            accessToken,
            refreshToken,
            role: dbUser.role,
            user: dbUser,
            workspaces
          });
        }
      }
    } catch (e) {
      // Continue to legacy check
    }
    
    // Legacy admin check via env
    if (user === process.env.ADMIN_USER && process.env.ADMIN_PASS_HASH) {
      const bcrypt = require('bcrypt');
      const valid = await bcrypt.compare(pass, process.env.ADMIN_PASS_HASH);
      
      if (valid) {
        // Find or create legacy admin user in new system
        const db = getDb();
        let legacyUser = db.prepare('SELECT * FROM users WHERE email = ?').get(user.toLowerCase());
        
        if (!legacyUser) {
          // Create from env
          const org = db.prepare('SELECT * FROM organizations LIMIT 1').get();
          if (org) {
            const now = Date.now();
            const result = db.prepare(`
              INSERT INTO users (org_id, email, password_hash, role, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(org.id, user.toLowerCase(), process.env.ADMIN_PASS_HASH, 'org_admin', 1, now, now);
            
            legacyUser = identityService.getUserById(result.lastInsertRowid);
          }
        }
        
        if (legacyUser) {
          const accessToken = signAccessToken({
            sub: String(legacyUser.id),
            orgId: String(legacyUser.org_id),
            role: legacyUser.role,
            email: legacyUser.email
          });
          
          const refreshToken = signRefreshToken({
            sub: String(legacyUser.id),
            orgId: String(legacyUser.org_id),
            role: legacyUser.role,
            type: 'refresh'
          });
          
          return res.json({
            ok: true,
            accessToken,
            refreshToken,
            role: legacyUser.role,
            user: legacyUser
          });
        }
      }
    }
    
    throw new HttpError(401, 'invalid credentials');
  } catch (error) {
    next(error);
  }
});

// POST /api/logout - Legacy logout
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
