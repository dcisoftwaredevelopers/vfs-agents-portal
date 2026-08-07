const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['User', 'Agent', 'Booking', 'Payment', 'Subscription', 'Slot', 'System', 'Document']
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: false }, // Related Agent
  priority: { 
    type: String, 
    required: true,
    enum: ['Info', 'Warning', 'Critical'],
    default: 'Info'
  },
  read: { type: Boolean, default: false },
  actionUrl: { type: String, default: '' }, // switches tab in admin dashboard e.g., 'agents', 'paymentVerification', etc.
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  targetReference: { type: String, default: '' }
}, {
  timestamps: true
});

adminNotificationSchema.index({ read: 1, createdAt: -1 });
adminNotificationSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
