import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest } = require('../../../lib/auth');
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const notifications = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(user.id);

    return NextResponse.json({ notifications });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest } = require('../../../lib/auth');
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const body = await request.json();

    if (body.mark_all_read) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(user.id);
    } else if (body.id) {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(body.id, user.id);
    }

    return NextResponse.json({ message: 'Notifications updated' });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
