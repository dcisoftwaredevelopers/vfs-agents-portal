const mongoose = require('mongoose');

// Fallback defaults for legacy/manual documents. New subscriptions snapshot live PlatformSettings values.
const PLAN_AMOUNT = 10000;
const GST_RATE = 0.18;
const GST_PERCENT = 18;
const DEFAULT_DURATION_DAYS = 30;
const GST_AMOUNT = +(PLAN_AMOUNT * GST_RATE).toFixed(2);
const TOTAL_AMOUNT = +(PLAN_AMOUNT + GST_AMOUNT).toFixed(2);

const subscriptionSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  planName: { type: String, default: 'Professional Plan' },
  basePrice: { type: Number, default: PLAN_AMOUNT },
  gstPercent: { type: Number, default: GST_PERCENT },
  durationDays: { type: Number, default: DEFAULT_DURATION_DAYS },
  planAmount: { type: Number, default: PLAN_AMOUNT },
  gstAmount: { type: Number, default: GST_AMOUNT },
  totalAmount: { type: Number, default: TOTAL_AMOUNT },
  discountApplied: { type: Boolean, default: false },
  discountAmount: { type: Number, default: 0 },
  invoiceNumber: { type: String, unique: true, required: true },
  paymentStatus: { 
    type: String, 
    enum: ['Pending', 'Paid', 'Failed', 'Pending Verification', 'Rejected'], 
    default: 'Pending' 
  },
  subscriptionStatus: { 
    type: String, 
    enum: ['Pending', 'Active', 'Expired', 'Cancelled', 'Verification Pending', 'Rejected'], 
    default: 'Pending' 
  },
  paymentDate: { type: Date },
  startDate: { type: Date },
  expiryDate: { type: Date },
  renewalDate: { type: Date },
  sentReminders: [{ type: String }], // keeps track of sent reminders e.g., '30_DAYS', '15_DAYS', etc.
  // sparse: true is required alongside unique — pending subscriptions have no transactionId yet
  // (multiple `null` values would otherwise violate the unique index)
  transactionId: { type: String, unique: true, sparse: true },
  normalizedTransactionId: { type: String, unique: true, sparse: true, index: true },
  screenshot: { type: String }, // Base64 payment proof screenshot
  paymentDateTime: { type: String },
  claimedPaymentAt: { type: Date },
  paymentProofSubmittedAt: { type: Date },
  expectedAmountSnapshot: { type: Number },
  verificationWarnings: [{ type: String }],
  notes: { type: String }, // optional remarks from agent
  rejectionRemarks: { type: String }, // remarks from admin if rejected
  source: { type: String, default: 'MANUAL_UPI' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' }
}, {
  timestamps: true
});

subscriptionSchema.index({ subscriptionStatus: 1, paymentStatus: 1, expiryDate: 1 });
subscriptionSchema.index({ agentId: 1, subscriptionStatus: 1, paymentStatus: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
