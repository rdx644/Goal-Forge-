import { NextResponse } from 'next/server';

// GET /api/escalation — Get escalation rules and logs
export async function GET(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../lib/auth');
    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'admin', 'manager');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const db = getDb();
    const rules = db.prepare('SELECT * FROM escalation_rules ORDER BY trigger_condition, escalation_level').all();
    const logs = db.prepare(`
      SELECT el.*, u.name as target_name, er.rule_name
      FROM escalation_log el
      JOIN users u ON el.target_user_id = u.id
      LEFT JOIN escalation_rules er ON el.rule_id = er.id
      ORDER BY el.created_at DESC LIMIT 100
    `).all();

    return NextResponse.json({ rules, logs });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/escalation — Update rule or resolve escalation
export async function POST(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../lib/auth');
    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const body = await request.json();
    const db = getDb();

    if (body.action === 'update_rule') {
      db.prepare(`
        UPDATE escalation_rules SET days_threshold = ?, notify_employee = ?, notify_manager = ?, notify_hr = ?, is_active = ?
        WHERE id = ?
      `).run(body.days_threshold, body.notify_employee ? 1 : 0, body.notify_manager ? 1 : 0, body.notify_hr ? 1 : 0, body.is_active ? 1 : 0, body.id);
      return NextResponse.json({ message: 'Rule updated' });
    }

    if (body.action === 'resolve') {
      db.prepare(`
        UPDATE escalation_log SET status = 'resolved', resolved_at = datetime('now'), resolved_by = ? WHERE id = ?
      `).run(user.id, body.log_id);
      return NextResponse.json({ message: 'Escalation resolved' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
