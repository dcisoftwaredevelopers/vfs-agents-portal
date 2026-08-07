const mongoose = require('mongoose');

const bookingDraftSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'DISCARDED'], default: 'ACTIVE', index: true },
  currentStep: { type: Number, min: 1, max: 6, default: 1 },
  destinationCountry: { type: String, default: '' },
  location: { type: String, default: '' },
  visaCategory: { type: String, default: '' },
  applicantsList: { type: [mongoose.Schema.Types.Mixed], default: [] },
  currentApplicantForm: { type: mongoose.Schema.Types.Mixed, default: {} },
  selectedServices: { type: [String], default: [] },
  bookingDate: { type: String, default: '' },
  bookingTime: { type: String, default: '' },
  useFreeApplicationCredit: { type: Boolean, default: false },
  paymentUpiId: { type: String, default: '' },
  lastSavedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), index: { expires: 0 } }
}, {
  timestamps: true
});

bookingDraftSchema.index(
  { agentId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);

module.exports = mongoose.model('BookingDraft', bookingDraftSchema);
