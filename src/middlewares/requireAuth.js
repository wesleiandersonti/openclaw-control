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
    req.auth = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role || 'viewer'
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireAuth
};
