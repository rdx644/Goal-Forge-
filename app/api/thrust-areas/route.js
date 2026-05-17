import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const db = getDb();
    const areas = db.prepare('SELECT * FROM thrust_areas WHERE is_active = 1 ORDER BY name').all();
    return NextResponse.json({ thrust_areas: areas });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
