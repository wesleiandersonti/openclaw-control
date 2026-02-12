const { verifyAccessToken } = require('../core/auth/jwt');
const { HttpError } = require('../core/errors/httpError');

function readBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function requireAuth(req, res, next) {
  const token = readBearerToken(req);

  if (!token) {
    return next(new HttpError(401, 'missing bearer token'));
  }

  try {
    const payload = verifyAccessToken(token);
    
    // Support both legacy and new format
    req.auth = {
      userId: payload.sub,
      username: payload.username || payload.email,
      email: payload.email,
      orgId: payload.orgId,
      role: payload.role || 'viewer',
      workspaceId: payload.workspaceId || null
    };
    
    // Set workspace from header if provided and not in token
    const workspaceHeader = req.headers['x-workspace-id'];
    if (workspaceHeader && !req.auth.workspaceId) {
      req.auth.workspaceId = workspaceHeader;
    }
    
    // Make workspaceId available on req for convenience
    req.workspaceId = req.auth.workspaceId;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireAuth
};
