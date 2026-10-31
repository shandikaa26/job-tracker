const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'jobs.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      position TEXT NOT NULL,
      location TEXT DEFAULT '',
      salary TEXT DEFAULT '',
      job_type TEXT DEFAULT '',
      description TEXT DEFAULT '',
      source TEXT DEFAULT '',
      url TEXT DEFAULT '',
      status TEXT DEFAULT 'Applied',
      notes TEXT DEFAULT '',
      applied_date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      changed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper: run a query that returns rows
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: run a query that returns one row
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: run a statement (INSERT, UPDATE, DELETE)
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return {
    lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0],
    changes: db.getRowsModified()
  };
}

module.exports = { getDb, queryAll, queryOne, run, saveDb };
