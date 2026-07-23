const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

exports.sendMail = async (mailOptions, defaultFromName = "VFS Global") => {
  try {
    const response = await resend.emails.send({
      from: `${defaultFromName} <${process.env.EMAIL_FROM}>`,
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
    });

    console.log("Resend Email Response:", response);
    return response;
  } catch (error) {
    console.error("Resend Error:", error);
    throw error;
  }
};