import { NextResponse } from 'next/server';

// POST /api/checkins — Employee logs achievement or Manager adds check-in comment
export async function POST(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest } = require('../../../lib/auth');
    const { computeProgressScore } = require('../../../lib/scoring');

    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const { type } = body; // 'achievement' or 'checkin_comment'

    const db = getDb();

    if (type === 'achievement') {
      // Employee logging quarterly achievement
      const { goal_id, quarter, actual_value, completion_date, status, comment } = body;

      if (!goal_id || !quarter) {
        return NextResponse.json({ error: 'goal_id and quarter are required' }, { status: 400 });
      }
      if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        return NextResponse.json({ error: 'Invalid quarter' }, { status: 400 });
      }
      if (status && !['not_started', 'on_track', 'completed'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }

      const goal = db.prepare('SELECT g.*, gs.employee_id, gs.cycle_id, gs.status as sheet_status FROM goals g JOIN goal_sheets gs ON g.goal_sheet_id = gs.id WHERE g.id = ?').get(goal_id);
      if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
      if (goal.employee_id !== user.id && user.role === 'employee') {
        return NextResponse.json({ error: 'Cannot update another employee\'s goal' }, { status: 403 });
      }
      if (!['approved', 'locked'].includes(goal.sheet_status)) {
        return NextResponse.json({ error: 'Goals must be approved and locked before achievements can be updated.' }, { status: 400 });
      }
      if (user.role === 'employee' && goal.is_shared && goal.shared_from_goal_id) {
        return NextResponse.json({
          error: 'This shared KPI is updated by its primary owner. Recipients can adjust only weightage before submission.',
        }, { status: 403 });
      }

      // Enforce check-in schedule window (BRD Table 1)
      const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(goal.cycle_id);
      if (cycle) {
        const now = new Date().toISOString().split('T')[0];
        const quarterWindows = {
          Q1: { start: cycle.q1_start, end: cycle.q1_end },
          Q2: { start: cycle.q2_start, end: cycle.q2_end },
          Q3: { start: cycle.q3_start, end: cycle.q3_end },
          Q4: { start: cycle.q4_start, end: cycle.q4_end },
        };
        const window = quarterWindows[quarter];
        if (window && window.start && window.end) {
          // Allow a 7-day grace period after window closes
          const endDate = new Date(window.end);
          endDate.setDate(endDate.getDate() + 7);
          const graceEnd = endDate.toISOString().split('T')[0];
          
          if (now < window.start) {
            return NextResponse.json({ 
              error: `${quarter} check-in window has not opened yet. Opens on ${window.start}.` 
            }, { status: 400 });
          }
          // Admin/Manager can override window restrictions
          if (now > graceEnd && user.role === 'employee') {
            return NextResponse.json({ 
              error: `${quarter} check-in window has closed (${window.start} to ${window.end}). Contact your manager or admin.` 
            }, { status: 400 });
          }
        }
      }

      // Compute progress score
      const score = computeProgressScore(goal, { actual_value, completion_date, status });

      db.prepare(`
        INSERT INTO achievements (goal_id, quarter, actual_value, completion_date, status, progress_score, employee_comment, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(goal_id, quarter) DO UPDATE SET
          actual_value = excluded.actual_value,
          completion_date = excluded.completion_date,
          status = excluded.status,
          progress_score = excluded.progress_score,
          employee_comment = excluded.employee_comment,
          updated_at = datetime('now')
      `).run(goal_id, quarter, actual_value ?? null, completion_date || null, status || 'not_started', score, comment || null);

      // If this is the primary owner of a shared goal, sync linked sheets.
      if (!goal.shared_from_goal_id) {
        const linkedGoals = db.prepare('SELECT id FROM goals WHERE shared_from_goal_id = ?').all(goal.id);
        for (const linked of linkedGoals) {
          db.prepare(`
            INSERT INTO achievements (goal_id, quarter, actual_value, completion_date, status, progress_score, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(goal_id, quarter) DO UPDATE SET
              actual_value = excluded.actual_value, completion_date = excluded.completion_date,
              status = excluded.status, progress_score = excluded.progress_score, updated_at = datetime('now')
          `).run(linked.id, quarter, actual_value ?? null, completion_date || null, status || 'not_started', score);
        }
      }

      return NextResponse.json({ message: 'Achievement recorded', progress_score: score });

    } else if (type === 'checkin_comment') {
      // Manager adding structured check-in comment
      const { goal_sheet_id, quarter, comment } = body;

      if (!goal_sheet_id || !quarter || !comment) {
        return NextResponse.json({ error: 'goal_sheet_id, quarter, and comment are required' }, { status: 400 });
      }
      if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
        return NextResponse.json({ error: 'Invalid quarter' }, { status: 400 });
      }

      if (user.role !== 'manager' && user.role !== 'admin') {
        return NextResponse.json({ error: 'Only managers can add check-in comments' }, { status: 403 });
      }

      const sheetForAccess = db.prepare(`
        SELECT gs.*, u.manager_id
        FROM goal_sheets gs
        JOIN users u ON u.id = gs.employee_id
        WHERE gs.id = ?
      `).get(goal_sheet_id);
      if (!sheetForAccess) {
        return NextResponse.json({ error: 'Goal sheet not found' }, { status: 404 });
      }
      if (user.role === 'manager' && sheetForAccess.manager_id !== user.id) {
        return NextResponse.json({ error: 'Managers can only check in their own team.' }, { status: 403 });
      }

      db.prepare(`
        INSERT INTO checkins (goal_sheet_id, quarter, manager_id, comment)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(goal_sheet_id, quarter, manager_id) DO UPDATE SET
          comment = excluded.comment, created_at = datetime('now')
      `).run(goal_sheet_id, quarter, user.id, comment);

      // Notify employee
      const sheet = db.prepare('SELECT employee_id FROM goal_sheets WHERE id = ?').get(goal_sheet_id);
      if (sheet) {
        db.prepare(`
          INSERT INTO notifications (user_id, type, title, message, link)
          VALUES (?, 'checkin_feedback', 'Manager Check-in Feedback', ?, '/dashboard/employee/checkins')
        `).run(sheet.employee_id, `Your manager has added ${quarter} check-in feedback.`);
      }

      return NextResponse.json({ message: 'Check-in comment saved' });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err) {
    console.error('Checkin error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/checkins — Get check-in data
export async function GET(request) {
  try {
    const { getDb } = require('../../../lib/db');
    const { getUserFromRequest } = require('../../../lib/auth');

    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const db = getDb();
    const url = new URL(request.url);
    const goalSheetId = url.searchParams.get('goal_sheet_id');
    const quarter = url.searchParams.get('quarter');

    let checkins = [];
    if (goalSheetId) {
      checkins = db.prepare(`
        SELECT c.*, u.name as manager_name FROM checkins c
        JOIN users u ON c.manager_id = u.id
        WHERE c.goal_sheet_id = ? ${quarter ? 'AND c.quarter = ?' : ''}
        ORDER BY c.created_at DESC
      `).all(goalSheetId, ...(quarter ? [quarter] : []));
    }

    return NextResponse.json({ checkins });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
