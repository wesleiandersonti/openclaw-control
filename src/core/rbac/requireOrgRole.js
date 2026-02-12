const { HttpError } = require('../errors/httpError');

const ROLE_WEIGHT = {
  org_admin: 4,
  admin: 3,
  operator: 2,
  viewer: 1
};

const WORKSPACE_ROLE_WEIGHT = {
  workspace_admin: 3,
  member: 2,
  viewer: 1
};

/**
 * Check if user has required organization role
 * @param {string} userRole - User's role in organization
 * @param {string|string[]} requiredRole - Required role(s)
 * @returns {boolean}
 */
function hasOrgRole(userRole, requiredRole) {
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const userWeight = ROLE_WEIGHT[userRole] || 0;
  
  return roles.some(role => {
    const requiredWeight = ROLE_WEIGHT[role] || 0;
    return userWeight >= requiredWeight;
  });
}

/**
 * Check if user has required workspace role
 * @param {string} userRole - User's role in workspace
 * @param {string|string[]} requiredRole - Required role(s)
 * @returns {boolean}
 */
function hasWorkspaceRole(userRole, requiredRole) {
  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const userWeight = WORKSPACE_ROLE_WEIGHT[userRole] || 0;
  
  return roles.some(role => {
    const requiredWeight = WORKSPACE_ROLE_WEIGHT[role] || 0;
    return userWeight >= requiredWeight;
  });
}

/**
 * Middleware to require specific organization role
 * @param {string|string[]} roles - Required role(s)
 * @returns {Function} Express middleware
 */
function requireOrgRole(roles) {
  return (req, res, next) => {
    if (!req.auth) {
      return next(new HttpError(401, 'authentication required'));
    }

    const canAccess = hasOrgRole(req.auth.role, roles);
    if (!canAccess) {
      return next(new HttpError(403, 'insufficient organization privileges'));
    }

    return next();
  };
}

/**
 * Middleware to require specific workspace role
 * Checks if user is member of current workspace with sufficient role
 * @param {string|string[]} roles - Required role(s)
 * @returns {Function} Express middleware
 */
function requireWorkspaceRole(roles) {
  return async (req, res, next) => {
    if (!req.auth) {
      return next(new HttpError(401, 'authentication required'));
    }

    if (!req.workspaceId) {
      return next(new HttpError(400, 'workspace context required'));
    }

    // org_admin bypasses workspace checks
    if (hasOrgRole(req.auth.role, 'org_admin')) {
      return next();
    }

    try {
      const { getDb } = require('../storage/sqlite');
      const db = getDb();
      
      const membership = db.prepare(`
        SELECT role FROM workspace_members
        WHERE workspace_id = ? AND user_id = ?
      `).get(req.workspaceId, req.auth.userId);

      if (!membership) {
        return next(new HttpError(403, 'not a member of this workspace'));
      }

      const canAccess = hasWorkspaceRole(membership.role, roles);
      if (!canAccess) {
        return next(new HttpError(403, 'insufficient workspace privileges'));
      }

      req.workspaceRole = membership.role;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  hasOrgRole,
  hasWorkspaceRole,
  requireOrgRole,
  requireWorkspaceRole
};
