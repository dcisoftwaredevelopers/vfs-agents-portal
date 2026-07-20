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
//
// FIX (timeout/ENETUNREACH): Render logs showed
//   "SMTP/OTP Send Error: Connection timeout"
//   "Failed to send ... reminder email: connect ENETUNREACH 2607:f8b0:..."
// The IP in that second error is an IPv6 address for smtp.gmail.com.
// Render's network doesn't reliably route outbound IPv6, so when Node
// resolves smtp.gmail.com and tries the IPv6 address first, the connection
// hangs and times out. `family: 4` forces the SMTP connection to use IPv4
// only, skipping the unreachable IPv6 route entirely.
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
      family: 4,           // force IPv4 - avoids Render's unreachable IPv6 route to Gmail
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