/**
 * GoalForge — Escalation Engine
 * Section 5.3: Rule-based escalation with auto-notification chain
 * 
 * Evaluates escalation rules against current data and creates
 * escalation log entries + notifications for overdue items.
 * 
 * Trigger: Call runEscalationEngine(db) via API or cron job
 */

const { dispatchNotification } = require('./notifications');

/**
 * Run the full escalation engine — evaluates all rules against current state
 * Returns summary of escalations triggered
 */
function runEscalationEngine(db) {
  const rules = db.prepare('SELECT * FROM escalation_rules WHERE is_active = 1').all();
  const activeCycle = db.prepare('SELECT * FROM cycles WHERE is_active = 1').get();

  if (!activeCycle) {
    return { triggered: 0, message: 'No active cycle found' };
  }

  const summary = { triggered: 0, details: [] };
  const now = new Date();

  for (const rule of rules) {
    let violations = [];

    switch (rule.trigger_condition) {
      case 'goal_not_submitted':
        violations = checkGoalNotSubmitted(db, activeCycle, rule, now);
        break;
      case 'goal_not_approved':
        violations = checkGoalNotApproved(db, activeCycle, rule, now);
        break;
      case 'checkin_not_completed':
        violations = checkCheckinNotCompleted(db, activeCycle, rule, now);
        break;
    }

    for (const v of violations) {
      // Check if this escalation was already logged (avoid duplicates)
      const existing = db.prepare(`
        SELECT id FROM escalation_log 
        WHERE rule_id = ? AND target_user_id = ? AND status = 'open'
        AND escalation_level = ?
      `).get(rule.id, v.userId, rule.escalation_level);

      if (existing) continue; // Already escalated at this level

      // Create escalation log entry
      db.prepare(`
        INSERT INTO escalation_log (rule_id, target_user_id, escalation_level, status, triggered_at, details)
        VALUES (?, ?, ?, 'open', datetime('now'), ?)
      `).run(rule.id, v.userId, rule.escalation_level, v.details);

      // Send notifications based on rule config
      if (rule.notify_employee) {
        const emp = db.prepare('SELECT * FROM users WHERE id = ?').get(v.userId);
        if (emp) {
          dispatchNotification(db, {
            userId: emp.id,
            type: 'escalation',
            title: `⚠️ Escalation: ${rule.rule_name}`,
            message: v.details,
            link: `/dashboard/employee`,
            emailTo: emp.email,
          });
        }
      }

      if (rule.notify_manager) {
        const emp = db.prepare('SELECT * FROM users WHERE id = ?').get(v.userId);
        if (emp?.manager_id) {
          const mgr = db.prepare('SELECT * FROM users WHERE id = ?').get(emp.manager_id);
          if (mgr) {
            dispatchNotification(db, {
              userId: mgr.id,
              type: 'escalation',
              title: `⚠️ Escalation: ${rule.rule_name}`,
              message: `${emp.name} (${emp.department}): ${v.details}`,
              link: `/dashboard/manager`,
              emailTo: mgr.email,
              teamsFacts: [
                { label: 'Employee', value: emp.name },
                { label: 'Department', value: emp.department },
                { label: 'Escalation Level', value: `Level ${rule.escalation_level}` },
              ],
            });
          }
        }
      }

      if (rule.notify_hr) {
        const admins = db.prepare("SELECT * FROM users WHERE role = 'admin'").all();
        const emp = db.prepare('SELECT * FROM users WHERE id = ?').get(v.userId);
        for (const admin of admins) {
          dispatchNotification(db, {
            userId: admin.id,
            type: 'escalation',
            title: `🔴 HR Escalation: ${rule.rule_name}`,
            message: `${emp?.name || 'Unknown'}: ${v.details}`,
            link: `/dashboard/admin`,
            emailTo: admin.email,
            teamsFacts: [
              { label: 'Employee', value: emp?.name || 'Unknown' },
              { label: 'Level', value: `Level ${rule.escalation_level} (HR Notified)` },
            ],
          });
        }
      }

      summary.triggered++;
      summary.details.push({
        rule: rule.rule_name,
        employee_id: v.userId,
        level: rule.escalation_level,
        details: v.details,
      });
    }
  }

  return summary;
}

/**
 * Check for employees who haven't submitted goals within N days of cycle start
 */
function checkGoalNotSubmitted(db, cycle, rule, now) {
  const cycleStart = new Date(cycle.goal_setting_start);
  const daysSinceStart = Math.floor((now - cycleStart) / (1000 * 60 * 60 * 24));

  if (daysSinceStart < rule.days_threshold) return [];

  // Find employees with no submitted/approved goal sheet for this cycle
  const employees = db.prepare(`
    SELECT u.id, u.name, u.employee_id, u.department
    FROM users u
    WHERE u.role = 'employee'
    AND u.id NOT IN (
      SELECT gs.employee_id FROM goal_sheets gs 
      WHERE gs.cycle_id = ? AND gs.status IN ('submitted', 'approved', 'locked')
    )
  `).all(cycle.id);

  return employees.map(emp => ({
    userId: emp.id,
    details: `${emp.name} has not submitted goals — ${daysSinceStart} days since cycle opened (threshold: ${rule.days_threshold} days)`,
  }));
}

/**
 * Check for goal sheets submitted but not approved within N days
 */
function checkGoalNotApproved(db, cycle, rule, now) {
  const sheets = db.prepare(`
    SELECT gs.*, u.name, u.employee_id, u.department
    FROM goal_sheets gs
    JOIN users u ON u.id = gs.employee_id
    WHERE gs.cycle_id = ? AND gs.status = 'submitted'
    AND julianday('now') - julianday(gs.submitted_at) >= ?
  `).all(cycle.id, rule.days_threshold);

  return sheets.map(s => ({
    userId: s.employee_id,
    details: `Goal sheet for ${s.name} pending approval for ${rule.days_threshold}+ days since submission`,
  }));
}

/**
 * Check for employees who haven't completed quarterly check-ins
 */
function checkCheckinNotCompleted(db, cycle, rule, now) {
  // Determine current quarter based on date
  const quarters = [
    { q: 'Q1', start: cycle.q1_start, end: cycle.q1_end },
    { q: 'Q2', start: cycle.q2_start, end: cycle.q2_end },
    { q: 'Q3', start: cycle.q3_start, end: cycle.q3_end },
    { q: 'Q4', start: cycle.q4_start, end: cycle.q4_end },
  ];

  const violations = [];

  for (const q of quarters) {
    const qStart = new Date(q.start);
    const daysSinceQStart = Math.floor((now - qStart) / (1000 * 60 * 60 * 24));

    if (daysSinceQStart < rule.days_threshold || daysSinceQStart < 0) continue;

    // Find employees with approved goals but no check-in for this quarter
    const employees = db.prepare(`
      SELECT DISTINCT u.id, u.name, u.employee_id, u.department
      FROM users u
      JOIN goal_sheets gs ON gs.employee_id = u.id AND gs.cycle_id = ? AND gs.status IN ('approved', 'locked')
      WHERE u.id NOT IN (
        SELECT DISTINCT a.user_id FROM achievements a
        JOIN goals g ON g.id = a.goal_id
        JOIN goal_sheets gs2 ON gs2.id = g.goal_sheet_id AND gs2.cycle_id = ?
        WHERE a.quarter = ?
      )
    `).all(cycle.id, cycle.id, q.q);

    for (const emp of employees) {
      violations.push({
        userId: emp.id,
        details: `${emp.name} has not completed ${q.q} check-in — ${daysSinceQStart} days since ${q.q} window opened`,
      });
    }
  }

  return violations;
}

/**
 * Resolve an escalation (mark as resolved by Admin/HR)
 */
function resolveEscalation(db, escalationId, resolvedBy, resolution) {
  db.prepare(`
    UPDATE escalation_log 
    SET status = 'resolved', resolved_at = datetime('now'), resolved_by = ?, resolution = ?
    WHERE id = ?
  `).run(resolvedBy, resolution, escalationId);
}

module.exports = {
  runEscalationEngine,
  resolveEscalation,
};
