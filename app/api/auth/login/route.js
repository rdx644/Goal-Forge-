import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { verifyPassword, generateToken } = require('../../../../lib/auth');
    
    const body = await request.json();
    const { employee_id, password } = body;

    if (!employee_id || !password) {
      return NextResponse.json({ error: 'Employee ID and password are required' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE employee_id = ? AND is_active = 1').get(employee_id);

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = generateToken(user);

    const response = NextResponse.json({
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        manager_id: user.manager_id,
      },
    });

    response.cookies.set('goalforge_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
