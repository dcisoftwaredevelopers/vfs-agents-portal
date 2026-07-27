import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Building2, KeyRound } from 'lucide-react';
import {
  useLoginMutation,
  useAdminLoginMutation,
  setCredentials,
  selectCurrentUser,
  selectCurrentAdmin,
} from '../features/auth/authSlice';

const ADMIN_EMAIL = 'admindci@gmail.com';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [showMockClerkModal, setShowMockClerkModal] = useState(false);

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

  const handleSelectMockAccount = (emailVal, passVal) => {
    setShowMockClerkModal(false);
    setEmail(emailVal);
    setPassword(passVal);
    triggerLogin(emailVal, passVal);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    triggerLogin(email, password);
  };

  const MOCK_ACCOUNTS = [
    { name: 'Super Admin Panel', email: ADMIN_EMAIL, password: 'Admin@2605', badge: 'Admin', badgeColor: '#0c2340' },
    { name: 'John Doe Travels', email: 'john@gmail.com', password: 'password123', badge: 'Active', badgeColor: '#10b981' },
    { name: 'Vintage Globetrotters', email: 'bob@gmail.com', password: 'password123', badge: 'Expired', badgeColor: '#ef4444' },
    { name: 'Stellar Visas', email: 'alice@gmail.com', password: 'password123', badge: 'Pending', badgeColor: '#dfa015' },
  ];

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
            <label className="form-label">Password</label>
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

        <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <div style={{ flexGrow: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
          <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>or use Clerk</span>
          <div style={{ flexGrow: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
        </div>

        <button
          type="button"
          onClick={() => setShowMockClerkModal(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
            padding: '11px 16px', border: '1px solid #e2e8f0', borderRadius: '4px',
            backgroundColor: '#ffffff', color: '#334155', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
          }}
        >
          <KeyRound size={16} style={{ marginRight: '10px', color: '#dfa015' }} />
          Simulate Clerk Accounts
        </button>

        <div style={{ textAlign: 'center', marginTop: '25px', fontSize: '14px', color: '#666' }}>
          New Agency? <Link to="/register" style={{ color: '#dfa015', fontWeight: '600' }}>Register here</Link>
        </div>
      </div>

      {showMockClerkModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(12, 35, 64, 0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }}>
          <div className="card" style={{
            backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            width: '400px', padding: '30px', borderTop: '5px solid #dfa015',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '800', color: '#0c2340', border: 'none', padding: 0 }}>
              Select Clerk Profile
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b' }}>
              Choose a pre-configured Agent or Admin to log in instantly.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {MOCK_ACCOUNTS.map((acct) => (
                <div
                  key={acct.email}
                  onClick={() => handleSelectMockAccount(acct.email, acct.password)}
                  style={{
                    padding: '12px', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#0c2340' }}>{acct.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{acct.email}</div>
                  </div>
                  <span style={{ fontSize: '10px', backgroundColor: acct.badgeColor, color: '#fff', padding: '2px 6px', borderRadius: '10px', fontWeight: '600' }}>
                    {acct.badge}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowMockClerkModal(false)}
              className="btn btn-outline"
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#64748b', fontWeight: '600' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
