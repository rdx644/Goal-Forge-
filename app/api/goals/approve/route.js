import { NextResponse } from 'next/server';

// POST /api/goals/approve — Manager approves/returns goal sheet
export async function POST(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../../lib/auth');

    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'manager', 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const { goal_sheet_id, action, return_reason, edits } = await request.json();
    // action: 'approve' | 'return'
    // edits: optional array of { goal_id, target_value, weightage } for inline editing

    if (!goal_sheet_id || !action) {
      return NextResponse.json({ error: 'goal_sheet_id and action are required' }, { status: 400 });
    }

    const db = getDb();
    const sheet = db.prepare('SELECT * FROM goal_sheets WHERE id = ?').get(goal_sheet_id);

    if (!sheet) {
      return NextResponse.json({ error: 'Goal sheet not found' }, { status: 404 });
    }

    if (sheet.status !== 'submitted') {
      return NextResponse.json({ error: 'Goal sheet is not in submitted state' }, { status: 400 });
    }

    const txn = db.transaction(() => {
      // Apply inline edits if any
      if (edits && edits.length > 0) {
        const updateGoal = db.prepare(
          'UPDATE goals SET target_value = ?, weightage = ?, updated_at = datetime(\'now\') WHERE id = ?'
        );
        for (const edit of edits) {
          // Log audit trail
          const oldGoal = db.prepare('SELECT * FROM goals WHERE id = ?').get(edit.goal_id);
          if (oldGoal) {
            if (edit.target_value !== undefined && edit.target_value !== oldGoal.target_value) {
              db.prepare(`
                INSERT INTO audit_log (entity_type, entity_id, action, field_changed, old_value, new_value, changed_by, reason)
                VALUES ('goal', ?, 'edit_during_approval', 'target_value', ?, ?, ?, 'Manager edit during approval')
              `).run(edit.goal_id, String(oldGoal.target_value), String(edit.target_value), user.id);
            }
            if (edit.weightage !== undefined && edit.weightage !== oldGoal.weightage) {
              db.prepare(`
                INSERT INTO audit_log (entity_type, entity_id, action, field_changed, old_value, new_value, changed_by, reason)
                VALUES ('goal', ?, 'edit_during_approval', 'weightage', ?, ?, ?, 'Manager edit during approval')
              `).run(edit.goal_id, String(oldGoal.weightage), String(edit.weightage), user.id);
            }
            updateGoal.run(
              edit.target_value !== undefined ? edit.target_value : oldGoal.target_value,
              edit.weightage !== undefined ? edit.weightage : oldGoal.weightage,
              edit.goal_id
            );
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
