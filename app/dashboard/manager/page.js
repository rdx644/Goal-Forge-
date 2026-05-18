'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function ManagerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('team');
  const [goalSheets, setGoalSheets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [selectedQuarter, setSelectedQuarter] = useState('Q1');
  const [checkinComment, setCheckinComment] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [showModal, setShowModal] = useState(null); // 'approve' | 'return' | 'checkin' | 'shared'
  const [sharedGoal, setSharedGoal] = useState({ title: '', description: '', uom_type: 'min_numeric', target_value: '', thrust_area_id: '', employee_ids: [] });
  const [teamEmployees, setTeamEmployees] = useState([]);
  const [thrustAreas, setThrustAreas] = useState([]);
  const [activeCycleId, setActiveCycleId] = useState(null);
  const [approvalEdits, setApprovalEdits] = useState({});
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const api = useCallback(async (url, opts = {}) => {
    return fetch(url, { ...opts, headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...opts.headers } });
  }, []);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u || u.role !== 'manager') { router.push('/'); return; }
    setUser(u);
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [goalsRes, empRes, taRes, notifRes, cyclesRes] = await Promise.all([
      api('/api/goals'), api('/api/admin/users?role=employee'), api('/api/thrust-areas'), api('/api/notifications'), api('/api/admin/cycles')
    ]);
    const gd = await goalsRes.json(); setGoalSheets(gd.goal_sheets || []);
    const ed = await empRes.json(); setTeamEmployees(ed.users || []);
    const td = await taRes.json(); setThrustAreas(td.thrust_areas || []);
    const nd = await notifRes.json(); setNotifications(nd.notifications || []);
    const cd = await cyclesRes.json(); setActiveCycleId((cd.cycles || []).find(c => c.is_active)?.id || null);
    setApprovalEdits({});
    setLoading(false);
  };

  const handleApprove = async () => {
    const sheetGoalIds = new Set((selectedSheet.goals || []).map(g => g.id));
    const edits = Object.values(approvalEdits).filter(e => sheetGoalIds.has(e.goal_id));
    const res = await api('/api/goals/approve', { method: 'POST', body: JSON.stringify({ goal_sheet_id: selectedSheet.id, action: 'approve', edits }) });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }
    showToast('Goal sheet approved and locked!');
    setShowModal(null); setSelectedSheet(null);
    await loadData();
  };

  const handleReturn = async () => {
    if (!returnReason.trim()) { showToast('Please provide a reason for return.', 'error'); return; }
    const res = await api('/api/goals/approve', { method: 'POST', body: JSON.stringify({ goal_sheet_id: selectedSheet.id, action: 'return', return_reason: returnReason }) });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }
    showToast('Goal sheet returned for rework.');
    setShowModal(null); setSelectedSheet(null); setReturnReason('');
    await loadData();
  };

  const handleCheckin = async () => {
    if (!checkinComment.trim()) { showToast('Please enter a check-in comment.', 'error'); return; }
    const res = await api('/api/checkins', { method: 'POST', body: JSON.stringify({ type: 'checkin_comment', goal_sheet_id: selectedSheet.id, quarter: selectedQuarter, comment: checkinComment }) });
    if (!res.ok) { showToast('Failed to save check-in.', 'error'); return; }
    showToast(`${selectedQuarter} check-in comment saved.`);
    setShowModal(null); setCheckinComment('');
  };

  const handlePushSharedGoal = async () => {
    if (!activeCycleId) { showToast('No active performance cycle is configured.', 'error'); return; }
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    const myTeam = teamEmployees.filter(e => e.manager_id === u?.id);
    const res = await api('/api/goals/shared', {
      method: 'POST',
      body: JSON.stringify({
        cycle_id: activeCycleId, ...sharedGoal,
        employee_ids: sharedGoal.employee_ids.length > 0 ? sharedGoal.employee_ids : myTeam.map(e => e.id)
      })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error, 'error'); return; }
    showToast(data.message);
    setShowModal(null); setSharedGoal({ title: '', description: '', uom_type: 'min_numeric', target_value: '', thrust_area_id: '', employee_ids: [] });
    await loadData();
  };

  const pending = goalSheets.filter(s => s.status === 'submitted');
  const approved = goalSheets.filter(s => s.status === 'approved' || s.status === 'locked');
  const logout = () => { localStorage.clear(); router.push('/'); };

  const editedValue = (goal, field) => approvalEdits[goal.id]?.[field] ?? goal[field] ?? '';
  const updateApprovalEdit = (goal, field, value) => {
    setApprovalEdits(prev => ({
      ...prev,
      [goal.id]: { ...(prev[goal.id] || {}), goal_id: goal.id, [field]: value },
    }));
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><div>Loading...</div></div>;

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-header"><div className="sidebar-logo">GF</div><div className="sidebar-brand">GoalForge</div></div>
        <div className="sidebar-nav">
          <div className="nav-section-title">Manager</div>
          <button className={`nav-item ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}><span className="icon">👥</span> Team Overview</button>
          <button className={`nav-item ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>
            <span className="icon">✅</span> Approvals {pending.length > 0 && <span className="badge badge-submitted" style={{ marginLeft: 'auto' }}>{pending.length}</span>}
          </button>
          <button className={`nav-item ${activeTab === 'checkins' ? 'active' : ''}`} onClick={() => setActiveTab('checkins')}><span className="icon">📊</span> Check-ins</button>
          <button className={`nav-item ${activeTab === 'shared' ? 'active' : ''}`} onClick={() => setActiveTab('shared')}><span className="icon">🔗</span> Shared Goals</button>
          <button className={`nav-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}><span className="icon">🔔</span> Notifications</button>
        </div>
        <div className="sidebar-footer">
          <div className="user-info"><div className="user-avatar">{user?.name?.charAt(0)}</div><div className="user-details"><div className="user-name">{user?.name}</div><div className="user-role">Manager · {user?.department}</div></div></div>
          <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={logout}>Sign Out</button>
        </div>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <div><h1 className="page-title">{activeTab === 'team' ? 'Team Overview' : activeTab === 'approvals' ? 'Pending Approvals' : activeTab === 'checkins' ? 'Quarterly Check-ins' : activeTab === 'shared' ? 'Shared Goals' : 'Notifications'}</h1></div>
          {activeTab === 'shared' && <button className="btn btn-primary" onClick={() => setShowModal('shared')}>➕ Push Shared Goal</button>}
        </div>

        <div className="page-body">
          {/* TEAM OVERVIEW */}
          {activeTab === 'team' && (
            <>
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-icon purple">👥</div><div><div className="stat-value">{goalSheets.length}</div><div className="stat-label">Team Members</div></div></div>
                <div className="stat-card"><div className="stat-icon orange">⏳</div><div><div className="stat-value">{pending.length}</div><div className="stat-label">Pending Approval</div></div></div>
                <div className="stat-card"><div className="stat-icon green">✅</div><div><div className="stat-value">{approved.length}</div><div className="stat-label">Approved</div></div></div>
              </div>
              <div className="table-container">
                <table>
                  <thead><tr><th>Employee</th><th>Department</th><th>Status</th><th>Goals</th><th>Weightage</th></tr></thead>
                  <tbody>
                    {goalSheets.map(s => (
                      <tr key={s.id}>
                        <td><strong>{s.employee_name}</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.emp_id}</span></td>
                        <td>{s.department || '—'}</td>
                        <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                        <td>{s.goals?.length || 0}</td>
                        <td>{s.total_weightage}%</td>
                      </tr>
                    ))}
                    {goalSheets.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No goal sheets from your team yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* APPROVALS */}
          {activeTab === 'approvals' && (
            pending.length === 0 ? <div className="empty-state"><div className="icon">✅</div><h3>All Caught Up</h3><p>No pending approvals.</p></div> : (
              pending.map(sheet => (
                <div key={sheet.id} className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header">
                    <div><div className="card-title">{sheet.employee_name}</div><span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Submitted {new Date(sheet.submitted_at).toLocaleDateString()}</span></div>
                    <div className="btn-group">
                      <button className="btn btn-success btn-sm" onClick={() => { setSelectedSheet(sheet); setShowModal('approve'); }}>✅ Approve</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { setSelectedSheet(sheet); setShowModal('return'); }}>↩ Return</button>
                    </div>
                  </div>
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Goal</th><th>Thrust Area</th><th>UoM</th><th>Target</th><th>Weightage</th></tr></thead>
                      <tbody>
                        {(sheet.goals || []).map(g => (
                          <tr key={g.id}>
                            <td><strong>{g.title}</strong>{g.description && <><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.description}</span></>}</td>
                            <td>{g.thrust_area_name || '—'}</td>
                            <td><span className="badge badge-draft">{g.uom_type}</span></td>
                            <td>
                              {g.is_shared ? (
                                g.uom_type === 'timeline' ? g.target_date : g.uom_type === 'zero' ? '0' : g.target_value
                              ) : g.uom_type === 'timeline' ? (
                                <input type="date" className="form-input" style={{ width: 150 }} value={editedValue(g, 'target_date')} onChange={e => updateApprovalEdit(g, 'target_date', e.target.value)} />
                              ) : g.uom_type === 'zero' ? (
                                '0'
                              ) : (
                                <input type="number" className="form-input" style={{ width: 110 }} value={editedValue(g, 'target_value')} onChange={e => updateApprovalEdit(g, 'target_value', Number(e.target.value))} />
                              )}
                            </td>
                            <td><input type="number" className="form-input" min={10} max={100} style={{ width: 90 }} value={editedValue(g, 'weightage')} onChange={e => updateApprovalEdit(g, 'weightage', Number(e.target.value))} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )
          )}

          {/* CHECK-INS */}
          {activeTab === 'checkins' && (
            <>
              <div className="tabs">
                {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                  <button key={q} className={`tab ${selectedQuarter === q ? 'active' : ''}`} onClick={() => setSelectedQuarter(q)}>{q}</button>
                ))}
              </div>
              {approved.map(sheet => (
                <div key={sheet.id} className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header">
                    <div className="card-title">{sheet.employee_name}</div>
                    <button className="btn btn-primary btn-sm" onClick={() => { setSelectedSheet(sheet); setShowModal('checkin'); }}>💬 Add Comment</button>
                  </div>
                  <div className="table-container">
                    <table>
                      <thead><tr><th>Goal</th><th>Target</th><th>Actual</th><th>Status</th><th>Score</th></tr></thead>
                      <tbody>
                        {(sheet.goals || []).map(g => {
                          const ach = (g.achievements || []).find(a => a.quarter === selectedQuarter) || {};
                          return (
                            <tr key={g.id}>
                              <td><strong>{g.title}</strong></td>
                              <td>{g.uom_type === 'timeline' ? g.target_date : g.target_value}</td>
                              <td>{ach.actual_value ?? ach.completion_date ?? '—'}</td>
                              <td>{ach.status ? <span className={`badge badge-${ach.status}`}>{ach.status}</span> : '—'}</td>
                              <td><strong>{ach.progress_score != null ? `${ach.progress_score}%` : '—'}</strong></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* SHARED GOALS */}
          {activeTab === 'shared' && (
            <div className="empty-state"><div className="icon">🔗</div><h3>Push Shared KPIs</h3><p>Use the button above to push departmental goals to your team members.</p></div>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            notifications.length === 0 ? <div className="empty-state"><div className="icon">🔔</div><h3>No Notifications</h3></div> : (
              notifications.map(n => (
                <div key={n.id} className="card" style={{ marginBottom: 8, padding: 16, opacity: n.is_read ? 0.6 : 1 }}>
                  <strong>{n.title}</strong>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{n.message}</p>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(n.created_at).toLocaleString()}</span>
                </div>
              ))
            )
          )}
        </div>
      </main>

      {/* MODALS */}
      {showModal === 'approve' && selectedSheet && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Approve Goal Sheet</div>
            <p>Approve <strong>{selectedSheet.employee_name}</strong>'s goal sheet? Goals will be locked after approval.</p>
            <div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowModal(null)}>Cancel</button><button className="btn btn-success" onClick={handleApprove}>✅ Approve & Lock</button></div>
          </div>
        </div>
      )}
      {showModal === 'return' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Return for Rework</div>
            <div className="form-group"><label className="form-label">Reason *</label><textarea className="form-textarea" value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="Explain what needs to be revised..." /></div>
            <div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowModal(null)}>Cancel</button><button className="btn btn-danger" onClick={handleReturn}>↩ Return</button></div>
          </div>
        </div>
      )}
      {showModal === 'checkin' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{selectedQuarter} Check-in — {selectedSheet?.employee_name}</div>
            <div className="form-group"><label className="form-label">Check-in Comment *</label><textarea className="form-textarea" value={checkinComment} onChange={e => setCheckinComment(e.target.value)} placeholder="Document the discussion..." rows={4} /></div>
            <div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowModal(null)}>Cancel</button><button className="btn btn-primary" onClick={handleCheckin}>💬 Save Comment</button></div>
          </div>
        </div>
      )}
      {showModal === 'shared' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Push Shared Goal (KPI)</div>
            <div className="form-group"><label className="form-label">Goal Title *</label><input className="form-input" value={sharedGoal.title} onChange={e => setSharedGoal({ ...sharedGoal, title: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={sharedGoal.description} onChange={e => setSharedGoal({ ...sharedGoal, description: e.target.value })} rows={2} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">UoM</label><select className="form-select" value={sharedGoal.uom_type} onChange={e => setSharedGoal({ ...sharedGoal, uom_type: e.target.value })}><option value="min_numeric">Min (Numeric)</option><option value="min_percent">Min (%)</option><option value="max_numeric">Max (Numeric)</option><option value="timeline">Timeline</option><option value="zero">Zero</option></select></div>
              <div className="form-group"><label className="form-label">Target</label><input type="number" className="form-input" value={sharedGoal.target_value} onChange={e => setSharedGoal({ ...sharedGoal, target_value: e.target.value })} /></div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>This will be pushed to all your team members.</p>
            <div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowModal(null)}>Cancel</button><button className="btn btn-primary" onClick={handlePushSharedGoal}>🔗 Push to Team</button></div>
          </div>
        </div>
      )}

      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  );
}
