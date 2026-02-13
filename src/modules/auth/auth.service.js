const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { env } = require('../../config/env');
const { getDb } = require('../../storage/sqlite');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../core/auth/jwt');
const { hashValue } = require('../../core/crypto/keyVault');
const { HttpError } = require('../../core/errors/httpError');

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDateTime(date) {
  return date.toISOString();
}

function ensureString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required`);
  }

  return value.trim();
}

function findActiveUser(username) {
  const db = getDb();
  const statement = db.prepare(`
    SELECT id, username, pass_hash AS passHash, role
    FROM users
    WHERE username = ? AND is_active = 1
    LIMIT 1
  `);

  return statement.get(username) || null;
}

function createRefreshTokenRecord(user, refreshToken, jti) {
  const db = getDb();
  const tokenHash = hashValue(refreshToken);
  const expiresAt = addDays(new Date(), env.JWT_REFRESH_TTL_DAYS);

  const statement = db.prepare(`
    INSERT INTO refresh_tokens (
      jti,
      user_id,
      username,
      role,
      token_hash,
      expires_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  statement.run(
    jti,
    user.userId || null,
    user.username,
    user.role,
    tokenHash,
    toIsoDateTime(expiresAt)
  );
}

async function validateUserCredentials(rawUser, rawPass) {
  const username = ensureString(rawUser, 'user');
  const password = ensureString(rawPass, 'pass');
  const dbUser = findActiveUser(username);

  if (dbUser) {
    const valid = await bcrypt.compare(password, dbUser.passHash);
    if (!valid) {
      throw new HttpError(401, 'invalid credentials');
    }

    return {
      userId: dbUser.id,
      username: dbUser.username,
      role: dbUser.role
    };
  }

  if (username !== env.ADMIN_USER || !env.ADMIN_PASS_HASH) {
    throw new HttpError(401, 'invalid credentials');
  }

  const validAdmin = await bcrypt.compare(password, env.ADMIN_PASS_HASH);
  if (!validAdmin) {
    throw new HttpError(401, 'invalid credentials');
  }

  return {
    userId: null,
    username,
    role: 'admin'
  };
}

async function login(payload) {
  const user = await validateUserCredentials(payload.user, payload.pass);
  const subject = user.userId ? String(user.userId) : user.username;

  const accessToken = signAccessToken({
    sub: subject,
    username: user.username,
    role: user.role
  });

  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken({
    sub: subject,
    username: user.username,
    role: user.role,
    jti,
    type: 'refresh'
  });

  createRefreshTokenRecord(user, refreshToken, jti);

  return {
    accessToken,
    refreshToken,
    role: user.role
  };
}

function getStoredRefreshToken(jti, tokenHash) {
  const db = getDb();
  const statement = db.prepare(`
    SELECT id, user_id AS userId, username, role
    FROM refresh_tokens
    WHERE jti = ?
      AND token_hash = ?
      AND revoked_at IS NULL
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `);

  return statement.get(jti, tokenHash) || null;
}

function refresh(payload) {
  const refreshToken = ensureString(payload.refreshToken, 'refreshToken');
  const decoded = verifyRefreshToken(refreshToken);

  if (decoded.type !== 'refresh' || !decoded.jti) {
    throw new HttpError(401, 'invalid refresh token');
  }

  const tokenHash = hashValue(refreshToken);
  const storedToken = getStoredRefreshToken(decoded.jti, tokenHash);

  if (!storedToken) {
    throw new HttpError(401, 'invalid refresh token');
  }

  const subject = storedToken.userId ? String(storedToken.userId) : storedToken.username;
  const accessToken = signAccessToken({
    sub: subject,
    username: storedToken.username,
    role: storedToken.role
  });

  return { accessToken };
}

function logout(payload) {
  const refreshToken = ensureString(payload.refreshToken, 'refreshToken');
  const decoded = verifyRefreshToken(refreshToken);

  if (decoded.type !== 'refresh' || !decoded.jti) {
    throw new HttpError(401, 'invalid refresh token');
  }

  const db = getDb();
  const tokenHash = hashValue(refreshToken);
  const statement = db.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = datetime('now')
    WHERE jti = ?
      AND token_hash = ?
      AND revoked_at IS NULL
  `);

  statement.run(decoded.jti, tokenHash);

  return { ok: true };
}

module.exports = {
  login,
  refresh,
  logout
};
