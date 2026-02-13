const { HttpError } = require('../errors/httpError');

const ROLE_WEIGHT = {
  viewer: 1,
  operator: 2,
  admin: 3
};

function hasRole(userRole, requiredRole) {
  const userWeight = ROLE_WEIGHT[userRole] || 0;
  const requiredWeight = ROLE_WEIGHT[requiredRole] || 0;
  return userWeight >= requiredWeight;
}

function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.auth) {
      return next(new HttpError(401, 'authentication required'));
    }

    const canAccess = roles.some((role) => hasRole(req.auth.role, role));
    if (!canAccess) {
      return next(new HttpError(403, 'forbidden'));
    }

    return next();
  };
}

module.exports = {
  requireRole
};
