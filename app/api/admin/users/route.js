import { NextResponse } from 'next/server';

// GET /api/admin/users — List all users
// POST /api/admin/users — Create user  
// PUT  handled via POST with id
export async function GET(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest } = require('../../../../lib/auth');
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const managerId = url.searchParams.get('manager_id');

    let query = `SELECT id, employee_id, name, email, role, department, manager_id, is_active, created_at FROM users WHERE 1=1`;
    const params = [];

    if (role) { query += ' AND role = ?'; params.push(role); }
    if (managerId) { query += ' AND manager_id = ?'; params.push(managerId); }

    if (user.role === 'manager') {
      query += " AND role = 'employee' AND manager_id = ?";
      params.push(user.id);
    } else if (user.role === 'employee') {
      query += ' AND id = ?';
      params.push(user.id);
    }

    query += ' ORDER BY name';
    const users = db.prepare(query).all(...params);

    // Attach manager names
    for (const u of users) {
      if (u.manager_id) {
        const mgr = db.prepare('SELECT name FROM users WHERE id = ?').get(u.manager_id);
        u.manager_name = mgr ? mgr.name : null;
      }
    }

    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest, requireRole, hashPassword } = require('../../../../lib/auth');
    const user = getUserFromRequest(request);
    const roleErr = requireRole(user, 'admin');
    if (roleErr) return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });

    const body = await request.json();
    const db = getDb();

    if (body.action === 'unlock_goal_sheet') {
      // Admin unlock capability
      const reason = body.reason || 'Admin unlock';
      db.prepare(`
        UPDATE goal_sheets
        SET status = 'returned', return_reason = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(reason, body.goal_sheet_id);
      db.prepare(`
        INSERT INTO audit_log (entity_type, entity_id, action, changed_by, reason)
        VALUES ('goal_sheet', ?, 'admin_unlock', ?, ?)
      `).run(body.goal_sheet_id, user.id, reason);
      return NextResponse.json({ message: 'Goal sheet unlocked' });
    }

    // Create/update user
    if (body.id) {
      db.prepare(`
        UPDATE users SET name=?, email=?, role=?, department=?, manager_id=?, is_active=?, updated_at=datetime('now')
        WHERE id=?
      `).run(body.name, body.email, body.role, body.department, body.manager_id || null, body.is_active ? 1 : 0, body.id);
    } else {
      db.prepare(`
        INSERT INTO users (employee_id, name, email, password_hash, role, department, manager_id)
        VALUES (?,?,?,?,?,?,?)
      `).run(body.employee_id, body.name, body.email, hashPassword(body.password || 'password123'),
        body.role, body.department, body.manager_id || null);
    }

    return NextResponse.json({ message: 'User saved' });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
