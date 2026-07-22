// FIX (root cause, permanent): Gmail SMTP over Render kept failing with
//   "SMTP/OTP Send Error: connect ENETUNREACH 2607:f8b0:..."
// even after pool + family:4 fixes, because nodemailer's `service: 'gmail'`
// preset does not reliably respect the `family` override on every code path,
// so it kept trying Gmail's IPv6 address, which Render cannot route to.
//
// Real fix: stop using SMTP entirely. Resend's API is a plain HTTPS POST
// (port 443, same path every other API call on this server already uses
// successfully) — there is no separate SMTP socket, no DNS family selection,
// no IPv6 route to fail on. This removes the whole class of error.
//
// exports.sendMail(mailOptions, defaultFromName) keeps the EXACT same
// signature as the old nodemailer-based version, so Bookingcontroller.js,
// Agentcontroller.js, and anywhere else that calls mailService.sendMail(...)
// do NOT need to change at all.

const RESEND_API_URL = 'https://api.resend.com/emails';

// Converts a nodemailer-style attachment ({ filename, content, contentType })
// into the base64 string Resend's API expects. Supports content as a Buffer,
// a base64 string, or a plain utf-8 string, so this stays compatible with
// whatever format attachments were being built in elsewhere (e.g. invoice
// PDFs from pdfService.js).
function normalizeAttachment(attachment) {
  if (!attachment) return null;

  let base64Content;
  const { content, encoding } = attachment;

  if (Buffer.isBuffer(content)) {
    base64Content = content.toString('base64');
  } else if (typeof content === 'string' && encoding === 'base64') {
    base64Content = content;
  } else if (typeof content === 'string') {
    // Heuristic: if it already looks like base64 (no whitespace, valid charset,
    // reasonably long), trust it as-is; otherwise treat as raw text/utf-8.
    const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(content) && content.length > 100;
    base64Content = looksLikeBase64 ? content : Buffer.from(content, 'utf-8').toString('base64');
  } else {
    return null;
  }

  return {
    filename: attachment.filename || 'attachment',
    content: base64Content
  };
}

exports.sendMail = async (mailOptions, defaultFromName = 'VFS Global') => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      'RESEND_API_KEY environment variable is not set. Configure it in your Render service settings.'
    );
  }

  // EMAIL_FROM must be an address on a domain you've verified in Resend
  // (Resend dashboard -> Domains). Until a domain is verified, Resend's
  // shared sandbox address 'onboarding@resend.dev' works for testing but
  // can usually only send to your own verified Resend account email.
  const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';
  const fromName = mailOptions.fromName || defaultFromName;

  const payload = {
    from: mailOptions.from || `${fromName} <${fromAddress}>`,
    to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
    subject: mailOptions.subject,
    html: mailOptions.html
  };

  if (mailOptions.text) {
    payload.text = mailOptions.text;
  }

  if (Array.isArray(mailOptions.attachments) && mailOptions.attachments.length > 0) {
    const normalized = mailOptions.attachments.map(normalizeAttachment).filter(Boolean);
    if (normalized.length > 0) {
      payload.attachments = normalized;
    }
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorMessage = `Resend API error (status ${response.status})`;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.message || errorBody.error || errorMessage;
    } catch (_) {
      // response body wasn't JSON, keep the generic message
    }
    throw new Error(errorMessage);
  }

  return response.json();
};