const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { env } = require('../config/env');

let db;

function resolveDbPath() {
  if (path.isAbsolute(env.DB_PATH)) {
    return env.DB_PATH;
  }

  return path.resolve(process.cwd(), env.DB_PATH);
}

function ensureDbDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function getDb() {
  if (db) {
    return db;
  }

  const filePath = resolveDbPath();
  ensureDbDirectory(filePath);

  db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  closeDb,
  resolveDbPath
};
