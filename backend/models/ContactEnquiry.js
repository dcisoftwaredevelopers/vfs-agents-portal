const mongoose = require('mongoose');

const contactEnquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 150 },
  country: { type: String, required: true, trim: true, maxlength: 80 },
  visaType: { type: String, required: true, trim: true, maxlength: 80 },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  status: { type: String, enum: ['New', 'Contacted', 'Closed'], default: 'New', index: true },
}, { timestamps: true });

module.exports = mongoose.model('ContactEnquiry', contactEnquirySchema);
