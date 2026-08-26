const { Resend } = require("resend");
const {
  getFormattedEmailSender,
  removeLegacyEmailBranding,
} = require("../config/emailBranding");

const resend = new Resend(process.env.RESEND_API_KEY);

const normalizeAttachments = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }

  return attachments.map((attachment) => {
    const normalized = { ...attachment };
    if (normalized.filename) {
      normalized.filename = removeLegacyEmailBranding(normalized.filename);
    }
    if (Buffer.isBuffer(normalized.content)) {
      normalized.content = normalized.content.toString("base64");
    }
    return normalized;
  });
};

exports.sendMail = async (mailOptions) => {
  try {
    const emailPayload = {
      from: getFormattedEmailSender(),
      to: mailOptions.to,
      subject: removeLegacyEmailBranding(mailOptions.subject),
      html: removeLegacyEmailBranding(mailOptions.html),
      ...(mailOptions.replyTo ? { reply_to: mailOptions.replyTo } : {}),
    };

    const attachments = normalizeAttachments(mailOptions.attachments);
    if (attachments) {
      emailPayload.attachments = attachments;
    }

    console.log("Resend Email Payload Summary:", {
      from: emailPayload.from,
      to: emailPayload.to,
      subject: emailPayload.subject,
      attachmentCount: attachments ? attachments.length : 0,
      attachmentFilenames: attachments ? attachments.map((attachment) => attachment.filename) : [],
    });

    const response = await resend.emails.send(emailPayload);

    console.log("Resend Email Response:", response);
    if (response?.error) {
      console.error("Resend Error Response:", response.error);
      const resendError = new Error(
        response.error.message || response.error.name || "Resend email delivery failed"
      );
      resendError.details = response.error;
      throw resendError;
    }
    console.log("Resend Email Accepted:", {
      id: response?.data?.id || response?.id || null,
      to: emailPayload.to,
      subject: emailPayload.subject,
    });
    return response;
  } catch (error) {
    console.error("Resend Error:", error);
    throw error;
  }
};
