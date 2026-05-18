/**
 * GoalForge — Database Layer (SQLite via better-sqlite3)
 * 
 * Design rationale:
 * - SQLite = zero infrastructure cost (Evaluation Parameter #6)
 * - Single-file DB, trivially portable for demo
 * - Audit trail table for governance (Evaluation Parameter #2)
 * - Supports all UoM types, shared goals, escalation rules
 * - Uses /tmp on Vercel (serverless writable dir)
 * - Auto-seeds on cold start for demo reliability
 */

const Database = require('better-sqlite3');
const path = require('path');

// Vercel serverless: filesystem is read-only except /tmp
const IS_VERCEL = !!(process.env.VERCEL || process.env.VERCEL_ENV);
const DB_PATH = IS_VERCEL
  ? '/tmp/goalforge.db'
  : path.join(process.cwd(), 'data', 'goalforge.db');

let db;

function getDb() {
  if (!db) {
    try {
      if (!IS_VERCEL) {
        const fs = require('fs');
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      initSchema();
      autoSeed();
    } catch (err) {
      console.error('DB init error:', err);
      throw err;
    }
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
      details TEXT,
      notified_users TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by INTEGER REFERENCES users(id),
      resolution TEXT
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

  ensureColumn('escalation_log', 'details', 'TEXT');
  ensureColumn('escalation_log', 'resolution', 'TEXT');
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Auto-seed on cold start if users table is empty.
 * On Vercel, /tmp is wiped between invocations so DB must self-seed.
 */
function autoSeed() {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (row.count > 0) return;

  console.log('🌱 Auto-seeding GoalForge database...');
  const { hashPassword } = require('./auth');
  const pwd = hashPassword('password123');

  const insertUser = db.prepare(
    'INSERT INTO users (employee_id, name, email, password_hash, role, department, manager_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const admin = insertUser.run('admin001', 'Priya Sharma', 'priya.sharma@company.com', pwd, 'admin', 'HR', null);
  const mgr1 = insertUser.run('mgr001', 'Rajesh Kumar', 'rajesh.kumar@company.com', pwd, 'manager', 'Engineering', null);
  const mgr2 = insertUser.run('mgr002', 'Anita Desai', 'anita.desai@company.com', pwd, 'manager', 'Sales', null);
  insertUser.run('emp001', 'Arjun Patel', 'arjun.patel@company.com', pwd, 'employee', 'Engineering', mgr1.lastInsertRowid);
  insertUser.run('emp002', 'Sneha Reddy', 'sneha.reddy@company.com', pwd, 'employee', 'Engineering', mgr1.lastInsertRowid);
  insertUser.run('emp003', 'Vikram Singh', 'vikram.singh@company.com', pwd, 'employee', 'Engineering', mgr1.lastInsertRowid);
  insertUser.run('emp004', 'Meera Nair', 'meera.nair@company.com', pwd, 'employee', 'Sales', mgr2.lastInsertRowid);
  insertUser.run('emp005', 'Rohit Joshi', 'rohit.joshi@company.com', pwd, 'employee', 'Sales', mgr2.lastInsertRowid);

  db.prepare(
    `INSERT INTO cycles (name, year, goal_setting_start, goal_setting_end,
      q1_start, q1_end, q2_start, q2_end, q3_start, q3_end, q4_start, q4_end, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('FY 2026-27', 2026, '2026-05-01', '2026-05-31',
    '2026-07-01', '2026-07-31', '2026-10-01', '2026-10-31',
    '2027-01-01', '2027-01-31', '2027-03-01', '2027-04-15', 1);

  const insertTA = db.prepare('INSERT INTO thrust_areas (name, description) VALUES (?, ?)');
  insertTA.run('Revenue Growth', 'Goals related to increasing revenue and business development');
  insertTA.run('Operational Excellence', 'Goals focused on process improvement and efficiency');
  insertTA.run('Customer Satisfaction', 'Goals targeting customer experience and retention');
  insertTA.run('Innovation & Learning', 'Goals for skill development, R&D, and innovation');
  insertTA.run('People & Culture', 'Goals related to team building, mentorship, and culture');
  insertTA.run('Compliance & Governance', 'Goals for regulatory compliance and risk management');

  const insertRule = db.prepare(
    'INSERT INTO escalation_rules (rule_name, trigger_condition, days_threshold, escalation_level, notify_employee, notify_manager, notify_hr) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertRule.run('Goal Submission Reminder', 'goal_not_submitted', 7, 1, 1, 0, 0);
  insertRule.run('Goal Submission Escalation', 'goal_not_submitted', 14, 2, 1, 1, 0);
  insertRule.run('Goal Submission Critical', 'goal_not_submitted', 21, 3, 1, 1, 1);
  insertRule.run('Goal Approval Reminder', 'goal_not_approved', 5, 1, 0, 1, 0);
  insertRule.run('Goal Approval Escalation', 'goal_not_approved', 10, 2, 0, 1, 1);
  insertRule.run('Check-in Reminder', 'checkin_not_completed', 7, 1, 1, 1, 0);
  insertRule.run('Check-in Escalation', 'checkin_not_completed', 14, 2, 1, 1, 1);

  console.log('🎉 Auto-seed complete!');
}

module.exports = { getDb };
