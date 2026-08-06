const PlatformSettings = require('../models/PlatformSettings');

const DEFAULT_SUBSCRIPTION_SETTINGS = Object.freeze({
  planName: 'Professional Plan',
  basePrice: 10000,
  gstPercent: 18,
  durationDays: 30,
});

const roundMoney = (amount) => +Number(amount || 0).toFixed(2);

const normalizePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeGstPercent = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : fallback;
};

const normalizeSubscriptionSettings = (settings) => ({
  planName: String(settings?.subscriptionPlanName || DEFAULT_SUBSCRIPTION_SETTINGS.planName).trim() || DEFAULT_SUBSCRIPTION_SETTINGS.planName,
  basePrice: normalizePositiveNumber(settings?.subscriptionBasePrice, DEFAULT_SUBSCRIPTION_SETTINGS.basePrice),
  gstPercent: normalizeGstPercent(settings?.subscriptionGstPercent, DEFAULT_SUBSCRIPTION_SETTINGS.gstPercent),
  durationDays: Math.round(normalizePositiveNumber(settings?.subscriptionDurationDays, DEFAULT_SUBSCRIPTION_SETTINGS.durationDays)),
  updatedBy: settings?.subscriptionSettingsUpdatedBy || null,
  updatedAt: settings?.subscriptionSettingsUpdatedAt || null,
});

const getSubscriptionSettings = async () => {
  const settings = await PlatformSettings.getSettings();
  const missingDefaults =
    settings.subscriptionPlanName === undefined ||
    settings.subscriptionBasePrice === undefined ||
    settings.subscriptionGstPercent === undefined ||
    settings.subscriptionDurationDays === undefined;

  if (missingDefaults) {
    settings.subscriptionPlanName ||= DEFAULT_SUBSCRIPTION_SETTINGS.planName;
    settings.subscriptionBasePrice ??= DEFAULT_SUBSCRIPTION_SETTINGS.basePrice;
    settings.subscriptionGstPercent ??= DEFAULT_SUBSCRIPTION_SETTINGS.gstPercent;
    settings.subscriptionDurationDays ??= DEFAULT_SUBSCRIPTION_SETTINGS.durationDays;
    await settings.save();
  }

  return normalizeSubscriptionSettings(settings);
};

const calculateSubscriptionPricing = (settings, discountEligible = false) => {
  const basePrice = normalizePositiveNumber(settings?.basePrice, DEFAULT_SUBSCRIPTION_SETTINGS.basePrice);
  const gstPercent = normalizeGstPercent(settings?.gstPercent, DEFAULT_SUBSCRIPTION_SETTINGS.gstPercent);
  const discountAmount = discountEligible ? roundMoney(basePrice * 0.10) : 0;
  const planAmount = roundMoney(basePrice - discountAmount);
  const gstAmount = roundMoney(planAmount * (gstPercent / 100));
  const totalAmount = roundMoney(planAmount + gstAmount);

  return {
    planAmount,
    gstAmount,
    totalAmount,
    discountApplied: Boolean(discountEligible),
    discountAmount,
  };
};

const buildSubscriptionSnapshot = (settings, pricing) => ({
  planName: settings.planName,
  basePrice: settings.basePrice,
  gstPercent: settings.gstPercent,
  durationDays: settings.durationDays,
  planAmount: pricing.planAmount,
  gstAmount: pricing.gstAmount,
  totalAmount: pricing.totalAmount,
  discountApplied: pricing.discountApplied,
  discountAmount: pricing.discountAmount,
});

module.exports = {
  DEFAULT_SUBSCRIPTION_SETTINGS,
  normalizeSubscriptionSettings,
  getSubscriptionSettings,
  calculateSubscriptionPricing,
  buildSubscriptionSnapshot,
};
