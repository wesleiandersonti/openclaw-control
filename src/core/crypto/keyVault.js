const crypto = require('node:crypto');
const { env } = require('../../config/env');

function getMasterKeyBuffer() {
  const masterKey = Buffer.from(env.KEY_ENC_MASTER_B64, 'base64');

  if (masterKey.length !== 32) {
    throw new Error('KEY_ENC_MASTER_B64 must decode to exactly 32 bytes');
  }

  return masterKey;
}

function encryptSecret(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('secret is required for encryption');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKeyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

function decryptSecret(payload) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getMasterKeyBuffer(),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedKey, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function maskKey(key) {
  const normalized = String(key || '');
  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
  }

  return `${normalized.slice(0, 3)}...${normalized.slice(-4)}`;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  hashValue,
  maskKey
};
