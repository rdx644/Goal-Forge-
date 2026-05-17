/**
 * GoalForge — Database Seed Script
 * Creates demo users, cycles, thrust areas, and sample goals
 * 
 * Run: node lib/seed.js
 * 
 * Demo Credentials:
 * - Employee: emp001 / password123
 * - Manager:  mgr001 / password123
 * - Admin:    admin001 / password123
 */

const { getDb } = require('./db');
const { hashPassword } = require('./auth');

function seed() {
  const db = getDb();

  console.log('🌱 Seeding GoalForge database...');

  // Clear existing data
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM escalation_log;
    DELETE FROM escalation_rules;
    DELETE FROM audit_log;
    DELETE FROM checkins;
    DELETE FROM achievements;
    DELETE FROM goals;
    DELETE FROM goal_sheets;
    DELETE FROM thrust_areas;
    DELETE FROM cycles;
    DELETE FROM users;
  `);

  // 1. Create Users
  const insertUser = db.prepare(`
    INSERT INTO users (employee_id, name, email, password_hash, role, department, manager_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const pwd = hashPassword('password123');

  // Admin
  const admin = insertUser.run('admin001', 'Priya Sharma', 'priya.sharma@company.com', pwd, 'admin', 'HR', null);
  
  // Managers
  const mgr1 = insertUser.run('mgr001', 'Rajesh Kumar', 'rajesh.kumar@company.com', pwd, 'manager', 'Engineering', null);
  const mgr2 = insertUser.run('mgr002', 'Anita Desai', 'anita.desai@company.com', pwd, 'manager', 'Sales', null);
  
  // Employees under Manager 1 (Engineering)
  insertUser.run('emp001', 'Arjun Patel', 'arjun.patel@company.com', pwd, 'employee', 'Engineering', mgr1.lastInsertRowid);
  insertUser.run('emp002', 'Sneha Reddy', 'sneha.reddy@company.com', pwd, 'employee', 'Engineering', mgr1.lastInsertRowid);
  insertUser.run('emp003', 'Vikram Singh', 'vikram.singh@company.com', pwd, 'employee', 'Engineering', mgr1.lastInsertRowid);
  
  // Employees under Manager 2 (Sales)
  insertUser.run('emp004', 'Meera Nair', 'meera.nair@company.com', pwd, 'employee', 'Sales', mgr2.lastInsertRowid);
  insertUser.run('emp005', 'Rohit Joshi', 'rohit.joshi@company.com', pwd, 'employee', 'Sales', mgr2.lastInsertRowid);

  console.log('  ✅ Users created');

  // 2. Create Performance Cycle
  db.prepare(`
    INSERT INTO cycles (name, year, goal_setting_start, goal_setting_end,
      q1_start, q1_end, q2_start, q2_end, q3_start, q3_end, q4_start, q4_end, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'FY 2026-27', 2026,
    '2026-05-01', '2026-05-31',
    '2026-07-01', '2026-07-31',
    '2026-10-01', '2026-10-31',
    '2027-01-01', '2027-01-31',
    '2027-03-01', '2027-04-15',
    1
  );

  console.log('  ✅ Performance cycle created');

  // 3. Create Thrust Areas
  const insertTA = db.prepare('INSERT INTO thrust_areas (name, description) VALUES (?, ?)');
  insertTA.run('Revenue Growth', 'Goals related to increasing revenue and business development');
  insertTA.run('Operational Excellence', 'Goals focused on process improvement and efficiency');
  insertTA.run('Customer Satisfaction', 'Goals targeting customer experience and retention');
  insertTA.run('Innovation & Learning', 'Goals for skill development, R&D, and innovation');
  insertTA.run('People & Culture', 'Goals related to team building, mentorship, and culture');
  insertTA.run('Compliance & Governance', 'Goals for regulatory compliance and risk management');

  console.log('  ✅ Thrust areas created');

  // 4. Create Escalation Rules (Good-to-Have Section 5.3)
  const insertRule = db.prepare(`
    INSERT INTO escalation_rules (rule_name, trigger_condition, days_threshold, escalation_level, notify_employee, notify_manager, notify_hr)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertRule.run('Goal Submission Reminder', 'goal_not_submitted', 7, 1, 1, 0, 0);
  insertRule.run('Goal Submission Escalation', 'goal_not_submitted', 14, 2, 1, 1, 0);
  insertRule.run('Goal Submission Critical', 'goal_not_submitted', 21, 3, 1, 1, 1);
  insertRule.run('Goal Approval Reminder', 'goal_not_approved', 5, 1, 0, 1, 0);
  insertRule.run('Goal Approval Escalation', 'goal_not_approved', 10, 2, 0, 1, 1);
  insertRule.run('Check-in Reminder', 'checkin_not_completed', 7, 1, 1, 1, 0);
  insertRule.run('Check-in Escalation', 'checkin_not_completed', 14, 2, 1, 1, 1);

  console.log('  ✅ Escalation rules created');

  console.log('\n🎉 Seed complete!\n');
  console.log('Demo Credentials:');
  console.log('  Employee: emp001 / password123');
  console.log('  Manager:  mgr001 / password123');
  console.log('  Admin:    admin001 / password123');
}

seed();
