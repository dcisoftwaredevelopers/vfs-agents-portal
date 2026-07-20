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

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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
  const servicesRows = appointment.servicesSelected && appointment.servicesSelected.length > 0
    ? appointment.servicesSelected
        .map(
          (s) => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 6px 0;">${escapeHtml(s.name)}</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">INR ${s.price.toFixed(2)}</td>
        </tr>
      `
        )
        .join('')
    : `
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-style: italic;">No additional services selected</td>
          <td style="padding: 6px 0; text-align: right; font-weight: bold;">INR 0.00</td>
        </tr>
      `;

  return emailShell(`
    <h2 style="color: #0c2340; border-bottom: 2px solid #dfa015; padding-bottom: 15px; margin-top: 0;">Appointment Confirmed</h2>
    <p style="font-size: 15px; line-height: 1.5; color: #334155;">Dear Applicant,</p>
    <p style="font-size: 15px; line-height: 1.5; color: #334155;">
      We are pleased to inform you that your UPI payment for appointment reference <strong>${escapeHtml(appointment.referenceNumber)}</strong> has been verified successfully.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #0c2340; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Appointment Details Summary</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 35%;">Reference Number:</td>
          <td style="padding: 6px 0; color: #e67e22; font-weight: bold;">${escapeHtml(appointment.referenceNumber)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Application Centre:</td>
          <td style="padding: 6px 0; font-weight: bold;">${escapeHtml(center ? center.name : 'Visa Application Centre')}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Centre Address:</td>
          <td style="padding: 6px 0; line-height: 1.4;">${escapeHtml(center && center.address ? center.address : 'N/A')}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Appointment Date:</td>
          <td style="padding: 6px 0;">${new Date(appointment.bookingDate).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Appointment Time:</td>
          <td style="padding: 6px 0; font-weight: bold;">${escapeHtml(appointment.bookingTime)}</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #0c2340; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Selected Services & Pricing Summary</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155; margin-bottom: 10px;">
        <thead>
          <tr style="border-bottom: 1px solid #cbd5e1;">
            <th style="text-align: left; padding: 6px 0; font-weight: bold;">Service Name</th>
            <th style="text-align: right; padding: 6px 0; font-weight: bold;">Price</th>
          </tr>
        </thead>
        <tbody>${servicesRows}</tbody>
      </table>

      <div style="border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 13.5px; color: #334155;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 3px 0;">Services Subtotal:</td>
            <td style="padding: 3px 0; text-align: right; font-weight: bold;">INR ${(appointment.selectedServicesTotal || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0;">Appointment Fee:</td>
            <td style="padding: 3px 0; text-align: right; font-weight: bold;">INR ${(appointment.appointmentFee || 0).toFixed(2)}</td>
          </tr>
          <tr style="font-size: 15px; color: #0c2340; font-weight: bold; border-top: 1.5px solid #0c2340;">
            <td style="padding: 8px 0 0 0;">Grand Total:</td>
            <td style="padding: 8px 0 0 0; text-align: right; color: #e67e22;">INR ${(appointment.totalAmount || 0).toFixed(2)}</td>
          </tr>
        </table>
      </div>
    </div>

    <p style="font-size: 15px; line-height: 1.5; color: #334155;">
      Your biometric appointment is now confirmed. Please find your official <strong>Appointment Confirmation Letter</strong> attached as a PDF to this email.
    </p>
    <p style="font-size: 15px; line-height: 1.5; color: #334155;">Thank you for choosing Dream Catcher Immigrations.</p>
  `);
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
  buildAppointmentConfirmationHtml,
  buildPaymentRejectedHtml,
  buildSubscriptionActivatedHtml,
  buildSubscriptionRejectedHtml,
};