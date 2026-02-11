const { getDb } = require('../../storage/sqlite');
const { HttpError } = require('../../core/errors/httpError');

function parseDateRange(from, to) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (from && !dateRegex.test(from)) {
    throw new HttpError(400, 'invalid from date format, expected YYYY-MM-DD');
  }

  if (to && !dateRegex.test(to)) {
    throw new HttpError(400, 'invalid to date format, expected YYYY-MM-DD');
  }

  const fromIso = from ? `${from}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z';
  const toIso = to ? `${to}T23:59:59.999Z` : '2999-12-31T23:59:59.999Z';
  const fromDate = new Date(fromIso);
  const toDate = new Date(toIso);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new HttpError(400, 'invalid date value');
  }

  if (fromDate > toDate) {
    throw new HttpError(400, 'from must be less than or equal to to');
  }

  return { fromIso, toIso };
}

function toNonNegativeInteger(value, field, fallback = 0) {
  const parsed = value === undefined || value === null || value === ''
    ? fallback
    : Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    throw new HttpError(400, `${field} must be a non-negative integer`);
  }

  return parsed;
}

function toNonNegativeNumber(value, field, fallback = 0) {
  const parsed = value === undefined || value === null || value === ''
    ? fallback
    : Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, `${field} must be a non-negative number`);
  }

  return parsed;
}

function ensureString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required`);
  }

  return value.trim();
}

function mapAggregateRow(row) {
  return {
    events: Number(row.events || 0),
    inputTokens: Number(row.inputTokens || 0),
    outputTokens: Number(row.outputTokens || 0),
    totalTokens: Number(row.totalTokens || 0),
    costUsd: Number(row.costUsd || 0)
  };
}

function recordUsage(payload, actor) {
  const provider = ensureString(payload.provider, 'provider').toLowerCase();
  const model = ensureString(payload.model, 'model');
  const sessionId = payload.sessionId ? String(payload.sessionId) : null;
  const apiKeyId = payload.apiKeyId === undefined || payload.apiKeyId === null || payload.apiKeyId === ''
    ? null
    : Number.parseInt(payload.apiKeyId, 10);

  if (apiKeyId !== null && (Number.isNaN(apiKeyId) || apiKeyId <= 0)) {
    throw new HttpError(400, 'apiKeyId must be a positive integer');
  }
  const inputTokens = toNonNegativeInteger(payload.inputTokens, 'inputTokens', 0);
  const outputTokens = toNonNegativeInteger(payload.outputTokens, 'outputTokens', 0);
  const totalTokens = payload.totalTokens === undefined
    ? inputTokens + outputTokens
    : toNonNegativeInteger(payload.totalTokens, 'totalTokens', 0);
  const costUsd = toNonNegativeNumber(payload.costUsd, 'costUsd', 0);
  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();

  if (Number.isNaN(timestamp.getTime())) {
    throw new HttpError(400, 'invalid timestamp');
  }

  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO usage_events (
      provider,
      model,
      session_id,
      api_key_id,
      input_tokens,
      output_tokens,
      total_tokens,
      cost_usd,
      event_time,
      created_by,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const result = statement.run(
    provider,
    model,
    sessionId,
    apiKeyId,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    timestamp.toISOString(),
    actor.username
  );

  return {
    id: Number(result.lastInsertRowid),
    provider,
    model,
    sessionId,
    apiKeyId,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    timestamp: timestamp.toISOString()
  };
}

function getUsageSummary(query) {
  const db = getDb();
  const { fromIso, toIso } = parseDateRange(query.from, query.to);
  const statement = db.prepare(`
    SELECT
      COUNT(*) AS events,
      COALESCE(SUM(input_tokens), 0) AS inputTokens,
      COALESCE(SUM(output_tokens), 0) AS outputTokens,
      COALESCE(SUM(total_tokens), 0) AS totalTokens,
      COALESCE(SUM(cost_usd), 0) AS costUsd
    FROM usage_events
    WHERE event_time BETWEEN ? AND ?
  `);

  const row = statement.get(fromIso, toIso);
  return {
    from: fromIso,
    to: toIso,
    ...mapAggregateRow(row)
  };
}

function getUsagePerModel(query) {
  const db = getDb();
  const { fromIso, toIso } = parseDateRange(query.from, query.to);
  const statement = db.prepare(`
    SELECT
      provider,
      model,
      COUNT(*) AS events,
      COALESCE(SUM(input_tokens), 0) AS inputTokens,
      COALESCE(SUM(output_tokens), 0) AS outputTokens,
      COALESCE(SUM(total_tokens), 0) AS totalTokens,
      COALESCE(SUM(cost_usd), 0) AS costUsd
    FROM usage_events
    WHERE event_time BETWEEN ? AND ?
    GROUP BY provider, model
    ORDER BY totalTokens DESC
  `);

  return statement.all(fromIso, toIso).map((row) => ({
    provider: row.provider,
    model: row.model,
    ...mapAggregateRow(row)
  }));
}

function getUsagePerSession(query) {
  const db = getDb();
  const { fromIso, toIso } = parseDateRange(query.from, query.to);
  const statement = db.prepare(`
    SELECT
      COALESCE(session_id, 'unknown') AS sessionId,
      COUNT(*) AS events,
      COALESCE(SUM(input_tokens), 0) AS inputTokens,
      COALESCE(SUM(output_tokens), 0) AS outputTokens,
      COALESCE(SUM(total_tokens), 0) AS totalTokens,
      COALESCE(SUM(cost_usd), 0) AS costUsd
    FROM usage_events
    WHERE event_time BETWEEN ? AND ?
    GROUP BY COALESCE(session_id, 'unknown')
    ORDER BY totalTokens DESC
  `);

  return statement.all(fromIso, toIso).map((row) => ({
    sessionId: row.sessionId,
    ...mapAggregateRow(row)
  }));
}

function getUsagePerKey(query) {
  const db = getDb();
  const { fromIso, toIso } = parseDateRange(query.from, query.to);
  const statement = db.prepare(`
    SELECT
      ue.api_key_id AS apiKeyId,
      COALESCE(ak.provider, ue.provider) AS provider,
      ak.masked_key AS maskedKey,
      COUNT(*) AS events,
      COALESCE(SUM(ue.input_tokens), 0) AS inputTokens,
      COALESCE(SUM(ue.output_tokens), 0) AS outputTokens,
      COALESCE(SUM(ue.total_tokens), 0) AS totalTokens,
      COALESCE(SUM(ue.cost_usd), 0) AS costUsd
    FROM usage_events ue
    LEFT JOIN api_keys ak ON ak.id = ue.api_key_id
    WHERE ue.event_time BETWEEN ? AND ?
    GROUP BY ue.api_key_id, COALESCE(ak.provider, ue.provider), ak.masked_key
    ORDER BY totalTokens DESC
  `);

  return statement.all(fromIso, toIso).map((row) => ({
    apiKeyId: row.apiKeyId,
    provider: row.provider,
    maskedKey: row.maskedKey,
    ...mapAggregateRow(row)
  }));
}

module.exports = {
  recordUsage,
  getUsageSummary,
  getUsagePerModel,
  getUsagePerSession,
  getUsagePerKey
};
