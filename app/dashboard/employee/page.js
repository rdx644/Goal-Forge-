'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const UOM_LABELS = {
  min_numeric: 'Min (Numeric) — Higher is better',
  min_percent: 'Min (%) — Higher is better',
  max_numeric: 'Max (Numeric) — Lower is better',
  max_percent: 'Max (%) — Lower is better',
  timeline: 'Timeline — Date-based',
  zero: 'Zero — Zero = Success',
};

const STATUS_COLORS = { draft: 'badge-draft', submitted: 'badge-submitted', approved: 'badge-approved', locked: 'badge-locked', returned: 'badge-returned' };

export default function EmployeeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('goals');
  const [goalSheets, setGoalSheets] = useState([]);
  const [thrustAreas, setThrustAreas] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [goals, setGoals] = useState([]);
  const [sheetStatus, setSheetStatus] = useState('draft');
  const [sheetId, setSheetId] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [toast, setToast] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState('Q1');
  const [checkinData, setCheckinData] = useState([]);
  const [loading, setLoading] = useState(true);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const api = useCallback(async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...opts.headers } });
    return res;
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u || u.role !== 'employee') { router.push('/'); return; }
    setUser(u);
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [cycleRes, taRes, notifRes] = await Promise.all([
      api('/api/admin/cycles'), api('/api/thrust-areas'), api('/api/notifications')
    ]);
    const cycleData = await cycleRes.json();
    const taData = await taRes.json();
    const notifData = await notifRes.json();
    setCycles(cycleData.cycles || []);
    setThrustAreas(taData.thrust_areas || []);
    setNotifications(notifData.notifications || []);
    const activeCycle = (cycleData.cycles || []).find(c => c.is_active);
    if (activeCycle) {
      setSelectedCycle(activeCycle.id);
      await loadGoals(activeCycle.id);
    }
    setLoading(false);
  };

  const loadGoals = async (cycleId) => {
    const res = await api(`/api/goals?cycle_id=${cycleId}`);
    const data = await res.json();
    const sheets = data.goal_sheets || [];
    setGoalSheets(sheets);
    if (sheets.length > 0) {
      const sheet = sheets[0];
      setSheetId(sheet.id);
      setSheetStatus(sheet.status);
      setReturnReason(sheet.return_reason || '');
      setGoals(sheet.goals.map(g => ({ ...g, _achievements: g.achievements || [] })));
    } else {
      setSheetId(null);
      setSheetStatus('draft');
      setGoals([]);
    }
  };

  const addGoal = () => {
    if (goals.length >= 8) { showToast('Maximum 8 goals allowed.', 'error'); return; }
    setGoals([...goals, { title: '', description: '', thrust_area_id: '', uom_type: 'min_numeric', target_value: '', target_date: '', weightage: 10 }]);
  };

  const updateGoal = (idx, field, value) => {
    const updated = [...goals];
    updated[idx] = { ...updated[idx], [field]: value };
    setGoals(updated);
  };

  const removeGoal = (idx) => {
    if (goals[idx].is_shared) { showToast('Cannot remove shared goals.', 'error'); return; }
    setGoals(goals.filter((_, i) => i !== idx));
  };

  const totalWeightage = goals.reduce((s, g) => s + Number(g.weightage || 0), 0);

  const saveGoals = async (action) => {
    try {
      const res = await api('/api/goals', {
        method: 'POST',
        body: JSON.stringify({ cycle_id: selectedCycle, goals: goals.filter(g => !g.is_shared), action })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.errors ? data.errors.join('; ') : data.error, 'error');
        return;
      }
      showToast(data.message);
      await loadGoals(selectedCycle);
    } catch (err) {
      showToast('Failed to save goals.', 'error');
    }
  };

  const saveAchievement = async (goalId, quarter, actualValue, completionDate, status) => {
    try {
      const res = await api('/api/checkins', {
        method: 'POST',
        body: JSON.stringify({ type: 'achievement', goal_id: goalId, quarter, actual_value: actualValue, completion_date: completionDate, status })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error, 'error'); return; }
      showToast(`${quarter} achievement saved. Score: ${data.progress_score}%`);
      await loadGoals(selectedCycle);
    } catch (err) {
      showToast('Failed to save achievement.', 'error');
    }
  };

  const isEditable = sheetStatus === 'draft' || sheetStatus === 'returned';

  const logout = () => { localStorage.clear(); router.push('/'); };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><div style={{ fontSize: 24 }}>Loading...</div></div>;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">GF</div>
          <div className="sidebar-brand">GoalForge</div>
        </div>
        <div className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>
          <button className={`nav-item ${activeTab === 'goals' ? 'active' : ''}`} onClick={() => setActiveTab('goals')}>
            <span className="icon">🎯</span> My Goals
          </button>
          <button className={`nav-item ${activeTab === 'checkins' ? 'active' : ''}`} onClick={() => setActiveTab('checkins')}>
            <span className="icon">📊</span> Quarterly Check-ins
          </button>
          <button className={`nav-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
            <span className="icon">🔔</span> Notifications
            {notifications.filter(n => !n.is_read).length > 0 && (
              <span className="badge badge-submitted" style={{ marginLeft: 'auto' }}>{notifications.filter(n => !n.is_read).length}</span>
            )}
          </button>
        </div>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0)}</div>
            <div className="user-details">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Employee · {user?.department}</div>
            </div>
          </div>
          <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={logout}>Sign Out</button>
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">{activeTab === 'goals' ? 'My Goals' : activeTab === 'checkins' ? 'Quarterly Check-ins' : 'Notifications'}</h1>
            <p className="page-subtitle">
              {activeTab === 'goals' ? 'Create, manage, and track your performance goals' : activeTab === 'checkins' ? 'Log your quarterly achievements' : 'Stay updated on your goal activities'}
            </p>
          </div>
          {activeTab === 'goals' && <span className={`badge ${STATUS_COLORS[sheetStatus]}`} style={{ fontSize: 14, padding: '6px 16px' }}>{sheetStatus.toUpperCase()}</span>}
        </div>

        <div className="page-body">
          {/* GOALS TAB */}
          {activeTab === 'goals' && (
            <>
              {returnReason && sheetStatus === 'returned' && (
                <div style={{ padding: 16, background: 'var(--danger-bg)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', marginBottom: 16, color: 'var(--danger)' }}>
                  ⚠ <strong>Returned by Manager:</strong> {returnReason}
                </div>
              )}

              {/* Weightage indicator */}
              <div className="weightage-indicator">
                <span style={{ fontSize: 13, fontWeight: 600 }}>Weightage:</span>
                <div className="weightage-bar">
                  <div className="weightage-fill" style={{
                    width: `${Math.min(totalWeightage, 100)}%`,
                    background: totalWeightage === 100 ? 'var(--success)' : totalWeightage > 100 ? 'var(--danger)' : 'var(--accent)'
                  }} />
                </div>
                <span className="weightage-value" style={{ color: totalWeightage === 100 ? 'var(--success)' : totalWeightage > 100 ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {totalWeightage}%
                </span>
              </div>

              {/* Goals list */}
              {goals.map((goal, idx) => (
                <div key={idx} className="card" style={{ marginBottom: 12, opacity: goal.is_shared ? 0.85 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Goal {idx + 1} {goal.is_shared ? '(Shared KPI)' : ''}</span>
                    {isEditable && !goal.is_shared && (
                      <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeGoal(idx)}>✕</button>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Goal Title *</label>
                      <input className="form-input" value={goal.title} onChange={e => updateGoal(idx, 'title', e.target.value)}
                        disabled={!isEditable || goal.is_shared} placeholder="Enter goal title" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Thrust Area</label>
                      <select className="form-select" value={goal.thrust_area_id || ''} onChange={e => updateGoal(idx, 'thrust_area_id', e.target.value)}
                        disabled={!isEditable || goal.is_shared}>
                        <option value="">Select...</option>
                        {thrustAreas.map(ta => <option key={ta.id} value={ta.id}>{ta.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea className="form-textarea" value={goal.description || ''} onChange={e => updateGoal(idx, 'description', e.target.value)}
                      disabled={!isEditable || goal.is_shared} placeholder="Describe this goal..." rows={2} />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Unit of Measurement *</label>
                      <select className="form-select" value={goal.uom_type} onChange={e => updateGoal(idx, 'uom_type', e.target.value)}
                        disabled={!isEditable || goal.is_shared}>
                        {Object.entries(UOM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    {goal.uom_type === 'timeline' ? (
                      <div className="form-group">
                        <label className="form-label">Target Date *</label>
                        <input type="date" className="form-input" value={goal.target_date || ''} onChange={e => updateGoal(idx, 'target_date', e.target.value)}
                          disabled={!isEditable || goal.is_shared} />
                      </div>
                    ) : goal.uom_type !== 'zero' ? (
                      <div className="form-group">
                        <label className="form-label">Target Value *</label>
                        <input type="number" className="form-input" value={goal.target_value || ''} onChange={e => updateGoal(idx, 'target_value', e.target.value)}
                          disabled={!isEditable || goal.is_shared} placeholder="e.g. 100" />
                      </div>
                    ) : null}
                    <div className="form-group">
                      <label className="form-label">Weightage (%) *</label>
                      <input type="number" className="form-input" min={10} max={100} value={goal.weightage}
                        onChange={e => updateGoal(idx, 'weightage', Number(e.target.value))}
                        disabled={!isEditable} />
                      <div className="form-hint">Min: 10%</div>
                    </div>
                  </div>
                </div>
              ))}

              {isEditable && (
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={addGoal} disabled={goals.length >= 8}>
                    ➕ Add Goal {goals.length}/8
                  </button>
                  <button className="btn btn-primary" onClick={() => saveGoals('save_draft')}>💾 Save Draft</button>
                  <button className="btn btn-success" onClick={() => saveGoals('submit')} disabled={totalWeightage !== 100}>
                    📤 Submit for Approval
                  </button>
                </div>
              )}

              {(sheetStatus === 'approved' || sheetStatus === 'locked') && (
                <div style={{ marginTop: 16, padding: 16, background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', color: 'var(--success)' }}>
                  ✅ Your goals have been approved and locked. Use the Check-ins tab to log quarterly achievements.
                </div>
              )}
            </>
          )}

          {/* CHECK-INS TAB */}
          {activeTab === 'checkins' && (
            <>
              <div className="tabs">
                {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                  <button key={q} className={`tab ${selectedQuarter === q ? 'active' : ''}`} onClick={() => setSelectedQuarter(q)}>{q}</button>
                ))}
              </div>

              {(sheetStatus !== 'approved' && sheetStatus !== 'locked') ? (
                <div className="empty-state">
                  <div className="icon">📋</div>
                  <h3>Goals Not Yet Approved</h3>
                  <p>Your goals must be approved before you can log quarterly achievements.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Goal</th><th>UoM</th><th>Target</th><th>Actual</th><th>Status</th><th>Score</th><th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goals.map((goal, idx) => {
                        const ach = (goal._achievements || []).find(a => a.quarter === selectedQuarter) || {};
                        return (
                          <tr key={idx}>
                            <td style={{ maxWidth: 200 }}><strong>{goal.title}</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>W: {goal.weightage}%</span></td>
                            <td><span className="badge badge-draft">{goal.uom_type}</span></td>
                            <td>{goal.uom_type === 'timeline' ? goal.target_date : goal.uom_type === 'zero' ? '0' : goal.target_value}</td>
                            <td>
                              {goal.uom_type === 'timeline' ? (
                                <input type="date" className="form-input" style={{ width: 150 }} defaultValue={ach.completion_date || ''}
                                  onBlur={e => saveAchievement(goal.id, selectedQuarter, null, e.target.value, ach.status || 'on_track')} />
                              ) : (
                                <input type="number" className="form-input" style={{ width: 100 }} defaultValue={ach.actual_value || ''}
                                  onBlur={e => saveAchievement(goal.id, selectedQuarter, Number(e.target.value), null, ach.status || 'on_track')} />
                              )}
                            </td>
                            <td>
                              <select className="form-select" style={{ width: 130 }} defaultValue={ach.status || 'not_started'}
                                onChange={e => saveAchievement(goal.id, selectedQuarter, ach.actual_value, ach.completion_date, e.target.value)}>
                                <option value="not_started">Not Started</option>
                                <option value="on_track">On Track</option>
                                <option value="completed">Completed</option>
                              </select>
                            </td>
                            <td><strong>{ach.progress_score != null ? `${ach.progress_score}%` : '—'}</strong></td>
                            <td><span style={{ color: 'var(--success)', fontSize: 13 }}>{ach.id ? '✅ Saved' : ''}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <>
              {notifications.length === 0 ? (
                <div className="empty-state"><div className="icon">🔔</div><h3>No Notifications</h3></div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className="card" style={{ marginBottom: 8, opacity: n.is_read ? 0.6 : 1, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{n.title}</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{n.message}</p>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
