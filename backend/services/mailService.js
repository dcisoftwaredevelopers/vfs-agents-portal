const nodemailer = require('nodemailer');

// FIX (speed): the old code called createTransporter() — and therefore built
// a brand new SMTP connection (full TCP + TLS handshake + Gmail auth) — on
// EVERY single email. With many agents submitting appointments/OTPs at the
// same time, each request paid that full connection-setup cost from scratch,
// which is the main reason things felt slow and also the kind of load that
// makes Gmail's SMTP start throwing intermittent errors (matches the 500
// "Failed to send verification email" seen in the console).
//
// Fix: build ONE pooled transporter, reused for the lifetime of the process.
// `pool: true` keeps a small set of authenticated connections open and reuses
// them across sendMail() calls instead of reconnecting every time.
let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error(
        'EMAIL_USER / EMAIL_PASS environment variables are not set. Configure them in your Render service settings.'
      );
    }

    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      pool: true,
      maxConnections: 5,   // how many parallel SMTP connections to keep open
      maxMessages: 100,    // recycle a connection after this many sends
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  return transporter;
}

exports.sendMail = async (mailOptions, defaultFromName = 'VFS Global') => {
  const fromAddress = process.env.EMAIL_USER;

  return getTransporter().sendMail({
    from: mailOptions.from || `"${defaultFromName}" <${fromAddress}>`,
    ...mailOptions
  });
};