import React, { useContext } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Globe, LogOut, Building2, KeyRound } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import {
  selectCurrentUser,
  selectCurrentAdmin,
  selectIsSuperAdmin,
  logout,
} from '../features/auth/authSlice';
import dci_logo from '../assets/dci_logo.png';

const STATUS_COLORS = {
  Active: '#10b981',
  Pending: '#dfa015',
  'Verification Pending': '#dfa015',
  'Subscription Expired': '#ef4444',
  Expired: '#ef4444',
  Blocked: '#7f1d1d',
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'as', label: 'Assamese' },
  { value: 'bn', label: 'Bengali' },
  { value: 'brx', label: 'Bodo' },
  { value: 'doi', label: 'Dogri' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'hi', label: 'Hindi' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ks', label: 'Kashmiri' },
  { value: 'kok', label: 'Konkani' },
  { value: 'mai', label: 'Maithili' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'mni', label: 'Manipuri' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ne', label: 'Nepali' },
  { value: 'or', label: 'Odia' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'sa', label: 'Sanskrit' },
  { value: 'sat', label: 'Santali' },
  { value: 'sd', label: 'Sindhi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'ur', label: 'Urdu' },
];

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { currentLanguage, t, changeLanguage } = useContext(LanguageContext);

  const user = useSelector(selectCurrentUser);
  const admin = useSelector(selectCurrentAdmin);
  const isSuperAdmin = useSelector(selectIsSuperAdmin);

  const getStatusColor = (status) => STATUS_COLORS[status] || '#64748b';

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleAdminLogout = () => {
    dispatch(logout());
    navigate('/admin-login');
  };

  return (
    <header className="main-header">
      <div className="top-bar">
        <div className="top-bar-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Globe size={14} />
            <span>{t('general.b2b_portal')}</span>
          </div>
          <div className="top-bar-links">
            <a href="#benefits">Agent Benefits</a>
            <a href="#pricing">Portal Pricing</a>
            {isSuperAdmin ? (
              <span style={{ marginLeft: '20px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <KeyRound size={14} style={{ color: '#dfa015' }} />
                <span style={{ fontWeight: 'bold' }}>{t('general.super_admin')}</span>
              </span>
            ) : user ? (
              <span style={{ marginLeft: '20px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Building2 size={14} />
                <span style={{ fontWeight: 'bold' }}>{user.agencyName}</span>
                <span style={{
                  backgroundColor: getStatusColor(user.status),
                  color: '#ffffff',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '12px',
                  marginLeft: '5px',
                  fontWeight: '600',
                }}>
                  {user.status || 'Pending'}
                </span>
              </span>
            ) : (
              <>
                <Link to="/login" style={{ marginLeft: '20px', fontWeight: '600' }}>Agent Login</Link>
                <Link to="/register" style={{ marginLeft: '20px', fontWeight: '600', color: '#dfa015' }}>Register Agency</Link>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="header-container">
        <div className="logo" style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '15px', textDecoration: 'none' }}>
            <div className="logo-wrapper" style={{ position: 'relative', width: '42px', height: '42px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '5px' }}>
              <img
              src={dci_logo}
                alt="Dream Catcher Logo"
                className="logo-emblem-animate"
                style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }}
              />
              <div className="logo-crystal-shine" />
              <div className="">
                
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
              <span style={{ fontSize: '16px', fontWeight: '800', color: '#0c2340', fontFamily: "'Outfit', 'Inter', sans-serif", letterSpacing: '-0.2px' }}>
                Dream Catcher <span style={{ color: '#dfa015', fontWeight: '700', fontSize: '15px' }}>Immigrations</span>
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                B2B VISA BOOKING PORTAL
              </span>
            </div>
          </Link>
        </div>
        <nav className="main-nav">
          {isSuperAdmin ? (
            <>
              <NavLink to="/admin-dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('menu.admin_dashboard')}
              </NavLink>
              <NavLink to="/track" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('menu.track_applications')}
              </NavLink>
              <button
                onClick={handleAdminLogout}
                className="nav-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '0', fontWeight: '600' }}
              >
                <LogOut size={16} /> {t('menu.logout')}
              </button>
            </>
          ) : user ? (
            <>
              <NavLink to="/agent-dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('menu.agent_dashboard')}
              </NavLink>
              <NavLink to="/book" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('menu.book_appointment')}
              </NavLink>
              <NavLink to="/track" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('menu.track_applications')}
              </NavLink>
              <label
                title="Preferred language"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#0c2340',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
              >
                <Globe size={16} style={{ color: '#64748b' }} />
                <select
                  value={currentLanguage}
                  onChange={(e) => changeLanguage(e.target.value)}
                  aria-label="Preferred language"
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 28px 6px 9px',
                    backgroundColor: '#fff',
                    color: '#0c2340',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    maxWidth: '150px'
                  }}
                >
                  {LANGUAGE_OPTIONS.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={handleLogout}
                className="nav-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '0', fontWeight: '600' }}
              >
                <LogOut size={16} /> {t('menu.logout')}
              </button>
            </>
          ) : (
            <>
              <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
                {t('menu.home')}
              </NavLink>
              <NavLink to="/login" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                {t('menu.agent_portal')}
              </NavLink>
              {location.pathname === '/admin-login' && (
                <NavLink to="/admin-login" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                  {t('menu.admin_panel')}
                </NavLink>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// Helper used in header copy buttons
function copyToClipboard(text) {
  if (!text) return alert('Nothing to copy');
  navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard'));
}
