const { getDb } = require('../../storage/sqlite');
const { HttpError } = require('../../core/errors/httpError');

const VALID_LIMIT_MODES = ['off', 'alert', 'block'];

function validateLimitMode(mode) {
  if (!mode || !VALID_LIMIT_MODES.includes(mode)) {
    throw new HttpError(400, `limit_mode must be one of: ${VALID_LIMIT_MODES.join(', ')}`);
  }
  return mode;
}

function validateDailyLimit(limit) {
  if (limit === null || limit === undefined) {
    return null;
  }
  
  const parsed = Number.parseFloat(limit);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new HttpError(400, 'daily_limit_usd must be a positive number or null');
  }
  return parsed;
}

function getTodayCostByKey(keyId) {
  const db = getDb();
  
  const today = new Date().toISOString().split('T')[0];
  const fromIso = `${today}T00:00:00.000Z`;
  const toIso = `${today}T23:59:59.999Z`;
  
  const statement = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) AS totalCost
    FROM usage_events
    WHERE api_key_id = ?
      AND event_time BETWEEN ? AND ?
  `);
  
  const row = statement.get(keyId, fromIso, toIso);
  return Number(row.totalCost || 0);
}

function getKeyLimitData(keyId) {
  const db = getDb();
  
  const statement = db.prepare(`
    SELECT 
      id,
      daily_limit_usd AS dailyLimitUsd,
      limit_mode AS limitMode
    FROM api_keys
    WHERE id = ?
    LIMIT 1
  `);
  
  return statement.get(keyId) || null;
}

function checkDailyLimit(key) {
  if (!key || !key.id) {
    return { allowed: true };
  }
  
  const limitData = getKeyLimitData(key.id);
  
  if (!limitData) {
    return { allowed: true };
  }
  
  const { dailyLimitUsd, limitMode } = limitData;
  
  // If limit is off or not set, allow
  if (limitMode === 'off' || dailyLimitUsd === null || dailyLimitUsd === undefined) {
    return { allowed: true };
  }
  
  const todayCost = getTodayCostByKey(key.id);
  const projectedCost = todayCost;
  
  if (projectedCost >= dailyLimitUsd) {
    if (limitMode === 'block') {
      throw new HttpError(
        402,
        `Daily limit exceeded. Limit: $${dailyLimitUsd.toFixed(4)}, Used: $${todayCost.toFixed(4)}`
      );
    } else if (limitMode === 'alert') {
      return {
        allowed: true,
        warning: true,
        message: `Daily limit warning. Limit: $${dailyLimitUsd.toFixed(4)}, Used: $${todayCost.toFixed(4)}`,
        todayCost,
        dailyLimitUsd,
      };
    }
  }
  
  return { allowed: true };
}

module.exports = {
  validateLimitMode,
  validateDailyLimit,
  checkDailyLimit,
  getTodayCostByKey,
  getKeyLimitData,
};
