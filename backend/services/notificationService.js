const AgentNotification = require('../models/AgentNotification');
const nodemailer = require('nodemailer');

/**
 * Create a centralized notification and save to database.
 * Also broadcasts to the user via Socket.IO if online.
 */
exports.createNotification = async (agentId, title, message, type, priority = 'LOW', metadata = null) => {
  try {
    const notification = await AgentNotification.create({
      agentId,
      title,
      message,
      type,
      priority,
      metadata
    });

    // Real-time broadcast
    if (global.io) {
      global.io.emit('new-notification', { agentId: agentId.toString(), notification });
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error.message);
    throw error;
  }
};

/**
 * Send an email notification using the configured transporter.
 */
exports.sendEmail = async (to, subject, htmlContent) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com',
        pass: process.env.EMAIL_PASS || 'csiz fkyl mnxu tfap'
      }
    });

    const mailOptions = {
      from: `"Dream Catcher Notification" <${process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com'}>`,
      to,
      subject,
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email notification sent to ${to}: ${subject}`);
    return info;
  } catch (error) {
    console.error('Failed to send email notification:', error.message);
    throw error;
  }
};
