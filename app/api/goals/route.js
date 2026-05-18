import { NextResponse } from 'next/server';

// GET /api/goals — List goals for current user (or team for managers)
export async function GET(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest } = require('../../../lib/auth');

    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const url = new URL(request.url);
    const cycleId = url.searchParams.get('cycle_id');
    const employeeId = url.searchParams.get('employee_id');

    let goalSheets;

    if (user.role === 'admin') {
      // Admin sees all
      goalSheets = db.prepare(`
        SELECT gs.*, u.name as employee_name, u.employee_id as emp_id, u.department,
               m.name as manager_name
        FROM goal_sheets gs
        JOIN users u ON gs.employee_id = u.id
        LEFT JOIN users m ON u.manager_id = m.id
        ${cycleId ? 'WHERE gs.cycle_id = ?' : ''}
        ORDER BY gs.updated_at DESC
      `).all(...(cycleId ? [cycleId] : []));
    } else if (user.role === 'manager') {
      // Manager sees their team's goals
      goalSheets = db.prepare(`
        SELECT gs.*, u.name as employee_name, u.employee_id as emp_id, u.department
        FROM goal_sheets gs
        JOIN users u ON gs.employee_id = u.id
        WHERE u.manager_id = ? ${cycleId ? 'AND gs.cycle_id = ?' : ''}
        ORDER BY gs.updated_at DESC
      `).all(user.id, ...(cycleId ? [cycleId] : []));
    } else {
      // Employee sees own goals
      goalSheets = db.prepare(`
        SELECT gs.*, u.name as employee_name, u.employee_id as emp_id
        FROM goal_sheets gs
        JOIN users u ON gs.employee_id = u.id
        WHERE gs.employee_id = ? ${cycleId ? 'AND gs.cycle_id = ?' : ''}
        ORDER BY gs.updated_at DESC
      `).all(user.id, ...(cycleId ? [cycleId] : []));
    }

    // Attach individual goals to each sheet
    for (const sheet of goalSheets) {
      sheet.goals = db.prepare(`
        SELECT g.*, ta.name as thrust_area_name
        FROM goals g
        LEFT JOIN thrust_areas ta ON g.thrust_area_id = ta.id
        WHERE g.goal_sheet_id = ?
        ORDER BY g.sort_order, g.id
      `).all(sheet.id);

      // Attach achievements to each goal
      for (const goal of sheet.goals) {
        goal.achievements = db.prepare(
          'SELECT * FROM achievements WHERE goal_id = ? ORDER BY quarter'
        ).all(goal.id);
      }
    }

    return NextResponse.json({ goal_sheets: goalSheets });
  } catch (err) {
    console.error('Goals GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/goals — Create or update a goal sheet with goals
export async function POST(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest } = require('../../../lib/auth');
    const { validateGoalSheet } = require('../../../lib/validation');

    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { cycle_id, goals, action } = body; // action: 'save_draft' | 'submit'

    if (!cycle_id) {
      return NextResponse.json({ error: 'Cycle ID is required' }, { status: 400 });
    }

    const db = getDb();
    const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(cycle_id);

    if (!cycle) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
    }

    // Get or create goal sheet
    let sheet = db.prepare(
      'SELECT * FROM goal_sheets WHERE employee_id = ? AND cycle_id = ?'
    ).get(user.id, cycle_id);

    if (user.role === 'employee') {
      const today = new Date().toISOString().split('T')[0];
      const adminUnlocked = sheet?.approved_at && sheet?.status === 'returned';
      if (!adminUnlocked && (today < cycle.goal_setting_start || today > cycle.goal_setting_end)) {
        return NextResponse.json({
          error: `Goal setting window is closed (${cycle.goal_setting_start} to ${cycle.goal_setting_end}). Contact Admin for exceptions.`,
        }, { status: 400 });
      }
    }

    if (sheet && sheet.status === 'locked') {
      return NextResponse.json({ error: 'Goal sheet is locked. Contact Admin to unlock.' }, { status: 403 });
    }

    if (sheet && sheet.status === 'approved') {
      return NextResponse.json({ error: 'Goal sheet is already approved.' }, { status: 403 });
    }

    // Validate if submitting
    if (action === 'submit') {
      const validation = validateGoalSheet(goals);
      if (!validation.valid) {
        return NextResponse.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 });
      }
    }

    const totalWeightage = goals.reduce((sum, g) => sum + Number(g.weightage || 0), 0);
    const shouldAuditPostLock = !!sheet?.approved_at;
    const oldGoals = sheet
      ? db.prepare('SELECT * FROM goals WHERE goal_sheet_id = ? ORDER BY sort_order, id').all(sheet.id)
      : [];

    const logAudit = (entityId, action, field, oldValue, newValue, reason) => {
      db.prepare(`
        INSERT INTO audit_log (entity_type, entity_id, action, field_changed, old_value, new_value, changed_by, reason)
        VALUES ('goal', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entityId || 0,
        action,
        field || null,
        oldValue == null ? null : String(oldValue),
        newValue == null ? null : String(newValue),
        user.id,
        reason
      );
    };

    const logPostLockGoalChanges = () => {
      if (!shouldAuditPostLock) return;

      const incomingById = new Map(goals.filter(g => g.id).map(g => [Number(g.id), g]));
      const oldById = new Map(oldGoals.map(g => [Number(g.id), g]));
      const auditableFields = ['title', 'description', 'thrust_area_id', 'uom_type', 'target_value', 'target_date', 'weightage'];

      for (const oldGoal of oldGoals) {
        const incoming = incomingById.get(Number(oldGoal.id));
        if (!incoming) {
          logAudit(oldGoal.id, 'post_lock_delete', null, oldGoal.title, null, 'Employee edit after admin unlock');
          continue;
        }

        for (const field of auditableFields) {
          const oldValue = oldGoal[field] ?? '';
          const newValue = incoming[field] ?? '';
          if (String(oldValue) !== String(newValue)) {
            logAudit(oldGoal.id, 'post_lock_edit', field, oldValue, newValue, 'Employee edit after admin unlock');
          }
        }
      }

      for (const incoming of goals) {
        if (!incoming.id || !oldById.has(Number(incoming.id))) {
          logAudit(null, 'post_lock_create', 'title', null, incoming.title || '(untitled)', 'Employee added goal after admin unlock');
        }
      }
    };

    const txn = db.transaction(() => {
      logPostLockGoalChanges();

      if (!sheet) {
        const result = db.prepare(`
          INSERT INTO goal_sheets (employee_id, cycle_id, status, total_weightage)
          VALUES (?, ?, ?, ?)
        `).run(user.id, cycle_id, action === 'submit' ? 'submitted' : 'draft', totalWeightage);
        sheet = { id: result.lastInsertRowid };
      } else {
        db.prepare(`
          UPDATE goal_sheets SET status = ?, total_weightage = ?, updated_at = datetime('now')
          ${action === 'submit' ? ", submitted_at = datetime('now')" : ''}
          WHERE id = ?
        `).run(action === 'submit' ? 'submitted' : 'draft', totalWeightage, sheet.id);
      }

      // Delete existing goals and re-insert (simpler for hackathon)
      db.prepare('DELETE FROM goals WHERE goal_sheet_id = ? AND is_shared = 0').run(sheet.id);

      // Shared/cascaded goals are immutable except recipient weightage.
      const updateSharedWeightage = db.prepare(`
        UPDATE goals SET weightage = ?, updated_at = datetime('now')
        WHERE id = ? AND goal_sheet_id = ? AND is_shared = 1
      `);
      goals.forEach((goal) => {
        if (goal.is_shared && goal.id) {
          if (shouldAuditPostLock) {
            const oldGoal = oldGoals.find(g => Number(g.id) === Number(goal.id));
            if (oldGoal && Number(oldGoal.weightage) !== Number(goal.weightage)) {
              logAudit(goal.id, 'post_lock_edit', 'weightage', oldGoal.weightage, goal.weightage, 'Shared-goal weightage adjusted after admin unlock');
            }
          }
          updateSharedWeightage.run(goal.weightage, goal.id, sheet.id);
        }
      });

      const insertGoal = db.prepare(`
        INSERT INTO goals (goal_sheet_id, thrust_area_id, title, description, uom_type, 
          target_value, target_date, weightage, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      goals.forEach((goal, idx) => {
        if (!goal.is_shared) {
          insertGoal.run(
            sheet.id, goal.thrust_area_id || null, goal.title, goal.description || '',
            goal.uom_type, goal.target_value ?? null, goal.target_date || null,
            goal.weightage, idx
          );
        }
      });

      // Create notification for manager if submitting
      if (action === 'submit') {
        const employee = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        if (employee.manager_id) {
          db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, link)
            VALUES (?, 'goal_submitted', 'Goal Sheet Submitted', ?, '/dashboard/manager/approvals')
          `).run(employee.manager_id, `${employee.name} has submitted their goal sheet for review.`);
        }
      }
    });

    txn();

    return NextResponse.json({
      message: action === 'submit' ? 'Goal sheet submitted for approval' : 'Draft saved',
      goal_sheet_id: sheet.id,
    });
  } catch (err) {
    console.error('Goals POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
