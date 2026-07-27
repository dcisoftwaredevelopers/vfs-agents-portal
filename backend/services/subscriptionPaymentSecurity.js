const MAX_PAYMENT_AGE_DAYS = 7;
const FUTURE_GRACE_MINUTES = 10;
const TRANSACTION_ID_PATTERN = /^[A-Z0-9]{8,35}$/;
const UPI_REFERENCE_NUMBER_PATTERN = /^\d{12}$/;
const crypto = require('crypto');

function normalizeTransactionId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function parsePaymentDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validatePaymentProof({ transactionId, paymentDateTime, screenshot }) {
  const errors = [];
  const warnings = [];
  const normalizedTransactionId = normalizeTransactionId(transactionId);
  const claimedPaymentAt = parsePaymentDateTime(paymentDateTime);
  const now = new Date();

  if (!TRANSACTION_ID_PATTERN.test(normalizedTransactionId)) {
    errors.push('Enter a valid UPI UTR / Transaction ID with 8 to 35 letters or numbers.');
  }

  if (!claimedPaymentAt) {
    errors.push('Payment date and time is required for manual UPI verification.');
  } else {
    const futureGraceMs = FUTURE_GRACE_MINUTES * 60 * 1000;
    const maxAgeMs = MAX_PAYMENT_AGE_DAYS * 24 * 60 * 60 * 1000;

    if (claimedPaymentAt.getTime() > now.getTime() + futureGraceMs) {
      errors.push('Payment date and time cannot be in the future.');
    }

    if (now.getTime() - claimedPaymentAt.getTime() > maxAgeMs) {
      errors.push(`Payment date and time must be within the last ${MAX_PAYMENT_AGE_DAYS} days.`);
    }
  }

  if (!screenshot) {
    errors.push('Payment proof screenshot is required.');
  }

  return {
    errors,
    warnings,
    normalizedTransactionId,
    claimedPaymentAt,
  };
}

function normalizeScreenshotForHash(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('data:')) {
    const commaIndex = raw.indexOf(',');
    return commaIndex >= 0 ? raw.slice(commaIndex + 1).replace(/\s+/g, '') : raw;
  }

  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (error) {
    return raw.replace(/\s+/g, '');
  }
}

function getScreenshotFileHash(screenshot) {
  const normalizedScreenshot = normalizeScreenshotForHash(screenshot);
  if (!normalizedScreenshot) return null;
  return crypto.createHash('sha256').update(normalizedScreenshot).digest('hex');
}

function buildPaymentProofRiskReview({ transactionId, screenshot, duplicateScreenshotFound = false }) {
  const warnings = [];
  const normalizedTransactionId = normalizeTransactionId(transactionId);
  const screenshotFileHash = getScreenshotFileHash(screenshot);
  const invalidUpiReferenceFormat = !!normalizedTransactionId && !UPI_REFERENCE_NUMBER_PATTERN.test(normalizedTransactionId);

  if (duplicateScreenshotFound) {
    warnings.push('Same payment proof screenshot file hash was submitted before. Verify this proof carefully before approval.');
  }

  if (invalidUpiReferenceFormat) {
    warnings.push('UPI reference number should be a 12-digit UPI/RRN reference. Submitted value does not match that pattern.');
  }

  return {
    screenshotFileHash,
    normalizedTransactionId,
    flags: {
      duplicateScreenshotFileHash: duplicateScreenshotFound,
      invalidUpiReferenceFormat,
    },
    warnings,
  };
}

function buildSubscriptionVerificationReview(subscription) {
  const warnings = [...(subscription.verificationWarnings || [])];
  if (!subscription.normalizedTransactionId) warnings.push('Missing normalized UTR reference.');
  if (!subscription.claimedPaymentAt) warnings.push('Missing claimed payment date and time.');
  if (!subscription.screenshot) warnings.push('Missing payment screenshot.');
  if (!subscription.totalAmount || subscription.totalAmount <= 0) warnings.push('Expected payable amount is missing or zero.');

  return {
    expectedAmount: subscription.expectedAmountSnapshot ?? subscription.totalAmount,
    claimedPaymentAt: subscription.claimedPaymentAt || null,
    paymentProofSubmittedAt: subscription.paymentProofSubmittedAt || subscription.createdAt,
    normalizedTransactionId: subscription.normalizedTransactionId || normalizeTransactionId(subscription.transactionId),
    warnings: [...new Set(warnings)],
    checklist: [
      'Match UTR / Transaction ID in bank or UPI merchant statement.',
      'Match paid amount exactly with Expected Amount.',
      'Match payment date and time with the bank statement.',
      'Open screenshot and confirm amount, UPI ID, date/time, and success status before approval.'
    ]
  };
}

function canApproveManualSubscription(subscription) {
  const review = buildSubscriptionVerificationReview(subscription);
  const blockers = [];

  if (!review.normalizedTransactionId) blockers.push('UTR / Transaction ID is missing.');
  if (!review.claimedPaymentAt) blockers.push('Payment date and time is missing.');
  if (!subscription.screenshot) blockers.push('Payment screenshot is missing.');
  if (!review.expectedAmount || review.expectedAmount <= 0) blockers.push('Expected amount is invalid.');

  return { canApprove: blockers.length === 0, blockers, review };
}

module.exports = {
  normalizeTransactionId,
  validatePaymentProof,
  getScreenshotFileHash,
  buildPaymentProofRiskReview,
  buildSubscriptionVerificationReview,
  canApproveManualSubscription,
};
