/**
 * GoalForge — Database Layer (SQLite via better-sqlite3)
 * 
 * Design rationale:
 * - SQLite = zero infrastructure cost (Evaluation Parameter #6)
 * - Single-file DB, trivially portable for demo
 * - Audit trail table for governance (Evaluation Parameter #2)
 * - Supports all UoM types, shared goals, escalation rules
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'goalforge.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Users table with role-based access
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('employee', 'manager', 'admin')),
      department TEXT DEFAULT 'General',
      manager_id INTEGER REFERENCES users(id),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Performance cycles managed by Admin
    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      year INTEGER NOT NULL,
      goal_setting_start TEXT NOT NULL,
      goal_setting_end TEXT NOT NULL,
      q1_start TEXT, q1_end TEXT,
      q2_start TEXT, q2_end TEXT,
      q3_start TEXT, q3_end TEXT,
      q4_start TEXT, q4_end TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Thrust Areas (categories for goals)
    CREATE TABLE IF NOT EXISTS thrust_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1
    );

    -- Goal Sheets (one per employee per cycle)
    CREATE TABLE IF NOT EXISTS goal_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES users(id),
      cycle_id INTEGER NOT NULL REFERENCES cycles(id),
      status TEXT NOT NULL DEFAULT 'draft' 
        CHECK(status IN ('draft', 'submitted', 'returned', 'approved', 'locked')),
      submitted_at TEXT,
      approved_at TEXT,
      approved_by INTEGER REFERENCES users(id),
      return_reason TEXT,
      total_weightage REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, cycle_id)
    );

    -- Individual Goals within a Goal Sheet
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_sheet_id INTEGER NOT NULL REFERENCES goal_sheets(id) ON DELETE CASCADE,
      thrust_area_id INTEGER REFERENCES thrust_areas(id),
      title TEXT NOT NULL,
      description TEXT,
      uom_type TEXT NOT NULL CHECK(uom_type IN ('min_numeric', 'min_percent', 'max_numeric', 'max_percent', 'timeline', 'zero')),
      target_value REAL,
      target_date TEXT,
      weightage REAL NOT NULL CHECK(weightage >= 10),
      is_shared INTEGER DEFAULT 0,
      shared_from_goal_id INTEGER REFERENCES goals(id),
      shared_by_user_id INTEGER REFERENCES users(id),
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Quarterly Achievement Entries
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      quarter TEXT NOT NULL CHECK(quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
      actual_value REAL,
      completion_date TEXT,
      status TEXT DEFAULT 'not_started' 
        CHECK(status IN ('not_started', 'on_track', 'completed')),
      progress_score REAL,
      employee_comment TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(goal_id, quarter)
    );

    -- Manager Check-in Comments
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_sheet_id INTEGER NOT NULL REFERENCES goal_sheets(id),
      quarter TEXT NOT NULL CHECK(quarter IN ('Q1', 'Q2', 'Q3', 'Q4')),
      manager_id INTEGER NOT NULL REFERENCES users(id),
      comment TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(goal_sheet_id, quarter, manager_id)
    );

    -- Audit Trail — every change after goal lock
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      field_changed TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_by INTEGER NOT NULL REFERENCES users(id),
      changed_at TEXT DEFAULT (datetime('now')),
      reason TEXT
    );

    -- Escalation Rules (Good-to-Have Section 5.3)
    CREATE TABLE IF NOT EXISTS escalation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_name TEXT NOT NULL,
      trigger_condition TEXT NOT NULL CHECK(trigger_condition IN (
        'goal_not_submitted', 'goal_not_approved', 'checkin_not_completed'
      )),
      days_threshold INTEGER NOT NULL DEFAULT 7,
      escalation_level INTEGER NOT NULL DEFAULT 1,
      notify_employee INTEGER DEFAULT 1,
      notify_manager INTEGER DEFAULT 1,
      notify_hr INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Escalation Log
    CREATE TABLE IF NOT EXISTS escalation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER REFERENCES escalation_rules(id),
      target_user_id INTEGER NOT NULL REFERENCES users(id),
      escalation_level INTEGER NOT NULL,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'acknowledged', 'resolved')),
      notified_users TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by INTEGER REFERENCES users(id)
    );

    -- Notifications (Good-to-Have Section 5.2)
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_goals_sheet ON goals(goal_sheet_id);
    CREATE INDEX IF NOT EXISTS idx_achievements_goal ON achievements(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goal_sheets_employee ON goal_sheets(employee_id);
    CREATE INDEX IF NOT EXISTS idx_goal_sheets_cycle ON goal_sheets(cycle_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);
}

module.exports = { getDb };
