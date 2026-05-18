import { NextResponse } from 'next/server';

// POST /api/goals/approve — Manager approves/returns goal sheet
export async function POST(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../../lib/auth');
    const { validateGoalSheet } = require('../../../../lib/validation');

    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'manager', 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const { goal_sheet_id, action, return_reason, edits } = await request.json();
    // action: 'approve' | 'return'
    // edits: optional array of { goal_id, target_value, target_date, weightage } for inline editing

    if (!goal_sheet_id || !action) {
      return NextResponse.json({ error: 'goal_sheet_id and action are required' }, { status: 400 });
    }

    const db = getDb();
    const sheet = db.prepare(`
      SELECT gs.*, u.manager_id
      FROM goal_sheets gs
      JOIN users u ON u.id = gs.employee_id
      WHERE gs.id = ?
    `).get(goal_sheet_id);

    if (!sheet) {
      return NextResponse.json({ error: 'Goal sheet not found' }, { status: 404 });
    }

    if (sheet.status !== 'submitted') {
      return NextResponse.json({ error: 'Goal sheet is not in submitted state' }, { status: 400 });
    }

    if (user.role === 'manager' && sheet.manager_id !== user.id) {
      return NextResponse.json({ error: 'Managers can only review their own team.' }, { status: 403 });
    }

    if (!['approve', 'return'].includes(action)) {
      return NextResponse.json({ error: 'Invalid approval action' }, { status: 400 });
    }

    if (edits && edits.length > 0) {
      const existingGoals = db.prepare('SELECT * FROM goals WHERE goal_sheet_id = ? ORDER BY sort_order, id').all(goal_sheet_id);
      const editedGoals = existingGoals.map(goal => {
        const edit = edits.find(e => e.goal_id === goal.id);
        return edit ? { ...goal, ...edit } : goal;
      });
      const validation = validateGoalSheet(editedGoals);
      if (!validation.valid) {
        return NextResponse.json({ error: 'Edited goals failed validation', errors: validation.errors }, { status: 400 });
      }
    }

    const txn = db.transaction(() => {
      // Apply inline edits if any
      if (edits && edits.length > 0) {
        for (const edit of edits) {
          // Log audit trail
          const oldGoal = db.prepare('SELECT * FROM goals WHERE id = ? AND goal_sheet_id = ?').get(edit.goal_id, goal_sheet_id);
          if (oldGoal) {
            if (!oldGoal.is_shared && edit.target_value !== undefined && edit.target_value !== oldGoal.target_value) {
              db.prepare(`
                INSERT INTO audit_log (entity_type, entity_id, action, field_changed, old_value, new_value, changed_by, reason)
                VALUES ('goal', ?, 'edit_during_approval', 'target_value', ?, ?, ?, 'Manager edit during approval')
              `).run(edit.goal_id, String(oldGoal.target_value), String(edit.target_value), user.id);
            }
            if (!oldGoal.is_shared && edit.target_date !== undefined && edit.target_date !== oldGoal.target_date) {
              db.prepare(`
                INSERT INTO audit_log (entity_type, entity_id, action, field_changed, old_value, new_value, changed_by, reason)
                VALUES ('goal', ?, 'edit_during_approval', 'target_date', ?, ?, ?, 'Manager edit during approval')
              `).run(edit.goal_id, String(oldGoal.target_date), String(edit.target_date), user.id);
            }
            if (edit.weightage !== undefined && Number(edit.weightage) !== Number(oldGoal.weightage)) {
              db.prepare(`
                INSERT INTO audit_log (entity_type, entity_id, action, field_changed, old_value, new_value, changed_by, reason)
                VALUES ('goal', ?, 'edit_during_approval', 'weightage', ?, ?, ?, 'Manager edit during approval')
              `).run(edit.goal_id, String(oldGoal.weightage), String(edit.weightage), user.id);
            }
            if (oldGoal.is_shared) {
              db.prepare(
                "UPDATE goals SET weightage = ?, updated_at = datetime('now') WHERE id = ?"
              ).run(edit.weightage !== undefined ? edit.weightage : oldGoal.weightage, edit.goal_id);
            } else {
              db.prepare(
                "UPDATE goals SET target_value = ?, target_date = ?, weightage = ?, updated_at = datetime('now') WHERE id = ?"
              ).run(
                edit.target_value !== undefined ? edit.target_value : oldGoal.target_value,
                edit.target_date !== undefined ? edit.target_date : oldGoal.target_date,
                edit.weightage !== undefined ? edit.weightage : oldGoal.weightage,
                edit.goal_id
              );
            }
          }
        }
      }

      if (action === 'approve') {
        db.prepare(`
          UPDATE goal_sheets SET status = 'approved', approved_at = datetime('now'), 
          approved_by = ?, updated_at = datetime('now') WHERE id = ?
        `).run(user.id, goal_sheet_id);

        // Lock the goals
        db.prepare(`
          UPDATE goal_sheets SET status = 'locked' WHERE id = ?
        `).run(goal_sheet_id);

        // Notify employee
        db.prepare(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES (?, 'goal_approved', 'Goals Approved', 'Your goal sheet has been approved and locked.', '/dashboard/employee/goals')
        `).run(sheet.employee_id);

      } else if (action === 'return') {
        db.prepare(`
          UPDATE goal_sheets SET status = 'returned', return_reason = ?, updated_at = datetime('now') WHERE id = ?
        `).run(return_reason || 'Please review and resubmit.', goal_sheet_id);

        // Notify employee
        db.prepare(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES (?, 'goal_returned', 'Goals Returned for Rework', ?, '/dashboard/employee/goals')
        `).run(sheet.employee_id, `Your goal sheet was returned: ${return_reason || 'Please review and resubmit.'}`);
      }
    });

    txn();

    return NextResponse.json({
      message: action === 'approve' ? 'Goal sheet approved and locked' : 'Goal sheet returned for rework',
    });
  } catch (err) {
    console.error('Approve error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
