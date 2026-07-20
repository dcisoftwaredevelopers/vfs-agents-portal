const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  freeSubscriptionOfferEnabled: { type: Boolean, default: false },
  freeSubscriptionSlotLimit: { type: Number, default: 10 },
  freeSubscriptionClaimedCount: { type: Number, default: 0 },
  adminFreeSubscriptionSlotLimit: { type: Number, default: 0 },
  adminFreeSubscriptionGrantedCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

platformSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
