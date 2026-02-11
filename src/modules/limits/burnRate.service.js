const { getDb } = require('../../storage/sqlite');
const { HttpError } = require('../../core/errors/httpError');
const { getTodayCostByKey, getKeyLimitData } = require('./limits.service');

function getBurnRate(keyId) {
  if (!keyId || Number.isNaN(Number(keyId))) {
    throw new HttpError(400, 'keyId is required');
  }

  const id = Number(keyId);

  // Fetch key limit config
  const limitData = getKeyLimitData(id);

  if (!limitData) {
    throw new HttpError(404, 'api key not found');
  }

  const { dailyLimitUsd, limitMode } = limitData;

  // Calculate today's total cost
  const todayCost = getTodayCostByKey(id);

  // Fetch usage from last 60 minutes
  const db = getDb();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const statement = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) AS lastHourCost
    FROM usage_events
    WHERE api_key_id = ?
      AND created_at >= ?
  `);

  const row = statement.get(id, oneHourAgo);
  const lastHourCost = Number(row.lastHourCost || 0);

  // Calculate burn rate
  const burnRateUsdPerHour = lastHourCost;

  // Calculate remaining and estimated time
  let remainingUsd = null;
  let estimatedHoursToLimit = null;
  let safe = true;
  let level = 'normal';

  if (dailyLimitUsd !== null && dailyLimitUsd !== undefined && limitMode !== 'off') {
    remainingUsd = Math.max(0, dailyLimitUsd - todayCost);

    if (burnRateUsdPerHour > 0) {
      estimatedHoursToLimit = remainingUsd / burnRateUsdPerHour;
    } else {
      estimatedHoursToLimit = null;
    }

    // Define level
    if (estimatedHoursToLimit !== null) {
      if (estimatedHoursToLimit < 1) {
        level = 'danger';
        safe = false;
      } else if (estimatedHoursToLimit < 3) {
        level = 'warning';
      } else {
        level = 'normal';
      }
    } else {
      // Burn rate is 0
      level = 'normal';
      safe = true;
    }
  }

  return {
    todayCost,
    dailyLimit: dailyLimitUsd,
    burnRateUsdPerHour,
    estimatedHoursToLimit,
    safe,
    level,
    limitMode: limitMode || 'off',
  };
}

module.exports = {
  getBurnRate,
};
