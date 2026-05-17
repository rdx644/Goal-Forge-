'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Route based on role
      const role = data.user.role;
      router.push(`/dashboard/${role}`);
    } catch (err) {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  const quickLogin = (id) => {
    setEmployeeId(id);
    setPassword('password123');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">GF</div>
          <div className="login-logo-text">GoalForge</div>
        </div>
        <p className="login-subtitle">Goal Setting &amp; Tracking Portal</p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Employee ID</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. emp001"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
              id="login-employee-id"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              id="login-password"
            />
          </div>

          {error && <div className="form-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading} id="login-submit">
            {loading ? '⏳ Signing in...' : '🚀 Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>QUICK LOGIN (Demo)</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => quickLogin('emp001')} id="quick-employee">
              👤 Employee
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => quickLogin('mgr001')} id="quick-manager">
              👔 Manager
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => quickLogin('admin001')} id="quick-admin">
              🛡 Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
