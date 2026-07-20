const AdminNotification = require('../models/AdminNotification');

/**
 * Create a new admin notification, save to DB, and broadcast to all admins via Socket.IO
 */
exports.createAdminNotification = async ({ title, description, category, userId, priority = 'Info', actionUrl = '' }) => {
  try {
    const notification = await AdminNotification.create({
      title,
      description,
      category,
      userId,
      priority,
      read: false,
      actionUrl
    });

    if (global.io) {
      if (notification.userId) {
        try {
          await notification.populate('userId', 'agencyName ownerName email mobile');
        } catch (e) {
          console.error('Failed to populate userId:', e.message);
        }
      }
      // Emit socket event to admin dashboard clients
      global.io.emit('new-admin-notification', notification);
    }

    return notification;
  } catch (error) {
    console.error('Error creating admin notification:', error.message);
  }
};
