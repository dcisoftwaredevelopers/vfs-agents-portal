import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_ROOT_URL } from '../config/api';

export default function AdminResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!token) {
      setError('This reset link is invalid or has expired.');
      return;
    }

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_ROOT_URL}/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Unable to reset password.');
        return;
      }

      setMessage(data.message || 'Password reset successfully.');
      setTimeout(() => navigate('/admin-login'), 1200);
    } catch (err) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '450px', marginTop: '40px' }}>
      <div className="card" style={{ padding: '35px' }}>
        <h2 style={{ color: '#0c2340', fontWeight: 'bold', fontSize: '24px', marginBottom: '20px', textAlign: 'center' }}>
          Reset Admin Password
        </h2>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '12px', fontSize: '14px', borderRadius: '4px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ backgroundColor: '#ecfdf5', borderLeft: '4px solid #10b981', color: '#047857', padding: '12px', fontSize: '14px', borderRadius: '4px', marginBottom: '20px' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 12 characters"
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-secondary"
            style={{ width: '100%', padding: '12px', marginTop: '15px', fontSize: '16px', fontWeight: 'bold' }}
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
