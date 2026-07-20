import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  useAdminLoginMutation,
  setCredentials,
  selectCurrentAdmin,
} from '../features/auth/authSlice';
import { API_ROOT_URL } from '../config/api';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const admin = useSelector(selectCurrentAdmin);
  const [adminLogin, { isLoading: loading }] = useAdminLoginMutation();

  useEffect(() => {
    if (admin) {
      navigate('/admin-dashboard');
    }
  }, [admin, navigate]);

  const validateForm = () => {
    const tempErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      tempErrors.email = 'Email is required';
    } else if (!emailRegex.test(email)) {
      tempErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      tempErrors.password = 'Password is required';
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    if (!validateForm()) return;

    try {
      const data = await adminLogin({ email, password }).unwrap();
      dispatch(setCredentials(data));
      navigate('/admin-dashboard');
    } catch (err) {
      setApiError(err?.data?.message || err?.error || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setResetMessage('');
    setResetError('');

    const targetEmail = forgotEmail.trim();
    if (!targetEmail) {
      setResetError('Email is required');
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch(`${API_ROOT_URL}/admin/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.message || 'Unable to process reset request.');
      } else {
        setResetMessage(data.message || 'If an admin account exists for this email, a reset link has been sent.');
      }
    } catch (err) {
      setResetError(err.message || 'Network error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '450px', marginTop: '40px' }}>
      <div className="card" style={{ padding: '35px' }}>
        <h2 style={{ color: '#0c2340', fontWeight: 'bold', fontSize: '24px', marginBottom: '20px', textAlign: 'center' }}>
          Admin Portal Login
        </h2>

        {apiError && (
          <div style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '12px', fontSize: '14px', borderRadius: '4px', marginBottom: '20px' }}>
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label className="form-label">Admin Email</label>
            <input
              type="email"
              className="form-control"
              style={{ borderColor: errors.email ? '#ef4444' : '#cbd5e1' }}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
              required
              placeholder="Enter admin email"
              autoComplete="off"
            />
            {errors.email && (
              <span style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'block' }}>{errors.email}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              style={{ borderColor: errors.password ? '#ef4444' : '#cbd5e1' }}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
              required
              placeholder="Enter password"
              autoComplete="new-password"
            />
            {errors.password && (
              <span style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px', display: 'block' }}>{errors.password}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-secondary"
            style={{ width: '100%', padding: '12px', marginTop: '15px', fontSize: '16px', fontWeight: 'bold' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In as Admin'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '18px' }}>
          <button
            type="button"
            onClick={() => {
              setShowForgotPassword((prev) => !prev);
              setForgotEmail(email);
              setResetMessage('');
              setResetError('');
            }}
            style={{ background: 'none', border: 'none', color: '#0c2340', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
          >
            Forgot Password?
          </button>
        </div>

        {showForgotPassword && (
          <form onSubmit={handleForgotPassword} style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
            <label className="form-label">Admin Email</label>
            <input
              type="email"
              className="form-control"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="Enter admin email"
              autoComplete="off"
            />
            {resetError && (
              <div style={{ marginTop: '10px', color: '#b91c1c', fontSize: '12px', fontWeight: 700 }}>
                {resetError}
              </div>
            )}
            {resetMessage && (
              <div style={{ marginTop: '10px', color: '#047857', fontSize: '12px', fontWeight: 700 }}>
                {resetMessage}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-outline"
              style={{ width: '100%', padding: '10px', marginTop: '12px', fontSize: '14px', fontWeight: 'bold' }}
              disabled={resetLoading}
            >
              {resetLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
