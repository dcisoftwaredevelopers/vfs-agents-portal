import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Building2 } from 'lucide-react';
import {
  useLoginMutation,
  useAdminLoginMutation,
  setCredentials,
  selectCurrentUser,
  selectCurrentAdmin,
} from '../features/auth/authSlice';
import { API_ROOT_URL } from '../config/api';

const ADMIN_EMAIL = 'admindci@gmail.com';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [showForgotForm, setShowForgotForm] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const user = useSelector(selectCurrentUser);
  const admin = useSelector(selectCurrentAdmin);

  const [login, { isLoading: isLoginLoading }] = useLoginMutation();
  const [adminLogin, { isLoading: isAdminLoginLoading }] = useAdminLoginMutation();
  const loading = isLoginLoading || isAdminLoginLoading;

  // Redirect if already logged in
  useEffect(() => {
    if (admin) {
      navigate('/admin-dashboard');
    } else if (user) {
      if (user.needsProfileCompletion || user.status === 'ProfileIncomplete') {
        navigate('/complete-profile');
      } else {
        navigate(user.role === 'SUPER_ADMIN' || user.role === 'admin' ? '/admin-dashboard' : '/agent-dashboard');
      }
    }
  }, [user, admin, navigate]);

  const validateForm = () => {
    const tempErrors = {};
    if (!email) tempErrors.email = 'Email address is required';
    if (!password) tempErrors.password = 'Password is required';
    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const triggerLogin = async (loginEmail, loginPassword) => {
    setApiError('');
    try {
      const isAdminAttempt = loginEmail.toLowerCase().trim() === ADMIN_EMAIL;
      const data = isAdminAttempt
        ? await adminLogin({ email: loginEmail, password: loginPassword }).unwrap()
        : await login({ email: loginEmail, password: loginPassword }).unwrap();

      dispatch(setCredentials(data));
      if (data.needsProfileCompletion || data.status === 'ProfileIncomplete') {
        navigate(data.redirectTo || '/complete-profile');
      } else {
        navigate(data.role === 'SUPER_ADMIN' || data.role === 'admin' ? '/admin-dashboard' : '/agent-dashboard');
      }
    } catch (err) {
      setApiError(err?.data?.message || err?.error || 'Authentication failed.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    triggerLogin(email, password);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const targetEmail = forgotEmail.trim();
    setResetMessage('');
    setResetError('');

    if (!targetEmail) {
      setResetError('Email address is required.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch(`${API_ROOT_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResetError(data.message || 'Unable to process reset request.');
      } else {
        setResetMessage(data.message || 'If an agent account exists for this email, a reset link has been sent.');
      }
    } catch (err) {
      setResetError(err.message || 'Network error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '450px', marginTop: '40px' }}>
      <div className="glass-card-premium animate-slideup" style={{ padding: '35px', borderTop: '5px solid #dfa015', borderLeft: '1px solid rgba(12, 35, 64, 0.05)', borderRight: '1px solid rgba(12, 35, 64, 0.05)', borderBottom: '1px solid rgba(12, 35, 64, 0.05)', borderRadius: '8px', boxShadow: '0 20px 40px rgba(12, 35, 64, 0.08)' }}>

        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          <Building2 size={36} style={{ color: '#0c2340', marginBottom: '10px' }} />
          <h2 style={{ color: '#0c2340', fontWeight: '800', fontSize: '24px', margin: 0 }}>
            Agent Sign-In
          </h2>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '5px' }}>
            Access the visa booking engine dashboard.
          </p>
        </div>

        {apiError && (
          <div style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '12px', fontSize: '13px', borderRadius: '4px', marginBottom: '20px' }}>
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Business Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ borderColor: errors.email ? '#ef4444' : '#cbd5e1' }}
              required
            />
            {errors.email && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.email}</span>}
          </div>

          <div className="form-group" style={{ marginBottom: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <label className="form-label" style={{ marginBottom: '6px' }}>Password</label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setShowForgotForm((prev) => !prev);
                  setResetError('');
                  setResetMessage('');
                }}
                style={{ background: 'none', border: 'none', color: '#dfa015', fontSize: '12px', fontWeight: '800', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ borderColor: errors.password ? '#ef4444' : '#cbd5e1' }}
              required
            />
            {errors.password && <span style={{ color: '#ef4444', fontSize: '11px' }}>{errors.password}</span>}
          </div>

          <button
            type="submit"
            className="btn btn-secondary"
            style={{ width: '100%', padding: '12px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#0c2340', color: '#ffffff' }}
            disabled={loading}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="premium-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#ffffff' }}></span>
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        {showForgotForm && (
          <form
            onSubmit={handleForgotPassword}
            style={{ marginTop: '20px', padding: '18px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}
          >
            <h3 style={{ margin: '0 0 6px', color: '#0c2340', fontSize: '16px', fontWeight: '800', border: 'none', padding: 0 }}>
              Reset your password
            </h3>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: '12.5px', lineHeight: 1.5 }}>
              Enter your registered agent email. We will send a secure reset link if the account exists.
            </p>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Registered Email</label>
              <input
                type="email"
                className="form-control"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="agent@example.com"
                required
              />
            </div>
            {resetError && (
              <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '4px', fontSize: '12px', marginBottom: '12px' }}>
                {resetError}
              </div>
            )}
            {resetMessage && (
              <div style={{ backgroundColor: '#ecfdf5', color: '#047857', padding: '10px', borderRadius: '4px', fontSize: '12px', marginBottom: '12px' }}>
                {resetMessage}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-outline"
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', color: '#0c2340', fontWeight: '800' }}
              disabled={resetLoading}
            >
              {resetLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '25px', fontSize: '14px', color: '#666' }}>
          New Agency? <Link to="/register" style={{ color: '#dfa015', fontWeight: '600' }}>Register here</Link>
        </div>
      </div>
    </div>
  );
}
