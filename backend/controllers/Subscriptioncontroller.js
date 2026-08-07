const Agent = require('../models/Agent');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const AgentNotification = require('../models/AgentNotification');
const AgentActivity = require('../models/AgentActivity');
const PlatformSettings = require('../models/PlatformSettings');
const rewardService = require('../services/rewardService');
const { validatePaymentProof } = require('../services/subscriptionPaymentSecurity');
const {
  getSubscriptionSettings,
  calculateSubscriptionPricing,
  buildSubscriptionSnapshot,
} = require('../services/subscriptionSettingsService');

function getRequestMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || ''
  };
}

async function submitProof(req, res, { activity, notificationTitle, notificationMessage, successMessage }) {
  const { transactionId, notes, paymentDateTime } = req.body;
  const agentId = req.user._id;
  const screenshot = req.file ? req.file.path : null; // Cloudinary URL

  try {
    const pendingSub = await Subscription.findOne({ agentId, subscriptionStatus: 'Verification Pending' });
    if (pendingSub) {
      return res.status(400).json({ message: 'You already have a subscription payment verification request pending review.' });
    }

    if (activity === 'SUBMIT_SUBSCRIPTION_PROOF') {
      const existingSubscription = await Subscription.exists({ agentId });
      if (!existingSubscription) {
        const [settings, subscriptionSettings] = await Promise.all([
          PlatformSettings.getSettings(),
          getSubscriptionSettings()
        ]);
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
            expiryDate.setDate(expiryDate.getDate() + subscriptionSettings.durationDays);

            const subscription = await Subscription.create({
              agentId,
              planName: `${subscriptionSettings.planName} (First Agent Free Offer)`,
              basePrice: subscriptionSettings.basePrice,
              gstPercent: subscriptionSettings.gstPercent,
              durationDays: subscriptionSettings.durationDays,
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
    const subscriptionSettings = await getSubscriptionSettings();
    const pricing = calculateSubscriptionPricing(subscriptionSettings, agentDiscountInfo?.discountEligible === true);
    const snapshot = buildSubscriptionSnapshot(subscriptionSettings, pricing);
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
      Object.assign(rejectedSub, snapshot);
      subscription = await rejectedSub.save();
    } else {
      const invoiceNumber = `REQ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      subscription = new Subscription({
        agentId,
        ...snapshot,
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
    const invoices = await Invoice.find({ agentId: req.user._id })
      .select('-pdfData')
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSettings = async (_req, res) => {
  try {
    const settings = await getSubscriptionSettings();
    const pricing = calculateSubscriptionPricing(settings, false);
    res.json({ ...settings, pricing });
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
    let status = req.user.status;
    if (activeSub) {
      const today = new Date();
      const diffTime = activeSub.expiryDate - today;
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      if (daysRemaining === 0 && activeSub.expiryDate <= today) {
        status = 'Expired';
      }
    }

    res.json({
      status,
      daysRemaining,
      activeSubscription: activeSub
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
