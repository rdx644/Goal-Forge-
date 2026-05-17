import { NextResponse } from 'next/server';

// GET /api/admin/cycles — List cycles
// POST /api/admin/cycles — Create/update cycle
export async function GET(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest } = require('../../../../lib/auth');
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const cycles = db.prepare('SELECT * FROM cycles ORDER BY year DESC').all();
    return NextResponse.json({ cycles });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../../lib/auth');
    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const body = await request.json();
    const db = getDb();

    if (body.id) {
      db.prepare(`
        UPDATE cycles SET name=?, year=?, goal_setting_start=?, goal_setting_end=?,
        q1_start=?, q1_end=?, q2_start=?, q2_end=?, q3_start=?, q3_end=?, q4_start=?, q4_end=?, is_active=?
        WHERE id=?
      `).run(body.name, body.year, body.goal_setting_start, body.goal_setting_end,
        body.q1_start, body.q1_end, body.q2_start, body.q2_end,
        body.q3_start, body.q3_end, body.q4_start, body.q4_end, body.is_active ? 1 : 0, body.id);
    } else {
      db.prepare(`
        INSERT INTO cycles (name, year, goal_setting_start, goal_setting_end,
        q1_start, q1_end, q2_start, q2_end, q3_start, q3_end, q4_start, q4_end, is_active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(body.name, body.year, body.goal_setting_start, body.goal_setting_end,
        body.q1_start, body.q1_end, body.q2_start, body.q2_end,
        body.q3_start, body.q3_end, body.q4_start, body.q4_end, body.is_active ? 1 : 0);
    }

    return NextResponse.json({ message: 'Cycle saved' });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
