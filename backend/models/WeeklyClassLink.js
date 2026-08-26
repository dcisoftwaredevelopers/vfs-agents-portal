const mongoose = require('mongoose');

const weeklyClassLinkSchema = new mongoose.Schema({
  className: { type: String, enum: ['german', 'french'], required: true, index: true },
  weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  meetingUrl: { type: String, required: true, trim: true, maxlength: 500 },
  schedule: { type: String, required: true, trim: true, maxlength: 160 },
  isPublished: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
}, { timestamps: true });

weeklyClassLinkSchema.index({ className: 1, weekStart: 1, meetingUrl: 1 }, { unique: true });

weeklyClassLinkSchema.statics.ensureMultipleLinkIndexes = async function () {
  const indexes = await this.collection.indexes();
  if (indexes.some((index) => index.name === 'className_1_weekStart_1')) {
    await this.collection.dropIndex('className_1_weekStart_1');
  }
  await this.collection.createIndex(
    { className: 1, weekStart: 1, meetingUrl: 1 },
    { unique: true, name: 'className_1_weekStart_1_meetingUrl_1' }
  );
};

module.exports = mongoose.model('WeeklyClassLink', weeklyClassLinkSchema);
