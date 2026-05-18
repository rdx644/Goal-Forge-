import { NextResponse } from 'next/server';

/**
 * POST /api/escalation/trigger — Run the escalation engine
 * Evaluates all active rules and creates escalation entries + notifications
 * Can be called manually by Admin or via an external cron/scheduler
 */
export async function POST(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../../lib/auth');
    const { runEscalationEngine } = require('../../../../lib/escalation');

    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const db = getDb();
    const result = runEscalationEngine(db);

    // Log the trigger action
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, reason)
      VALUES ('system', 0, 'escalation_engine_run', ?, ?)
    `).run(user.id, `Triggered manually — ${result.triggered} escalations created`);

    return NextResponse.json({
      message: `Escalation engine completed`,
      triggered: result.triggered,
      details: result.details,
    });
  } catch (err) {
    console.error('Escalation trigger error:', err);
    return NextResponse.json({ error: 'Escalation engine failed: ' + err.message }, { status: 500 });
  }
}

/**
 * GET /api/escalation/trigger — Get escalation engine status
 */
export async function GET(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest, requireRole } = require('../../../../lib/auth');

    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const db = getDb();

    const lastRun = db.prepare(`
      SELECT * FROM audit_log 
      WHERE action = 'escalation_engine_run' 
      ORDER BY changed_at DESC LIMIT 1
    `).get();

    const openEscalations = db.prepare(`
      SELECT COUNT(*) as count FROM escalation_log WHERE status = 'open'
    `).get();

    const activeRules = db.prepare(`
      SELECT COUNT(*) as count FROM escalation_rules WHERE is_active = 1
    `).get();

    return NextResponse.json({
      last_run: lastRun?.changed_at || 'Never',
      open_escalations: openEscalations.count,
      active_rules: activeRules.count,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
