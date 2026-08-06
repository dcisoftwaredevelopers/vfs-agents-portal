const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const Subscription = require('../models/Subscription');
const { AUTH_COOKIE_NAME } = require('../utils/authUtils');

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  return null;
};

const protect = async (req, res, next) => {
  const cookies = String(req.headers.cookie || '')
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((acc, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = decodeURIComponent(cookie.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no auth cookie' });
  }

  try {
    const secret = getJwtSecret();
    if (!secret) {
      return res.status(500).json({ message: 'JWT configuration is missing' });
    }

    const decoded = jwt.verify(token, secret);
    const searchId = decoded.id || decoded.sub;
    let agent = null;

    if (searchId && mongoose.Types.ObjectId.isValid(searchId)) {
      agent = await Agent.findById(searchId);
    }
    if (!agent && decoded.email) {
      agent = await Agent.findOne({ email: decoded.email.toLowerCase().trim() });
    }
    if (!agent && decoded.sub) {
      agent = await Agent.findOne({ clerkId: decoded.sub });
    }

    if (!agent) {
      return res.status(401).json({ message: 'Not authorized, agent not found' });
    }

    if (agent.isActive === false || agent.status === 'Blocked') {
      return res.status(403).json({ message: 'Not authorized, account is inactive or blocked' });
    }

    req.user = agent;
    return next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

const admin = (req, res, next) => {
  const adminRoles = ['admin', 'SUPER_ADMIN', 'CENTER_MANAGER'];
  if (req.user && adminRoles.includes(req.user.role)) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin/manager' });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    const rolesToCheck = [...allowedRoles];
    if (rolesToCheck.includes('SUPER_ADMIN') || rolesToCheck.includes('CENTER_MANAGER')) {
      rolesToCheck.push('admin');
    }
    if (req.user && (rolesToCheck.includes(req.user.role) || (req.user.role === 'SUPER_ADMIN'))) {
      next();
    } else {
      res.status(403).json({ message: `Access denied. Role ${req.user.role || 'guest'} is not authorized for this action.` });
    }
  };
};

const verifyActiveSubscription = async (req, res, next) => {
  if (req.user && req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  if (!req.user || req.user.role !== 'Agent') {
    return res.status(403).json({ message: 'Access denied. Must be an Agent.' });
  }

  const status = req.user.status;

  if (status === 'Active') {
    try {
      const activeSub = await Subscription.findOne({
        agentId: req.user._id,
        subscriptionStatus: 'Active',
        paymentStatus: 'Paid',
        expiryDate: { $gt: new Date() }
      }).select('_id expiryDate');

      if (activeSub) {
        req.activeSubscription = activeSub;
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please renew your subscription to continue booking visa appointments.',
        status: 'Expired'
      });
    } catch (error) {
      return res.status(500).json({ message: 'Unable to verify subscription status' });
    }
  }

  let message = 'Purchase an active subscription to access visa booking.';
  if (status === 'Pending') {
    message = 'Your agency profile is pending verification. Cannot book appointments until approved.';
  } else if (status === 'Verification Pending') {
    message = 'Your subscription payment is currently pending admin verification. Cannot book appointments.';
  } else if (status === 'Rejected') {
    message = 'Your agency profile has been rejected.';
  } else if (status === 'Blocked') {
    message = 'Your agency account is blocked. Please contact admin.';
  } else if (status === 'Subscription Expired' || status === 'Expired') {
    message = 'Your subscription has expired. Please renew your subscription to continue booking visa appointments.';
  }

  return res.status(403).json({ 
    success: false, 
    message, 
    status 
  });
};

module.exports = { protect, admin, authorize, verifyActiveSubscription };
