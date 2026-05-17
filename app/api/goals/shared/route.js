import { NextResponse } from 'next/server';

// POST /api/goals/shared — Push shared goal to multiple employees
export async function POST(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../../lib/auth');

    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'manager', 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const { cycle_id, title, description, thrust_area_id, uom_type, target_value, target_date, employee_ids } = await request.json();

    if (!cycle_id || !title || !uom_type || !employee_ids || employee_ids.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();

    const txn = db.transaction(() => {
      for (const empId of employee_ids) {
        // Get or create goal sheet for this employee
        let sheet = db.prepare(
          'SELECT * FROM goal_sheets WHERE employee_id = ? AND cycle_id = ?'
        ).get(empId, cycle_id);

        if (!sheet) {
          const r = db.prepare(
            'INSERT INTO goal_sheets (employee_id, cycle_id, status) VALUES (?, ?, ?)'
          ).run(empId, cycle_id, 'draft');
          sheet = { id: r.lastInsertRowid };
        }

        // Insert shared goal — recipients can only adjust weightage
        db.prepare(`
          INSERT INTO goals (goal_sheet_id, thrust_area_id, title, description, uom_type, 
            target_value, target_date, weightage, is_shared, shared_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 10, 1, ?)
        `).run(sheet.id, thrust_area_id || null, title, description || '', uom_type,
          target_value || null, target_date || null, user.id);

        // Notify employee
        db.prepare(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES (?, 'shared_goal', 'New Shared Goal Assigned', ?, '/dashboard/employee/goals')
        `).run(empId, `A shared KPI "${title}" has been assigned to you.`);
      }
    });

    txn();

    return NextResponse.json({ message: `Shared goal pushed to ${employee_ids.length} employee(s)` });
  } catch (err) {
    console.error('Shared goal error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
