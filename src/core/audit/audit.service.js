const { getDb } = require('../../storage/sqlite');

function writeAuditLog(entry) {
  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO audit_log (
      user_name,
      user_role,
      action,
      target_type,
      target_id,
      metadata,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  statement.run(
    entry.userName,
    entry.userRole,
    entry.action,
    entry.targetType || 'resource',
    entry.targetId || null,
    entry.metadata ? JSON.stringify(entry.metadata) : null
  );
}

module.exports = {
  writeAuditLog
};
