// All transactional email HTML was previously built inline inside the
// controller (large template literals mixed in with business logic).
// Pulling them out here makes the controller easier to read/test and lets
// these templates be reused or unit-tested independently.
//
// NOTE: these interpolate agent/appointment data directly. If any of these
// fields can ever contain user-supplied free text (agency name, notes,
// rejection remarks, etc.) that a browser/email client will render as HTML,
// escape it before interpolating to avoid HTML/script injection in the
// rendered email.

const { EMAIL_SENDER_NAME } = require('../config/emailBranding');

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const PORTAL_NAME = EMAIL_SENDER_NAME;
const APPOINTMENT_CONFIRMATION_SENDER_NAME = PORTAL_NAME;
const APPOINTMENT_CONFIRMATION_SUBJECT = 'Appointment Confirmation Letter';
const replaceVfsBranding = (str = '') =>
  String(str).replace(/\bVFS(?:\s+Global)?\b/gi, PORTAL_NAME);

const emailShell = (innerHtml, { borderColor = '#e2e8f0' } = {}) => `
  <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid ${borderColor}; border-radius: 8px;">
    ${innerHtml}
    <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
    <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
      This is an automated email from Dream Catcher Immigrations. Please do not reply directly to this message.
    </p>
  </div>
`;

function buildAppointmentConfirmationHtml({ appointment, center }) {
  const primaryApplicant = appointment.applicantDetails?.[0] || {};
  const countryName = center?.countryName || 'Portugal';
  const centerCity = center?.city || 'New Delhi';
  const centerDisplayName = replaceVfsBranding(center?.name || `${centerCity} Visa Application Centre`);
  const applicantName = `${primaryApplicant.firstName || ''} ${primaryApplicant.lastName || ''}`
    .trim()
    .toUpperCase() || 'CUSTOMER';
  const passportNumber = String(primaryApplicant.passportNumber || 'N/A').toUpperCase();
  const visaCategory = primaryApplicant.visaCategory || 'Standard';

  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; color: #000000; max-width: 760px; margin: 0 auto; padding: 24px 18px; font-size: 18px; line-height: 1.12;">
      <p style="margin: 0 0 28px 0;">Dear Customer,</p>

      <p style="margin: 0 0 18px 0;">Greetings from the ${PORTAL_NAME} ${escapeHtml(countryName)} Visa Helpdesk.</p>

      <p style="margin: 0 0 18px 0;">
        We would like to inform you that as per the update received from our dedicated team, your appointment has been scheduled at <strong>${escapeHtml(centerDisplayName)}</strong> as per the below mentioned details:
      </p>

      <p style="margin: 0 0 16px 0;">Kindly refer the below details:</p>

      <p style="margin: 0;">
        Name: ${escapeHtml(applicantName)}<br />
        Passport no: ${escapeHtml(passportNumber)}<br />
        Appointment date: To Be Scheduled<br />
        Visa Category: ${escapeHtml(visaCategory)}
      </p>

      <p style="margin: 0 0 22px 0;">We value your time and patience.</p>

      <p style="margin: 0 0 18px 0;">
        In case of further assistance, please contact us at
        <a href="tel:+919047047512" style="color: #2f6f73; text-decoration: underline;">+91 90470 47512</a>
        or write to us at
        <a href="mailto:info@dreamcatcherimmigrations.com" style="color: #2f6f73; text-decoration: underline;">info@dreamcatcherimmigrations.com</a>.
      </p>

      <p style="margin: 0 0 18px 0;">Best Regards,</p>
      <p style="margin: 0 0 22px 0;">${escapeHtml(countryName)} Visa Help Desk</p>

      <p style="margin: 0;">${PORTAL_NAME}<br />B2B Visa Booking Services</p>

      <p style="margin: 22px 0 0 0;">
        Contact: <a href="tel:+919047047512" style="color: #2f6f73; text-decoration: underline;">+91 90470 47512</a> |
        <a href="mailto:info@dreamcatcherimmigrations.com" style="color: #2f6f73; text-decoration: underline;">info@dreamcatcherimmigrations.com</a>
      </p>
    </div>
  `;
}

function buildPaymentRejectedHtml({ appointment, reason }) {
  return emailShell(
    `
    <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 15px; margin-top: 0;">Payment Verification Unsuccessful</h2>
    <p style="font-size: 15px; line-height: 1.5; color: #334155;">Dear Applicant,</p>
    <p style="font-size: 15px; line-height: 1.5; color: #334155;">
      We regret to inform you that your payment verification for appointment reference <strong>${escapeHtml(appointment.referenceNumber)}</strong> was unsuccessful.
    </p>
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <strong style="display: block; font-size: 14px; color: #991b1b; margin-bottom: 5px;">Reason for Rejection:</strong>
      <span style="font-size: 13.5px; color: #7f1d1d; line-height: 1.5;">${escapeHtml(reason)}</span>
    </div>
    <p style="font-size: 15px; line-height: 1.5; color: #334155;">
      As a result, your slot has been released back to the general booking pool. You will need to book a new appointment and submit a valid payment.
    </p>
    <p style="font-size: 15px; line-height: 1.5; color: #334155;">If you believe this was an error, please contact our support team.</p>
  `,
    { borderColor: '#e2e8f0' }
  );
}

function buildSubscriptionActivatedHtml({ agent, invoiceNumber, expiryDate }) {
  return emailShell(`
    <h2 style="color: #0c2340; border-bottom: 2px solid #dfa015; padding-bottom: 10px;">Subscription Activated</h2>
    <p>Dear ${escapeHtml(agent.ownerName)},</p>
    <p>Your subscription payment has been verified. Your agency is now authorized to search slots and book visa appointments.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Invoice Number:</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(invoiceNumber)}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Expiry Date:</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${expiryDate.toLocaleDateString('en-GB')}</td>
      </tr>
    </table>
    <p>Your Tax Invoice PDF has been attached to this email.</p>
  `);
}

function buildSubscriptionRejectedHtml({ agent, remarks }) {
  return emailShell(
    `
    <h2 style="color: #b91c1c; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Payment Verification Failed</h2>
    <p>Dear ${escapeHtml(agent.ownerName)},</p>
    <p>We were unable to verify your subscription payment proof. Rejection Remarks:</p>
    <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; color: #991b1b; font-weight: bold; margin: 15px 0;">
      ${escapeHtml(remarks)}
    </div>
    <p>Please log in to your Agent Dashboard, review your payment credentials, and resubmit the payment proof screenshot.</p>
  `,
    { borderColor: '#fee2e2' }
  );
}

module.exports = {
  APPOINTMENT_CONFIRMATION_SENDER_NAME,
  APPOINTMENT_CONFIRMATION_SUBJECT,
  buildAppointmentConfirmationHtml,
  buildPaymentRejectedHtml,
  buildSubscriptionActivatedHtml,
  buildSubscriptionRejectedHtml,
};
