const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  referredAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  starsAwarded: { type: Number, default: 5 },
}, {
  timestamps: true,
});

referralSchema.index({ referrerId: 1, referredAgentId: 1 }, { unique: true });

module.exports = mongoose.model('Referral', referralSchema);
