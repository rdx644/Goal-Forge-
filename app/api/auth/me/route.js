import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest } = require('../../../../lib/auth');

    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const db = getDb();
    const freshUser = db.prepare(
      'SELECT id, employee_id, name, email, role, department, manager_id FROM users WHERE id = ?'
    ).get(user.id);

    if (!freshUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: freshUser });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
