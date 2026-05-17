'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [dashData, setDashData] = useState(null);
  const [users, setUsers] = useState([]);
  const [goalSheets, setGoalSheets] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [escalationData, setEscalationData] = useState({ rules: [], logs: [] });
  const [escalationStatus, setEscalationStatus] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(null);
  const [unlockSheet, setUnlockSheet] = useState(null);
  const [unlockReason, setUnlockReason] = useState('');

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const api = useCallback(async (url, opts = {}) => {
    return fetch(url, { ...opts, headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...opts.headers } });
  }, []);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!u || u.role !== 'admin') { router.push('/'); return; }
    setUser(u);
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [dashRes, usersRes, goalsRes, cyclesRes, notifRes, escRes, escStatusRes] = await Promise.all([
      api('/api/reports/dashboard'), api('/api/admin/users'), api('/api/goals'),
      api('/api/admin/cycles'), api('/api/notifications'),
      api('/api/escalation'), api('/api/escalation/trigger')
    ]);
    setDashData(await dashRes.json());
    setUsers((await usersRes.json()).users || []);
    setGoalSheets((await goalsRes.json()).goal_sheets || []);
    setCycles((await cyclesRes.json()).cycles || []);
    setNotifications((await notifRes.json()).notifications || []);
    setEscalationData(await escRes.json());
    setEscalationStatus(await escStatusRes.json());
    setLoading(false);
  };

  const triggerEscalation = async () => {
    showToast('Running escalation engine...', 'info');
    const res = await api('/api/escalation/trigger', { method: 'POST' });
    const data = await res.json();
    if (res.ok) { showToast(`Escalation complete — ${data.triggered} new escalation(s)`); await loadData(); }
    else showToast('Escalation failed: ' + data.error, 'error');
  };

  const resolveEscalation = async (logId) => {
    const res = await api('/api/escalation', { method: 'POST', body: JSON.stringify({ action: 'resolve', log_id: logId }) });
    if (res.ok) { showToast('Escalation resolved'); await loadData(); }
    else showToast('Failed to resolve', 'error');
  };

  const handleUnlock = async () => {
    if (!unlockSheet) return;
    const res = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'unlock_goal_sheet', goal_sheet_id: unlockSheet.id, reason: unlockReason })
    });
    if (res.ok) { showToast('Goal sheet unlocked.'); setShowModal(null); await loadData(); }
    else showToast('Failed to unlock.', 'error');
  };

  const exportCSV = async () => {
    const token = getToken();
    window.open(`/api/reports/achievement?cycle_id=1&format=csv&token=${token}`, '_blank');
    showToast('Report downloading...');
  };

  const logout = () => { localStorage.clear(); router.push('/'); };
  const stats = dashData?.stats || {};

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><div>Loading...</div></div>;

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-header"><div className="sidebar-logo">GF</div><div className="sidebar-brand">GoalForge</div></div>
        <div className="sidebar-nav">
          <div className="nav-section-title">Admin</div>
          <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}><span className="icon">📊</span> Overview</button>
          <button className={`nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}><span className="icon">👥</span> Users & Hierarchy</button>
          <button className={`nav-item ${activeTab === 'sheets' ? 'active' : ''}`} onClick={() => setActiveTab('sheets')}><span className="icon">📋</span> Goal Sheets</button>
          <button className={`nav-item ${activeTab === 'cycles' ? 'active' : ''}`} onClick={() => setActiveTab('cycles')}><span className="icon">🔄</span> Cycles</button>
          <button className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}><span className="icon">📈</span> Analytics</button>
          <button className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}><span className="icon">📊</span> Reports</button>
          <button className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}><span className="icon">🔍</span> Audit Trail</button>
          <button className={`nav-item ${activeTab === 'escalation' ? 'active' : ''}`} onClick={() => setActiveTab('escalation')}><span className="icon">⚡</span> Escalation</button>
          <button className={`nav-item ${activeTab === 'integrations' ? 'active' : ''}`} onClick={() => setActiveTab('integrations')}><span className="icon">🔗</span> Integrations</button>
        </div>
        <div className="sidebar-footer">
          <div className="user-info"><div className="user-avatar">{user?.name?.charAt(0)}</div><div className="user-details"><div className="user-name">{user?.name}</div><div className="user-role">Admin · HR</div></div></div>
          <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={logout}>Sign Out</button>
        </div>
      </nav>

      <main className="main-content">
        <div className="page-header">
          <div><h1 className="page-title">{({overview:'Dashboard Overview',users:'User Management',sheets:'All Goal Sheets',cycles:'Cycle Management',analytics:'Analytics Dashboard',reports:'Reports & Export',audit:'Audit Trail',escalation:'Escalation Engine',integrations:'Integrations'})[activeTab]}</h1></div>
          {activeTab === 'reports' && <button className="btn btn-primary" onClick={exportCSV}>📥 Export CSV</button>}
          {activeTab === 'escalation' && <button className="btn btn-warning" onClick={triggerEscalation}>⚡ Run Escalation Engine</button>}
        </div>

        <div className="page-body">
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-icon purple">👥</div><div><div className="stat-value">{stats.totalEmployees}</div><div className="stat-label">Employees</div></div></div>
                <div className="stat-card"><div className="stat-icon blue">👔</div><div><div className="stat-value">{stats.totalManagers}</div><div className="stat-label">Managers</div></div></div>
                <div className="stat-card"><div className="stat-icon green">✅</div><div><div className="stat-value">{stats.approvedSheets}</div><div className="stat-label">Approved Sheets</div></div></div>
                <div className="stat-card"><div className="stat-icon orange">⏳</div><div><div className="stat-value">{stats.submittedSheets}</div><div className="stat-label">Pending Approval</div></div></div>
                <div className="stat-card"><div className="stat-icon red">📝</div><div><div className="stat-value">{stats.draftSheets}</div><div className="stat-label">Drafts</div></div></div>
              </div>

              {/* Quarterly Completion */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 16 }}>📊 Quarterly Completion Rates</div>
                {dashData?.quarterCompletion && Object.entries(dashData.quarterCompletion).map(([q, d]) => (
                  <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                    <span style={{ width: 32, fontWeight: 700 }}>{q}</span>
                    <div className="progress-bar" style={{ flex: 1 }}>
                      <div className={`progress-fill ${d.rate >= 80 ? 'green' : d.rate >= 50 ? 'orange' : 'red'}`} style={{ width: `${d.rate}%` }} />
                    </div>
                    <span style={{ width: 80, textAlign: 'right', fontWeight: 600 }}>{d.completed}/{d.total} ({d.rate}%)</span>
                  </div>
                ))}
              </div>

              {/* Department Breakdown */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 16 }}>🏢 Department Breakdown</div>
                <div className="table-container">
                  <table>
                    <thead><tr><th>Department</th><th>Goal Sheets</th><th>Approved</th><th>Avg Score</th></tr></thead>
                    <tbody>
                      {(dashData?.deptBreakdown || []).map(d => (
                        <tr key={d.department}><td><strong>{d.department}</strong></td><td>{d.total_sheets}</td><td>{d.approved_sheets}</td><td>{d.avg_score ? `${Math.round(d.avg_score)}%` : '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Goal Distribution by Thrust Area */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>🎯 Goal Distribution by Thrust Area</div>
                {(dashData?.thrustAreaDist || []).map(t => (
                  <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <span style={{ flex: 1, fontSize: 14 }}>{t.name || 'Uncategorized'}</span>
                    <div className="progress-bar" style={{ width: 200 }}>
                      <div className="progress-fill" style={{ width: `${Math.min((t.count / Math.max(...(dashData?.thrustAreaDist || []).map(x => x.count), 1)) * 100, 100)}%` }} />
                    </div>
                    <span style={{ fontWeight: 600, width: 30, textAlign: 'right' }}>{t.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* USERS */}
          {activeTab === 'users' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Employee ID</th><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Reports To</th><th>Status</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{u.employee_id}</td>
                      <td><strong>{u.name}</strong></td><td>{u.email}</td>
                      <td><span className={`badge ${u.role === 'admin' ? 'badge-locked' : u.role === 'manager' ? 'badge-submitted' : 'badge-approved'}`}>{u.role}</span></td>
                      <td>{u.department}</td><td>{u.manager_name || '—'}</td>
                      <td><span className={`badge ${u.is_active ? 'badge-approved' : 'badge-returned'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* GOAL SHEETS */}
          {activeTab === 'sheets' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Employee</th><th>Status</th><th>Goals</th><th>Weightage</th><th>Manager</th><th>Actions</th></tr></thead>
                <tbody>
                  {goalSheets.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.employee_name}</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.emp_id}</span></td>
                      <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                      <td>{s.goals?.length || 0}</td><td>{s.total_weightage}%</td>
                      <td>{s.manager_name || '—'}</td>
                      <td>{s.status === 'locked' && (
                        <button className="btn btn-outline btn-sm" onClick={() => { setUnlockSheet(s); setShowModal('unlock'); }}>🔓 Unlock</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CYCLES */}
          {activeTab === 'cycles' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Cycle</th><th>Year</th><th>Goal Setting</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Status</th></tr></thead>
                <tbody>
                  {cycles.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td><td>{c.year}</td>
                      <td>{c.goal_setting_start} → {c.goal_setting_end}</td>
                      <td>{c.q1_start} → {c.q1_end}</td><td>{c.q2_start} → {c.q2_end}</td>
                      <td>{c.q3_start} → {c.q3_end}</td><td>{c.q4_start} → {c.q4_end}</td>
                      <td><span className={`badge ${c.is_active ? 'badge-approved' : 'badge-draft'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* REPORTS */}
          {activeTab === 'reports' && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title">📈 Manager Effectiveness Dashboard</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>Comparison of check-in completion rates across L1 managers</p>
                <div className="table-container">
                  <table>
                    <thead><tr><th>Manager</th><th>Team Size</th><th>Check-ins Done</th><th>Completion Rate</th></tr></thead>
                    <tbody>
                      {(dashData?.managerCompletion || []).map(m => (
                        <tr key={m.manager_id}>
                          <td><strong>{m.manager_name}</strong></td><td>{m.total_sheets}</td><td>{m.checked_in_sheets}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="progress-bar" style={{ width: 100 }}>
                                <div className={`progress-fill ${m.total_sheets > 0 && (m.checked_in_sheets / m.total_sheets * 100) >= 80 ? 'green' : 'orange'}`}
                                  style={{ width: `${m.total_sheets > 0 ? (m.checked_in_sheets / m.total_sheets * 100) : 0}%` }} />
                              </div>
                              <span>{m.total_sheets > 0 ? Math.round(m.checked_in_sheets / m.total_sheets * 100) : 0}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <div className="card-title">📊 UoM Type Distribution</div>
                <div style={{ marginTop: 16 }}>
                  {(dashData?.uomDist || []).map(u => (
                    <div key={u.uom_type} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ width: 120, fontSize: 14 }}>{u.uom_type}</span>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-fill" style={{ width: `${(u.count / Math.max(...(dashData?.uomDist || []).map(x => x.count), 1)) * 100}%` }} />
                      </div>
                      <span style={{ fontWeight: 600 }}>{u.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Time</th><th>Entity</th><th>Action</th><th>Field</th><th>Old → New</th><th>Changed By</th><th>Reason</th></tr></thead>
                <tbody>
                  {(dashData?.auditLog || []).length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No audit entries yet.</td></tr>
                  ) : (dashData?.auditLog || []).map(a => (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12 }}>{new Date(a.changed_at).toLocaleString()}</td>
                      <td>{a.entity_type} #{a.entity_id}</td><td><span className="badge badge-submitted">{a.action}</span></td>
                      <td>{a.field_changed || '—'}</td><td>{a.old_value ? `${a.old_value} → ${a.new_value}` : '—'}</td>
                      <td>{a.changed_by_name}</td><td>{a.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ANALYTICS — Section 5.4 */}
          {activeTab === 'analytics' && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 16 }}>📊 Goal Status Distribution</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[{label:'Not Started',val:dashData?.goalStatusDist?.not_started||0,color:'#64748b'},{label:'On Track',val:dashData?.goalStatusDist?.on_track||0,color:'#f59e0b'},{label:'Completed',val:dashData?.goalStatusDist?.completed||0,color:'#22c55e'}].map(s=>(
                    <div key={s.label} style={{flex:1,minWidth:140,background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:20,textAlign:'center'}}>
                      <div style={{fontSize:32,fontWeight:800,color:s.color}}>{s.val}</div>
                      <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 16 }}>📈 QoQ Achievement Trends by Department</div>
                {(dashData?.qoqTrends||[]).map(qt=>(
                  <div key={qt.quarter} style={{marginBottom:16}}>
                    <div style={{fontWeight:700,marginBottom:8,color:'var(--text-secondary)'}}>{qt.quarter}</div>
                    {qt.departments.length===0?<div style={{fontSize:13,color:'var(--text-muted)'}}>No data yet</div>:
                    qt.departments.map(d=>(
                      <div key={d.department} style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
                        <span style={{width:120,fontSize:13}}>{d.department}</span>
                        <div className="progress-bar" style={{flex:1}}><div className={`progress-fill ${(d.avg_score||0)>=80?'green':(d.avg_score||0)>=50?'orange':'red'}`} style={{width:`${Math.min(d.avg_score||0,100)}%`}}/></div>
                        <span style={{width:60,textAlign:'right',fontSize:13,fontWeight:600}}>{Math.round(d.avg_score||0)}%</span>
                        <span style={{width:30,textAlign:'right',fontSize:11,color:'var(--text-muted)'}}>{d.employees_updated}👤</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>🗺️ Achievement Heatmap</div>
                <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:12}}>Progress scores per employee per quarter (color: 🟢≥80% 🟡≥50% 🔴&lt;50% ⚫No data)</p>
                <div className="table-container"><table>
                  <thead><tr><th>Employee</th><th>Dept</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr></thead>
                  <tbody>
                    {(dashData?.heatmapData||[]).map(h=>(
                      <tr key={h.name}><td><strong>{h.name}</strong></td><td>{h.department}</td>
                        {['q1_score','q2_score','q3_score','q4_score'].map(q=>{
                          const v=h[q]; const bg=v==null?'#1e293b':v>=80?'#166534':v>=50?'#854d0e':'#991b1b';
                          return <td key={q} style={{background:bg,color:'#fff',textAlign:'center',fontWeight:700,borderRadius:4}}>{v!=null?`${Math.round(v)}%`:'—'}</td>;
                        })}
                      </tr>
                    ))}
                    {(dashData?.heatmapData||[]).length===0&&<tr><td colSpan={6} style={{textAlign:'center',color:'var(--text-muted)',padding:24}}>No achievement data yet — check-ins will populate this heatmap.</td></tr>}
                  </tbody>
                </table></div>
              </div>
            </>
          )}

          {/* ESCALATION — Section 5.3 */}
          {activeTab === 'escalation' && (
            <>
              {escalationStatus && (
                <div className="stats-grid" style={{marginBottom:16}}>
                  <div className="stat-card"><div className="stat-icon purple">🕐</div><div><div className="stat-value" style={{fontSize:14}}>{escalationStatus.last_run}</div><div className="stat-label">Last Engine Run</div></div></div>
                  <div className="stat-card"><div className="stat-icon orange">⚠️</div><div><div className="stat-value">{escalationStatus.open_escalations}</div><div className="stat-label">Open Escalations</div></div></div>
                  <div className="stat-card"><div className="stat-icon green">✅</div><div><div className="stat-value">{escalationStatus.active_rules}</div><div className="stat-label">Active Rules</div></div></div>
                </div>
              )}
              <div className="card" style={{marginBottom:16}}>
                <div className="card-title" style={{marginBottom:16}}>⚡ Configurable Escalation Rules</div>
                <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:12}}>Auto-notification chain: Employee → Manager → Skip-level / HR after defined intervals</p>
                <div className="table-container"><table>
                  <thead><tr><th>Rule Name</th><th>Trigger</th><th>Days Threshold</th><th>Level</th><th>→ Employee</th><th>→ Manager</th><th>→ HR</th><th>Active</th></tr></thead>
                  <tbody>
                    {(escalationData.rules||[]).map(r=>(
                      <tr key={r.id}>
                        <td><strong>{r.rule_name}</strong></td>
                        <td><span className="badge badge-submitted">{r.trigger_condition}</span></td>
                        <td style={{textAlign:'center'}}>{r.days_threshold}</td>
                        <td style={{textAlign:'center'}}><span className={`badge ${r.escalation_level>=3?'badge-locked':r.escalation_level>=2?'badge-returned':'badge-approved'}`}>L{r.escalation_level}</span></td>
                        <td style={{textAlign:'center'}}>{r.notify_employee?'✅':'—'}</td>
                        <td style={{textAlign:'center'}}>{r.notify_manager?'✅':'—'}</td>
                        <td style={{textAlign:'center'}}>{r.notify_hr?'✅':'—'}</td>
                        <td style={{textAlign:'center'}}>{r.is_active?'🟢':'🔴'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
              <div className="card">
                <div className="card-title" style={{marginBottom:16}}>📋 Escalation Log</div>
                <div className="table-container"><table>
                  <thead><tr><th>Time</th><th>Rule</th><th>Employee</th><th>Level</th><th>Status</th><th>Details</th><th>Action</th></tr></thead>
                  <tbody>
                    {(escalationData.logs||[]).length===0?(
                      <tr><td colSpan={7} style={{textAlign:'center',color:'var(--text-muted)',padding:24}}>No escalations yet. Click "Run Escalation Engine" to check for overdue items.</td></tr>
                    ):(escalationData.logs||[]).map(l=>(
                      <tr key={l.id}>
                        <td style={{fontSize:12}}>{new Date(l.triggered_at||l.created_at).toLocaleString()}</td>
                        <td><strong>{l.rule_name}</strong></td>
                        <td>{l.target_name}</td>
                        <td style={{textAlign:'center'}}><span className={`badge ${l.escalation_level>=3?'badge-locked':'badge-returned'}`}>L{l.escalation_level}</span></td>
                        <td><span className={`badge ${l.status==='open'?'badge-returned':'badge-approved'}`}>{l.status}</span></td>
                        <td style={{fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis'}}>{l.details}</td>
                        <td>{l.status==='open'&&<button className="btn btn-outline btn-sm" onClick={()=>resolveEscalation(l.id)}>✅ Resolve</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </>
          )}

          {/* INTEGRATIONS — Section 5.1 & 5.2 */}
          {activeTab === 'integrations' && (
            <>
              <div className="card" style={{marginBottom:16}}>
                <div className="card-title" style={{marginBottom:8}}>🔐 Microsoft Entra ID (Azure AD)</div>
                <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:16}}>SSO, Org Hierarchy Sync, and Role Mapping from Azure AD Groups</p>
                <div style={{display:'grid',gap:12}}>
                  {[{label:'AZURE_AD_CLIENT_ID',desc:'App Registration Client ID'},{label:'AZURE_AD_CLIENT_SECRET',desc:'Client Secret'},{label:'AZURE_AD_TENANT_ID',desc:'Directory (Tenant) ID'}].map(e=>(
                    <div key={e.label} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8}}>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:13,flex:1}}>{e.label}</span>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>{e.desc}</span>
                      <span className="badge badge-returned">Not Set</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:16,padding:16,background:'rgba(99,102,241,0.1)',borderRadius:8,border:'1px solid rgba(99,102,241,0.3)'}}>
                  <strong style={{color:'var(--primary)'}}>SSO Endpoint Ready:</strong>
                  <code style={{display:'block',marginTop:8,fontSize:12,color:'var(--text-muted)'}}>/api/auth/sso → Redirects to Azure AD login</code>
                  <code style={{display:'block',marginTop:4,fontSize:12,color:'var(--text-muted)'}}>/api/auth/sso/callback → Handles token exchange, user sync, role mapping</code>
                </div>
              </div>
              <div className="card" style={{marginBottom:16}}>
                <div className="card-title" style={{marginBottom:8}}>📧 Email Notifications</div>
                <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:16}}>SMTP-based email delivery for goal events (submission, approval, rejection, reminders)</p>
                <div style={{display:'grid',gap:12}}>
                  {[{label:'SMTP_HOST',desc:'e.g. smtp.gmail.com'},{label:'SMTP_PORT',desc:'587 (TLS) or 465 (SSL)'},{label:'SMTP_USER',desc:'Email address'},{label:'SMTP_PASS',desc:'App password'}].map(e=>(
                    <div key={e.label} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8}}>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:13,flex:1}}>{e.label}</span>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>{e.desc}</span>
                      <span className="badge badge-returned">Not Set</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-title" style={{marginBottom:8}}>💬 Microsoft Teams Integration</div>
                <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:16}}>Adaptive card notifications via Incoming Webhook with deep-link support</p>
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8}}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:13,flex:1}}>TEAMS_WEBHOOK_URL</span>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>Channel → Connectors → Incoming Webhook</span>
                  <span className="badge badge-returned">Not Set</span>
                </div>
                <div style={{marginTop:16,padding:16,background:'rgba(34,197,94,0.1)',borderRadius:8,border:'1px solid rgba(34,197,94,0.3)'}}>
                  <strong style={{color:'#22c55e'}}>Notification Dispatcher:</strong>
                  <span style={{display:'block',marginTop:8,fontSize:12,color:'var(--text-muted)'}}>All 6 event types (goal_submitted, goal_approved, goal_returned, shared_goal, checkin_feedback, escalation) automatically dispatch to: In-App ✅ + Email (when configured) + Teams (when configured)</span>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* UNLOCK MODAL */}
      {showModal === 'unlock' && unlockSheet && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔓 Unlock Goal Sheet</div>
            <p>Unlock <strong>{unlockSheet.employee_name}</strong>'s goal sheet? This will be logged in the audit trail.</p>
            <div className="form-group"><label className="form-label">Reason</label><input className="form-input" value={unlockReason} onChange={e => setUnlockReason(e.target.value)} placeholder="Reason for unlocking..." /></div>
            <div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowModal(null)}>Cancel</button><button className="btn btn-warning" onClick={handleUnlock}>🔓 Unlock</button></div>
          </div>
        </div>
      )}

      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  );
}
