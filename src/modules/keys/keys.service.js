const { getDb } = require('../../storage/sqlite');
const { encryptSecret, decryptSecret, hashValue, maskKey } = require('../../core/crypto/keyVault');
const { writeAuditLog } = require('../../core/audit/audit.service');
const { HttpError } = require('../../core/errors/httpError');

const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'custom'];

function normalizeProvider(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(normalized)) {
    throw new HttpError(400, 'invalid provider');
  }

  return normalized;
}

function normalizeName(name) {
  if (typeof name !== 'string') {
    return null;
  }

  const trimmed = name.trim();
  return trimmed.length ? trimmed : null;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }

  return fallback;
}

function parseToggleValue(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }

  throw new HttpError(400, 'isActive must be a boolean');
}

function mapKey(row) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    maskedKey: row.maskedKey,
    isActive: Boolean(row.isActive),
    isDefault: Boolean(row.isDefault),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function listKeys(providerFilter) {
  const db = getDb();
  const provider = providerFilter ? normalizeProvider(providerFilter) : null;
  const statement = db.prepare(`
    SELECT
      id,
      provider,
      name,
      masked_key AS maskedKey,
      is_active AS isActive,
      is_default AS isDefault,
      created_by AS createdBy,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM api_keys
    WHERE (? IS NULL OR provider = ?)
    ORDER BY provider ASC, is_default DESC, id DESC
  `);

  return statement.all(provider, provider).map(mapKey);
}

function createKey(payload, actor) {
  const provider = normalizeProvider(payload.provider);
  const rawKey = String(payload.apiKey || '').trim();

  if (!rawKey) {
    throw new HttpError(400, 'apiKey is required');
  }

  const name = normalizeName(payload.name);
  const shouldSetDefault = toBoolean(payload.isDefault, false);
  const encrypted = encryptSecret(rawKey);
  const masked = maskKey(rawKey);
  const keyHash = hashValue(rawKey);
  const db = getDb();

  const transaction = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO api_keys (
        provider,
        name,
        encrypted_key,
        iv,
        auth_tag,
        masked_key,
        key_hash,
        is_active,
        is_default,
        created_by,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, datetime('now'), datetime('now'))
    `);

    const result = insert.run(
      provider,
      name,
      encrypted.encryptedKey,
      encrypted.iv,
      encrypted.authTag,
      masked,
      keyHash,
      actor.username
    );

    const keyId = Number(result.lastInsertRowid);

    if (shouldSetDefault) {
      db.prepare('UPDATE api_keys SET is_default = 0, updated_at = datetime(\'now\') WHERE provider = ?').run(provider);
      db.prepare('UPDATE api_keys SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ?').run(keyId);
    }

    writeAuditLog({
      userName: actor.username,
      userRole: actor.role,
      action: 'api_key.create',
      targetType: 'api_key',
      targetId: String(keyId),
      metadata: {
        provider,
        isDefault: shouldSetDefault
      }
    });

    return keyId;
  });

  let keyId;

  try {
    keyId = transaction();
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE constraint failed: api_keys.key_hash')) {
      throw new HttpError(409, 'api key already exists');
    }
    throw error;
  }

  return getKeyById(keyId);
}

function getKeyById(keyId) {
  const db = getDb();
  const statement = db.prepare(`
    SELECT
      id,
      provider,
      name,
      masked_key AS maskedKey,
      is_active AS isActive,
      is_default AS isDefault,
      created_by AS createdBy,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM api_keys
    WHERE id = ?
    LIMIT 1
  `);

  const key = statement.get(keyId);
  if (!key) {
    throw new HttpError(404, 'api key not found');
  }

  return mapKey(key);
}

function toggleKey(keyId, isActive, actor) {
  const db = getDb();
  const active = parseToggleValue(isActive);

  const transaction = db.transaction(() => {
    const key = db.prepare('SELECT id, provider FROM api_keys WHERE id = ? LIMIT 1').get(keyId);
    if (!key) {
      throw new HttpError(404, 'api key not found');
    }

    db.prepare(`
      UPDATE api_keys
      SET is_active = ?, is_default = CASE WHEN ? = 0 THEN 0 ELSE is_default END, updated_at = datetime('now')
      WHERE id = ?
    `).run(active ? 1 : 0, active ? 1 : 0, keyId);

    writeAuditLog({
      userName: actor.username,
      userRole: actor.role,
      action: 'api_key.toggle',
      targetType: 'api_key',
      targetId: String(keyId),
      metadata: {
        isActive: active
      }
    });
  });

  transaction();
  return getKeyById(keyId);
}

function deleteKey(keyId, actor) {
  const db = getDb();
  const key = db.prepare('SELECT id, provider FROM api_keys WHERE id = ? LIMIT 1').get(keyId);

  if (!key) {
    throw new HttpError(404, 'api key not found');
  }

  const statement = db.prepare('DELETE FROM api_keys WHERE id = ?');
  statement.run(keyId);

  writeAuditLog({
    userName: actor.username,
    userRole: actor.role,
    action: 'api_key.delete',
    targetType: 'api_key',
    targetId: String(keyId),
    metadata: {
      provider: key.provider
    }
  });

  return { ok: true };
}

function setDefaultKey(keyId, actor) {
  const db = getDb();

  const transaction = db.transaction(() => {
    const key = db.prepare('SELECT id, provider, is_active AS isActive FROM api_keys WHERE id = ? LIMIT 1').get(keyId);

    if (!key) {
      throw new HttpError(404, 'api key not found');
    }

    if (!key.isActive) {
      throw new HttpError(400, 'cannot set inactive key as default');
    }

    db.prepare('UPDATE api_keys SET is_default = 0, updated_at = datetime(\'now\') WHERE provider = ?').run(key.provider);
    db.prepare('UPDATE api_keys SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ?').run(keyId);

    writeAuditLog({
      userName: actor.username,
      userRole: actor.role,
      action: 'api_key.set_default',
      targetType: 'api_key',
      targetId: String(keyId),
      metadata: {
        provider: key.provider
      }
    });
  });

  transaction();
  return getKeyById(keyId);
}

function getDefaultKeyWithSecret(provider) {
  const normalized = normalizeProvider(provider);
  const db = getDb();

  const statement = db.prepare(`
    SELECT
      id,
      provider,
      name,
      encrypted_key AS encryptedKey,
      iv,
      auth_tag AS authTag,
      masked_key AS maskedKey,
      is_active AS isActive,
      is_default AS isDefault
    FROM api_keys
    WHERE provider = ? AND is_active = 1 AND is_default = 1
    LIMIT 1
  `);

  const key = statement.get(normalized);
  if (!key) {
    throw new HttpError(404, `no active default key found for provider: ${provider}`);
  }

  const decryptedKey = decryptSecret({
    encryptedKey: key.encryptedKey,
    iv: key.iv,
    authTag: key.authTag,
  });

  return {
    id: key.id,
    provider: key.provider,
    name: key.name,
    apiKey: decryptedKey,
    maskedKey: key.maskedKey,
    isActive: Boolean(key.isActive),
    isDefault: Boolean(key.isDefault),
  };
}

module.exports = {
  SUPPORTED_PROVIDERS,
  listKeys,
  createKey,
  toggleKey,
  deleteKey,
  setDefaultKey,
  getDefaultKeyWithSecret,
};
