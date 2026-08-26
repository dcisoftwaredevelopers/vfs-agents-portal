import React, { useContext, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Globe, LogOut, Building2, KeyRound, Menu, X, ChevronDown, BookOpen } from 'lucide-react';
import { LanguageContext } from '../context/LanguageContext';
import {
  selectCurrentUser,
  selectCurrentAdmin,
  selectIsSuperAdmin,
  logout,
} from '../features/auth/authSlice';
import dci_logo from '../assets/dci_logo.png';
import { API_ROOT_URL } from '../config/api';

const apiFetch = (url, options = {}) => window.fetch(url, { credentials: 'include', ...options });

const STATUS_COLORS = {
  Active: '#10b981',
  ProfileIncomplete: '#f97316',
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isClassesOpen, setIsClassesOpen] = useState(false);

  const user = useSelector(selectCurrentUser);
  const admin = useSelector(selectCurrentAdmin);
  const isSuperAdmin = useSelector(selectIsSuperAdmin);

  const getStatusColor = (status) => STATUS_COLORS[status] || '#64748b';

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMobileMenu();
    };
    const handleResize = () => {
      if (window.innerWidth > 768) closeMobileMenu();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await apiFetch(`${API_ROOT_URL}/auth/logout`, { method: 'POST' });
    } catch (error) {
      console.error('Logout request failed:', error);
    }
    dispatch(logout());
    setIsMobileMenuOpen(false);
    navigate('/login');
  };

  const handleAdminLogout = async () => {
    try {
      await apiFetch(`${API_ROOT_URL}/auth/logout`, { method: 'POST' });
    } catch (error) {
      console.error('Logout request failed:', error);
    }
    dispatch(logout());
    setIsMobileMenuOpen(false);
    navigate('/admin-login');
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
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
              <div className="classes-nav-dropdown" onMouseLeave={() => setIsClassesOpen(false)}>
                <button type="button" className="nav-link classes-nav-trigger" onClick={() => setIsClassesOpen((open) => !open)} aria-expanded={isClassesOpen}>
                  <BookOpen size={15} /> Classes <ChevronDown size={14} className={isClassesOpen ? 'classes-chevron-open' : ''} />
                </button>
                {isClassesOpen && (
                  <div className="classes-nav-menu">
                    <Link to="/classes/german" onClick={() => setIsClassesOpen(false)}><span>🇩🇪</span> German Classes</Link>
                    <Link to="/classes/french" onClick={() => setIsClassesOpen(false)}><span>🇫🇷</span> French Classes</Link>
                  </div>
                )}
              </div>
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
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={isMobileMenuOpen}
        >
          <Menu size={24} />
        </button>
      </div>
    </header>
    {isMobileMenuOpen && (
      <div
        className="mobile-menu-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        onClick={closeMobileMenu}
      >
        <div className="mobile-menu-panel" onClick={(event) => event.stopPropagation()}>
          <div className="mobile-menu-head">
            <Link to="/" className="mobile-menu-brand" onClick={closeMobileMenu}>
              <img src={dci_logo} alt="Dream Catcher Logo" />
              <span>
                Dream Catcher
                <small>B2B Visa Booking Portal</small>
              </span>
            </Link>
            <button
              type="button"
              className="mobile-menu-close"
              onClick={closeMobileMenu}
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
          </div>

          <nav className="mobile-menu-links">
            {isSuperAdmin ? (
              <>
                <NavLink to="/admin-dashboard" onClick={closeMobileMenu}>{t('menu.admin_dashboard')}</NavLink>
                <NavLink to="/track" onClick={closeMobileMenu}>{t('menu.track_applications')}</NavLink>
                <button type="button" className="mobile-menu-logout" onClick={handleAdminLogout}>
                  <LogOut size={20} /> {t('menu.logout')}
                </button>
              </>
            ) : user ? (
              <>
                <NavLink to="/agent-dashboard" onClick={closeMobileMenu}>{t('menu.agent_dashboard')}</NavLink>
                <div className="mobile-classes-links">
                  <span><BookOpen size={18} /> Classes</span>
                  <Link to="/classes/german" onClick={closeMobileMenu}>🇩🇪 German Classes</Link>
                  <Link to="/classes/french" onClick={closeMobileMenu}>🇫🇷 French Classes</Link>
                </div>
                <NavLink to="/book" onClick={closeMobileMenu}>{t('menu.book_appointment')}</NavLink>
                <NavLink to="/track" onClick={closeMobileMenu}>{t('menu.track_applications')}</NavLink>
                <a href="#benefits" onClick={closeMobileMenu}>Agent Benefits</a>
                <a href="#pricing" onClick={closeMobileMenu}>Portal Pricing</a>
                <label className="mobile-menu-language">
                  <span><Globe size={18} /> Language</span>
                  <select
                    value={currentLanguage}
                    onChange={(e) => changeLanguage(e.target.value)}
                    aria-label="Preferred language"
                  >
                    {LANGUAGE_OPTIONS.map((language) => (
                      <option key={language.value} value={language.value}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="mobile-menu-logout" onClick={handleLogout}>
                  <LogOut size={20} /> {t('menu.logout')}
                </button>
              </>
            ) : (
              <>
                <NavLink to="/" onClick={closeMobileMenu} end>{t('menu.home')}</NavLink>
                <a href="#benefits" onClick={closeMobileMenu}>Agent Benefits</a>
                <a href="#pricing" onClick={closeMobileMenu}>Portal Pricing</a>
                <NavLink to="/login" onClick={closeMobileMenu}>{t('menu.agent_portal')}</NavLink>
                <NavLink to="/register" className="mobile-menu-cta" onClick={closeMobileMenu}>Register Agency</NavLink>
                {location.pathname === '/admin-login' && (
                  <NavLink to="/admin-login" onClick={closeMobileMenu}>{t('menu.admin_panel')}</NavLink>
                )}
              </>
            )}
          </nav>
        </div>
      </div>
    )}
    </>
  );
}

// Helper used in header copy buttons
function copyToClipboard(text) {
  if (!text) return alert('Nothing to copy');
  navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard'));
}
