import { NextResponse } from 'next/server';

// GET /api/reports/achievement — Export achievement data
export async function GET(request) {
  try {
    const { getDb } = require('../../../../lib/db');
    const { getUserFromRequest } = require('../../../../lib/auth');
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const url = new URL(request.url);
    const cycleId = url.searchParams.get('cycle_id') || 1;
    const format = url.searchParams.get('format') || 'json';

    const data = db.prepare(`
      SELECT 
        u.employee_id, u.name as employee_name, u.department,
        g.title as goal_title, g.uom_type, g.target_value, g.target_date, g.weightage,
        ta.name as thrust_area,
        a.quarter, a.actual_value, a.completion_date, a.status, a.progress_score,
        gs.status as sheet_status
      FROM goal_sheets gs
      JOIN users u ON gs.employee_id = u.id
      JOIN goals g ON g.goal_sheet_id = gs.id
      LEFT JOIN thrust_areas ta ON g.thrust_area_id = ta.id
      LEFT JOIN achievements a ON a.goal_id = g.id
      WHERE gs.cycle_id = ?
      ORDER BY u.name, g.sort_order, a.quarter
    `).all(cycleId);

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Employee ID', 'Name', 'Department', 'Goal', 'Thrust Area', 'UoM', 'Target', 'Weightage',
        'Quarter', 'Actual', 'Status', 'Score'];
      const rows = data.map(d => [
        d.employee_id, d.employee_name, d.department, d.goal_title, d.thrust_area || '',
        d.uom_type, d.target_value || d.target_date || '', d.weightage,
        d.quarter || '', d.actual_value || '', d.status || '', d.progress_score || ''
      ]);

      const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n');

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="achievement_report.csv"',
        },
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
