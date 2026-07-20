const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const AgentNotification = require('../models/AgentNotification');
const AgentActivity = require('../models/AgentActivity');
const PlatformSettings = require('../models/PlatformSettings');
const rewardService = require('../services/rewardService');
const Appointment = require('../models/Appointment');
const AuditLog = require('../models/AuditLog');
const { validatePaymentProof } = require('../services/subscriptionPaymentSecurity');

const { tryCatch } = require('bullmq');

// Single source of truth for plan pricing — must match the defaults in
// models/Subscription.js. Never accept planAmount/gstAmount/totalAmount from
// the client; always compute from this constant.
const PLAN_AMOUNT = 999;
const GST_RATE = 0.18;
const SUBSCRIPTION_CYCLE_DAYS = 28;
const GST_AMOUNT = +(PLAN_AMOUNT * GST_RATE).toFixed(2);
const TOTAL_AMOUNT = +(PLAN_AMOUNT + GST_AMOUNT).toFixed(2);

function getRequestMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || ''
  };
}

function calculateSubscriptionPricing(discountEligible) {
  const discountAmount = discountEligible ? +(PLAN_AMOUNT * 0.10).toFixed(2) : 0;
  const planAmount = +(PLAN_AMOUNT - discountAmount).toFixed(2);
  const gstAmount = +(planAmount * GST_RATE).toFixed(2);
  const totalAmount = +(planAmount + gstAmount).toFixed(2);

  return {
    planAmount,
    gstAmount,
    totalAmount,
    discountApplied: discountEligible,
    discountAmount,
  };
}

async function submitProof(req, res, { activity, notificationTitle, notificationMessage, successMessage }) {
  const { transactionId, screenshot, notes, paymentDateTime } = req.body;
  const agentId = req.user._id;

  try {
    const pendingSub = await Subscription.findOne({ agentId, subscriptionStatus: 'Verification Pending' });
    if (pendingSub) {
      return res.status(400).json({ message: 'You already have a subscription payment verification request pending review.' });
    }

    if (activity === 'SUBMIT_SUBSCRIPTION_PROOF') {
      const existingSubscription = await Subscription.exists({ agentId });
      if (!existingSubscription) {
        const settings = await PlatformSettings.getSettings();
        const offerAvailable =
          settings.freeSubscriptionOfferEnabled &&
          settings.freeSubscriptionClaimedCount < settings.freeSubscriptionSlotLimit;

        if (offerAvailable) {
          const claimed = await PlatformSettings.findOneAndUpdate(
            {
              freeSubscriptionOfferEnabled: true,
              $expr: { $lt: ['$freeSubscriptionClaimedCount', '$freeSubscriptionSlotLimit'] }
            },
            { $inc: { freeSubscriptionClaimedCount: 1 } },
            { new: true }
          );

          if (claimed) {
            const today = new Date();
            const expiryDate = new Date(today);
            expiryDate.setDate(expiryDate.getDate() + SUBSCRIPTION_CYCLE_DAYS);

            const subscription = await Subscription.create({
              agentId,
              planName: 'Professional Agent Plan (First Agent Free Offer)',
              planAmount: 0,
              gstAmount: 0,
              totalAmount: 0,
              discountApplied: false,
              discountAmount: 0,
              invoiceNumber: `FREE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
              paymentStatus: 'Paid',
              subscriptionStatus: 'Active',
              paymentDate: today,
              startDate: today,
              expiryDate,
              renewalDate: expiryDate,
              createdBy: agentId
            });

            const agent = await Agent.findById(agentId);
            if (agent) {
              agent.status = 'Active';
              await agent.save();
              await rewardService.handleReferralRewardOnFirstPaidSubscription(agent, null, true);
            }

            const { ipAddress, userAgent } = getRequestMeta(req);
            await AgentActivity.create({ agentId, activity: 'FREE_SUBSCRIPTION_CLAIMED', ipAddress, userAgent });

            await AgentNotification.create({
              agentId,
              title: 'Free Subscription Activated',
              message: '🎉 You got a FREE subscription as one of our first agents!',
              type: 'FREE_SUBSCRIPTION_CLAIMED'
            });

            return res.status(200).json({
              message: 'Your free subscription has been activated successfully.',
              subscription,
              offer: {
                enabled: claimed.freeSubscriptionOfferEnabled,
                slotLimit: claimed.freeSubscriptionSlotLimit,
                claimedCount: claimed.freeSubscriptionClaimedCount
              }
            });
          }
        }
      }
    }

    let subscription;
    const rejectedSub = await Subscription.findOne({ agentId, subscriptionStatus: 'Rejected' });
    const agentDiscountInfo = await Agent.findById(agentId).select('discountEligible').lean();
    const pricing = calculateSubscriptionPricing(agentDiscountInfo?.discountEligible === true);
    const proofCheck = validatePaymentProof({ transactionId, paymentDateTime, screenshot });
    if (proofCheck.errors.length) {
      return res.status(400).json({ message: proofCheck.errors.join(' ') });
    }

    const duplicateTx = await Subscription.findOne({
      $or: [
        { normalizedTransactionId: proofCheck.normalizedTransactionId },
        { transactionId: proofCheck.normalizedTransactionId }
      ],
      _id: rejectedSub ? { $ne: rejectedSub._id } : { $exists: true },
      subscriptionStatus: { $in: ['Active', 'Verification Pending', 'Rejected'] }
    });
    if (duplicateTx) {
      return res.status(400).json({ message: 'This UPI UTR / Transaction ID has already been submitted. Please verify the reference number.' });
    }

    if (rejectedSub) {
      rejectedSub.paymentStatus = 'Pending Verification';
      rejectedSub.subscriptionStatus = 'Verification Pending';
      rejectedSub.transactionId = proofCheck.normalizedTransactionId;
      rejectedSub.normalizedTransactionId = proofCheck.normalizedTransactionId;
      rejectedSub.screenshot = screenshot;
      rejectedSub.notes = notes || '';
      rejectedSub.paymentDateTime = paymentDateTime || '';
      rejectedSub.claimedPaymentAt = proofCheck.claimedPaymentAt;
      rejectedSub.paymentProofSubmittedAt = new Date();
      rejectedSub.expectedAmountSnapshot = pricing.totalAmount;
      rejectedSub.verificationWarnings = proofCheck.warnings;
      rejectedSub.rejectionRemarks = '';
      // Always re-stamp the current plan price on reuse, in case pricing
      // changed since this record was first created.
      rejectedSub.planAmount = pricing.planAmount;
      rejectedSub.gstAmount = pricing.gstAmount;
      rejectedSub.totalAmount = pricing.totalAmount;
      rejectedSub.discountApplied = pricing.discountApplied;
      rejectedSub.discountAmount = pricing.discountAmount;
      subscription = await rejectedSub.save();
    } else {
      const invoiceNumber = `REQ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      subscription = new Subscription({
        agentId,
        planName: 'Professional Agent Plan',
        planAmount: pricing.planAmount,
        gstAmount: pricing.gstAmount,
        totalAmount: pricing.totalAmount,
        discountApplied: pricing.discountApplied,
        discountAmount: pricing.discountAmount,
        invoiceNumber,
        paymentStatus: 'Pending Verification',
        subscriptionStatus: 'Verification Pending',
        transactionId: proofCheck.normalizedTransactionId,
        normalizedTransactionId: proofCheck.normalizedTransactionId,
        screenshot,
        notes: notes || '',
        paymentDateTime: paymentDateTime || '',
        claimedPaymentAt: proofCheck.claimedPaymentAt,
        paymentProofSubmittedAt: new Date(),
        expectedAmountSnapshot: pricing.totalAmount,
        verificationWarnings: proofCheck.warnings,
        createdBy: agentId
      });
      await subscription.save();
    }

    if (pricing.discountApplied) {
      await Agent.findOneAndUpdate(
        { _id: agentId, discountEligible: true },
        { $set: { discountEligible: false } }
      );
    }

    const agent = await Agent.findById(agentId);
    if (agent && agent.status !== 'Active') {
      agent.status = 'Verification Pending';
      await agent.save();
    }

    const { ipAddress, userAgent } = getRequestMeta(req);
    await AgentActivity.create({ agentId, activity, ipAddress, userAgent });

    await AgentNotification.create({
      agentId,
      title: notificationTitle,
      message: notificationMessage,
      type: 'SUBSCRIPTION_EXPIRING'
    });

    res.status(200).json({ message: successMessage, subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Purchase Monthly Subscription (Simulated payment / UPI screenshot)
exports.purchase = (req, res) =>
  submitProof(req, res, {
    activity: 'SUBMIT_SUBSCRIPTION_PROOF',
    notificationTitle: 'Payment Proof Submitted',
    notificationMessage:
      'Your subscription payment verification request has been submitted. Booking features will unlock upon approval.',
    successMessage: 'Payment proof submitted successfully! Awaiting administrator verification.'
  });

// Renew Subscription Request (Simulated UPI proof - manual verification)
exports.renew = (req, res) =>
  submitProof(req, res, {
    activity: 'SUBMIT_RENEWAL_PROOF',
    notificationTitle: 'Renewal Proof Submitted',
    notificationMessage: 'Your subscription renewal payment proof has been submitted and is pending verification.',
    successMessage: 'Renewal payment proof submitted successfully! Awaiting administrator verification.'
  });

// Get Subscription & Invoice History for Agent
exports.getHistory = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ agentId: req.user._id }).sort({ createdAt: -1 });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Invoices for Agent
exports.getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ agentId: req.user._id }).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Download Invoice PDF
exports.downloadInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.agentId.toString() !== req.user._id.toString() && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Unauthorized access to invoice.' });
    }

    if (!invoice.pdfData) {
      return res.status(400).json({ message: 'Invoice PDF not generated for this billing cycle.' });
    }

    const pdfBuffer = Buffer.from(invoice.pdfData, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice_${invoice.invoiceNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Agent Notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await AgentNotification.find({ agentId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark Notification as Read
exports.markNotificationRead = async (req, res) => {
  try {
    const notification = await AgentNotification.findOneAndUpdate(
      { _id: req.params.id, agentId: req.user._id },
      { read: true },
      { new: true }
    );
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get active subscription statistics for dashboard widget
exports.getStats = async (req, res) => {
  try {
    const activeSub = await Subscription.findOne({
      agentId: req.user._id,
      subscriptionStatus: 'Active',
      paymentStatus: 'Paid'
    }).sort({ expiryDate: -1 });

    let daysRemaining = 0;
    if (activeSub) {
      const today = new Date();
      const diffTime = activeSub.expiryDate - today;
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    res.json({
      status: req.user.status,
      daysRemaining,
      activeSubscription: activeSub
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteagents = async (req, res) => {
  try {
    const agentId = req.params.id;
    if (!mongoose.types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ message: 'Invalid agent ID' });
    }

    const agent = await Agent.findById(agentId).maxTimeMS(5000); // Set a max time limit for the query  
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Prevent deleting agents with active/booked appointments (data integrity)
    const activeAppointmentsCount = await Appointment.countDocuments({
      userId: agentId,
      status: { $in: ['Locked', 'BOOKED', 'Pending Verification'] }
    }).maxTimeMS(5000);

    if (activeAppointmentsCount > 0) {
      return res.status(400).json({ message: `Cannot delete agent. They have ${activeAppointmentsCount} active/booked appointment(s). Cancel or resolve them first.` });
    }

    // Soft delete: after for production, preserves audit trial and historical data
    agent.status = 'Deleted'
    agent.deletedAt = new Date(),
      agent.deletedBy = req.user._id;
    await agent.save();

    await AuditLog.create({
      action: 'DELETE_AGENT',
      performedBy: req.user._id,
      userId: req.user._id,
      entityType: 'Agent',
      entityId: agent._id.toString(),
      oldValue: { status: 'Active', email: agent.email, agencyName: agent.agencyName },
      newValue: { status: 'Deleted' },
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Delete agent error:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}