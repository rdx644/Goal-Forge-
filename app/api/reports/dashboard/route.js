import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/reports/dashboard — Completion dashboard data
export async function GET(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest } = require('../../../../lib/auth');
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();

    // Overall stats
    const totalEmployees = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'employee' AND is_active = 1").get().c;
    const totalManagers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'manager' AND is_active = 1").get().c;
    const totalGoalSheets = db.prepare("SELECT COUNT(*) as c FROM goal_sheets").get().c;
    const approvedSheets = db.prepare("SELECT COUNT(*) as c FROM goal_sheets WHERE status IN ('approved', 'locked')").get().c;
    const submittedSheets = db.prepare("SELECT COUNT(*) as c FROM goal_sheets WHERE status = 'submitted'").get().c;
    const draftSheets = db.prepare("SELECT COUNT(*) as c FROM goal_sheets WHERE status = 'draft'").get().c;

    // Completion by quarter
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterCompletion = {};
    for (const q of quarters) {
      const completed = db.prepare(`
        SELECT COUNT(DISTINCT gs.employee_id) as c FROM achievements a
        JOIN goals g ON a.goal_id = g.id
        JOIN goal_sheets gs ON g.goal_sheet_id = gs.id
        WHERE a.quarter = ? AND a.status != 'not_started'
      `).get(q).c;
      quarterCompletion[q] = { completed, total: totalEmployees, rate: totalEmployees ? Math.round(completed / totalEmployees * 100) : 0 };
    }

    // Check-in completion by manager
    const managerCompletion = db.prepare(`
      SELECT u.name as manager_name, u.id as manager_id,
        COUNT(DISTINCT gs.id) as total_sheets,
        COUNT(DISTINCT c.goal_sheet_id) as checked_in_sheets
      FROM users u
      LEFT JOIN users emp ON emp.manager_id = u.id
      LEFT JOIN goal_sheets gs ON gs.employee_id = emp.id
      LEFT JOIN checkins c ON c.goal_sheet_id = gs.id
      WHERE u.role = 'manager'
      GROUP BY u.id
    `).all();

    // Department breakdown
    const deptBreakdown = db.prepare(`
      SELECT u.department, 
        COUNT(DISTINCT gs.id) as total_sheets,
        COUNT(DISTINCT CASE WHEN gs.status IN ('approved', 'locked') THEN gs.id END) as approved_sheets,
        AVG(a.progress_score) as avg_score
      FROM users u
      LEFT JOIN goal_sheets gs ON gs.employee_id = u.id
      LEFT JOIN goals g ON g.goal_sheet_id = gs.id
      LEFT JOIN achievements a ON a.goal_id = g.id
      WHERE u.role = 'employee'
      GROUP BY u.department
    `).all();

    // Goal distribution by thrust area
    const thrustAreaDist = db.prepare(`
      SELECT ta.name, COUNT(g.id) as count
      FROM goals g
      LEFT JOIN thrust_areas ta ON g.thrust_area_id = ta.id
      GROUP BY ta.name
      ORDER BY count DESC
    `).all();

    // UoM distribution
    const uomDist = db.prepare(`
      SELECT uom_type, COUNT(*) as count FROM goals GROUP BY uom_type
    `).all();

    // Audit log (recent)
    const auditLog = db.prepare(`
      SELECT al.*, u.name as changed_by_name
      FROM audit_log al
      JOIN users u ON al.changed_by = u.id
      ORDER BY al.changed_at DESC
      LIMIT 50
    `).all();

    // QoQ Achievement Trends — Section 5.4
    const qoqTrends = [];
    for (const q of quarters) {
      const deptScores = db.prepare(`
        SELECT u.department,
          AVG(a.progress_score) as avg_score,
          COUNT(DISTINCT gs.employee_id) as employees_updated
        FROM achievements a
        JOIN goals g ON g.id = a.goal_id
        JOIN goal_sheets gs ON gs.id = g.goal_sheet_id
        JOIN users u ON gs.employee_id = u.id
        WHERE a.quarter = ?
        GROUP BY u.department
      `).all(q);
      qoqTrends.push({ quarter: q, departments: deptScores });
    }

    // Per-goal status distribution — Section 5.4
    const goalStatusDist = db.prepare(`
      SELECT 
        COUNT(CASE WHEN a.status = 'not_started' OR a.id IS NULL THEN 1 END) as not_started,
        COUNT(CASE WHEN a.status = 'on_track' THEN 1 END) as on_track,
        COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed
      FROM goals g
      LEFT JOIN achievements a ON a.goal_id = g.id
    `).get();

    // Heatmap data — completion rates per employee per quarter
    const heatmapData = db.prepare(`
      SELECT u.name, u.department,
        MAX(CASE WHEN a.quarter = 'Q1' THEN a.progress_score END) as q1_score,
        MAX(CASE WHEN a.quarter = 'Q2' THEN a.progress_score END) as q2_score,
        MAX(CASE WHEN a.quarter = 'Q3' THEN a.progress_score END) as q3_score,
        MAX(CASE WHEN a.quarter = 'Q4' THEN a.progress_score END) as q4_score
      FROM users u
      LEFT JOIN goal_sheets gs ON gs.employee_id = u.id
      LEFT JOIN goals g ON g.goal_sheet_id = gs.id
      LEFT JOIN achievements a ON a.goal_id = g.id
      WHERE u.role = 'employee'
      GROUP BY u.id
      ORDER BY u.department, u.name
    `).all();

    // Notifications count
    const unreadNotifications = db.prepare(
      'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(user.id).c;

    return NextResponse.json({
      stats: { totalEmployees, totalManagers, totalGoalSheets, approvedSheets, submittedSheets, draftSheets },
      quarterCompletion,
      managerCompletion,
      deptBreakdown,
      thrustAreaDist,
      uomDist,
      qoqTrends,
      goalStatusDist,
      heatmapData,
      auditLog,
      unreadNotifications,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
