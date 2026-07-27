const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const requiredWhenProfileComplete = function () {
  return this.status !== 'ProfileIncomplete';
};

const agentSchema = new mongoose.Schema({
  clerkId: { type: String, unique: true, sparse: true, index: true },
  agentId: { type: String, unique: true, sparse: true, index: true },
  agencyName: { type: String, required: true },
  ownerName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false }, // CHANGED: select:false so it's never fetched by default
  mobile: { type: String, required: requiredWhenProfileComplete },
  panNumber: { type: String, required: requiredWhenProfileComplete },
  aadharNumber: { type: String, required: requiredWhenProfileComplete },
  gstNumber: { type: String, required: false }, // Optional, uniqueness enforced only when provided (via partial index)
  businessRegNumber: { type: String },
  address: { type: String, required: requiredWhenProfileComplete },
  city: { type: String, required: requiredWhenProfileComplete },
  state: { type: String, required: requiredWhenProfileComplete },
  country: { type: String, required: requiredWhenProfileComplete },
  logo: { type: String }, // stores base64 company logo
  status: { 
    type: String, 
    enum: ['ProfileIncomplete', 'Pending', 'Verified', 'Rejected', 'Blocked', 'Subscription Expired', 'Active', 'Deleted'], 
    default: 'Pending' 
  },
  role: { type: String, enum: ['SUPER_ADMIN', 'Agent'], default: 'Agent' },
  isActive: { type: Boolean, default: true },
  preferredLanguage: { type: String, default: 'en' },

  // soft delete fields
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },

  // Referral / rewards
  referralCode: { type: String, unique: true, sparse: true, index: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
  discountEligible: { type: Boolean, default: false },
  stars: { type: Number, default: 0 },
  goldCoins: { type: Number, default: 0 },
  freeApplicationsAvailable: { type: Number, default: 0 },
  freeApplicationsUsed: { type: Number, default: 0 },
  completedBookingsCount: { type: Number, default: 0 },
  dailyAmountLimit: { type: Number, default: 100000 },
  lastBookingMilestoneReached: { type: Number, default: 0 },
  referralsCount: { type: Number, default: 0 },
  freeSubscriptionGrantedByAdmin: { type: Boolean, default: false },
  freeSubscriptionGrantedAt: { type: Date, default: null },
  freeSubscriptionGrantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },

  // ADDED: account lockout / brute-force protection
  loginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, default: null, select: false },
  resetPasswordToken: { type: String, select: false, default: null },
  resetPasswordExpires: { type: Date, select: false, default: null },
}, {
  timestamps: true
});

// ADDED: virtual — is the account currently locked?
agentSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Match password
agentSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

agentSchema.methods.hasFreeApplicationCredit = function () {
  return Number(this.freeApplicationsAvailable || 0) > Number(this.freeApplicationsUsed || 0);
};

// ADDED: call on failed login — increments counter, locks account if threshold hit
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

agentSchema.methods.registerFailedLogin = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 0;
    this.lockUntil = null;
  }

  this.loginAttempts += 1;

  if (this.loginAttempts >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
    this.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
  }

  await this.save({ validateBeforeSave: false });
};

// ADDED: call on successful login — clears counters
agentSchema.methods.registerSuccessfulLogin = async function () {
  if (this.loginAttempts === 0 && !this.lockUntil) return;
  this.loginAttempts = 0;
  this.lockUntil = null;
  await this.save({ validateBeforeSave: false });
};

// Encrypt password before saving
agentSchema.pre('save', async function(next) {
  if (!this.password || !this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Auto-generate agentId for new agents
agentSchema.pre('save', async function(next) {
  if (this.isNew && !this.agentId && this.role === 'Agent') {
    try {
      const DailySequence = require('./DailySequence');
      
      const date = this.createdAt || new Date();
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const dateKey = `${day}${month}${year}`;

      const counter = await DailySequence.findOneAndUpdate(
        { dateKey },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      const seqStr = String(counter.seq).padStart(3, '0');
      this.agentId = `DCI${dateKey}${seqStr}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});


// ADDED: Partial unique index - only enforces uniqueness when gstNumber is provided and not empty
agentSchema.index(
  { gstNumber: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      gstNumber: { $type: 'string', $gt: '' }
    } 
  }
);

// Auto-generate a short referral code for new agents (if missing)
agentSchema.pre('save', function (next) {
  try {
    if (this.isNew && this.role === 'Agent' && !this.referralCode) {
      const randomChars = crypto.randomBytes(2).toString('hex').toUpperCase();
      const suffix = this.agentId ? this.agentId.slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000);
      this.referralCode = `VFS-${randomChars}-${suffix}`;
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('Agent', agentSchema);
