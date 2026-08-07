const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const Appointment = require('../models/Appointment');
const Agent = require('../models/Agent');
const Payment = require('../models/Payment');
const Slot = require('../models/Slot');
const Center = require('../models/Center');
const SlotBlock = require('../models/SlotBlock');
const EmergencyClosure = require('../models/EmergencyClosure');
const { protect, admin, authorize } = require('../middleware/authMiddleware');
const AuditLog = require('../models/AuditLog');
const rewardService = require('../services/rewardService');
const PlatformSettings = require('../models/PlatformSettings');
const Subscription = require('../models/Subscription');
const AgentActivity = require('../models/AgentActivity');
const AgentNotification = require('../models/AgentNotification');
const mailService = require('../services/mailService');
const {
  APPOINTMENT_CONFIRMATION_SENDER_NAME,
  APPOINTMENT_CONFIRMATION_SUBJECT,
  buildAppointmentConfirmationHtml
} = require('../services/Emailtemplates');
const { DEFAULT_SLOTS, isSlotBlocked, getActiveLocksMap } = require('../services/slotAvailabilityService');
const {
  buildPaymentProofRiskReview,
  buildSubscriptionVerificationReview,
  canApproveManualSubscription,
  getScreenshotFileHash
} = require('../services/subscriptionPaymentSecurity');
const {
  DEFAULT_SUBSCRIPTION_SETTINGS,
  normalizeSubscriptionSettings,
  getSubscriptionSettings,
} = require('../services/subscriptionSettingsService');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLOT_BLOCK_TYPES = ['COUNTRY', 'CENTER', 'DATE', 'SLOT'];

const isValidDateString = (value) => DATE_RE.test(String(value || ''));
const isValidTimeString = (value) => TIME_RE.test(String(value || ''));
const buildMonthDates = (month) => {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return null;

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `${year}-${String(monthNumber).padStart(2, '0')}-${day}`;
  });
};

const adminFreeSubscriptionGrantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req.ip),
  message: { message: 'Too many free subscription grant attempts. Please try again in a minute.' },
});

const requireSuperAdminController = (req, res) => {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ message: 'SUPER_ADMIN access is required for this action.' });
    return false;
  }
  return true;
};

const validateSubscriptionSettingsPayload = (body) => {
  const planName = String(body?.planName || '').trim();
  const basePrice = Number(body?.basePrice);
  const gstPercent = Number(body?.gstPercent);
  const durationDays = Number(body?.durationDays);

  if (!planName) return { error: 'Plan name is required.' };
  if (!Number.isFinite(basePrice) || basePrice <= 0) return { error: 'Base price must be a positive number.' };
  if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 100) return { error: 'GST percent must be between 0 and 100.' };
  if (!Number.isFinite(durationDays) || durationDays <= 0) return { error: 'Duration days must be a positive number.' };

  return {
    value: {
      planName,
      basePrice: +basePrice.toFixed(2),
      gstPercent: +gstPercent.toFixed(2),
      durationDays: Math.round(durationDays)
    }
  };
};

const adminForgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests. Please try again after 15 minutes.' },
});

const genericAdminResetMessage = 'If an admin account exists for this email, a reset link has been sent.';

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const getClientOrigin = (req) => {
  const configuredOrigin = (process.env.CLIENT_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean)[0];
  const requestOrigin = req.headers.origin;
  return configuredOrigin || requestOrigin || 'http://localhost:5173';
};

const buildSubmittedBeforeScreenshotHashSet = async () => {
  const [payments, subscriptions] = await Promise.all([
    Payment.find({ screenshot: { $exists: true, $nin: [null, ''] } })
      .select('_id screenshot createdAt')
      .lean(),
    Subscription.find({ screenshot: { $exists: true, $nin: [null, ''] } })
      .select('_id screenshot createdAt')
      .lean(),
  ]);

  const submissionsByHash = new Map();
  const addSubmission = (kind, item) => {
    const screenshotFileHash = getScreenshotFileHash(item.screenshot);
    if (!screenshotFileHash) return;
    if (!submissionsByHash.has(screenshotFileHash)) submissionsByHash.set(screenshotFileHash, []);
    submissionsByHash.get(screenshotFileHash).push({
      kind,
      id: String(item._id),
      createdAt: item.createdAt ? new Date(item.createdAt).getTime() : 0,
    });
  };

  payments.forEach((payment) => addSubmission('appointmentPayment', payment));
  subscriptions.forEach((subscription) => addSubmission('subscriptionPayment', subscription));
  return submissionsByHash;
};

const wasScreenshotHashSubmittedBefore = (submissionsByHash, kind, item) => {
  const screenshotFileHash = getScreenshotFileHash(item?.screenshot);
  if (!screenshotFileHash) return false;

  const currentCreatedAt = item.createdAt ? new Date(item.createdAt).getTime() : Date.now();
  return (submissionsByHash.get(screenshotFileHash) || []).some((submission) => {
    if (submission.kind === kind && submission.id === String(item._id)) return false;
    return !submission.createdAt || submission.createdAt <= currentCreatedAt;
  });
};

const logAuditAction = async (req, action, entityType, entityId, oldValue, newValue) => {
  try {
    await AuditLog.create({
      action,
      performedBy: req.user._id,
      userId: req.user._id,
      entityType,
      entityId: entityId ? entityId.toString() : '',
      oldValue,
      newValue,
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    // Hook admin notifications on key actions
    try {
      const adminNotificationService = require('../services/adminNotificationService');
      let title = '';
      let description = '';
      let category = 'System';
      let priority = 'Info';
      let actionUrl = '';

      switch (action) {
        case 'APPROVE_AGENT':
          title = 'Agent Account Approved';
          description = `Agent status updated to Verified/Active.`;
          category = 'Agent';
          actionUrl = 'agents';
          break;
        case 'REJECT_AGENT':
          title = 'Agent Account Rejected';
          description = `Agent profile verification request was rejected.`;
          category = 'Agent';
          priority = 'Warning';
          actionUrl = 'agents';
          break;
        case 'BLOCK_AGENT':
          title = 'Agent Blocked';
          description = `Agent account has been blocked.`;
          category = 'Agent';
          priority = 'Critical';
          actionUrl = 'agents';
          break;
        case 'UNBLOCK_AGENT':
          title = 'Agent Unblocked';
          description = `Agent account has been unblocked.`;
          category = 'Agent';
          actionUrl = 'agents';
          break;
        case 'VERIFY_PAYMENT_SUCCESS':
          title = 'Booking Payment Approved';
          description = `UPI payment for appointment lock was verified successfully.`;
          category = 'Payment';
          actionUrl = 'paymentVerification';
          break;
        case 'VERIFY_PAYMENT_REJECT':
          title = 'Booking Payment Rejected';
          description = `UPI payment proof for appointment was rejected.`;
          category = 'Payment';
          priority = 'Critical';
          actionUrl = 'paymentVerification';
          break;
        case 'FREE_APPLICATION_REQUESTED':
          title = 'Free Application Verification Requested';
          description = `Agent requested a free application credit for an appointment.`;
          category = 'Payment';
          actionUrl = 'freeApplications';
          break;
        case 'APPROVE_FREE_APPLICATION':
          title = 'Free Application Approved';
          description = `Free application credit verified and appointment confirmed.`;
          category = 'Payment';
          actionUrl = 'freeApplications';
          break;
        case 'REJECT_FREE_APPLICATION':
          title = 'Free Application Rejected';
          description = `Free application credit request was rejected.`;
          category = 'Payment';
          priority = 'Warning';
          actionUrl = 'freeApplications';
          break;
        case 'APPROVE_SUBSCRIPTION_PAYMENT':
          title = 'Subscription Approved';
          description = `UPI payment verified. Subscription activated.`;
          category = 'Subscription';
          actionUrl = 'subPayments';
          break;
        case 'REJECT_SUBSCRIPTION_PAYMENT':
          title = 'Subscription Rejected';
          description = `UPI payment proof for subscription was rejected.`;
          category = 'Subscription';
          priority = 'Critical';
          actionUrl = 'subPayments';
          break;
        case 'GRANT_COMPLIMENTARY_DAYS':
          title = 'Complimentary Days Granted';
          description = `Granted complimentary subscription days to agent.`;
          category = 'Subscription';
          actionUrl = 'agents';
          break;
        case 'UPDATE_FREE_SUBSCRIPTION_SLOT_LIMIT':
          title = 'Admin Free Subscription Slots Updated';
          description = `Manual free subscription grant slot limit was updated.`;
          category = 'Subscription';
          actionUrl = 'agents';
          break;
        case 'UPDATE_SUBSCRIPTION_SETTINGS':
          title = 'Subscription Settings Updated';
          description = `Portal subscription price, GST, or duration settings were updated.`;
          category = 'Subscription';
          actionUrl = 'subscriptionSettings';
          break;
        case 'ADMIN_GRANTED_FREE_SUBSCRIPTION':
          title = 'Admin Free Subscription Granted';
          description = `Admin granted a free subscription to an agent.`;
          category = 'Subscription';
          actionUrl = 'agents';
          break;
        case 'CANCEL_SUBSCRIPTION':
          title = 'Subscription Cancelled';
          description = `Agent monthly subscription suspended/cancelled.`;
          category = 'Subscription';
          priority = 'Warning';
          actionUrl = 'agents';
          break;
        case 'CREATE_SLOT':
          title = 'New Slot Created';
          description = `New visa appointment slot added to the system.`;
          category = 'Slot';
          actionUrl = 'slots';
          break;
        case 'BLOCK_SLOTS_HIERARCHICAL':
        case 'BLOCK_DATE':
          title = 'Slots Blocked';
          description = `Visa appointment slots were blocked.`;
          category = 'Slot';
          priority = 'Warning';
          actionUrl = 'slots';
          break;
        case 'UNBLOCK_SLOTS_HIERARCHICAL':
        case 'UNBLOCK_SLOTS_BULK':
          title = 'Slots Unblocked';
          description = `Visa appointment slots were released/unblocked.`;
          category = 'Slot';
          actionUrl = 'slots';
          break;
        case 'EMERGENCY_CLOSURE':
          title = 'Emergency Closure Declared';
          description = `Emergency closure declared. Slots blocked, and bookings refunded.`;
          category = 'Slot';
          priority = 'Critical';
          actionUrl = 'closures';
          break;
      }

      if (title) {
        let relatedUserId = null;
        if (entityType === 'Agent' || entityType === 'Subscription' || entityType === 'Appointment') {
          relatedUserId = entityId;
        }
        await adminNotificationService.createAdminNotification({
          title,
          description,
          category,
          userId: relatedUserId,
          priority,
          actionUrl
        });
      }
    } catch (notifErr) {
      console.error('Failed to trigger admin notification from audit helper:', notifErr.message);
    }
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
};

router.post('/forgot-password', adminForgotPasswordLimiter, async (req, res) => {
  const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : '';

  try {
    if (!email) {
      return res.json({ message: genericAdminResetMessage });
    }

    const adminAgent = await Agent.findOne({ email, role: 'SUPER_ADMIN' })
      .select('+resetPasswordToken +resetPasswordExpires');

    if (!adminAgent || adminAgent.role !== 'SUPER_ADMIN') {
      return res.json({ message: genericAdminResetMessage });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    adminAgent.resetPasswordToken = hashResetToken(rawToken);
    adminAgent.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await adminAgent.save({ validateBeforeSave: false });

    const resetLink = `${getClientOrigin(req).replace(/\/$/, '')}/admin-reset-password?token=${rawToken}`;

    try {
      await mailService.sendMail(
        {
          to: adminAgent.email,
          subject: 'Admin Password Reset Request',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #0c2340; margin: 0; font-size: 24px; font-weight: bold; border-bottom: 2px solid #dfa015; padding-bottom: 15px;">Dream Catcher Admin</h2>
              </div>
              <p style="font-size: 16px; line-height: 1.5; color: #334155;">Dear Admin,</p>
              <p style="font-size: 15px; line-height: 1.6; color: #334155;">A password reset was requested for your SUPER_ADMIN account. Use the secure link below to set a new password.</p>
              <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 20px; text-align: center; margin: 25px 0;">
                <a href="${resetLink}" style="display: inline-block; background-color: #0c2340; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 4px; font-weight: bold;">Reset Admin Password</a>
              </div>
              <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin-top: 20px;">
                This link expires in <strong>15 minutes</strong> and can be used only once. If you did not request this, ignore this email and review admin account access.
              </p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">This is an automated notification. Please do not reply directly to this mail.</p>
            </div>
          `
        },
        'Dream Catcher Admin'
      );

      await AuditLog.create({
        action: 'SUPER_ADMIN_PASSWORD_RESET_REQUESTED',
        performedBy: adminAgent._id,
        userId: adminAgent._id,
        entityType: 'Agent',
        entityId: adminAgent._id.toString(),
        newValue: { email: adminAgent.email, expiresAt: adminAgent.resetPasswordExpires },
        ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      });
    } catch (mailError) {
      adminAgent.resetPasswordToken = null;
      adminAgent.resetPasswordExpires = null;
      await adminAgent.save({ validateBeforeSave: false });
      console.error('Admin password reset email failed:', mailError.message);
    }

    return res.json({ message: genericAdminResetMessage });
  } catch (error) {
    console.error('Admin forgot-password error:', error.message);
    return res.json({ message: genericAdminResetMessage });
  }
});

router.post('/reset-password', async (req, res) => {
  const token = req.body?.token ? String(req.body.token).trim() : '';
  const newPassword = req.body?.newPassword ? String(req.body.newPassword) : '';

  try {
    if (!token) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }

    if (!newPassword || newPassword.length < 12) {
      return res.status(400).json({ message: 'New password must be at least 12 characters.' });
    }

    const adminAgent = await Agent.findOne({
      role: 'SUPER_ADMIN',
      resetPasswordToken: hashResetToken(token),
      resetPasswordExpires: { $gt: new Date() }
    }).select('+password +resetPasswordToken +resetPasswordExpires +loginAttempts +lockUntil');

    if (!adminAgent || adminAgent.role !== 'SUPER_ADMIN') {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }

    adminAgent.password = newPassword;
    adminAgent.resetPasswordToken = null;
    adminAgent.resetPasswordExpires = null;
    adminAgent.loginAttempts = 0;
    adminAgent.lockUntil = null;
    await adminAgent.save();

    await AuditLog.create({
      action: 'SUPER_ADMIN_PASSWORD_RESET_VIA_EMAIL',
      performedBy: adminAgent._id,
      userId: adminAgent._id,
      entityType: 'Agent',
      entityId: adminAgent._id.toString(),
      newValue: { email: adminAgent.email, resetAt: new Date() },
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    try {
      await mailService.sendMail(
        {
          to: adminAgent.email,
          subject: 'Admin Password Changed',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #0c2340; margin: 0; font-size: 24px; font-weight: bold; border-bottom: 2px solid #dfa015; padding-bottom: 15px;">Dream Catcher Admin</h2>
              </div>
              <p style="font-size: 16px; line-height: 1.5; color: #334155;">Dear Admin,</p>
              <p style="font-size: 15px; line-height: 1.6; color: #334155;">Your SUPER_ADMIN password was just reset successfully.</p>
              <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin-top: 20px;">If you did not perform this action, secure the account and review audit logs immediately.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">This is an automated notification. Please do not reply directly to this mail.</p>
            </div>
          `
        },
        'Dream Catcher Admin'
      );
    } catch (mailError) {
      console.error('Admin password reset confirmation email failed:', mailError.message);
    }

    return res.json({ message: 'Password reset successfully. Please sign in with your new password.' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to reset password.' });
  }
});

router.get('/settings/subscription', protect, authorize('SUPER_ADMIN'), async (_req, res) => {
  try {
    const settings = await PlatformSettings.getSettings();
    res.json(normalizeSubscriptionSettings(settings));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load subscription settings.' });
  }
});

router.patch('/settings/subscription', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  const validation = validateSubscriptionSettingsPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ message: validation.error });
  }

  try {
    const settings = await PlatformSettings.getSettings();
    const oldValue = normalizeSubscriptionSettings(settings);
    const { planName, basePrice, gstPercent, durationDays } = validation.value;

    settings.subscriptionPlanName = planName;
    settings.subscriptionBasePrice = basePrice;
    settings.subscriptionGstPercent = gstPercent;
    settings.subscriptionDurationDays = durationDays;
    settings.subscriptionSettingsUpdatedBy = req.user._id;
    settings.subscriptionSettingsUpdatedAt = new Date();
    await settings.save();

    const newValue = normalizeSubscriptionSettings(settings);
    await logAuditAction(req, 'UPDATE_SUBSCRIPTION_SETTINGS', 'PlatformSettings', settings._id, oldValue, newValue);

    res.json({ message: 'Subscription settings updated successfully.', settings: newValue });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to update subscription settings.' });
  }
});

// ==========================================
// LEGACY COMPATIBLE ENDPOINTS
// ==========================================

// Get all appointments (Admin/Supervisor only)
router.get('/appointments', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR'), async (req, res) => {
  try {
    const { page = 1, limit = 25, search = '', month = '', status = '' } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const skip = (pageNum - 1) * limitNum;
    const query = {};
    const listProjection = {
      supportingDocuments: 0,
      'applicantDetails.passportDocument': 0,
    };

    if (status && status !== 'All') {
      query.applicationStatus = status;
    }

    if (month) {
      const [year, monthNumber] = month.split('-').map(Number);
      if (year && monthNumber) {
        query.bookingDate = {
          $gte: new Date(year, monthNumber - 1, 1),
          $lt: new Date(year, monthNumber, 1)
        };
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
      const matchingAgents = await Agent.find({
        $or: [
          { name: searchRegex },
          { agencyName: searchRegex },
          { ownerName: searchRegex },
          { email: searchRegex },
          { mobile: searchRegex },
          { agentId: searchRegex }
        ]
      }).select('_id').lean();

      query.$or = [
        { referenceNumber: searchRegex },
        { userId: { $in: matchingAgents.map(agent => agent._id) } },
        { 'applicantDetails.firstName': searchRegex },
        { 'applicantDetails.lastName': searchRegex },
        { 'applicantDetails.passportNumber': searchRegex },
        { 'applicantDetails.email': searchRegex },
        { 'applicantDetails.phone': searchRegex }
      ];
    }

    const [totalAppointments, total, revenueAgg, appointments] = await Promise.all([
      Appointment.countDocuments(),
      Appointment.countDocuments(query),
      Appointment.aggregate([
        { $match: query },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
      ]),
      Appointment.find(query, listProjection)
        .populate('userId', 'agencyName ownerName email mobile')
        .populate('centerId', 'name city')
        .sort({ createdAt: -1 })
        .allowDiskUse(true)
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    res.json({
      data: appointments,
      total,
      page: pageNum,
      totalPages: Math.max(Math.ceil(total / limitNum), 1),
      totalAppointments,
      totalRevenue: revenueAgg[0]?.totalRevenue || 0
    });
  } catch (error) {
    console.error('Failed to load admin appointments:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update appointment status (Admin only)
router.put('/appointments/:id/status', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { applicationStatus } = req.body;
  const validStatuses = ['Processing', 'Proceed', 'Delivered', 'Delayed'];

  if (!validStatuses.includes(applicationStatus)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Appointment ID' });
  }

  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const oldStatus = appointment.applicationStatus;
    appointment.applicationStatus = applicationStatus;
    await appointment.save();

    // Log administrative action
    await logAuditAction(req, 'UPDATE_APPOINTMENT_STATUS', 'Appointment', appointment._id, { status: oldStatus }, { status: applicationStatus });

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get admin stats (Admin/Supervisor only)
router.get('/stats', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR'), async (req, res) => {
  try {
    const totalAppointments = await Appointment.countDocuments();
    const appointments = await Appointment.find();

    let totalRevenue = 0;
    const servicesCount = {};

    appointments.forEach(appt => {
      totalRevenue += appt.totalAmount || 0;
      appt.servicesSelected.forEach(service => {
        servicesCount[service.name] = (servicesCount[service.name] || 0) + 1;
      });
    });

    res.json({
      totalAppointments,
      totalRevenue,
      servicesCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all registered users (Admin only)
router.get('/users', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  try {
    const users = await Agent.find({ role: 'Agent' })
      .select('-password -logo -aadharNumber -panNumber')
      .sort({ createdAt: -1 })
      .maxTimeMS(10000)
      .lean();
    const agentIds = users.map((user) => user._id);
    let subscriptions = [];

    try {
      subscriptions = await Subscription.find({ agentId: { $in: agentIds } })
        .select('agentId subscriptionStatus paymentStatus source totalAmount expiryDate createdAt')
        .maxTimeMS(10000)
        .lean();
    } catch (subscriptionError) {
      console.error('Failed to load subscription details for admin users:', subscriptionError);
    }

    subscriptions.sort((a, b) => {
      const agentCompare = String(a.agentId || '').localeCompare(String(b.agentId || ''));
      if (agentCompare !== 0) return agentCompare;

      const expiryDiff = new Date(b.expiryDate || 0).getTime() - new Date(a.expiryDate || 0).getTime();
      if (expiryDiff !== 0) return expiryDiff;

      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const latestSubscriptionByAgent = new Map();
    const activeSubscriptionByAgent = new Map();

    subscriptions.forEach((subscription) => {
      const agentId = subscription.agentId?.toString();
      if (agentId && !latestSubscriptionByAgent.has(agentId)) {
        latestSubscriptionByAgent.set(agentId, subscription);
      }
      if (
        agentId &&
        !activeSubscriptionByAgent.has(agentId) &&
        subscription.subscriptionStatus === 'Active' &&
        subscription.paymentStatus === 'Paid'
      ) {
        activeSubscriptionByAgent.set(agentId, subscription);
      }
    });

    res.json(users.map((user) => {
      const userId = user._id.toString();
      const latestSubscription = activeSubscriptionByAgent.get(userId) || latestSubscriptionByAgent.get(userId);
      const activeSubscription = activeSubscriptionByAgent.get(userId);
      return {
        ...user,
        freeSubscriptionGrantedByAdmin: user.freeSubscriptionGrantedByAdmin === true,
        freeSubscriptionGrantedAt: user.freeSubscriptionGrantedAt || null,
        status: user.status,
        subscriptionStatus: latestSubscription?.subscriptionStatus || null,
        subscriptionPaymentStatus: latestSubscription?.paymentStatus || null,
        activePaidSubscription: Boolean(
          activeSubscription &&
          activeSubscription.source !== 'ADMIN_FREE_GRANT'
        )
      };
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// ==========================================
// NEW PRODUCTION-GRADE SLOT & AUDIT ENDPOINTS
// ==========================================

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 1. Get Audit Logs with Filters
router.get('/audit-logs', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { country, centerId, adminUser, actionType, startDate, endDate } = req.query;
  const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const skip = (pageNum - 1) * limitNum;
  const query = {};

  const actionTypeMap = {
    'Appointment Status Updated': 'UPDATE_APPOINTMENT_STATUS',
    'Slot Created': 'CREATE_SLOT',
    'Slot Updated': 'UPDATE_SLOT',
    'Slot Deleted': 'DELETE_SLOT',
    'Block Created': 'BLOCK_SLOTS_HIERARCHICAL',
    'Block Removed': { $in: ['UNBLOCK_SLOTS_HIERARCHICAL', 'UNBLOCK_SLOTS_BULK'] },
    'Capacity Modified': 'UPDATE_CAPACITY',
    'Date Blocked': 'BLOCK_DATE',
    'Bulk Upload': 'BULK_UPLOAD_SLOTS',
    'Emergency Closure': 'EMERGENCY_CLOSURE',
    'Center Reopened': 'REOPEN_CENTER',
    'Payment Proof Submitted': 'SUBMIT_PAYMENT_PROOF',
    'Payment Approved': 'VERIFY_PAYMENT_SUCCESS',
    'Payment Rejected': 'VERIFY_PAYMENT_REJECT',
    'Agent Approved': 'APPROVE_AGENT',
    'Agent Rejected': 'REJECT_AGENT',
    'Agent Blocked': 'BLOCK_AGENT',
    'Agent Unblocked': 'UNBLOCK_AGENT',
    'Complimentary Days': 'GRANT_COMPLIMENTARY_DAYS',
    'Subscription Cancelled': 'CANCEL_SUBSCRIPTION',
    'Subscription Approved': 'APPROVE_SUBSCRIPTION_PAYMENT',
    'Subscription Rejected': 'REJECT_SUBSCRIPTION_PAYMENT'
  };

  if (actionType && actionTypeMap[actionType]) {
    query.action = actionTypeMap[actionType];
  } else if (actionType) {
    query.action = actionType;
  }

  if (adminUser && mongoose.Types.ObjectId.isValid(adminUser)) {
    query.performedBy = adminUser;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
  }

  try {
    const andConditions = [];

    if (country) {
      const countryCode = country.trim().toUpperCase();
      const countryCenters = await Center.find({ countryCode }).select('_id').lean();
      const countryCenterIds = countryCenters.map(center => center._id);
      const countryCenterIdStrings = countryCenterIds.map(id => id.toString());

      andConditions.push({
        $or: [
          { 'newValue.countryCode': new RegExp(`^${escapeRegex(countryCode)}$`, 'i') },
          { 'oldValue.countryCode': new RegExp(`^${escapeRegex(countryCode)}$`, 'i') },
          { 'newValue.centerId': { $in: [...countryCenterIds, ...countryCenterIdStrings] } },
          { 'oldValue.centerId': { $in: [...countryCenterIds, ...countryCenterIdStrings] } }
        ]
      });
    }

    if (centerId) {
      const centerFilter = centerId.trim();
      let centerIds = [];

      if (mongoose.Types.ObjectId.isValid(centerFilter)) {
        centerIds = [new mongoose.Types.ObjectId(centerFilter)];
      } else {
        const centerRegex = new RegExp(escapeRegex(centerFilter), 'i');
        const matchingCenters = await Center.find({ name: centerRegex }).select('_id').lean();
        centerIds = matchingCenters.map(center => center._id);
        andConditions.push({
          $or: [
            { 'newValue.centerName': centerRegex },
            { 'oldValue.centerName': centerRegex },
            { 'newValue.centerId': { $in: [...centerIds, ...centerIds.map(id => id.toString())] } },
            { 'oldValue.centerId': { $in: [...centerIds, ...centerIds.map(id => id.toString())] } }
          ]
        });
      }

      if (mongoose.Types.ObjectId.isValid(centerFilter)) {
        const centerIdStrings = centerIds.map(id => id.toString());
        andConditions.push({
          $or: [
            { 'newValue.centerId': { $in: [...centerIds, ...centerIdStrings] } },
            { 'oldValue.centerId': { $in: [...centerIds, ...centerIdStrings] } }
          ]
        });
      }
    }

    const finalQuery = andConditions.length ? { ...query, $and: andConditions } : query;

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(finalQuery),
      AuditLog.find(finalQuery)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    const centerIds = [...new Set(logs
      .map(log => log.newValue?.centerId || log.oldValue?.centerId)
      .filter(id => id && mongoose.Types.ObjectId.isValid(String(id)))
      .map(String))];
    const actorIds = [...new Set(logs
      .map(log => log.performedBy)
      .filter(id => id && mongoose.Types.ObjectId.isValid(String(id)))
      .map(String))];

    const [centersForLogs, actors] = await Promise.all([
      centerIds.length ? Center.find({ _id: { $in: centerIds } }).select('name city countryCode').lean() : [],
      actorIds.length ? Agent.find({ _id: { $in: actorIds } }).select('name ownerName agencyName email role').lean() : []
    ]);

    const centerById = new Map(centersForLogs.map(center => [String(center._id), center]));
    const actorById = new Map(actors.map(actor => [String(actor._id), actor]));

    const populatedLogs = logs.map(log => {
      const rawCenterId = log.newValue?.centerId || log.oldValue?.centerId || '';
      const center = rawCenterId ? centerById.get(String(rawCenterId)) : null;
      const actor = actorById.get(String(log.performedBy));
      const displayDate = log.newValue?.date ||
        log.newValue?.startDate ||
        (log.newValue?.endDate ? `${log.newValue?.startDate || 'N/A'} to ${log.newValue.endDate}` : 'N/A');

      return {
        _id: log._id,
        action: log.action,
        performedBy: actor ? {
          _id: actor._id,
          name: actor.name || actor.ownerName || actor.agencyName || actor.email,
          email: actor.email,
          role: actor.role
        } : null,
        timestamp: log.timestamp,
        ipAddress: log.ipAddress,
        countryCode: log.newValue?.countryCode || center?.countryCode || 'N/A',
        centerId: rawCenterId ? String(rawCenterId) : '',
        centerName: center?.name || log.newValue?.centerName || 'All Centers',
        date: displayDate,
        timeSlot: log.newValue?.timeSlot || 'N/A',
        previousValue: log.newValue?.previousValue || (log.oldValue ? JSON.stringify(log.oldValue) : 'N/A'),
        newValue: log.newValue?.newValue || (log.newValue ? JSON.stringify(log.newValue) : 'N/A'),
        reason: log.newValue?.reason || 'N/A'
      };
    });

    res.json({
      data: populatedLogs,
      total,
      page: pageNum,
      totalPages: Math.max(Math.ceil(total / limitNum), 1)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. Create Slot
router.post('/slots', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { centerId, date, startTime, endTime, capacity } = req.body;
  if (!centerId || !date || !startTime || !endTime) {
    return res.status(400).json({ message: 'All slot parameters are required' });
  }

  try {
    const center = await Center.findById(centerId);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }
    if (!center.active) {
      return res.status(400).json({ message: 'Cannot allocate slots to an inactive center' });
    }

    const existing = await Slot.findOne({ centerId, date, startTime, endTime });
    if (existing) {
      return res.status(400).json({ message: 'A slot for this date and time range already exists.' });
    }

    const newSlot = new Slot({
      centerId,
      date,
      startTime,
      endTime,
      capacity: capacity || 5,
      bookedCount: 0,
      status: 'AVAILABLE'
    });
    await newSlot.save();

    await logAuditAction(req, 'CREATE_SLOT', 'Slot', newSlot._id, null, newSlot);

    res.status(201).json(newSlot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



// 5. Block slots for full date
router.post('/block-date', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { centerId, date } = req.body;
  if (!centerId || !date) {
    return res.status(400).json({ message: 'centerId and date are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    return res.status(400).json({ message: 'Invalid Center ID' });
  }

  try {
    // Mark all slots on this date as BLOCKED
    await Slot.updateMany({ centerId, date }, { $set: { status: 'BLOCKED' } });

    await logAuditAction(req, 'BLOCK_DATE', 'Center', centerId, null, { centerId, date });

    res.json({ message: `Successfully blocked all slots on ${date}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 6. Capacity configuration update
router.post('/capacity', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { slotId, newCapacity } = req.body;
  if (!slotId || newCapacity === undefined) {
    return res.status(400).json({ message: 'slotId and newCapacity are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(slotId)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }

  try {
    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    // Validate capacity doesn't truncate booked count
    if (newCapacity < slot.bookedCount) {
      return res.status(400).json({ message: `New capacity cannot be lower than current bookings (${slot.bookedCount})` });
    }

    const oldCapacity = slot.capacity;
    slot.capacity = newCapacity;
    await slot.save();

    const centerObj = await Center.findById(slot.centerId);
    await logAuditAction(req, 'UPDATE_CAPACITY', 'Slot', slot._id, null, {
      countryCode: 'All',
      centerId: slot.centerId,
      centerName: centerObj ? centerObj.name : 'Unknown',
      date: slot.date,
      timeSlot: `${slot.startTime} - ${slot.endTime}`,
      reason: 'Capacity Configured',
      previousValue: `Capacity: ${oldCapacity}`,
      newValue: `Capacity: ${newCapacity}`
    });

    // Broadcast updated capacity count
    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocksCount = await SlotLock.countDocuments({
        slotId: slot._id,
        expiresAt: { $gt: new Date() }
      });
      global.io.emit('slot-update', {
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount: activeLocksCount,
        capacity: slot.capacity
      });
    }

    res.json({ message: 'Capacity configured successfully.', slot });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 7. Emergency closure (cancel bookings, reset counts, trigger logs)
router.post('/emergency-close', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { centerId, date } = req.body;
  if (!centerId || !date) {
    return res.status(400).json({ message: 'centerId and date are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    return res.status(400).json({ message: 'Invalid Center ID' });
  }

  try {
    // 1. Find all slots for the center and date
    const slots = await Slot.find({ centerId, date });
    const slotIds = slots.map(s => s._id);

    // 2. Find and cancel all active bookings (LOCKED or BOOKED)
    const activeAppointments = await Appointment.find({
      slotId: { $in: slotIds },
      status: { $in: ['LOCKED', 'BOOKED'] }
    });

    for (const appt of activeAppointments) {
      appt.status = 'CANCELLED';
      appt.paymentStatus = 'REFUNDED';
      await appt.save();

      console.log(`Emergency Closure simulation: Refunded / Cancelled appointment ${appt.referenceNumber}`);
    }

    // 3. Mark all slots on this date as BLOCKED and reset counts
    await Slot.updateMany(
      { centerId, date },
      { $set: { status: 'BLOCKED', bookedCount: 0 } }
    );

    const SlotLock = require('../models/SlotLock');
    await SlotLock.deleteMany({ slotId: { $in: slotIds } });

    // 4. Log audit log
    await logAuditAction(req, 'EMERGENCY_CLOSURE', 'Center', centerId, null, { centerId, date, cancelledBookingsCount: activeAppointments.length });

    // Broadcast updates
    if (global.io) {
      slots.forEach(slot => {
        global.io.emit('slot-update', {
          slotId: slot._id,
          bookedCount: 0,
          lockedCount: 0,
          capacity: slot.capacity
        });
      });
    }

    res.json({
      message: `Emergency closure processed. Cancelled ${activeAppointments.length} appointments, refunded transactions, and blocked dates.`,
      cancelledCount: activeAppointments.length
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 8. Bulk upload slots via CSV text parsing
router.post('/bulk-upload', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { centerId, csvText } = req.body;
  if (!centerId || !csvText) {
    return res.status(400).json({ message: 'centerId and csvText are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    return res.status(400).json({ message: 'Invalid Center ID' });
  }

  try {
    const center = await Center.findById(centerId);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }
    if (!center.active) {
      return res.status(400).json({ message: 'Cannot upload slots to an inactive center.' });
    }

    const lines = csvText.split('\n');
    let totalRecords = 0;
    let successCount = 0;
    let failedCount = 0;
    const errorDetails = [];
    const slotsCreated = [];

    // Skip header if present
    let startIndex = 0;
    if (lines.length > 0 && lines[0].toLowerCase().includes('date')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      totalRecords++;

      const parts = line.split(',');
      if (parts.length < 4) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: 'Invalid format. Expected: date,startTime,endTime,capacity' });
        continue;
      }

      const [dateStr, startTimeStr, endTimeStr, capacityStr] = parts;
      const date = dateStr.trim();
      const startTime = startTimeStr.trim();
      const endTime = endTimeStr.trim();
      const capacity = parseInt(capacityStr.trim(), 10);

      if (!date || !startTime || !endTime || isNaN(capacity)) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: 'Invalid fields: check date, times, and capacity values.' });
        continue;
      }

      // Check if slot already exists in DB
      const existing = await Slot.findOne({ centerId, date, startTime, endTime });
      if (existing) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: `Duplicate slot: ${date} ${startTime}-${endTime} already exists.` });
        continue;
      }

      try {
        const slot = new Slot({
          centerId,
          date,
          startTime,
          endTime,
          capacity,
          bookedCount: 0,
          status: 'AVAILABLE'
        });
        await slot.save();
        slotsCreated.push(slot);
        successCount++;
      } catch (err) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: err.message });
      }
    }

    await logAuditAction(req, 'BULK_UPLOAD_SLOTS', 'Center', centerId, null, { centerId, count: slotsCreated.length });

    res.json({
      message: `Bulk upload completed: ${successCount} successful, ${failedCount} failed.`,
      totalRecords,
      successCount,
      failedCount,
      errorDetails,
      slots: slotsCreated
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 1. Hierarchical Block Endpoint
router.post('/slots/block', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { countryCode, centerId, blockType, startDate, endDate, startTime, endTime, reason } = req.body;
  if (!countryCode || !blockType || !reason) {
    return res.status(400).json({ message: 'countryCode, blockType, and reason are required' });
  }
  if (!SLOT_BLOCK_TYPES.includes(blockType)) {
    return res.status(400).json({ message: 'Invalid blockType' });
  }

  const cCode = countryCode.trim().toUpperCase();
  const normalizedStartDate = startDate || '';
  const normalizedEndDate = blockType === 'SLOT' ? startDate : (endDate || startDate || '');
  const normalizedStartTime = startTime || '';
  const normalizedEndTime = endTime || '';

  if ((blockType === 'DATE' || blockType === 'SLOT') && !isValidDateString(normalizedStartDate)) {
    return res.status(400).json({ message: 'startDate must use YYYY-MM-DD format' });
  }
  if (blockType === 'DATE' && !isValidDateString(normalizedEndDate)) {
    return res.status(400).json({ message: 'endDate must use YYYY-MM-DD format' });
  }
  if (blockType === 'DATE' && normalizedStartDate > normalizedEndDate) {
    return res.status(400).json({ message: 'endDate must be on or after startDate' });
  }
  if (blockType === 'SLOT') {
    if (!isValidTimeString(normalizedStartTime) || !isValidTimeString(normalizedEndTime)) {
      return res.status(400).json({ message: 'startTime and endTime must use HH:mm format' });
    }
    if (normalizedStartTime >= normalizedEndTime) {
      return res.status(400).json({ message: 'endTime must be later than startTime' });
    }
  }

  try {
    // Validate centerId if blockType is not COUNTRY
    if (blockType !== 'COUNTRY' && !centerId) {
      return res.status(400).json({ message: 'centerId is required for center, date, or slot level blocking' });
    }

    if (centerId) {
      if (!mongoose.Types.ObjectId.isValid(centerId)) {
        return res.status(400).json({ message: 'Invalid Center ID' });
      }
      const center = await Center.findById(centerId);
      if (!center) {
        return res.status(404).json({ message: 'Center not found' });
      }
      if (!center.active) {
        return res.status(400).json({ message: 'Cannot apply block to an inactive center.' });
      }
      if (center.countryCode && center.countryCode.trim().toUpperCase() !== cCode) {
        return res.status(400).json({ message: 'countryCode does not match the selected center' });
      }
    }

    // Prevent duplicate blocking records
    const duplicate = await SlotBlock.findOne({
      countryCode: cCode,
      centerId: centerId || null,
      blockType,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      active: true
    });

    if (duplicate) {
      return res.status(400).json({ message: 'A duplicate active blocking record already exists.' });
    }

    // Prevent overlapping restrictions hierarchically
    const countryBlock = await SlotBlock.findOne({ countryCode: cCode, blockType: 'COUNTRY', active: true });
    if (countryBlock) {
      return res.status(400).json({ message: `A country-level block is already active for ${cCode}.` });
    }

    if (blockType !== 'COUNTRY') {
      const centerBlock = await SlotBlock.findOne({ countryCode: cCode, centerId, blockType: 'CENTER', active: true });
      if (centerBlock) {
        return res.status(400).json({ message: `A center-level block is already active for this center under country ${cCode}.` });
      }
    }

    if (blockType === 'DATE' || blockType === 'SLOT') {
      const dateBlocks = await SlotBlock.find({
        countryCode: cCode,
        centerId,
        blockType: 'DATE',
        active: true
      });

      for (const db of dateBlocks) {
        const reqStart = normalizedStartDate;
        const reqEnd = blockType === 'DATE' ? normalizedEndDate : normalizedStartDate;

        if (reqStart <= db.endDate && reqEnd >= db.startDate) {
          return res.status(400).json({ message: `The date range overlaps with an active Date Block (${db.startDate} to ${db.endDate}).` });
        }
      }
    }

    if (blockType === 'SLOT') {
      const matchingSlotBlock = await SlotBlock.findOne({
        countryCode: cCode,
        centerId,
        blockType: 'SLOT',
        startDate: normalizedStartDate,
        startTime: { $lt: normalizedEndTime },
        endTime: { $gt: normalizedStartTime },
        active: true
      });
      if (matchingSlotBlock) {
        return res.status(400).json({ message: `The requested time range overlaps an active block (${matchingSlotBlock.startTime} - ${matchingSlotBlock.endTime}).` });
      }
    }

    const blockRecord = new SlotBlock({
      countryCode: cCode,
      centerId: centerId || null,
      blockType,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      reason,
      blockedBy: req.user._id,
      active: true
    });
    await blockRecord.save();

    const CenterObj = centerId ? await Center.findById(centerId) : null;
    await logAuditAction(req, 'BLOCK_SLOTS_HIERARCHICAL', 'SlotBlock', blockRecord._id, null, {
      countryCode: blockRecord.countryCode,
      centerId: blockRecord.centerId,
      centerName: CenterObj ? CenterObj.name : 'All Centers',
      date: blockRecord.startDate ? (blockRecord.startDate === blockRecord.endDate ? blockRecord.startDate : `${blockRecord.startDate} to ${blockRecord.endDate}`) : 'All Dates',
      timeSlot: blockRecord.startTime ? `${blockRecord.startTime} - ${blockRecord.endTime}` : 'All Day',
      reason: blockRecord.reason,
      previousValue: 'Available',
      newValue: 'Blocked'
    });

    if (global.io) {
      global.io.emit('slot-update', { blockCreated: true });
    }

    res.status(201).json({ message: 'Slots blocked successfully', blockRecord });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Convenience endpoint used by the admin range-blocking panel.
// It stores the range as a normal SLOT block so history, audit logs, and
// availability checks continue to use the same source of truth.
router.post('/slots/block-range', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { countryCode: requestedCountryCode, centerId, date, startTime, endTime, reason } = req.body;

  if (!centerId || !date || !startTime || !endTime || !reason) {
    return res.status(400).json({ message: 'centerId, date, startTime, endTime, and reason are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    return res.status(400).json({ message: 'Invalid Center ID' });
  }

  if (!isValidDateString(date)) {
    return res.status(400).json({ message: 'date must use YYYY-MM-DD format' });
  }

  if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
    return res.status(400).json({ message: 'startTime and endTime must use HH:mm format' });
  }

  if (startTime >= endTime) {
    return res.status(400).json({ message: 'End time must be later than start time' });
  }

  try {
    const center = await Center.findById(centerId);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }
    if (!center.active) {
      return res.status(400).json({ message: 'Cannot apply block to an inactive center.' });
    }

    const countryCode = (requestedCountryCode || center.countryCode || '').trim().toUpperCase();
    if (!countryCode) {
      return res.status(400).json({ message: 'Center country code is missing' });
    }
    if (center.countryCode && center.countryCode.trim().toUpperCase() !== countryCode) {
      return res.status(400).json({ message: 'countryCode does not match the selected center' });
    }

    const countryBlock = await SlotBlock.findOne({ countryCode, blockType: 'COUNTRY', active: true });
    if (countryBlock) {
      return res.status(400).json({ message: `A country-level block is already active for ${countryCode}.` });
    }

    const centerBlock = await SlotBlock.findOne({ countryCode, centerId, blockType: 'CENTER', active: true });
    if (centerBlock) {
      return res.status(400).json({ message: 'A center-level block is already active for this center.' });
    }

    const overlappingDateBlock = await SlotBlock.findOne({
      countryCode,
      centerId,
      blockType: 'DATE',
      active: true,
      startDate: { $lte: date },
      endDate: { $gte: date }
    });
    if (overlappingDateBlock) {
      return res.status(400).json({ message: `The date is already blocked (${overlappingDateBlock.startDate} to ${overlappingDateBlock.endDate}).` });
    }

    const overlappingSlotBlock = await SlotBlock.findOne({
      countryCode,
      centerId,
      blockType: 'SLOT',
      active: true,
      startDate: date,
      startTime: { $lt: endTime },
      endTime: { $gt: startTime }
    });
    if (overlappingSlotBlock) {
      return res.status(400).json({ message: `The requested time range overlaps an active block (${overlappingSlotBlock.startTime} - ${overlappingSlotBlock.endTime}).` });
    }

    const blockRecord = await SlotBlock.create({
      countryCode,
      centerId,
      blockType: 'SLOT',
      startDate: date,
      endDate: date,
      startTime,
      endTime,
      reason,
      blockedBy: req.user._id,
      active: true
    });

    await logAuditAction(req, 'BLOCK_SLOTS_HIERARCHICAL', 'SlotBlock', blockRecord._id, null, {
      countryCode,
      centerId,
      centerName: center.name,
      date,
      timeSlot: `${startTime} - ${endTime}`,
      reason,
      previousValue: 'Available',
      newValue: 'Blocked'
    });

    if (global.io) {
      global.io.emit('slot-update', { blockCreated: true });
    }

    res.status(201).json({ message: 'Time range blocked successfully', blockRecord });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. Unblock Endpoint
router.post('/slots/unblock', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { blockId } = req.body;
  if (!blockId) {
    return res.status(400).json({ message: 'blockId is required' });
  }

  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    return res.status(400).json({ message: 'Invalid Block ID' });
  }

  try {
    const blockRecord = await SlotBlock.findById(blockId);
    if (!blockRecord) {
      return res.status(404).json({ message: 'Blocking record not found' });
    }

    if (!blockRecord.active) {
      return res.status(400).json({ message: 'This blocking record is already inactive.' });
    }

    blockRecord.active = false;
    blockRecord.unblockedBy = req.user._id;
    blockRecord.unblockedAt = new Date();
    await blockRecord.save();

    const CenterObj = blockRecord.centerId ? await Center.findById(blockRecord.centerId) : null;
    await logAuditAction(req, 'UNBLOCK_SLOTS_HIERARCHICAL', 'SlotBlock', blockRecord._id, null, {
      countryCode: blockRecord.countryCode,
      centerId: blockRecord.centerId,
      centerName: CenterObj ? CenterObj.name : 'All Centers',
      date: blockRecord.startDate ? (blockRecord.startDate === blockRecord.endDate ? blockRecord.startDate : `${blockRecord.startDate} to ${blockRecord.endDate}`) : 'All Dates',
      timeSlot: blockRecord.startTime ? `${blockRecord.startTime} - ${blockRecord.endTime}` : 'All Day',
      reason: 'Unblocked by Admin',
      previousValue: 'Blocked',
      newValue: 'Available'
    });

    if (global.io) {
      global.io.emit('slot-update', { blockReleased: true });
    }

    res.json({ message: 'Slots unblocked successfully', blockRecord });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bulk Unblock Endpoint
router.post('/slots/unblock-bulk', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { blockIds } = req.body;
  if (!blockIds || !Array.isArray(blockIds)) {
    return res.status(400).json({ message: 'blockIds array is required' });
  }

  try {
    const result = await SlotBlock.updateMany(
      { _id: { $in: blockIds }, active: true },
      {
        $set: {
          active: false,
          unblockedBy: req.user._id,
          unblockedAt: new Date()
        }
      }
    );

    await logAuditAction(req, 'UNBLOCK_SLOTS_BULK', 'SlotBlock', null, null, {
      countryCode: 'Multiple',
      centerName: 'Multiple Centers',
      date: 'N/A',
      timeSlot: 'N/A',
      reason: `Bulk Unblocked ${result.modifiedCount} records`,
      previousValue: 'Blocked',
      newValue: 'Available'
    });

    if (global.io) {
      global.io.emit('slot-update', { blockReleased: true });
    }

    res.json({ message: `Successfully unblocked ${result.modifiedCount} slot restrictions.`, count: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET slots month-summary for calendar view
router.get('/slots/month-summary', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { month, centerId, countryCode } = req.query;
  if (!month || !centerId || !countryCode) {
    return res.status(400).json({ message: 'month, centerId, and countryCode parameters are required' });
  }

  try {
    const dates = buildMonthDates(month);
    if (!dates) {
      return res.status(400).json({ message: 'month must use YYYY-MM format' });
    }

    const activeBlocks = await SlotBlock.find({ countryCode: countryCode.trim().toUpperCase(), active: true }).lean();
    const monthSlots = await Slot.find({ centerId, date: { $in: dates } }).lean();
    const slotsByDate = new Map();
    monthSlots.forEach(slot => {
      if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, []);
      slotsByDate.get(slot.date).push(slot);
    });
    const locksMap = await getActiveLocksMap(monthSlots.map(slot => slot._id));

    const summaries = {};

    for (const date of dates) {
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (day === 0 || day === 6) {
        summaries[date] = 'Closed';
        continue;
      }

      let slots = slotsByDate.get(date) || [];
      if (slots.length === 0) {
        slots = DEFAULT_SLOTS.map(s => ({
          centerId,
          date,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: 5,
          bookedCount: 0,
          lockedCount: 0,
          status: 'AVAILABLE'
        }));
      }

      let totalSlots = slots.length;
      let blockedCount = 0;
      let fullCount = 0;

      slots.forEach(s => {
        const lockedCount = locksMap[s._id?.toString()] || 0;
        const blocked = isSlotBlocked(s, activeBlocks);
        if (blocked || s.status === 'BLOCKED') {
          blockedCount++;
        } else {
          const avail = Math.max(0, s.capacity - s.bookedCount - lockedCount);
          if (avail === 0) {
            fullCount++;
          }
        }
      });

      let status = 'Available';
      if (blockedCount === totalSlots) {
        status = 'Fully Blocked';
      } else if (blockedCount > 0) {
        status = 'Partially Blocked';
      } else if (fullCount === totalSlots) {
        status = 'Capacity Full';
      }

      summaries[date] = status;
    }

    res.json(summaries);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. Get Blocks History Endpoint
router.get('/slots/blocks', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  try {
    const blocks = await SlotBlock.find()
      .populate('centerId', 'name city')
      .sort({ createdAt: -1 })
      .lean();

    const actorIds = [...new Set(blocks
      .flatMap(block => [block.blockedBy, block.unblockedBy])
      .filter(id => id && mongoose.Types.ObjectId.isValid(String(id)))
      .map(String))];

    const actors = actorIds.length
      ? await Agent.find({ _id: { $in: actorIds } }).select('name ownerName agencyName email role').lean()
      : [];
    const actorById = new Map(actors.map(actor => [String(actor._id), actor]));
    const formatActor = (id) => {
      const actor = id ? actorById.get(String(id)) : null;
      if (!actor) return null;
      return {
        _id: actor._id,
        name: actor.name || actor.ownerName || actor.agencyName || actor.email,
        email: actor.email,
        role: actor.role
      };
    };

    res.json(blocks.map(block => ({
      ...block,
      blockedBy: formatActor(block.blockedBy),
      unblockedBy: formatActor(block.unblockedBy)
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Slot Availability by ID (toggles or updates status/capacity)
const handleSlotAvailability = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid Slot ID' });
  }
  const { status, capacity } = req.body;

  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Slot not found' });
    }

    const oldVal = { capacity: slot.capacity, status: slot.status };

    if (capacity !== undefined) {
      const parsedCapacity = parseInt(capacity, 10);
      if (isNaN(parsedCapacity) || parsedCapacity < 0) {
        return res.status(400).json({ success: false, message: 'Invalid capacity count' });
      }
      if (parsedCapacity < slot.bookedCount) {
        return res.status(400).json({ success: false, message: `Capacity cannot be lower than booked count (${slot.bookedCount})` });
      }
      slot.capacity = parsedCapacity;
    }

    if (status !== undefined) {
      if (!['AVAILABLE', 'BLOCKED'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      slot.status = status;
    }

    await slot.save();
    await logAuditAction(req, 'UPDATE_SLOT', 'Slot', slot._id, oldVal, { capacity: slot.capacity, status: slot.status });

    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocksCount = await SlotLock.countDocuments({
        slotId: slot._id,
        expiresAt: { $gt: new Date() }
      });
      global.io.emit('slot-update', {
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount: activeLocksCount,
        capacity: slot.capacity,
        status: slot.status
      });
    }

    res.json({ success: true, message: 'Slot availability updated successfully', slot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

router.post('/slots/availability/:id', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), handleSlotAvailability);
router.put('/slots/availability/:id', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), handleSlotAvailability);

// ==========================================
// GENERIC DYNAMIC SLOT ENDPOINTS (/:id) - MUST BE DEFINED LAST
// ==========================================

// 3. Update Slot (POST - legacy compatibility)
router.post('/slots/:id', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }
  const { capacity, status } = req.body;

  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const oldVal = { capacity: slot.capacity, status: slot.status };
    if (capacity !== undefined) slot.capacity = capacity;
    if (status !== undefined) slot.status = status;

    await slot.save();

    await logAuditAction(req, 'UPDATE_SLOT', 'Slot', slot._id, oldVal, { capacity: slot.capacity, status: slot.status });

    // Broadcast update
    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocksCount = await SlotLock.countDocuments({
        slotId: slot._id,
        expiresAt: { $gt: new Date() }
      });
      global.io.emit('slot-update', {
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount: activeLocksCount,
        capacity: slot.capacity
      });
    }

    res.json(slot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Slot (PUT - REST spec)
router.put('/slots/:id', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }
  const { capacity, status } = req.body;

  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const oldVal = { capacity: slot.capacity, status: slot.status };
    if (capacity !== undefined) slot.capacity = capacity;
    if (status !== undefined) slot.status = status;

    await slot.save();

    await logAuditAction(req, 'UPDATE_SLOT', 'Slot', slot._id, oldVal, { capacity: slot.capacity, status: slot.status });

    // Broadcast update
    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocksCount = await SlotLock.countDocuments({
        slotId: slot._id,
        expiresAt: { $gt: new Date() }
      });
      global.io.emit('slot-update', {
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount: activeLocksCount,
        capacity: slot.capacity
      });
    }

    res.json(slot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete Slot (Super Admin only!)
router.delete('/slots/:id', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }
  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    if (slot.bookedCount > 0) {
      return res.status(400).json({ message: 'Cannot delete a slot with active bookings' });
    }

    await Slot.deleteOne({ _id: req.params.id });

    await logAuditAction(req, 'DELETE_SLOT', 'Slot', slot._id, slot, null);

    res.json({ message: 'Slot deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 4. Declare emergency closure
router.post('/emergency-closure', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { countryCode, centerId, reason, startDate, endDate, closureType, startTime, endTime } = req.body;
  if (!countryCode || !reason || !startDate || !endDate) {
    return res.status(400).json({ message: 'countryCode, reason, startDate, and endDate are required' });
  }

  try {
    let centerIds = [];
    if (centerId) {
      if (!mongoose.Types.ObjectId.isValid(centerId)) {
        return res.status(400).json({ message: 'Invalid Center ID' });
      }
      const center = await Center.findById(centerId);
      if (!center) {
        return res.status(404).json({ message: 'Center not found' });
      }
      if (!center.active) {
        return res.status(400).json({ message: 'Center is currently inactive.' });
      }
      centerIds.push(center._id);
    } else {
      // Country wide closure - find all active centers in that country
      const activeCenters = await Center.find({ countryCode: countryCode.trim().toUpperCase(), active: true });
      if (activeCenters.length === 0) {
        return res.status(400).json({ message: `No active centers found under country code ${countryCode}` });
      }
      centerIds = activeCenters.map(c => c._id);
    }

    const slotQuery = {
      centerId: { $in: centerIds },
      date: { $gte: startDate, $lte: endDate }
    };

    if (startTime && endTime) {
      slotQuery.startTime = { $gte: startTime };
      slotQuery.endTime = { $lte: endTime };
    }

    // Query matching slots
    const slots = await Slot.find(slotQuery);
    const slotIds = slots.map(s => s._id);

    const cType = closureType || (centerId ? (startTime && endTime ? 'PARTIAL_DAY' : 'FULL_DAY') : 'COUNTRY_WIDE');

    // Create EmergencyClosure record
    const closure = new EmergencyClosure({
      countryCode: countryCode.trim().toUpperCase(),
      centerId: centerId ? centerId : null,
      closureType: cType,
      reason,
      startDate,
      endDate,
      startTime: startTime || null,
      endTime: endTime || null,
      impactedSlotsCount: slots.length,
      declaredBy: req.user._id,
      status: 'ACTIVE'
    });
    await closure.save();

    // Update all matching slots to BLOCKED
    await Slot.updateMany(
      { _id: { $in: slotIds } },
      { $set: { status: 'BLOCKED' } }
    );

    // Trigger background cancellation queue helper
    const { processEmergencyClosureJobs } = require('../services/queueService');
    const result = await processEmergencyClosureJobs(slotIds, reason, req.user._id);

    await logAuditAction(req, 'EMERGENCY_CLOSURE', 'EmergencyClosure', closure._id, null, closure);

    res.status(201).json({
      message: centerId
        ? `Emergency closure declared successfully. Cancelled ${result.cancelledLocks + result.reviewQueueCount} appointments and blocked slots.`
        : `Emergency closure declared successfully for all active centers under country ${countryCode}. Cancelled ${result.cancelledLocks + result.reviewQueueCount} appointments and blocked slots.`,
      closure,
      affectedSlotsCount: slots.length,
      cancelledLocks: result.cancelledLocks,
      reviewQueueCount: result.reviewQueueCount
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 5. Reopen center
router.post('/emergency-closure/reopen', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { closureId } = req.body;
  if (!closureId) {
    return res.status(400).json({ message: 'closureId is required' });
  }

  if (!mongoose.Types.ObjectId.isValid(closureId)) {
    return res.status(400).json({ message: 'Invalid Closure ID' });
  }

  try {
    const closure = await EmergencyClosure.findById(closureId);
    if (!closure) {
      return res.status(404).json({ message: 'Closure record not found' });
    }

    if (closure.status === 'REOPENED') {
      return res.status(400).json({ message: 'Center/Country is already reopened' });
    }

    closure.status = 'REOPENED';
    await closure.save();

    let slotQuery = {
      date: { $gte: closure.startDate, $lte: closure.endDate }
    };

    if (closure.centerId) {
      slotQuery.centerId = closure.centerId;
    } else {
      const centers = await Center.find({ countryCode: closure.countryCode });
      slotQuery.centerId = { $in: centers.map(c => c._id) };
    }

    if (closure.startTime && closure.endTime) {
      slotQuery.startTime = { $gte: closure.startTime };
      slotQuery.endTime = { $lte: closure.endTime };
    }

    const slots = await Slot.find(slotQuery);
    const slotIds = slots.map(s => s._id);

    await Slot.updateMany(
      { _id: { $in: slotIds } },
      { $set: { status: 'AVAILABLE' } }
    );

    const logEntityId = closure.centerId ? closure.centerId : null;
    await logAuditAction(req, 'REOPEN_CENTER', 'Center', logEntityId, null, { countryCode: closure.countryCode, centerId: closure.centerId, startDate: closure.startDate, endDate: closure.endDate });

    // Broadcast updates to Socket.io
    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocks = await SlotLock.find({
        slotId: { $in: slotIds },
        expiresAt: { $gt: new Date() }
      });
      const locksMap = {};
      activeLocks.forEach(lock => {
        const key = lock.slotId.toString();
        locksMap[key] = (locksMap[key] || 0) + 1;
      });

      slots.forEach(slot => {
        const lockedCount = locksMap[slot._id.toString()] || 0;
        global.io.emit('slot-update', {
          slotId: slot._id,
          bookedCount: slot.bookedCount,
          lockedCount,
          capacity: slot.capacity,
          status: 'AVAILABLE'
        });
      });
    }

    res.json({ message: 'Center reopened successfully and slot schedules restored.', closure });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all emergency closures
router.get('/emergency-closures', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  try {
    const closures = await EmergencyClosure.find().populate('centerId', 'name city countryName countryCode countryFlag').sort({ createdAt: -1 });

    // Add country name and flag fallback for country-wide closures
    const { GOING_TO_COUNTRIES } = require('../config/masterData');
    const countryMap = {};
    GOING_TO_COUNTRIES.forEach(c => {
      countryMap[c.code] = c;
    });

    const populatedClosures = closures.map(closure => {
      const plain = closure.toObject();
      const country = countryMap[plain.countryCode];
      plain.countryName = country ? country.name : plain.countryCode;
      plain.countryFlag = country ? country.flag : '🏳️';
      return plain;
    });

    res.json(populatedClosures);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get blocking & emergency dashboard metrics (Admin/Supervisor only)
router.get('/blocking-stats', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR'), async (req, res) => {
  try {
    const totalBlocked = await Slot.countDocuments({ status: 'BLOCKED' });
    const vipBlocked = await SlotBlock.countDocuments({ reason: 'VIP', active: true });
    const diplomaticBlocked = await SlotBlock.countDocuments({ reason: 'DIPLOMATIC', active: true });
    const activeClosures = await EmergencyClosure.countDocuments({ status: 'ACTIVE' });
    const refundPendingAppts = await Appointment.countDocuments({ status: 'REFUND_PENDING' });
    const rescheduleRequiredAppts = await Appointment.countDocuments({ status: 'RESCHEDULE_REQUIRED' });

    res.json({
      totalBlocked,
      vipBlocked,
      diplomaticBlocked,
      activeClosures,
      refundPendingAppts,
      rescheduleRequiredAppts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /free-applications - Retrieve appointments pending free application verification
router.get('/free-applications', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
    const status = String(req.query.status || 'PENDING').toUpperCase();
    const allowedStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    const query = {
      freeApplicationVerificationStatus: allowedStatuses.includes(status) ? status : 'PENDING'
    };

    const total = await Appointment.countDocuments(query);
    const appointments = await Appointment.find(query)
      .populate('userId', 'agentId agencyName ownerName email mobile freeApplicationsAvailable freeApplicationsUsed')
      .populate('centerId', 'name city')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const Payment = require('../models/Payment');
    const payments = await Payment.find({ appointmentId: { $in: appointments.map(a => a._id) } }).sort({ createdAt: -1 }).lean();
    const paymentByAppointmentId = new Map();
    payments.forEach((payment) => {
      const key = String(payment.appointmentId);
      if (!paymentByAppointmentId.has(key)) paymentByAppointmentId.set(key, payment);
    });

    res.json({
      data: appointments.map((appointment) => ({
        appointment,
        payment: paymentByAppointmentId.get(String(appointment._id)) || null
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/free-applications/:id/approve', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id).populate('userId', 'agencyName ownerName email mobile');
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.freeApplicationVerificationStatus !== 'PENDING') {
      return res.status(400).json({ message: 'This free application request is not pending verification.' });
    }

    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({ appointmentId: appointment._id });
    if (Number(appointment.payableAmount || 0) > 0 && (!payment || payment.status !== 'SUCCESS')) {
      return res.status(400).json({ message: 'Balance payment must be approved before approving the free application credit.' });
    }

    const claimedAppointment = await Appointment.findOneAndUpdate(
      { _id: appointment._id, freeApplicationVerificationStatus: 'PENDING' },
      {
        $set: {
          freeApplicationVerificationStatus: 'APPROVED',
          freeApplicationVerifiedBy: req.user._id,
          freeApplicationVerifiedAt: new Date(),
          freeApplicationRejectionReason: ''
        }
      },
      { new: true }
    );

    if (!claimedAppointment) {
      return res.status(400).json({ message: 'This free application request has already been processed.' });
    }

    const creditUpdatedAgent = await Agent.findOneAndUpdate(
      {
        _id: claimedAppointment.userId,
        $expr: { $gt: ['$freeApplicationsAvailable', '$freeApplicationsUsed'] }
      },
      { $inc: { freeApplicationsUsed: 1 } },
      { new: true }
    );

    if (!creditUpdatedAgent) {
      await Appointment.updateOne(
        { _id: claimedAppointment._id, freeApplicationVerificationStatus: 'APPROVED' },
        { $set: { freeApplicationVerificationStatus: 'PENDING', freeApplicationVerifiedBy: null, freeApplicationVerifiedAt: null } }
      );
      return res.status(400).json({ message: 'Agent has no free application credits remaining. Reject this request or ask the agent to pay the full amount.' });
    }

    const slot = await Slot.findById(claimedAppointment.slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    claimedAppointment.status = 'BOOKED';
    claimedAppointment.paymentStatus = 'Paid';
    claimedAppointment.payableAmount = Number(claimedAppointment.payableAmount || 0);
    await claimedAppointment.save();

    const lockingService = require('../services/lockingService');
    await lockingService.releaseLock(claimedAppointment.slotId.toString(), claimedAppointment.userId.toString());

    slot.bookedCount += 1;
    await slot.save();

    await rewardService.handleBookingMilestone(claimedAppointment.userId, null);

    await logAuditAction(req, 'APPROVE_FREE_APPLICATION', 'Appointment', claimedAppointment._id,
      { freeApplicationVerificationStatus: 'PENDING' },
      {
        status: 'BOOKED',
        paymentStatus: 'Paid',
        freeApplicationVerificationStatus: 'APPROVED',
        freeApplicationDiscountAmount: claimedAppointment.freeApplicationDiscountAmount,
        payableAmount: claimedAppointment.payableAmount
      }
    );

    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocksCount = await SlotLock.countDocuments({
        slotId: slot._id,
        expiresAt: { $gt: new Date() }
      });
      global.io.emit('slot-update', {
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount: activeLocksCount,
        capacity: slot.capacity
      });
    }

    res.json({ message: 'Free application credit approved and appointment confirmed.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/free-applications/:id/reject', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ message: 'Rejection reason is required.' });
  }

  try {
    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, freeApplicationVerificationStatus: 'PENDING' },
      {
        $set: {
          status: 'Payment Rejected',
          paymentStatus: 'Payment Rejected',
          freeApplicationRequested: false,
          freeApplicationDiscountAmount: 0,
          freeApplicationVerificationStatus: 'REJECTED',
          freeApplicationVerifiedBy: req.user._id,
          freeApplicationVerifiedAt: new Date(),
          freeApplicationRejectionReason: reason
        }
      },
      { new: true }
    );

    if (!appointment) {
      return res.status(400).json({ message: 'This free application request is not pending verification.' });
    }

    appointment.payableAmount = appointment.totalAmount;
    await appointment.save();

    const SlotLock = require('../models/SlotLock');
    const Payment = require('../models/Payment');
    await Payment.updateMany(
      { appointmentId: appointment._id, status: { $in: ['PENDING_VERIFICATION', 'SUCCESS'] } },
      { $set: { status: 'REJECTED' } }
    );

    await SlotLock.findOneAndUpdate(
      { slotId: appointment.slotId, userId: appointment.userId },
      { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    );

    await logAuditAction(req, 'REJECT_FREE_APPLICATION', 'Appointment', appointment._id,
      { freeApplicationVerificationStatus: 'PENDING' },
      {
        status: appointment.status,
        paymentStatus: appointment.paymentStatus,
        payableAmount: appointment.payableAmount,
        freeApplicationVerificationStatus: appointment.freeApplicationVerificationStatus,
        freeApplicationRejectionReason: reason
      }
    );

    res.json({ message: 'Free application credit rejected. Agent must pay the full booking amount to confirm this appointment.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /payments-verification - Retrieve appointments pending manual UPI verification
router.get('/payments-verification', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR'), async (req, res) => {
  try {
    // Server-side pagination
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));

    // Payment is the source of truth for this queue. Requiring both appointment
    // status fields to contain one exact legacy label caused valid agent
    // submissions to disappear when either field was migrated or updated first.
    const pendingAppointmentIds = await Payment.distinct('appointmentId', {
      status: 'PENDING_VERIFICATION'
    });
    const query = { _id: { $in: pendingAppointmentIds } };
    const total = await Appointment.countDocuments(query);
    const appointments = await Appointment.find(query)
      .populate('userId', 'agentId agencyName ownerName name email mobile')
      .populate('centerId', 'name city')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const payments = await Payment.find({
      appointmentId: { $in: appointments.map(a => a._id) },
      status: 'PENDING_VERIFICATION'
    }).sort({ createdAt: -1 }).lean();
    const paymentByAppointmentId = new Map();
    payments.forEach((payment) => {
      const key = String(payment.appointmentId);
      if (!paymentByAppointmentId.has(key)) paymentByAppointmentId.set(key, payment);
    });

    const submissionsByHash = await buildSubmittedBeforeScreenshotHashSet();
    const result = appointments.map((appt) => {
      const payment = paymentByAppointmentId.get(String(appt._id)) || null;
      const verificationReview = payment
        ? buildPaymentProofRiskReview({
          transactionId: payment.transactionId,
          screenshot: payment.screenshot,
          duplicateScreenshotFound: wasScreenshotHashSubmittedBefore(submissionsByHash, 'appointmentPayment', payment),
        })
        : null;

      return {
        appointment: appt,
        payment: payment ? { ...payment, verificationReview } : null,
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;
    res.json({ data: result, total, page, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /payments-verification/:id/approve - Approve UPI payment, confirm appointment, generate PDF, and send confirmation email
router.post('/payments-verification/:id/approve', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id).populate('userId', 'name email mobile');
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const payment = await Payment.findOne({
      appointmentId: appointment._id,
      status: 'PENDING_VERIFICATION'
    }).sort({ createdAt: -1 });
    if (!payment) {
      return res.status(400).json({ message: 'This appointment is not pending verification.' });
    }

    const slot = await Slot.findById(appointment.slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const center = await Center.findById(appointment.centerId);

    payment.status = 'SUCCESS';
    await payment.save();

    if (appointment.freeApplicationVerificationStatus === 'PENDING') {
      appointment.paymentStatus = 'Paid';
      appointment.payableAmount = payment ? payment.amount : appointment.payableAmount;
      await appointment.save();

      await logAuditAction(req, 'VERIFY_PAYMENT_SUCCESS', 'Appointment', appointment._id,
        { status: 'Pending Verification', paymentStatus: 'Pending Verification' },
        {
          status: appointment.status,
          paymentStatus: appointment.paymentStatus,
          freeApplicationVerificationStatus: appointment.freeApplicationVerificationStatus,
          payableAmount: appointment.payableAmount
        }
      );

      return res.json({ message: 'Balance payment approved. Free application verification is still pending.' });
    }

    // Set appointment status to BOOKED and paymentStatus to Paid
    appointment.status = 'BOOKED';
    appointment.paymentStatus = 'Paid';
    await appointment.save();

    // Release slot lock (decrements lockedCount, updates availableCount)
    const lockingService = require('../services/lockingService');
    await lockingService.releaseLock(appointment.slotId.toString(), appointment.userId._id.toString());

    // Increment bookedCount
    slot.bookedCount += 1;
    await slot.save();

    // Award milestone reward for paid booking completion
    await rewardService.handleBookingMilestone(appointment.userId._id, null);

    // Log admin action
    await logAuditAction(req, 'VERIFY_PAYMENT_SUCCESS', 'Appointment', appointment._id,
      { status: 'Pending Verification', paymentStatus: 'Pending Verification' },
      { status: 'BOOKED', paymentStatus: 'Paid' }
    );

    await AgentNotification.create({
      agentId: appointment.userId._id,
      title: 'Appointment Payment Approved',
      message: `Payment approved for appointment ${appointment.referenceNumber}. The appointment is now confirmed.`,
      type: 'BOOKING_PAYMENT_APPROVED',
      priority: 'HIGH',
      metadata: {
        appointmentId: appointment._id,
        referenceNumber: appointment.referenceNumber,
        status: appointment.status,
        paymentStatus: appointment.paymentStatus
      }
    });

    // Broadcast updated slot counts
    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocksCount = await SlotLock.countDocuments({
        slotId: slot._id,
        expiresAt: { $gt: new Date() }
      });
      global.io.emit('slot-update', {
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount: activeLocksCount,
        capacity: slot.capacity
      });
    }

    // Generate PDF Confirmation Buffer
    const pdfService = require('../services/pdfService');
    const pdfBuffer = await pdfService.generateConfirmationPDF(appointment, payment, slot, center);
    let confirmationEmailSent = false;

    const applicantEmail = appointment.applicantDetails && appointment.applicantDetails[0]
      ? appointment.applicantDetails[0].email
      : appointment.userId.email;

    const userEmail = appointment.userId ? appointment.userId.email : '';
    const recipients = [applicantEmail];
    if (userEmail && userEmail !== applicantEmail) {
      recipients.push(userEmail);
    }
    console.log('[admin route approve payment] Email recipients:', {
      appointmentId: appointment._id?.toString(),
      referenceNumber: appointment.referenceNumber,
      applicantEmail,
      userEmail,
      recipients,
    });
    console.log('[admin route approve payment] Confirmation PDF attachment size:', {
      appointmentId: appointment._id?.toString(),
      referenceNumber: appointment.referenceNumber,
      bytes: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : null,
      isBuffer: Buffer.isBuffer(pdfBuffer),
    });

    // const mailOptions = {
    //   to: recipients.join(', '),
    //   subject: 'Appointment Confirmation Letter',
    //   html: `
    //     <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
    //       <h2 style="color: #0c2340; border-bottom: 2px solid #dfa015; padding-bottom: 15px; margin-top: 0;">Appointment Confirmed</h2>
    //       <p style="font-size: 15px; line-height: 1.5; color: #334155;">Dear Applicant,</p>
    //       <p style="font-size: 15px; line-height: 1.5; color: #334155;">
    //         We are pleased to inform you that your UPI payment for appointment reference <strong>${appointment.referenceNumber}</strong> has been verified successfully.
    //       </p>

    //       <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0;">
    //         <h3 style="margin-top: 0; color: #0c2340; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Appointment Details Summary</h3>
    //         <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
    //           <tr>
    //             <td style="padding: 6px 0; font-weight: bold; width: 35%;">Reference Number:</td>
    //             <td style="padding: 6px 0; color: #e67e22; font-weight: bold;">${appointment.referenceNumber}</td>
    //           </tr>
    //           <tr>
    //             <td style="padding: 6px 0; font-weight: bold;">Application Centre:</td>
    //             <td style="padding: 6px 0; font-weight: bold;">${center ? center.name : 'Visa Application Centre'}</td>
    //           </tr>
    //           <tr>
    //             <td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Centre Address:</td>
    //             <td style="padding: 6px 0; line-height: 1.4;">${center && center.address ? center.address : 'N/A'}</td>
    //           </tr>
    //           <tr>
    //             <td style="padding: 6px 0; font-weight: bold;">Appointment Date:</td>
    //             <td style="padding: 6px 0;">${new Date(appointment.bookingDate).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
    //           </tr>
    //           <tr>
    //             <td style="padding: 6px 0; font-weight: bold;">Appointment Time:</td>
    //             <td style="padding: 6px 0; font-weight: bold;">${appointment.bookingTime}</td>
    //           </tr>
    //         </table>
    //       </div>

    //       <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0;">
    //         <h3 style="margin-top: 0; color: #0c2340; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Selected Services & Pricing Summary</h3>
    //         <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155; margin-bottom: 10px;">
    //           <thead>
    //             <tr style="border-bottom: 1px solid #cbd5e1;">
    //               <th style="text-align: left; padding: 6px 0; font-weight: bold;">Service Name</th>
    //               <th style="text-align: right; padding: 6px 0; font-weight: bold;">Price</th>
    //             </tr>
    //           </thead>
    //           <tbody>
    //             ${appointment.servicesSelected && appointment.servicesSelected.length > 0 ? 
    //               appointment.servicesSelected.map(s => `
    //                 <tr style="border-bottom: 1px solid #f1f5f9;">
    //                   <td style="padding: 6px 0;">${s.name}</td>
    //                   <td style="padding: 6px 0; text-align: right; font-weight: bold;">INR ${s.price.toFixed(2)}</td>
    //                 </tr>
    //               `).join('') : `
    //                 <tr>
    //                   <td style="padding: 6px 0; color: #64748b; font-style: italic;">No additional services selected</td>
    //                   <td style="padding: 6px 0; text-align: right; font-weight: bold;">INR 0.00</td>
    //                 </tr>
    //               `
    //             }
    //           </tbody>
    //         </table>

    //         <div style="border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 13.5px; color: #334155;">
    //           <table style="width: 100%; border-collapse: collapse;">
    //             <tr>
    //               <td style="padding: 3px 0;">Services Subtotal:</td>
    //               <td style="padding: 3px 0; text-align: right; font-weight: bold;">INR ${(appointment.selectedServicesTotal || 0).toFixed(2)}</td>
    //             </tr>
    //             <tr>
    //               <td style="padding: 3px 0;">Appointment Fee:</td>
    //               <td style="padding: 3px 0; text-align: right; font-weight: bold;">INR ${(appointment.appointmentFee || 0).toFixed(2)}</td>
    //             </tr>
    //             <tr style="font-size: 15px; color: #0c2340; font-weight: bold; border-top: 1.5px solid #0c2340;">
    //               <td style="padding: 8px 0 0 0;">Grand Total:</td>
    //               <td style="padding: 8px 0 0 0; text-align: right; color: #e67e22;">INR ${(appointment.totalAmount || 0).toFixed(2)}</td>
    //             </tr>
    //           </table>
    //         </div>
    //       </div>

    //       <p style="font-size: 15px; line-height: 1.5; color: #334155;">
    //         Your biometric appointment is now confirmed. Please find your official <strong>Appointment Confirmation Letter</strong> attached as a PDF to this email.
    //       </p>
    //       <p style="font-size: 15px; line-height: 1.5; color: #334155;">
    //         Thank you for choosing Dream Catcher Immigrations.
    //       </p>
    //       <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
    //       <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
    //         This is an automated email from Dream Catcher Immigrations. Please do not reply directly to this message.
    //       </p>
    //     </div>
    //   `,
    //   attachments: [
    //     {
    //       filename: `Appointment_Confirmation_${appointment.referenceNumber}.pdf`,
    //       content: pdfBuffer
    //     }
    //   ]
    // };

    const primaryApplicant = appointment.applicantDetails && appointment.applicantDetails[0]
      ? appointment.applicantDetails[0]
      : null;
    const countryName = center && center.countryName ? center.countryName : 'Portugal';
    const centerCity = center && center.city ? center.city : 'New Delhi';
    const portalName = 'Dream Catcher Immigrations B2B Visa Booking Portal';
    const centerDisplayName = (center && center.name ? center.name : `${centerCity} Visa Application Centre`)
      .replace(/\bVFS(?:\s+Global)?\b/gi, portalName);
    const applicantName = primaryApplicant
      ? `${primaryApplicant.firstName || ''} ${primaryApplicant.lastName || ''}`.trim().toUpperCase()
      : 'CUSTOMER';
    const passportNumber = primaryApplicant && primaryApplicant.passportNumber
      ? primaryApplicant.passportNumber.toUpperCase()
      : 'N/A';
    const visaCategory = primaryApplicant && primaryApplicant.visaCategory
      ? primaryApplicant.visaCategory
      : 'Standard';
    const appointmentDateText = 'To Be Scheduled';

    const mailOptions = {
      to: recipients,
      subject: APPOINTMENT_CONFIRMATION_SUBJECT,
      html: `
        <div style="font-family: Georgia, 'Times New Roman', serif; color: #000; max-width: 760px; margin: 0 auto; padding: 24px 18px; font-size: 18px; line-height: 1.08;">
          <p style="margin: 0 0 28px 0;">Dear Customer,</p>

          <p style="margin: 0 0 18px 0;">Greetings from the ${portalName} ${countryName} Visa Helpdesk.</p>

          <p style="margin: 0 0 18px 0;">
            We would like to inform you that as per the update received from our dedicated team, your appointment has been scheduled at <strong>${centerDisplayName}</strong> as per the below mentioned details:
          </p>

          <p style="margin: 0 0 16px 0;">Kindly refer the below details:</p>

          <p style="margin: 0;">
            Name: ${applicantName}<br/>
            Passport no: ${passportNumber}<br/>
            Appointment date: ${appointmentDateText}<br/>
            Visa Category: ${visaCategory}
          </p>

          <p style="margin: 24px 0 14px 0;">The customer needs to carry the below -mentioned documents at the time of submission:</p>
          <ul style="margin: 0 0 18px 56px; padding: 0;">
            <li style="padding-left: 8px;">Documents as per the checklist mentioned on our website</li>
            <li style="padding-left: 8px;">Printout of this email as an appointment confirmation</li>
          </ul>

          <p style="margin: 0 0 22px 0;">We value your time and patience.</p>

          <p style="margin: 0 0 18px 0;">
            Important Announcement - ${portalName} offers a wide array of value-added services like Premium Lounge, SMS, Courier, Photocopy &amp; Photo Booth Facility. Please speak to your Customer Support Agent for more details from Monday to Friday between 8 AM till 5 PM. Please note that the use of value-added services will not facilitate or provide priority for your visa application process at the visa application centre.
          </p>

          <p style="margin: 0 0 18px 0;">
            Note: We would request you to visit on the above mentioned date and time as the appointment reschedule facility is not applicable in this case.
          </p>

          <p style="margin: 0 0 18px 0;">
            In case of further assistance, please feel free to contact us at 022-67866077, Timings: 08:00-17:00, or write to us at <a href="mailto:infonorth.ptin@vishelpline.com" style="color: #2f6f73; text-decoration: underline;">infonorth.ptin@vishelpline.com</a>
          </p>

          <p style="margin: 0 0 18px 0;">For any complaints, suggestions or feedback, please contact our support team.</p>

          <p style="margin: 0 0 18px 0;">Best Regards,</p>
          <p style="margin: 0 0 22px 0;">${countryName} Visa Help Desk</p>

          <p style="margin: 0;">${portalName}<br/>B2B Visa Booking Services</p>

          <p style="margin: 22px 0 0 0;">${countryName} Visa Helpline: 022 67866077 | <a href="mailto:infonorth.ptin@vishelpline.com" style="color: #2f6f73; text-decoration: underline;">infonorth.ptin@vishelpline.com</a></p>
        </div>
      `,
      attachments: [
        {
          filename: `Appointment_Confirmation_${appointment.referenceNumber}.pdf`,
          content: pdfBuffer
        }
      ]
    };
    mailOptions.html = buildAppointmentConfirmationHtml({ appointment, center });

    try {
      await mailService.sendMail(mailOptions, APPOINTMENT_CONFIRMATION_SENDER_NAME);
      confirmationEmailSent = true;
    } catch (mailError) {
      console.error('[admin route approve payment] Confirmation email delivery failed:', {
        referenceNumber: appointment.referenceNumber,
        appointmentId: appointment._id?.toString(),
        recipients,
        message: mailError.message,
        details: mailError.details || mailError,
      });
    }

    res.json({
      message: confirmationEmailSent
        ? 'Payment approved and confirmation email sent.'
        : 'Payment approved. Email delivery could not be confirmed.',
      emailSent: confirmationEmailSent,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /payments-verification/:id/reject - Reject UPI payment, release slot capacity, and notify applicant
router.post('/payments-verification/:id/reject', protect, authorize('SUPER_ADMIN', 'CENTER_MANAGER'), async (req, res) => {
  const { reason } = req.body;
  const displayReason = reason || 'The transaction reference number or payment screenshot provided could not be verified with our bank records.';

  try {
    const appointment = await Appointment.findById(req.params.id).populate('userId', 'name email mobile');
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({
      appointmentId: appointment._id,
      status: 'PENDING_VERIFICATION'
    }).sort({ createdAt: -1 });
    if (!payment) {
      return res.status(400).json({ message: 'This appointment is not pending verification.' });
    }

    const slot = await Slot.findById(appointment.slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    payment.status = 'REJECTED';
    await payment.save();

    // Set appointment status to Payment Rejected
    appointment.status = 'Payment Rejected';
    appointment.paymentStatus = 'Payment Rejected';
    await appointment.save();

    // Release lock (decrements lockedCount, updates availableCount)
    const lockingService = require('../services/lockingService');
    await lockingService.releaseLock(appointment.slotId.toString(), appointment.userId._id.toString());

    // Log admin action
    await logAuditAction(req, 'VERIFY_PAYMENT_REJECT', 'Appointment', appointment._id,
      { status: 'Pending Verification', paymentStatus: 'Pending Verification' },
      { status: 'Payment Rejected', paymentStatus: 'Payment Rejected' }
    );

    await AgentNotification.create({
      agentId: appointment.userId._id,
      title: 'Appointment Payment Rejected',
      message: `Payment rejected for appointment ${appointment.referenceNumber}. Reason: ${displayReason}`,
      type: 'BOOKING_PAYMENT_REJECTED',
      priority: 'HIGH',
      metadata: {
        appointmentId: appointment._id,
        referenceNumber: appointment.referenceNumber,
        status: appointment.status,
        paymentStatus: appointment.paymentStatus,
        reason: displayReason
      }
    });

    // Broadcast updated slot counts
    if (global.io) {
      const SlotLock = require('../models/SlotLock');
      const activeLocksCount = await SlotLock.countDocuments({
        slotId: slot._id,
        expiresAt: { $gt: new Date() }
      });
      global.io.emit('slot-update', {
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount: activeLocksCount,
        capacity: slot.capacity
      });
    }

    const applicantEmail = appointment.applicantDetails && appointment.applicantDetails[0]
      ? appointment.applicantDetails[0].email
      : appointment.userId.email;

    const userEmail = appointment.userId ? appointment.userId.email : '';
    const recipients = [applicantEmail];
    if (userEmail && userEmail !== applicantEmail) {
      recipients.push(userEmail);
    }

    const mailOptions = {
      to: recipients.join(', '),
      subject: 'Payment Verification Unsuccessful – Dream Catcher Immigrations',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 15px; margin-top: 0;">Payment Verification Unsuccessful</h2>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">Dear Applicant,</p>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">
            We regret to inform you that your payment verification for appointment reference <strong>${appointment.referenceNumber}</strong> was unsuccessful.
          </p>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong style="display: block; font-size: 14px; color: #991b1b; margin-bottom: 5px;">Reason for Rejection:</strong>
            <span style="font-size: 13.5px; color: #7f1d1d; line-height: 1.5;">${displayReason}</span>
          </div>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">
            As a result, your slot has been released back to the general booking pool. You will need to book a new appointment and submit a valid payment.
          </p>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">
            If you believe this was an error, please contact our support team.
          </p>
          <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
            This is an automated email from Dream Catcher Immigrations. Please do not reply directly to this message.
          </p>
        </div>
      `
    };

    await mailService.sendMail(mailOptions, 'Dream Catcher Immigrations');

    res.json({ message: 'Appointment payment verification rejected and email notification sent.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================
// B2B SAAS AGENT & SUBSCRIPTION ENDPOINTS
// ==========================================

// Get all agent & subscription stats for Admin Dashboard
router.get('/b2b-stats', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  const { month } = req.query;

  try {
    const totalAgents = await Agent.countDocuments({ role: 'Agent' });
    const verifiedAgents = await Agent.countDocuments({ role: 'Agent', status: 'Verified' });
    const pendingAgents = await Agent.countDocuments({ role: 'Agent', status: 'Pending' });
    const blockedAgents = await Agent.countDocuments({ role: 'Agent', status: 'Blocked' });
    const activeAgents = await Agent.countDocuments({ role: 'Agent', status: 'Active' });
    const expiredAgents = await Agent.countDocuments({ role: 'Agent', status: { $in: ['Expired', 'Subscription Expired'] } });

    const Subscription = require('../models/Subscription');
    const subscribedAgents = await Subscription.distinct('agentId', { subscriptionStatus: 'Active', paymentStatus: 'Paid' });

    let startOfMonth;
    let endOfMonth;
    if (month) {
      startOfMonth = new Date(`${month}-01T00:00:00.000Z`);
      endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    } else {
      const now = new Date();
      startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const recentSubs = await Subscription.find({
      paymentStatus: 'Paid',
      paymentDate: { $gte: startOfMonth, $lt: endOfMonth }
    });

    let monthlyRevenue = 0;
    let gstCollected = 0;
    recentSubs.forEach(sub => {
      monthlyRevenue += sub.planAmount || 0;
      gstCollected += sub.gstAmount || 0;
    });

    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);
    const upcomingRenewalsCount = await Subscription.countDocuments({
      subscriptionStatus: 'Active',
      paymentStatus: 'Paid',
      expiryDate: { $gte: today, $lte: sevenDaysFromNow }
    });

    // Highest-performing agent aggregation for the selected month
    const topAgents = await Appointment.aggregate([
      {
        $match: {
          status: 'BOOKED',
          bookingDate: { $gte: startOfMonth, $lt: endOfMonth }
        }
      },
      {
        $group: {
          _id: '$userId',
          bookingCount: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { bookingCount: -1 } },
      { $limit: 1 }
    ]);

    let topPerformingAgent = null;
    if (topAgents.length > 0 && topAgents[0]._id) {
      const agentObj = await Agent.findById(topAgents[0]._id).select('agencyName ownerName email mobile agentId');
      if (agentObj) {
        topPerformingAgent = {
          agent: agentObj,
          bookingCount: topAgents[0].bookingCount,
          totalRevenue: topAgents[0].totalRevenue
        };
      }
    }

    res.json({
      totalAgents,
      verifiedAgents,
      pendingAgents,
      blockedAgents,
      activeAgents,
      expiredAgents,
      subscribedAgentsCount: subscribedAgents.length,
      monthlyRevenue,
      gstCollected,
      upcomingRenewalsCount,
      topPerformingAgent
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/settings/free-subscription-offer', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const settings = await PlatformSettings.getSettings();
    res.json({
      enabled: settings.freeSubscriptionOfferEnabled,
      slotLimit: settings.freeSubscriptionSlotLimit,
      claimedCount: settings.freeSubscriptionClaimedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/settings/free-subscription-offer', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'enabled')) {
      if (typeof req.body.enabled === 'boolean') {
        updates.freeSubscriptionOfferEnabled = req.body.enabled;
      } else if (req.body.enabled === 'true' || req.body.enabled === 'false') {
        updates.freeSubscriptionOfferEnabled = req.body.enabled === 'true';
      } else {
        return res.status(400).json({ message: 'Enabled must be true or false.' });
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'slotLimit')) {
      const slotLimit = Number(req.body.slotLimit);
      if (!Number.isInteger(slotLimit) || slotLimit < 0) {
        return res.status(400).json({ message: 'Slot limit must be a non-negative whole number.' });
      }
      updates.freeSubscriptionSlotLimit = slotLimit;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No settings were provided to update.' });
    }

    const settings = await PlatformSettings.getSettings();
    const oldValue = {
      enabled: settings.freeSubscriptionOfferEnabled,
      slotLimit: settings.freeSubscriptionSlotLimit,
      claimedCount: settings.freeSubscriptionClaimedCount
    };

    Object.assign(settings, updates);
    await settings.save();

    const newValue = {
      enabled: settings.freeSubscriptionOfferEnabled,
      slotLimit: settings.freeSubscriptionSlotLimit,
      claimedCount: settings.freeSubscriptionClaimedCount
    };

    await logAuditAction(req, 'UPDATE_FREE_SUBSCRIPTION_OFFER', 'PlatformSettings', settings._id, oldValue, newValue);

    res.json(newValue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/settings/free-subscription-slots', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    if (!requireSuperAdminController(req, res)) return;

    const settings = await PlatformSettings.getSettings();
    const slotLimit = Number(settings.adminFreeSubscriptionSlotLimit || 0);
    const grantedCount = Number(settings.adminFreeSubscriptionGrantedCount || 0);

    res.json({
      slotLimit,
      grantedCount,
      remaining: Math.max(0, slotLimit - grantedCount)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/settings/free-subscription-slots', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    if (!requireSuperAdminController(req, res)) return;

    const slotLimit = Number(req.body.slotLimit);
    if (!Number.isInteger(slotLimit) || slotLimit < 0) {
      return res.status(400).json({ message: 'Slot limit must be a non-negative whole number.' });
    }

    const settings = await PlatformSettings.getSettings();
    const grantedCount = Number(settings.adminFreeSubscriptionGrantedCount || 0);
    if (slotLimit < grantedCount) {
      return res.status(400).json({
        message: `Cannot set slot limit below the already-granted count (${grantedCount}).`
      });
    }

    const oldValue = {
      slotLimit: Number(settings.adminFreeSubscriptionSlotLimit || 0),
      grantedCount
    };
    settings.adminFreeSubscriptionSlotLimit = slotLimit;
    await settings.save();

    const newValue = {
      slotLimit: Number(settings.adminFreeSubscriptionSlotLimit || 0),
      grantedCount: Number(settings.adminFreeSubscriptionGrantedCount || 0)
    };

    await logAuditAction(req, 'UPDATE_FREE_SUBSCRIPTION_SLOT_LIMIT', 'PlatformSettings', settings._id, oldValue, newValue);

    res.json({
      slotLimit: newValue.slotLimit,
      grantedCount: newValue.grantedCount,
      remaining: Math.max(0, newValue.slotLimit - newValue.grantedCount)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post(
  '/agents/:id/grant-free-subscription',
  protect,
  authorize('SUPER_ADMIN'),
  adminFreeSubscriptionGrantLimiter,
  async (req, res) => {
    let claimedSettingsId = null;
    let createdSubscriptionId = null;

    try {
      if (!requireSuperAdminController(req, res)) return;

      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid agent id.' });
      }

      const agent = await Agent.findOne({ _id: req.params.id, role: 'Agent' });
      if (!agent) {
        return res.status(404).json({ message: 'Agent not found' });
      }

      if (agent.freeSubscriptionGrantedByAdmin === true) {
        return res.status(400).json({ message: 'This agent has already received an admin-granted free subscription.' });
      }

      const activeSubscription = await Subscription.findOne({
        agentId: agent._id,
        subscriptionStatus: 'Active',
        paymentStatus: 'Paid',
        source: { $ne: 'ADMIN_FREE_GRANT' }
      }).sort({ expiryDate: -1, createdAt: -1 });

      if (activeSubscription) {
        return res.status(400).json({ message: 'This agent already has an active subscription.' });
      }

      const currentSettings = await PlatformSettings.getSettings();
      const currentGrantedCount = Number(currentSettings.adminFreeSubscriptionGrantedCount || 0);
      const currentSlotLimit = Number(currentSettings.adminFreeSubscriptionSlotLimit || 0);

      if (currentGrantedCount >= currentSlotLimit) {
        return res.status(400).json({ message: 'No free subscription slots remaining.' });
      }

      const claimedSettings = await PlatformSettings.findOneAndUpdate(
        {
          _id: currentSettings._id,
          adminFreeSubscriptionGrantedCount: currentGrantedCount
        },
        { $inc: { adminFreeSubscriptionGrantedCount: 1 } },
        { new: true }
      );

      if (!claimedSettings) {
        return res.status(409).json({ message: 'Slot limit reached, please retry.' });
      }

      claimedSettingsId = claimedSettings._id;

      const subscriptionSettings = await getSubscriptionSettings();
      const today = new Date();
      const expiryDate = new Date(today);
      expiryDate.setDate(expiryDate.getDate() + subscriptionSettings.durationDays);

      const subscription = await Subscription.create({
        agentId: agent._id,
        planName: `${subscriptionSettings.planName} (Admin Grant)`,
        basePrice: subscriptionSettings.basePrice,
        gstPercent: subscriptionSettings.gstPercent,
        durationDays: subscriptionSettings.durationDays,
        planAmount: 0,
        gstAmount: 0,
        totalAmount: 0,
        discountApplied: false,
        discountAmount: 0,
        invoiceNumber: `ADMINFREE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        paymentStatus: 'Paid',
        subscriptionStatus: 'Active',
        paymentDate: today,
        startDate: today,
        expiryDate,
        renewalDate: expiryDate,
        source: 'ADMIN_FREE_GRANT',
        createdBy: req.user._id
      });
      createdSubscriptionId = subscription._id;

      const updatedAgent = await Agent.findOneAndUpdate(
        { _id: agent._id, freeSubscriptionGrantedByAdmin: { $ne: true } },
        {
          $set: {
            status: 'Active',
            freeSubscriptionGrantedByAdmin: true,
            freeSubscriptionGrantedAt: today,
            freeSubscriptionGrantedBy: req.user._id
          }
        },
        { new: true }
      ).select('-password');

      if (!updatedAgent) {
        await Subscription.deleteOne({ _id: createdSubscriptionId });
        await PlatformSettings.updateOne(
          { _id: claimedSettingsId, adminFreeSubscriptionGrantedCount: { $gt: 0 } },
          { $inc: { adminFreeSubscriptionGrantedCount: -1 } }
        );
        return res.status(400).json({ message: 'This agent has already received an admin-granted free subscription.' });
      }

      const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';
      await AgentActivity.create({
        agentId: updatedAgent._id,
        activity: 'ADMIN_GRANTED_FREE_SUBSCRIPTION',
        ipAddress,
        userAgent
      });

      await logAuditAction(
        req,
        'ADMIN_GRANTED_FREE_SUBSCRIPTION',
        'Agent',
        updatedAgent._id,
        { freeSubscriptionGrantedByAdmin: false },
        {
          freeSubscriptionGrantedByAdmin: true,
          subscriptionId: subscription._id,
          expiryDate,
          grantedCount: claimedSettings.adminFreeSubscriptionGrantedCount
        }
      );

      await AgentNotification.create({
        agentId: updatedAgent._id,
        title: 'Free Subscription Granted',
        message: 'You have been granted a free subscription by the admin!',
        type: 'ADMIN_FREE_SUBSCRIPTION_GRANTED',
        priority: 'HIGH',
        metadata: {
          subscriptionId: subscription._id,
          expiryDate
        }
      });

      res.status(201).json({
        message: 'Free subscription granted successfully.',
        agent: updatedAgent,
        subscription,
        slots: {
          slotLimit: Number(claimedSettings.adminFreeSubscriptionSlotLimit || 0),
          grantedCount: Number(claimedSettings.adminFreeSubscriptionGrantedCount || 0),
          remaining: Math.max(
            0,
            Number(claimedSettings.adminFreeSubscriptionSlotLimit || 0) -
            Number(claimedSettings.adminFreeSubscriptionGrantedCount || 0)
          )
        }
      });
    } catch (error) {
      if (claimedSettingsId) {
        try {
          if (createdSubscriptionId) {
            await Subscription.deleteOne({ _id: createdSubscriptionId });
          }
          await PlatformSettings.updateOne(
            { _id: claimedSettingsId, adminFreeSubscriptionGrantedCount: { $gt: 0 } },
            { $inc: { adminFreeSubscriptionGrantedCount: -1 } }
          );
        } catch (compensationError) {
          console.error('Failed to compensate admin free subscription grant:', compensationError);
        }
      }
      res.status(500).json({ message: error.message || 'Failed to grant free subscription.' });
    }
  }
);

// Approve Agent Profile
router.post('/agents/:id/approve', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const oldStatus = agent.status;
    const Subscription = require('../models/Subscription');
    const pendingSub = await Subscription.findOne({ agentId: agent._id, subscriptionStatus: 'Verification Pending' });
    const activeSub = await Subscription.findOne({ agentId: agent._id, subscriptionStatus: 'Active' });

    if (activeSub) {
      agent.status = 'Active';
    } else if (pendingSub) {
      agent.status = 'Verification Pending';
    } else {
      agent.status = 'Verified';
    }
    await agent.save();

    const AgentNotification = require('../models/AgentNotification');
    await AgentNotification.create({
      agentId: agent._id,
      title: 'Profile Approved',
      message: 'Your travel agency profile has been approved! You can now subscribe to start booking.',
      type: 'REGISTRATION_APPROVED'
    });

    await logAuditAction(req, 'APPROVE_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: 'Verified' });
    res.json({ message: 'Agent approved successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reject Agent Profile
router.post('/agents/:id/reject', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const oldStatus = agent.status;
    agent.status = 'Rejected';
    await agent.save();

    const AgentNotification = require('../models/AgentNotification');
    await AgentNotification.create({
      agentId: agent._id,
      title: 'Profile Rejected',
      message: 'Your travel agency profile was rejected. Please review details and resubmit.',
      type: 'REGISTRATION_REJECTED'
    });

    await logAuditAction(req, 'REJECT_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: 'Rejected' });
    res.json({ message: 'Agent rejected successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Block Agent
router.post('/agents/:id/block', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const oldStatus = agent.status;
    agent.status = 'Blocked';
    await agent.save();

    await logAuditAction(req, 'BLOCK_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: 'Blocked' });
    res.json({ message: 'Agent blocked successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Unblock Agent
router.post('/agents/:id/unblock', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const Subscription = require('../models/Subscription');
    const activeSub = await Subscription.findOne({ agentId: agent._id, subscriptionStatus: 'Active', paymentStatus: 'Paid' });
    const oldStatus = agent.status;
    agent.status = activeSub ? 'Active' : 'Verified';
    await agent.save();

    await logAuditAction(req, 'UNBLOCK_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: agent.status });
    res.json({ message: 'Agent unblocked successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update per-agent daily booking amount cap
router.patch('/agents/:id/daily-limit', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid agent id.' });
    }

    const dailyAmountLimit = Number(req.body.dailyAmountLimit);
    if (!Number.isFinite(dailyAmountLimit) || dailyAmountLimit <= 0) {
      return res.status(400).json({ message: 'Daily amount limit must be a positive number.' });
    }

    const agent = await Agent.findOne({ _id: req.params.id, role: 'Agent' });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const oldValue = { dailyAmountLimit: agent.dailyAmountLimit ?? 100000 };
    agent.dailyAmountLimit = dailyAmountLimit;
    await agent.save();

    await logAuditAction(req, 'UPDATE_AGENT_DAILY_LIMIT', 'Agent', agent._id, oldValue, { dailyAmountLimit });

    res.json({
      message: 'Daily booking amount limit updated successfully.',
      agent
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Grant Complimentary Subscription Days
router.post('/agents/:id/complimentary', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  const { days } = req.body;
  if (!days || isNaN(days)) return res.status(400).json({ message: 'Please provide valid days count.' });

  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const Subscription = require('../models/Subscription');
    let sub = await Subscription.findOne({ agentId: agent._id, paymentStatus: 'Paid' }).sort({ expiryDate: -1 });

    const today = new Date();
    let newExpiry;

    if (sub) {
      const baseDate = sub.expiryDate > today ? sub.expiryDate : today;
      newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + parseInt(days));
      sub.expiryDate = newExpiry;
      sub.renewalDate = newExpiry;
      sub.subscriptionStatus = 'Active';
      await sub.save();
    } else {
      newExpiry = new Date();
      newExpiry.setDate(today.getDate() + parseInt(days));
      const subscriptionSettings = await getSubscriptionSettings();
      sub = new Subscription({
        agentId: agent._id,
        planName: `${subscriptionSettings.planName} (Complimentary)`,
        basePrice: subscriptionSettings.basePrice,
        gstPercent: subscriptionSettings.gstPercent,
        durationDays: parseInt(days),
        planAmount: 0,
        gstAmount: 0,
        totalAmount: 0,
        invoiceNumber: 'COMP-' + Date.now(),
        paymentStatus: 'Paid',
        subscriptionStatus: 'Active',
        paymentDate: today,
        startDate: today,
        expiryDate: newExpiry,
        renewalDate: newExpiry,
        createdBy: req.user._id
      });
      await sub.save();
    }

    agent.status = 'Active';
    await agent.save();

    const AgentNotification = require('../models/AgentNotification');
    await AgentNotification.create({
      agentId: agent._id,
      title: 'Complimentary Days Granted',
      message: `Admin granted you ${days} complimentary subscription days. Valid until ${newExpiry.toLocaleDateString('en-GB')}.`,
      type: 'SUBSCRIPTION_ACTIVATED'
    });

    await logAuditAction(req, 'GRANT_COMPLIMENTARY_DAYS', 'Agent', agent._id, {}, { days, newExpiry });
    res.json({ message: `Granted ${days} complimentary days successfully.`, agent, subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel Subscription (Suspend/Cancel agent's billing cycle)
router.post('/agents/:id/cancel-subscription', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const Subscription = require('../models/Subscription');
    await Subscription.updateMany(
      { agentId: agent._id, subscriptionStatus: 'Active' },
      { subscriptionStatus: 'Cancelled' }
    );

    const oldStatus = agent.status;
    agent.status = 'Verified';
    await agent.save();

    const AgentNotification = require('../models/AgentNotification');
    await AgentNotification.create({
      agentId: agent._id,
      title: 'Subscription Cancelled',
      message: 'Your active monthly subscription has been suspended/cancelled by the administrator.',
      type: 'SUBSCRIPTION_CANCELLED'
    });

    await logAuditAction(req, 'CANCEL_SUBSCRIPTION', 'Agent', agent._id, { status: oldStatus }, { status: 'Verified' });
    res.json({ message: 'Subscription cancelled successfully.', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==========================================================
// ADMIN SUBSCRIPTION PAYMENT VERIFICATION ROUTES
// ==========================================================

// Get all Agent Subscription payment requests for verification
router.get('/subscription-payments', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const Subscription = require('../models/Subscription');
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10)));
    const search = (req.query.search || '').trim();
    const status = req.query.status || '';

    const query = { subscriptionStatus: { $in: ['Verification Pending', 'Active', 'Rejected'] } };
    if (status && status !== 'ALL') {
      query.subscriptionStatus = status;
    }
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ transactionId: re }, { invoiceNumber: re }, { 'agentId.ownerName': re }, { 'agentId.agencyName': re }, { 'agentId.email': re }];
    }

    // Count total matching
    const total = await Subscription.countDocuments(query);
    const list = await Subscription.find(query)
      .populate('agentId', 'agencyName ownerName email mobile agentId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const submissionsByHash = await buildSubmittedBeforeScreenshotHashSet();
    const data = list.map((item) => {
      const baseReview = buildSubscriptionVerificationReview(item);
      const riskReview = buildPaymentProofRiskReview({
        transactionId: item.normalizedTransactionId || item.transactionId,
        screenshot: item.screenshot,
        duplicateScreenshotFound: wasScreenshotHashSubmittedBefore(submissionsByHash, 'subscriptionPayment', item),
      });

      return {
        ...item,
        verificationReview: {
          ...baseReview,
          screenshotFileHash: riskReview.screenshotFileHash,
          flags: riskReview.flags,
          warnings: [...new Set([...(baseReview.warnings || []), ...riskReview.warnings])],
        }
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;
    res.json({ data, total, page, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Approve subscription payment request
router.post('/subscription-payments/:id/approve', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const Subscription = require('../models/Subscription');
    const Invoice = require('../models/Invoice');
    const RenewalHistory = require('../models/RenewalHistory');
    const AgentNotification = require('../models/AgentNotification');
    const pdfService = require('../services/pdfService');

    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Subscription request not found' });
    if (sub.subscriptionStatus === 'Active') {
      return res.status(400).json({ message: 'Subscription is already active.' });
    }
    if (sub.subscriptionStatus !== 'Verification Pending') {
      return res.status(400).json({ message: 'Only pending verification requests can be approved.' });
    }

    const approvalCheck = canApproveManualSubscription(sub);
    if (!approvalCheck.canApprove) {
      return res.status(400).json({
        message: `Cannot approve payment proof: ${approvalCheck.blockers.join(' ')}`,
        verificationReview: approvalCheck.review
      });
    }

    const agent = await Agent.findById(sub.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Calculate dates
    const previousPaidSub = await Subscription.findOne({
      agentId: sub.agentId,
      paymentStatus: 'Paid',
      _id: { $ne: sub._id }
    }).sort({ expiryDate: -1 });

    const today = new Date();
    let startDate = new Date();
    let previousExpiryDate = null;

    if (previousPaidSub && previousPaidSub.expiryDate > today) {
      previousExpiryDate = previousPaidSub.expiryDate;
      startDate = new Date(previousPaidSub.expiryDate);
    }

    const expiryDate = new Date(startDate);
    const durationDays = Number(sub.durationDays || DEFAULT_SUBSCRIPTION_SETTINGS.durationDays);
    expiryDate.setDate(expiryDate.getDate() + durationDays);

    const finalInvoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Update subscription details
    sub.paymentStatus = 'Paid';
    sub.subscriptionStatus = 'Active';
    sub.paymentDate = today;
    sub.startDate = startDate;
    sub.expiryDate = expiryDate;
    sub.renewalDate = expiryDate;
    sub.invoiceNumber = finalInvoiceNumber;
    await sub.save();

    // Create Payment Record
    const payment = new Payment({
      appointmentId: new mongoose.Types.ObjectId(), // Dummy ID
      amount: sub.totalAmount,
      transactionId: sub.transactionId,
      screenshot: sub.screenshot,
      gatewayResponse: { subscriptionId: sub._id, type: 'SubscriptionManualVerify' },
      status: 'SUCCESS'
    });
    await payment.save();

    // Save Renewal History
    if (previousExpiryDate) {
      await RenewalHistory.create({
        agentId: agent._id,
        subscriptionId: sub._id,
        previousExpiryDate,
        newExpiryDate: expiryDate
      });
    }

    // Update Agent status
    agent.status = 'Active';
    await agent.save();

    // Award referral reward once for the agent's first paid subscription
    if (!previousPaidSub) {
      await rewardService.handleReferralRewardOnFirstPaidSubscription(agent, null, true);
    }

    // Generate GST Invoice PDF
    let pdfBuffer;
    try {
      pdfBuffer = await pdfService.generateGSTInvoicePDF(agent, sub, payment);
      const invoice = new Invoice({
        invoiceNumber: finalInvoiceNumber,
        agentId: agent._id,
        subscriptionId: sub._id,
        pdfData: pdfBuffer.toString('base64')
      });
      await invoice.save();
    } catch (pdfErr) {
      console.error('Invoice PDF generation failed during verification:', pdfErr.message);
    }

    // Create Notification
    await AgentNotification.create({
      agentId: agent._id,
      title: 'Subscription Activated',
      message: `Your payment was verified. Your ${sub.planName} is active. Valid until ${expiryDate.toLocaleDateString('en-GB')}.`,
      type: 'SUBSCRIPTION_ACTIVATED'
    });

    // Audit logs
    await logAuditAction(req, 'APPROVE_SUBSCRIPTION_PAYMENT', 'Subscription', sub._id, { status: 'Verification Pending' }, { status: 'Active' });

    // Send confirmation email
    try {
      const mailOptions = {
        to: agent.email,
        subject: 'Visa Booking Portal - Subscription Activated',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0c2340; border-bottom: 2px solid #dfa015; padding-bottom: 10px;">Subscription Activated</h2>
            <p>Dear ${agent.ownerName},</p>
            <p>Your subscription payment has been verified. Your agency is now authorized to search slots and book visa appointments.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Invoice Number:</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${finalInvoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Expiry Date:</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${expiryDate.toLocaleDateString('en-GB')}</td>
              </tr>
            </table>
            <p>Your Tax Invoice PDF has been attached to this email.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 11px; color: #94a3b8; text-align: center;">This is an automated billing email. Please do not reply.</p>
          </div>
        `
      };

      if (pdfBuffer) {
        mailOptions.attachments = [{
          filename: `Invoice_${finalInvoiceNumber}.pdf`,
          content: pdfBuffer
        }];
      }

      await mailService.sendMail(mailOptions, 'Dream Catcher SaaS Billing');
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr.message);
    }

    res.json({ message: 'Subscription payment approved successfully.', subscription: sub });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reject subscription payment request
router.post('/subscription-payments/:id/reject', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  const { remarks } = req.body;
  if (!remarks || !remarks.trim()) {
    return res.status(400).json({ message: 'Please provide rejection remarks/reason.' });
  }

  try {
    const Subscription = require('../models/Subscription');
    const AgentNotification = require('../models/AgentNotification');
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Subscription request not found' });
    if (sub.subscriptionStatus === 'Active') {
      return res.status(400).json({ message: 'Cannot reject an already approved active subscription.' });
    }

    const agent = await Agent.findById(sub.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    // Update statuses
    sub.paymentStatus = 'Rejected';
    sub.subscriptionStatus = 'Rejected';
    sub.rejectionRemarks = remarks;
    await sub.save();

    // Reset Agent status back to Verified if they were in Verification Pending
    if (agent.status === 'Verification Pending') {
      agent.status = 'Verified';
      await agent.save();
    }

    // Create Notification
    await AgentNotification.create({
      agentId: agent._id,
      title: 'Payment Proof Rejected',
      message: `Your payment proof was rejected. Remarks: ${remarks}. Please upload a new proof.`,
      type: 'REGISTRATION_REJECTED'
    });

    // Audit logs
    await logAuditAction(req, 'REJECT_SUBSCRIPTION_PAYMENT', 'Subscription', sub._id, { status: 'Verification Pending' }, { status: 'Rejected', remarks });

    // Send email notice
    try {
      await mailService.sendMail({
        to: agent.email,
        subject: 'Visa Booking Portal - Subscription Payment Rejected',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 8px;">
            <h2 style="color: #b91c1c; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Payment Verification Failed</h2>
            <p>Dear ${agent.ownerName},</p>
            <p>We were unable to verify your subscription payment proof. Rejection Remarks:</p>
            <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; color: #991b1b; font-weight: bold; margin: 15px 0;">
              ${remarks}
            </div>
            <p>Please log in to your Agent Dashboard, review your payment credentials, and resubmit the payment proof screenshot.</p>
            <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 20px 0;" />
            <p style="font-size: 11px; color: #94a3b8; text-align: center;">This is an automated billing email. Please do not reply.</p>
          </div>
        `
      }, 'Dream Catcher SaaS Billing');
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr.message);
    }

    res.json({ message: 'Subscription payment rejected. Remarks saved.', subscription: sub });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- ADMIN NOTIFICATIONS ROUTE HANDLERS ---
const AdminNotification = require('../models/AdminNotification');

// Get all admin notifications with filters, search, and pagination
router.get('/notifications', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const { category, read, search, page = 1, limit = 10 } = req.query;
    const query = {};

    if (category && category !== 'All') {
      query.category = category;
    }

    if (read !== undefined && read !== 'All') {
      query.read = read === 'true';
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await AdminNotification.countDocuments(query);
    const notifications = await AdminNotification.find(query)
      .populate('userId', 'agencyName ownerName email mobile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      notifications,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const notification = await AdminNotification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark all notifications as read
router.post('/notifications/mark-all-read', protect, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    await AdminNotification.updateMany({ read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
