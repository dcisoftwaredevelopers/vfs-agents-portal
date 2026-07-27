import React, { useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LanguageContext } from '../context/LanguageContext';
import {
  Building2, Calendar, ClipboardCheck, FileText, Bell,
  CreditCard, ShieldCheck, Download, AlertTriangle, ArrowRight, Upload, Settings,
  User, Mail, Phone, MapPin, Globe, Camera, ChevronRight, CheckCircle2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { API_ROOT_URL } from '../config/api';

// ---------------------------------------------------------------------------
// Constants (previously scattered / hard-coded across the component)
// ---------------------------------------------------------------------------
const API_BASE = API_ROOT_URL;

const apiFetch = (url, options = {}) => window.fetch(url, { credentials: 'include', ...options });

const UPI_CONFIG = {
  payeeId: 'dreamintoreality@ptyes',
  payeeName: 'Dream Catcher Immigrations Pvt Ltd',
  currency: 'INR',
};

const SUBSCRIPTION_PLAN_AMOUNT = 10000;
const SUBSCRIPTION_GST_RATE = 0.18;
const SUBSCRIPTION_CYCLE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getSubscriptionPricing(discountEligible) {
  const discountAmount = discountEligible ? +(SUBSCRIPTION_PLAN_AMOUNT * 0.10).toFixed(2) : 0;
  const planAmount = +(SUBSCRIPTION_PLAN_AMOUNT - discountAmount).toFixed(2);
  const gstAmount = +(planAmount * SUBSCRIPTION_GST_RATE).toFixed(2);
  const totalAmount = +(planAmount + gstAmount).toFixed(2);
  return { planAmount, gstAmount, totalAmount, discountApplied: discountEligible, discountAmount };
}

const COLORS = {
  navy: '#0c2340',
  gold: '#dfa015',
  green: '#10b981',
  red: '#ef4444',
  slate: '#64748b',
  border: '#e2e8f0',
  bgSoft: '#f8fafc',
};

const STATUS_COLOR_MAP = {
  Active: COLORS.green,
  Pending: COLORS.gold,
  Blocked: COLORS.red,
  'Verification Pending': COLORS.gold,
  Expired: COLORS.red,
};

const NAV_ITEMS = [
  { key: 'subscription', label: 'Dashboard & Subscription', icon: CreditCard },
  { key: 'bookings', label: 'Client Bookings', icon: Calendar },
  { key: 'billing', label: 'Invoices & Billing', icon: FileText },
  { key: 'notifications', label: 'Alerts & Notifications', icon: Bell },
];

// ---------------------------------------------------------------------------
// Small reusable pieces (previously duplicated inline)
// ---------------------------------------------------------------------------
const styles = {
  card: { backgroundColor: '#fff', borderRadius: '4px' },
  sectionTitle: { border: 'none', padding: 0, color: COLORS.navy, fontWeight: '800', marginBottom: '20px' },
  infoBox: (color) => ({
    border: `1px solid ${color}`,
    backgroundColor: `${color}0D`, // ~5% alpha
    padding: '20px',
    borderRadius: '4px',
    display: 'flex',
    gap: '15px',
  }),
  modalOverlay: (z = 1000) => ({
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(12, 35, 64, 0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: z,
  }),
  btnPrimary: {
    padding: '10px 0', backgroundColor: COLORS.navy, color: '#fff',
    fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', flex: 1,
  },
  btnOutline: {
    padding: '10px 0', border: '1px solid #cbd5e1', backgroundColor: '#fff',
    color: COLORS.slate, fontWeight: '600', flex: 1, borderRadius: '4px', cursor: 'pointer',
  },
};

function StatusPill({ status }) {
  const color = STATUS_COLOR_MAP[status] || COLORS.slate;
  return (
    <span style={{
      backgroundColor: color, color: '#fff', fontSize: '12px', padding: '3px 10px',
      borderRadius: '12px', fontWeight: 'bold', display: 'inline-block', marginTop: '3px',
    }}>
      {status || 'Pending'}
    </span>
  );
}

function InfoCard({ label, value, valueColor = COLORS.navy }) {
  return (
    <div style={{ border: '1px solid #cbd5e1', padding: '15px', borderRadius: '4px', backgroundColor: COLORS.bgSoft }}>
      <span style={{ fontSize: '12px', color: COLORS.slate, textTransform: 'uppercase', display: 'block' }}>{label}</span>
      <strong style={{ fontSize: '16px', color: valueColor, marginTop: '5px', display: 'block' }}>{value}</strong>
    </div>
  );
}

function AlertBanner({ color, icon, title, children }) {
  return (
    <div style={styles.infoBox(color)}>
      <AlertTriangle size={24} style={{ color, flexShrink: 0 }} />
      <div>
        <h4 style={{ margin: '0 0 5px 0', color, fontWeight: 'bold' }}>{title}</h4>
        <p style={{ margin: 0, fontSize: '13.5px', color: '#555', lineHeight: '1.5' }}>{children}</p>
      </div>
    </div>
  );
}

function CopyButton({ text, message }) {
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); alert(message || 'Copied to clipboard!'); }}
      style={{
        padding: '2px 8px', fontSize: '11px', backgroundColor: '#cbd5e1', border: 'none',
        borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold', color: COLORS.navy,
      }}
    >
      Copy
    </button>
  );
}

function EmptyState({ children }) {
  return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AgentDashboard() {
  const navigate = useNavigate();
  const { t } = useContext(LanguageContext);
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('userInfo')));
  const [activeTab, setActiveTab] = useState('subscription');
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState('purchase'); // 'purchase' | 'renew'
  const [transactionId, setTransactionId] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDateTime, setPaymentDateTime] = useState('');
  const [enlargeQR, setEnlargeQR] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [accessAlertModal, setAccessAlertModal] = useState(null); // null | 'NoSub' | 'Pending' | 'Expired'
  const subscriptionPricing = getSubscriptionPricing(user?.discountEligible === true);

  // ---- data fetching -------------------------------------------------
  const authedFetch = useCallback((path) => {
    const headers = {
      'Content-Type': 'application/json'
    };
    return apiFetch(`${API_BASE}${path}`, { headers });
  }, []);

  const fetchSubscriptionDetails = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/subscription/history');
      if (res.status === 401) {
        console.error('Unauthorized - session may have expired');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data?.length) setSubscription(data[0]);
      } else {
        console.error('Failed to fetch subscription:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    }
  }, [authedFetch, user]);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/subscription/invoices');
      if (res.status === 401) {
        console.error('Unauthorized - session may have expired');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setInvoices(data || []);
      } else {
        console.error('Failed to fetch invoices:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
    }
  }, [authedFetch, user]);

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/booking/history');
      if (res.status === 401) {
        console.error('Unauthorized - session may have expired');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setBookings(data || []);
      } else {
        console.error('Failed to fetch bookings:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching bookings:', err);
    }
  }, [authedFetch, user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/subscription/notifications');
      if (res.status === 401) {
        console.error('Unauthorized - session may have expired');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
      } else {
        console.error('Failed to fetch notifications:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [authedFetch, user]);

  const redeemFreeBooking = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch(`${API_BASE}/referral/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to redeem free application credit');
      }
      const updatedUser = {
        ...user,
        freeApplicationsAvailable: data.updatedAgent.freeApplicationsAvailable,
        freeApplicationsUsed: data.updatedAgent.freeApplicationsUsed,
        goldCoins: data.updatedAgent.goldCoins
      };
      localStorage.setItem('userInfo', JSON.stringify(updatedUser));
      setUser(updatedUser);
      setNotifications(prev => [{ title: 'Free Application Credit Redeemed', message: data.message, type: 'REDEEM_FREE_BOOKING', createdAt: new Date().toISOString() }, ...prev]);
      alert(data.message);
    } catch (err) {
      console.error('Redeem failed:', err);
      alert(err.message || 'Could not redeem free application credit');
    }
  }, [user]);

  useEffect(() => {
    const redirectReason = localStorage.getItem('booking_redirect_reason');
    if (!redirectReason) return;
    localStorage.removeItem('booking_redirect_reason');

    if (redirectReason === 'Verification Pending') {
      setAccessAlertModal('Pending');
    } else if (['Expired', 'Subscription Expired'].includes(redirectReason)) {
      setAccessAlertModal('Expired');
    } else {
      // Covers 'Verified', 'Pending', and any unrecognised reason
      setAccessAlertModal('NoSub');
    }
  }, []);

  const fetchUserProfile = async () => {
    try {
      const res = await apiFetch(`${API_ROOT_URL}/auth/me`, {
      });
      if (res.ok) {
        const profile = await res.json();
        if (
          profile.status !== user.status ||
          profile.agencyName !== user.agencyName ||
          profile.ownerName !== user.ownerName ||
          profile.stars !== user.stars ||
          profile.goldCoins !== user.goldCoins ||
          profile.freeApplicationsAvailable !== user.freeApplicationsAvailable ||
          profile.freeApplicationsUsed !== user.freeApplicationsUsed ||
          profile.referralsCount !== user.referralsCount
        ) {
          const updatedUser = { ...user, ...profile };
          localStorage.setItem('userInfo', JSON.stringify(updatedUser));
          setUser(updatedUser);
        }
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchUserProfile();
    fetchSubscriptionDetails();
    fetchInvoices();
    fetchBookings();
    fetchNotifications();
  }, [user, fetchSubscriptionDetails, fetchInvoices, fetchBookings, fetchNotifications]);

  if (!user) return null; // navigation to /login already triggered above

  // ---- UPI helpers -----------------------------------------------------
  const getUPIURI = () => {
    const { payeeId, payeeName, currency } = UPI_CONFIG;
    const amount = subscriptionPricing.totalAmount;
    if (!payeeId) throw new Error('Payee UPI ID is missing.');
    if (!payeeName) throw new Error('Payee Name is missing.');
    if (!amount || amount <= 0) throw new Error('Invalid payment amount.');
    if (currency !== 'INR') throw new Error('Only INR currency is supported for UPI.');

    const note = paymentType === 'renew' ? 'Agent Subscription Renewal' : 'Agent Subscription';
    return `upi://pay?pa=${encodeURIComponent(payeeId)}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=${currency}&tn=${encodeURIComponent(note)}`;
  };

  const downloadSVG = (elementId, filename) => {
    const svgElement = document.getElementById(elementId);
    if (!svgElement) {
      alert('QR Code SVG element not found.');
      // alert('Please try again or take a screeshort of the QR code instead');
      return;
    }
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = svgUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(svgUrl);
  };

  const handleScreenshotUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Store the actual File object, not base64
    setScreenshot(file);
  };

  const resetPaymentForm = () => {
    setShowPaymentModal(false);
    setTransactionId('');
    setScreenshot('');
    setNotes('');
    setPaymentDateTime('');
    setModalError('');
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    const normalizedTransactionId = transactionId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{8,35}$/.test(normalizedTransactionId)) {
      setModalError('Please enter a valid UPI UTR / Transaction ID with 8 to 35 letters or numbers.');
      return;
    }
    if (!paymentDateTime) {
      setModalError('Please enter the exact payment date and time from your UPI receipt.');
      return;
    }
    if (!screenshot) {
      setModalError('Please upload a payment screenshot/proof.');
      return;
    }

    setModalLoading(true);
    const endpoint = paymentType === 'renew' ? 'renew' : 'purchase';

    try {
      // Use FormData to send file as multipart/form-data
      const formData = new FormData();
      formData.append('transactionId', normalizedTransactionId);
      formData.append('screenshot', screenshot); // Actual File object
      formData.append('notes', notes);
      formData.append('paymentDateTime', paymentDateTime);

      const res = await apiFetch(`${API_BASE}/subscription/${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Payment submission failed.');

      const updatedUser = { ...user, status: 'Verification Pending' };
      localStorage.setItem('userInfo', JSON.stringify(updatedUser));
      setUser(updatedUser);

      resetPaymentForm();
      fetchSubscriptionDetails();
      fetchInvoices();
      fetchNotifications();

      alert('Subscription payment submitted! Access will unlock once the administrator verifies your transaction.');
      window.location.reload();
    } catch (err) {
      setModalError(err.message || 'Server error.');
    } finally {
      setModalLoading(false);
    }
  };

  const downloadInvoicePDF = async (inv) => {
    if (!inv?._id) {
      alert('Invoice details are missing. Please refresh and try again.');
      return;
    }

    try {
      const res = await authedFetch(`/subscription/invoices/${inv._id}/download`);
      if (!res.ok) {
        let message = 'Failed to download invoice PDF.';
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          message = data.message || message;
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const pdfUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `invoice-${inv.invoiceNumber || inv._id}.pdf`;
      link.click();
      URL.revokeObjectURL(pdfUrl);
    } catch (err) {
      console.error('Invoice download failed:', err);
      alert(err.message || 'Could not download invoice PDF. Please try again.');
    }
  };

  const getSubscriptionCycleStatus = () => {
    if (!subscription || subscription.subscriptionStatus !== 'Active' || !subscription.expiryDate) {
      return {
        daysRemaining: 0,
        daysUsed: 0,
        totalDays: SUBSCRIPTION_CYCLE_DAYS,
        progressPercent: 100,
        isExpired: true,
        valueColor: COLORS.red,
        statusText: 'Renewal required',
      };
    }

    const now = new Date();
    const expiryDate = new Date(subscription.expiryDate);
    const startDate = subscription.startDate
      ? new Date(subscription.startDate)
      : new Date(expiryDate.getTime() - SUBSCRIPTION_CYCLE_DAYS * MS_PER_DAY);
    const totalDays = Math.max(1, Math.round((expiryDate - startDate) / MS_PER_DAY) || SUBSCRIPTION_CYCLE_DAYS);
    const daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / MS_PER_DAY));
    const daysUsed = Math.min(totalDays, Math.max(0, totalDays - daysRemaining));
    const progressPercent = Math.min(100, Math.max(0, (daysUsed / totalDays) * 100));
    const isExpired = daysRemaining <= 0;
    const isRenewSoon = daysRemaining > 0 && daysRemaining <= 3;

    return {
      daysRemaining,
      daysUsed,
      totalDays,
      progressPercent,
      isExpired,
      valueColor: isExpired ? COLORS.red : isRenewSoon ? COLORS.gold : COLORS.green,
      statusText: isExpired ? 'Plan expired' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`,
    };
  };

  const subscriptionCycle = getSubscriptionCycleStatus();

  const openPaymentModal = (type) => {
    setPaymentType(type);
    setShowPaymentModal(true);
  };

  // ---- render ------------------------------------------------------------
  return (
    <div className="container" style={{ marginTop: '30px', paddingBottom: '60px', fontFamily: "'Outfit', 'Inter', sans-serif" }}>

      {/* Agency profile header */}
      <div style={{
        backgroundColor: COLORS.navy, borderRadius: '8px', padding: '30px 40px', color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
        gap: '20px', marginBottom: '35px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Building2 size={28} style={{ color: COLORS.gold }} />
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{user.agencyName}</h2>
          </div>
          <p style={{ margin: '5px 0 0 0', opacity: 0.8, fontSize: '14px' }}>
            Owner: <strong>{user.ownerName}</strong> | Email: {user.email} | Mobile: {user.mobile || 'Not Provided'}
          </p>
          <p style={{ margin: '6px 0 0 0', opacity: 0.85, fontSize: '13px' }}>
            <strong style={{ marginRight: '8px' }}>Agent ID:</strong> {user.agentId || 'N/A'}
            <span style={{ marginLeft: '18px', marginRight: '8px' }}>
              <strong style={{ marginRight: '6px' }}>Referral:</strong>
              <span style={{ background: '#fff', color: '#0c2340', padding: '4px 8px', borderRadius: '6px', fontWeight: '700' }}>{user.referralCode || 'N/A'}</span>
            </span>
            {user.referralCode && (
              <button
                onClick={() => { navigator.clipboard.writeText(user.referralCode); alert('Referral code copied'); }}
                style={{ marginLeft: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#cbd5e1', cursor: 'pointer', fontWeight: '700' }}
              >
                Copy
              </button>
            )}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginTop: '16px' }}>
            <div style={{ border: '1px solid #d1fae5', backgroundColor: '#ecfdf5', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#047857', marginBottom: '6px' }}>Stars</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#065f46' }}>{user.stars ?? 0}</div>
            </div>
            <div style={{ border: '1px solid #fef3c7', backgroundColor: '#fffbeb', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#975a16', marginBottom: '6px' }}>Gold Coins</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#92400e' }}>{user.goldCoins ?? 0}</div>
            </div>
            <div style={{ border: '1px solid #dbeafe', backgroundColor: '#eff6ff', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#1e40af', marginBottom: '6px' }}>Free Applications</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#1d4ed8' }}>
                {Math.max(0, (user.freeApplicationsAvailable || 0) - (user.freeApplicationsUsed || 0))}
              </div>
            </div>
          </div>

          {user.goldCoins >= 1 && (
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={redeemFreeBooking}
                style={{ padding: '10px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#1d4ed8', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
              >
                Redeem 1 Gold Coin for 1 Free Application
              </button>
              <p style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
                Use your earned Gold Coins to get a free application credit.
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '12px', opacity: 0.7, display: 'block' }}>Account Status</span>
            <StatusPill status={user.status} />
          </div>

          {user.status === 'Active' ? (
            <Link to="/book" className="btn" style={{
              backgroundColor: COLORS.gold, color: COLORS.navy, fontWeight: 'bold', padding: '10px 20px',
              borderRadius: '4px', textDecoration: 'none', fontSize: '14px', display: 'inline-flex',
              alignItems: 'center', gap: '5px',
            }}>
              Book New Visa <ArrowRight size={15} />
            </Link>
          ) : (
            <div
              title={
                user.status === 'Verification Pending' || (subscription && subscription.subscriptionStatus === 'Verification Pending')
                  ? 'Waiting for Admin Payment Verification'
                  : ['Expired', 'Subscription Expired'].includes(user.status)
                    ? 'Subscription Expired - Renew to Continue'
                    : 'Purchase Subscription for Access'
              }
            >
              <button
                type="button"
                onClick={() => {
                  if (user.status === 'Verification Pending' || (subscription && subscription.subscriptionStatus === 'Verification Pending')) {
                    setAccessAlertModal('Pending');
                  } else if (['Expired', 'Subscription Expired'].includes(user.status)) {
                    setAccessAlertModal('Expired');
                  } else {
                    setAccessAlertModal('NoSub');
                  }
                }}
                style={{
                  backgroundColor: '#94a3b8', color: '#f1f5f9', fontWeight: 'bold', padding: '10px 20px',
                  borderRadius: '4px', border: 'none', fontSize: '14px', display: 'inline-flex',
                  alignItems: 'center', gap: '5px', cursor: 'not-allowed', opacity: '0.7',
                }}
              >
                Book New Visa <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>

        {/* Sidebar nav */}
        <div style={{ flex: '1 1 240px', maxWidth: '300px' }}>
          <div className="glass-card-premium" style={{ padding: '15px 0', display: 'flex', flexDirection: 'column', gap: '5px', border: '1px solid rgba(12, 35, 64, 0.08)' }}>
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    textAlign: 'left', padding: '12px 20px',
                    background: isActive ? 'rgba(12,35,64,0.06)' : 'none',
                    border: 'none',
                    borderLeft: isActive ? `4px solid ${COLORS.gold}` : '4px solid transparent',
                    color: isActive ? COLORS.navy : COLORS.slate,
                    fontWeight: isActive ? '700' : '500',
                    cursor: 'pointer', fontSize: '14px', display: 'flex',
                    alignItems: 'center', gap: '10px', position: 'relative',
                  }}
                >
                  <Icon size={18} /> {label}
                  {key === 'notifications' && notifications.length > 0 && (
                    <span style={{
                      position: 'absolute', right: '20px', backgroundColor: COLORS.red, color: '#fff',
                      borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold',
                    }}>
                      {notifications.length}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                textAlign: 'left', padding: '12px 20px',
                background: activeTab === 'settings' ? 'rgba(12,35,64,0.06)' : 'none',
                border: 'none',
                borderLeft: activeTab === 'settings' ? `4px solid ${COLORS.gold}` : '4px solid transparent',
                color: activeTab === 'settings' ? COLORS.navy : COLORS.slate,
                fontWeight: activeTab === 'settings' ? '700' : '500',
                cursor: 'pointer', fontSize: '14px', display: 'flex',
                alignItems: 'center', gap: '10px', position: 'relative',
              }}
            >
              <Settings size={18} /> {t('agent.profile_settings')}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: '1 1 500px' }}>

          {activeTab === 'subscription' && (
            <div className="glass-card-premium" style={{ padding: '30px', border: '1px solid rgba(12, 35, 64, 0.08)' }}>
              <h3 style={styles.sectionTitle}>Subscription Overview</h3>

              {user.status === 'Pending' && (
                <AlertBanner color={COLORS.gold} title="Awaiting Verification">
                  Your agency profile has been submitted and is currently undergoing verification by our
                  administrators. Standard subscription billing and slot bookings will become available once approved.
                </AlertBanner>
              )}

              {user.status === 'Blocked' && (
                <AlertBanner color={COLORS.red} title="Agency Profile Suspended">
                  Your travel agency access has been suspended/blocked. Please contact portal support at
                  billing@dreamcatcherimmigrations.com to resolve access issues.
                </AlertBanner>
              )}

              {subscription && user.status === 'Active' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '25px' }}>
                    <InfoCard label="Current Tier" value={subscription.planName} />
                    <InfoCard label="Days Remaining" value={`${subscriptionCycle.daysRemaining} Days`} valueColor={subscriptionCycle.valueColor} />
                    <InfoCard label="Expiry Date" value={new Date(subscription.expiryDate).toLocaleDateString('en-GB')} />
                  </div>

                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '16px', marginBottom: '20px', backgroundColor: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <strong style={{ color: COLORS.navy }}>Monthly Subscription Cycle</strong>
                      <span style={{ color: subscriptionCycle.valueColor, fontWeight: '800' }}>{subscriptionCycle.statusText}</span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${subscriptionCycle.progressPercent}%`,
                        height: '100%',
                        backgroundColor: subscriptionCycle.valueColor,
                        transition: 'width 250ms ease',
                      }} />
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: '13px', color: COLORS.slate }}>
                      Day {Math.min(subscriptionCycle.totalDays, subscriptionCycle.daysUsed + 1)} of {subscriptionCycle.totalDays}. The count reduces automatically each day from 30 to 0.
                    </p>
                  </div>

                  <div style={{
                    border: '1px solid #cbd5e1', padding: '20px', borderRadius: '4px', backgroundColor: COLORS.bgSoft,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px',
                  }}>
                    <div>
                      <h4 style={{ margin: '0 0 5px 0', color: COLORS.navy, fontWeight: '700' }}>Extend Your Booking Cycle</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: COLORS.slate }}>Renew your active subscription for another month.</p>
                    </div>
                    <button
                      onClick={() => openPaymentModal('renew')}
                      className="btn"
                      style={{ padding: '8px 18px', backgroundColor: COLORS.navy, color: '#fff', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Renew Now
                    </button>
                  </div>
                </div>
              )}

              {subscription && (subscription.subscriptionStatus === 'Verification Pending' || user.status === 'Verification Pending') && (
                <div style={{ border: `1px solid ${COLORS.gold}`, backgroundColor: 'rgba(223, 160, 21, 0.03)', padding: '25px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                    <AlertTriangle size={28} style={{ color: COLORS.gold, flexShrink: 0 }} />
                    <div>
                      <h4 style={{ margin: '0 0 5px 0', color: COLORS.navy, fontWeight: 'bold', fontSize: '16px' }}>Payment Verification Pending</h4>
                      <p style={{ margin: 0, fontSize: '13.5px', color: '#555', lineHeight: '1.5' }}>
                        Your subscription payment proof has been successfully submitted and is currently pending review
                        by our compliance team. Standard booking access will unlock automatically upon verification.
                      </p>
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '4px', marginBottom: '25px', fontSize: '13px' }}>
                    <div style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '8px', marginBottom: '8px', fontWeight: 'bold', color: COLORS.navy }}>
                      Transaction Reference
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', color: COLORS.slate }}>
                      <div>UTR/Txn ID: <strong style={{ color: '#334155' }}>{subscription.transactionId}</strong></div>
                      <div>Plan Amount: <strong style={{ color: '#334155' }}>INR {(subscription.planAmount || 0).toFixed(2)}</strong></div>
                      {subscription.discountApplied && (
                        <div>Referral Discount: <strong style={{ color: COLORS.green }}>-INR {(subscription.discountAmount || 0).toFixed(2)}</strong></div>
                      )}
                      <div>GST: <strong style={{ color: '#334155' }}>INR {(subscription.gstAmount || 0).toFixed(2)}</strong></div>
                      <div>Total Payable: <strong style={{ color: '#334155' }}>INR {(subscription.totalAmount || 0).toFixed(2)}</strong></div>
                      <div>Submitted: <strong style={{ color: '#334155' }}>{new Date(subscription.updatedAt).toLocaleString('en-GB')}</strong></div>
                      <div>Notes: <strong style={{ color: '#334155' }}>{subscription.notes || 'N/A'}</strong></div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginTop: '30px', padding: '0 10px' }}>
                    <div style={{ position: 'absolute', top: '15px', left: '10%', right: '10%', height: '2px', backgroundColor: COLORS.border, zIndex: 0 }} />
                    <div style={{ position: 'absolute', top: '15px', left: '10%', width: '40%', height: '2px', backgroundColor: COLORS.green, zIndex: 0 }} />
                    {[
                      { label: 'Payment Paid', bg: COLORS.green, content: '✓' },
                      { label: 'Verification Pending', bg: COLORS.gold, content: '✓' },
                      { label: 'Portal Activated', bg: '#cbd5e1', content: '3', muted: true },
                    ].map((step, i) => (
                      <div key={i} style={{ zIndex: 1, textAlign: 'center', width: '30%' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%', backgroundColor: step.bg,
                          color: step.muted ? '#94a3b8' : '#fff', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', margin: '0 auto 8px', fontWeight: 'bold',
                        }}>
                          {step.content}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: step.muted ? '#94a3b8' : COLORS.navy }}>{step.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {subscription && subscription.subscriptionStatus === 'Rejected' && (
                <div style={{ border: `1px solid ${COLORS.red}`, backgroundColor: 'rgba(239, 68, 68, 0.02)', padding: '25px', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                    <AlertTriangle size={28} style={{ color: COLORS.red, flexShrink: 0 }} />
                    <div>
                      <h4 style={{ margin: '0 0 5px 0', color: COLORS.red, fontWeight: 'bold', fontSize: '16px' }}>Payment Proof Rejected</h4>
                      <p style={{ margin: 0, fontSize: '13.5px', color: '#555', lineHeight: '1.5' }}>Your subscription payment verification failed. Rejection Reason:</p>
                      <div style={{ backgroundColor: '#fee2e2', padding: '12px', borderLeft: `4px solid ${COLORS.red}`, color: '#991b1b', fontWeight: 'bold', fontSize: '13px', margin: '10px 0 0' }}>
                        {subscription.rejectionRemarks || 'No details provided.'}
                      </div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '20px', marginTop: '20px' }}>
                    <h5 style={{ margin: '0 0 15px 0', color: COLORS.navy, fontWeight: 'bold' }}>Resubmit UPI Proof</h5>
                    <p style={{ fontSize: '13px', color: COLORS.slate, marginBottom: '15px' }}>Please check your transaction credentials and upload a fresh screenshot.</p>
                    <button
                      onClick={() => openPaymentModal('purchase')}
                      className="btn"
                      style={{ padding: '10px 24px', backgroundColor: COLORS.red, color: '#fff', border: 'none', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Resubmit Payment Proof
                    </button>
                  </div>
                </div>
              )}

              {!subscription && !['Pending', 'Blocked', 'Active', 'Verification Pending'].includes(user.status) && (
                <div style={{ border: `1px solid ${COLORS.red}`, backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: '20px', borderRadius: '4px', textAlign: 'center' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: COLORS.red, fontWeight: 'bold' }}>Subscription Expired / Inactive</h4>
                  <p style={{ margin: '0 0 20px 0', fontSize: '13.5px', color: '#555', lineHeight: '1.5' }}>
                    You currently do not have an active subscription. Purchase a Professional Agent subscription plan
                    for INR {getSubscriptionPricing(user.discountEligible === true).totalAmount.toFixed(2)} per month to start querying slots and booking clients.
                  </p>
                  <button
                    onClick={() => openPaymentModal('purchase')}
                    className="btn btn-secondary"
                    style={{ padding: '12px 28px', backgroundColor: COLORS.red, color: '#fff', border: 'none', fontWeight: 'bold' }}
                  >
                    Purchase Subscription
                  </button>
                </div>
              )}

              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: '35px', paddingTop: '20px' }}>
                <h4 style={{ color: COLORS.navy, fontWeight: '700', marginBottom: '10px', fontSize: '15px' }}>Important B2B Billing Details</h4>
                <ul style={{ paddingLeft: '20px', fontSize: '13px', color: COLORS.slate, lineHeight: '1.6' }}>
                  <li>Plan pricing is INR 10,000 + 18% GST per month. Referral discounts apply only to subscription purchase or renewal, never appointment fees.</li>
                  <li>Payments are verified manually using UPI transaction proofs within 5-10 minutes.</li>
                  <li>Invoices showing your agency name and GSTIN are generated instantly upon approval.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="glass-card-premium" style={{ padding: '30px', border: '1px solid rgba(12, 35, 64, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Client Appointment History</h3>
                {user.status === 'Active' && (
                  <Link to="/book" className="btn" style={{ padding: '6px 14px', fontSize: '13px', backgroundColor: COLORS.navy, color: '#fff', textDecoration: 'none', borderRadius: '4px' }}>
                    New Booking
                  </Link>
                )}
              </div>

              {bookings.length === 0 ? (
                <EmptyState>No visa appointments booked yet.</EmptyState>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${COLORS.border}`, color: COLORS.slate, textAlign: 'left' }}>
                        <th style={{ padding: '12px 8px' }}>Ref No.</th>
                        <th style={{ padding: '12px 8px' }}>Client Name</th>
                        <th style={{ padding: '12px 8px' }}>Passport</th>
                        <th style={{ padding: '12px 8px' }}>Date & Time</th>
                        <th style={{ padding: '12px 8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((booking) => {
                        const client = booking.applicantDetails?.[0];
                        const statusColors = {
                          BOOKED: ['#d1fae5', '#065f46'],
                          'Pending Verification': ['#fef3c7', '#92400e'],
                        };
                        const [bg, fg] = statusColors[booking.status] || ['#fee2e2', '#991b1b'];
                        return (
                          <tr key={booking._id} style={{ borderBottom: `1px solid ${COLORS.border}`, color: '#334155' }}>
                            <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{booking.referenceNumber}</td>
                            <td style={{ padding: '12px 8px' }}>{client ? `${client.firstName} ${client.lastName}` : 'N/A'}</td>
                            <td style={{ padding: '12px 8px' }}>{client ? client.passportNumber : 'N/A'}</td>
                            <td style={{ padding: '12px 8px' }}>
                              {new Date(booking.bookingDate).toLocaleDateString('en-GB')} at {booking.bookingTime}
                            </td>
                            <td style={{ padding: '12px 8px' }}>
                              <span style={{ backgroundColor: bg, color: fg, fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>
                                {booking.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="glass-card-premium" style={{ padding: '30px', border: '1px solid rgba(12, 35, 64, 0.08)' }}>
              <h3 style={styles.sectionTitle}>Invoice & Billing Documents</h3>

              {invoices.length === 0 ? (
                <EmptyState>No tax invoices generated yet.</EmptyState>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${COLORS.border}`, color: COLORS.slate, textAlign: 'left' }}>
                        <th style={{ padding: '12px 8px' }}>Invoice No.</th>
                        <th style={{ padding: '12px 8px' }}>Date</th>
                        <th style={{ padding: '12px 8px' }}>Base Amt</th>
                        <th style={{ padding: '12px 8px' }}>GST (18%)</th>
                        <th style={{ padding: '12px 8px' }}>Total Amt</th>
                        <th style={{ padding: '12px 8px', textAlign: 'center' }}>PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv._id} style={{ borderBottom: `1px solid ${COLORS.border}`, color: '#334155' }}>
                          <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{inv.invoiceNumber}</td>
                          <td style={{ padding: '12px 8px' }}>{new Date(inv.createdAt).toLocaleDateString('en-GB')}</td>
                          <td style={{ padding: '12px 8px' }}>₹0.85</td>
                          <td style={{ padding: '12px 8px' }}>₹0.15</td>
                          <td style={{ padding: '12px 8px', fontWeight: '600' }}>₹1.00</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <button
                              onClick={() => downloadInvoicePDF(inv)}
                              style={{ background: 'none', border: 'none', color: COLORS.navy, cursor: 'pointer' }}
                              title="Download Tax Invoice"
                            >
                              <Download size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="glass-card-premium animate-fadein" style={{ padding: '30px', border: '1px solid rgba(12, 35, 64, 0.08)' }}>
              <h3 style={styles.sectionTitle}>System Alerts & Notifications</h3>

              {notifications.length === 0 ? (
                <EmptyState>No alerts or notifications.</EmptyState>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {notifications.map((n) => (
                    <div key={n._id} style={{
                      border: `1px solid ${COLORS.border}`, padding: '15px 20px', borderRadius: '4px',
                      backgroundColor: COLORS.bgSoft, display: 'flex', gap: '15px', alignItems: 'flex-start',
                    }}>
                      <span style={{ fontSize: '20px' }}>🔔</span>
                      <div>
                        <h4 style={{ margin: '0 0 5px 0', color: COLORS.navy, fontWeight: 'bold', fontSize: '14px' }}>{n.title}</h4>
                        <p style={{ margin: '0 0 5px 0', fontSize: '13px', color: '#555', lineHeight: '1.5' }}>{n.message}</p>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(n.createdAt).toLocaleString('en-GB')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Settings & Profile */}
          {activeTab === 'settings' && (
            <div style={{ padding: '10px 0' }}>
              <style>{`
                .google-card {
                  background: #ffffff;
                  border: 1px solid #dadce0;
                  border-radius: 12px;
                  margin-bottom: 24px;
                  overflow: hidden;
                  box-shadow: 0 1px 2px 0 rgba(60,64,67,0.05);
                  transition: box-shadow 0.2s, border-color 0.2s;
                }
                .google-card:hover {
                  box-shadow: 0 2px 6px 0 rgba(60,64,67,0.15);
                  border-color: #dfa015; /* Match VFS Golden Accent */
                }
                .google-card-header {
                  padding: 24px 24px 16px 24px;
                }
                .google-card-title {
                  font-size: 18px;
                  font-weight: 600;
                  color: #202124;
                  margin: 0 0 6px 0;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                }
                .google-card-subtitle {
                  font-size: 13px;
                  color: #5f6368;
                  margin: 0;
                  line-height: 1.4;
                }
                .google-row {
                  display: flex;
                  align-items: center;
                  padding: 20px 24px;
                  border-top: 1px solid #dadce0;
                  min-height: 64px;
                  transition: background-color 0.15s;
                }
                .google-row:hover {
                  background-color: #f8fafc;
                }
                .google-label-container {
                  display: flex;
                  align-items: center;
                  width: 240px;
                  min-width: 180px;
                }
                .google-label {
                  font-size: 11px;
                  font-weight: 700;
                  color: #5f6368;
                  text-transform: uppercase;
                  letter-spacing: 0.8px;
                }
                .google-value {
                  font-size: 14px;
                  color: #3c4043;
                  flex-grow: 1;
                  font-weight: 500;
                  word-break: break-all;
                }
                .google-avatar-container {
                  position: relative;
                  width: 72px;
                  height: 72px;
                  border-radius: 50%;
                  background-color: #0c2340;
                  color: #ffffff;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 28px;
                  font-weight: bold;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                  cursor: pointer;
                  transition: transform 0.2s, background-color 0.2s;
                }
                .google-avatar-container:hover {
                  transform: scale(1.05);
                  background-color: #0a1b32;
                }
                .google-camera-overlay {
                  position: absolute;
                  bottom: -2px;
                  right: -2px;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  background-color: #ffffff;
                  border: 1px solid #dadce0;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: #5f6368;
                  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                .google-badge {
                  padding: 4px 10px;
                  border-radius: 12px;
                  font-size: 11px;
                  font-weight: 600;
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                }
                .google-badge-success {
                  background-color: #e6f4ea;
                  color: #137333;
                  border: 1px solid #ceead6;
                }
                .google-badge-primary {
                  background-color: #e8f0fe;
                  color: #1a73e8;
                  border: 1px solid #d2e3fc;
                }
                .google-select {
                  width: 100%;
                  max-width: 260px;
                  height: 40px;
                  border: 1px solid #dadce0;
                  border-radius: 8px;
                  padding: 0 12px;
                  font-size: 14px;
                  background-color: #ffffff;
                  color: #3c4043;
                  outline: none;
                  cursor: pointer;
                  font-weight: 600;
                  transition: border-color 0.2s;
                }
                .google-select:focus {
                  border-color: #dfa015;
                }
                .google-banner {
                  text-align: center;
                  padding: 30px 10px 40px 10px;
                  max-width: 720px;
                  margin: 0 auto;
                }
                .google-banner-title {
                  font-size: 28px;
                  font-weight: 400;
                  color: #202124;
                  margin-bottom: 8px;
                }
                .google-banner-subtitle {
                  font-size: 15px;
                  color: #5f6368;
                  line-height: 1.5;
                }
              `}</style>

              <div className="google-banner">
                <h2 className="google-banner-title">{t('agent.profile_settings')}</h2>
                <p className="google-banner-subtitle">
                  Manage your personal details, office locations, B2B identity documents, and regional settings below.
                </p>
              </div>

              {/* SECTION 1: Basic Info */}
              <div className="google-card">
                <div className="google-card-header">
                  <h3 className="google-card-title">
                    <User size={20} style={{ color: '#dfa015' }} />
                    Basic info
                  </h3>
                  <p className="google-card-subtitle">Some info, like your agency partner status, is managed directly by the platform administration.</p>
                </div>

                {/* Profile Pic Row */}
                <div className="google-row" style={{ minHeight: '90px' }}>
                  <div className="google-label-container">
                    <span className="google-label">Photo</span>
                  </div>
                  <div className="google-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#5f6368' }}>A business logo helps personalize your partner portal</span>
                    <div
                      className="google-avatar-container"
                      onClick={() => alert(`Profile photo changes are locked. Please contact portal administrator at admindci@gmail.com to change your corporate logo.`)}
                    >
                      {user.agencyName ? user.agencyName.charAt(0).toUpperCase() : 'A'}
                      <div className="google-camera-overlay">
                        <Camera size={12} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Owner Name Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <User size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Owner Name</span>
                  </div>
                  <div className="google-value">{user.ownerName}</div>
                </div>

                {/* Agency Name Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <Building2 size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Agency Name</span>
                  </div>
                  <div className="google-value">{user.agencyName}</div>
                </div>

                {/* Agent ID Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <ShieldCheck size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Partner ID</span>
                  </div>
                  <div className="google-value" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px', letterSpacing: '0.5px' }}>
                      {user.agentId || 'Allocation Pending'}
                    </span>
                    <span className="google-badge google-badge-success">
                      <CheckCircle2 size={12} /> Active B2B Partner
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Contact Info */}
              <div className="google-card">
                <div className="google-card-header">
                  <h3 className="google-card-title">
                    <Mail size={20} style={{ color: '#dfa015' }} />
                    Contact info
                  </h3>
                  <p className="google-card-subtitle">Email addresses and mobile numbers linked to your partner access.</p>
                </div>

                {/* Email Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <Mail size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Email Address</span>
                  </div>
                  <div className="google-value" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>{user.email}</span>
                    <span className="google-badge google-badge-primary">Primary</span>
                  </div>
                </div>

                {/* Mobile Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <Phone size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Mobile Number</span>
                  </div>
                  <div className="google-value">{user.mobile}</div>
                </div>
              </div>

              {/* SECTION 3: Identity & Compliance */}
              <div className="google-card">
                <div className="google-card-header">
                  <h3 className="google-card-title">
                    <FileText size={20} style={{ color: '#dfa015' }} />
                    Identity & Compliance
                  </h3>
                  <p className="google-card-subtitle">Tax registration and national identity cards recorded for portal compliance.</p>
                </div>

                {/* GSTIN Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <Building2 size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">GSTIN Status</span>
                  </div>
                  <div className="google-value">{user.gstNumber || 'N/A'}</div>
                </div>

                {/* PAN Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <FileText size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">PAN Number</span>
                  </div>
                  <div className="google-value" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}>
                    {user.panNumber || 'N/A'}
                  </div>
                </div>

                {/* Aadhar Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <FileText size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Aadhar Number</span>
                  </div>
                  <div className="google-value" style={{ fontFamily: 'monospace' }}>
                    {user.aadharNumber || 'N/A'}
                  </div>
                </div>
              </div>

              {/* SECTION 4: Office Address */}
              <div className="google-card">
                <div className="google-card-header">
                  <h3 className="google-card-title">
                    <MapPin size={20} style={{ color: '#dfa015' }} />
                    Office Address
                  </h3>
                  <p className="google-card-subtitle">Registered physical address of your main corporate office.</p>
                </div>

                {/* Address Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <MapPin size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Street Address</span>
                  </div>
                  <div className="google-value">{user.address}</div>
                </div>

                {/* City & State Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <MapPin size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">City & State</span>
                  </div>
                  <div className="google-value">{user.city}, {user.state}</div>
                </div>

                {/* Country Row */}
                <div className="google-row">
                  <div className="google-label-container">
                    <Globe size={16} style={{ marginRight: '8px', color: '#5f6368' }} />
                    <span className="google-label">Country</span>
                  </div>
                  <div className="google-value">{user.country}</div>
                </div>
              </div>


            </div>
          )}

        </div>
      </div>

      {/* UPI payment modal */}
      {showPaymentModal && (
        <div style={styles.modalOverlay(1000)}>
          <div className="card" style={{
            backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            width: '480px', padding: '30px', borderTop: `5px solid ${COLORS.gold}`, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: '800', color: COLORS.navy, border: 'none', padding: 0 }}>
              {paymentType === 'renew' ? 'Renew Portal Subscription' : 'Purchase Portal Subscription'}
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: COLORS.slate }}>
              B2B SaaS subscription simulation. Complete UPI transfer and upload receipt proof.
            </p>

            {modalError && (
              <div style={{ backgroundColor: '#fee2e2', borderLeft: `4px solid ${COLORS.red}`, color: '#b91c1c', padding: '10px', fontSize: '13px', borderRadius: '4px', marginBottom: '15px' }}>
                {modalError}
              </div>
            )}

            <div style={{ backgroundColor: COLORS.bgSoft, padding: '20px', borderRadius: '6px', border: `1px solid ${COLORS.border}`, marginBottom: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: COLORS.slate, textTransform: 'uppercase', fontWeight: 'bold' }}>UPI Payment Details</div>

              <div style={{ margin: '15px 0' }}>
                <span style={{ fontSize: '28px', fontWeight: '800', color: COLORS.navy }}>INR {subscriptionPricing.totalAmount.toFixed(2)}</span>
                <span style={{ fontSize: '12px', color: COLORS.slate, display: 'block', marginTop: '2px' }}>
                  INR {subscriptionPricing.planAmount.toFixed(2)} + 18% GST
                  {subscriptionPricing.discountApplied ? ` (10% referral discount saved INR ${subscriptionPricing.discountAmount.toFixed(2)})` : ''}
                </span>
                <span style={{ marginLeft: '8px' }}>
                  <CopyButton text={subscriptionPricing.totalAmount.toFixed(2)} message={`Amount INR ${subscriptionPricing.totalAmount.toFixed(2)} copied!`} />
                </span>
              </div>

              <div style={{ fontSize: '14px', color: '#334155', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                UPI ID: <span style={{ color: COLORS.gold }}>{UPI_CONFIG.payeeId}</span>
                <CopyButton text={UPI_CONFIG.payeeId} message="UPI ID copied!" />
              </div>
              <div style={{ fontSize: '12px', color: COLORS.slate, marginTop: '5px' }}>Payee: {UPI_CONFIG.payeeName}</div>

              <div style={{ margin: '15px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {(() => {
                  try {
                    const upiURI = getUPIURI();
                    return (
                      <div
                        style={{ cursor: 'pointer', display: 'inline-block', backgroundColor: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        onClick={() => setEnlargeQR(true)}
                        title="Click to enlarge QR Code"
                      >
                        <QRCodeSVG id="upi-qr-code-svg" value={upiURI} size={150} level="H" includeMargin style={{ display: 'block', margin: '0 auto' }} />
                        <div style={{ fontSize: '11px', color: COLORS.slate, marginTop: '5px' }}>🔍 Click to enlarge QR</div>
                      </div>
                    );
                  } catch (err) {
                    return (
                      <div style={{ color: COLORS.red, fontSize: '13px', fontWeight: 'bold', padding: '10px', border: '1px solid #fee2e2', backgroundColor: '#fff5f5', borderRadius: '4px' }}>
                        Error: {err.message}
                      </div>
                    );
                  }
                })()}
              </div>

              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => downloadSVG('upi-qr-code-svg', 'dreamcatcher_upi_qr.svg')}
                  style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: COLORS.navy, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Download QR Code
                </button>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit}>
              <div className="form-group">
                <label className="form-label">UPI Reference / UTR / Transaction ID *</label>
                <input
                  type="text" className="form-control" placeholder="e.g. 302511223344"
                  value={transactionId} onChange={(e) => setTransactionId(e.target.value)} required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Date & Time *</label>
                <input
                  type="datetime-local" className="form-control"
                  value={paymentDateTime} onChange={(e) => setPaymentDateTime(e.target.value)}
                  required
                />
                <div style={{ fontSize: '11px', color: COLORS.slate, marginTop: '4px' }}>
                  Enter the exact successful payment time shown in your UPI app. Admin will match this with the bank statement.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes / Remarks (Optional)</label>
                <textarea
                  className="form-control" placeholder="Any extra info for administrative staff"
                  value={notes} onChange={(e) => setNotes(e.target.value)} style={{ height: '60px', resize: 'none' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '25px' }}>
                <label className="form-label">Upload UPI Payment Screenshot *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <label className="btn" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px dashed #cbd5e1',
                    backgroundColor: COLORS.bgSoft, color: COLORS.slate, cursor: 'pointer', padding: '8px 12px',
                    fontSize: '13px', margin: 0,
                  }}>
                    <Upload size={16} /> Choose File
                    <input type="file" onChange={handleScreenshotUpload} style={{ display: 'none' }} accept="image/*" required />
                  </label>
                  {screenshot && (
                    <img src={URL.createObjectURL(screenshot)} alt="Preview" style={{ height: '35px', width: '35px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <button type="button" onClick={resetPaymentForm} className="btn btn-outline" style={styles.btnOutline} disabled={modalLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-secondary" style={styles.btnPrimary} disabled={modalLoading}>
                  {modalLoading ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span className="premium-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#0c2340' }}></span>
                      Submitting...
                    </span>
                  ) : "I've Paid"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enlarged QR modal */}
      {enlargeQR && (
        <div style={{ ...styles.modalOverlay(1100), backgroundColor: 'rgba(12, 35, 64, 0.8)' }} onClick={() => setEnlargeQR(false)}>
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', textAlign: 'center', width: '360px' }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 15px 0', color: COLORS.navy, fontWeight: 'bold' }}>Dream Catcher UPI QR Code</h4>

            {(() => {
              try {
                const upiURI = getUPIURI();
                return (
                  <div style={{ backgroundColor: '#fff', padding: '10px', borderRadius: '4px', border: `1px solid ${COLORS.border}`, display: 'inline-block' }}>
                    <QRCodeSVG id="upi-qr-code-svg-enlarged" value={upiURI} size={280} level="H" includeMargin style={{ display: 'block', margin: '0 auto' }} />
                  </div>
                );
              } catch (err) {
                return (
                  <div style={{ color: COLORS.red, fontSize: '13px', fontWeight: 'bold', padding: '10px', border: '1px solid #fee2e2', backgroundColor: '#fff5f5', borderRadius: '4px' }}>
                    Error: {err.message}
                  </div>
                );
              }
            })()}

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => downloadSVG('upi-qr-code-svg-enlarged', 'dreamcatcher_upi_qr_large.svg')}
                style={{ padding: '8px 16px', backgroundColor: COLORS.navy, color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                Download SVG
              </button>
              <button
                type="button"
                onClick={() => setEnlargeQR(false)}
                style={{ padding: '8px 16px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: COLORS.slate, fontWeight: '600', fontSize: '12px', borderRadius: '4px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
            <p style={{ margin: '15px 0 0 0', color: COLORS.slate, fontSize: '12px', fontWeight: '500' }}>Scan with GPay, PhonePe, Paytm, BHIM, etc.</p>
          </div>
        </div>
      )}

      {/* Access alert modals */}
      {accessAlertModal === 'NoSub' && (
        <div style={styles.modalOverlay(1200)}>
          <div className="card" style={{ width: '450px', padding: '30px', backgroundColor: '#fff', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', color: COLORS.gold, marginBottom: '15px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 15px 0', color: COLORS.navy, fontWeight: 'bold', border: 'none', padding: 0 }}>Subscription Required</h3>
            <p style={{ margin: '0 0 25px 0', fontSize: '14px', lineHeight: '1.6', color: '#475569' }}>
              You need an active Professional Agent Subscription before you can book visa appointments.
              Please purchase a subscription to unlock booking access.
            </p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button type="button" onClick={() => setAccessAlertModal(null)} style={styles.btnOutline}>Cancel</button>
              <button
                type="button"
                onClick={() => { setAccessAlertModal(null); openPaymentModal('purchase'); }}
                style={{ ...styles.btnPrimary, backgroundColor: COLORS.gold, color: COLORS.navy }}
              >
                Purchase Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {accessAlertModal === 'Pending' && (
        <div style={styles.modalOverlay(1200)}>
          <div className="card" style={{ width: '450px', padding: '30px', backgroundColor: '#fff', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', color: '#3b82f6', marginBottom: '15px' }}>⏳</div>
            <h3 style={{ margin: '0 0 15px 0', color: COLORS.navy, fontWeight: 'bold', border: 'none', padding: 0 }}>Subscription Under Verification</h3>
            <p style={{ margin: '0 0 15px 0', fontSize: '14px', lineHeight: '1.6', color: '#475569' }}>
              Your payment has been submitted successfully. Our team is verifying your payment.
            </p>
            <p style={{ margin: '0 0 20px 0', fontSize: '13.5px', color: COLORS.slate }}>
              Booking access will automatically be enabled once your subscription is approved.
            </p>
            <div style={{ backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '6px', marginBottom: '25px', fontSize: '13px' }}>
              <strong>Current Status:</strong> <span style={{ color: '#b45309', fontWeight: 'bold' }}>Payment Verification Pending</span>
            </div>
            <button type="button" onClick={() => setAccessAlertModal(null)} style={{ ...styles.btnOutline, width: '100%' }}>
              Okay, Got it
            </button>
          </div>
        </div>
      )}

      {accessAlertModal === 'Expired' && (
        <div style={styles.modalOverlay(1200)}>
          <div className="card" style={{ width: '450px', padding: '30px', backgroundColor: '#fff', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', color: COLORS.red, marginBottom: '15px' }}>❌</div>
            <h3 style={{ margin: '0 0 15px 0', color: COLORS.navy, fontWeight: 'bold', border: 'none', padding: 0 }}>Subscription Expired</h3>
            <p style={{ margin: '0 0 25px 0', fontSize: '14px', lineHeight: '1.6', color: '#475569' }}>
              Your Professional Agent Subscription has expired. Renew your subscription to continue booking visa appointments.
            </p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button type="button" onClick={() => setAccessAlertModal(null)} style={styles.btnOutline}>Cancel</button>
              <button
                type="button"
                onClick={() => { setAccessAlertModal(null); openPaymentModal('renew'); }}
                style={{ ...styles.btnPrimary, backgroundColor: COLORS.red }}
              >
                Renew Subscription
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
