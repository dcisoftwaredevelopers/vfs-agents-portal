const mailService = require('../services/mailService');
const ContactEnquiry = require('../models/ContactEnquiry');

const normalize = (value) => String(value || '').trim();
const escapeHtml = (value) => normalize(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

exports.submitContact = async (req, res) => {
  const name = normalize(req.body.name);
  const phone = normalize(req.body.phone);
  const email = normalize(req.body.email).toLowerCase();
  const country = normalize(req.body.country);
  const visaType = normalize(req.body.visaType);
  const message = normalize(req.body.message);

  const errors = [];
  if (name.length < 2 || name.length > 100) errors.push('Please enter a valid full name.');
  if (!/^[-+()\s0-9]{10,20}$/.test(phone) || phone.replace(/\D/g, '').length < 10) errors.push('Please enter a valid phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) errors.push('Please enter a valid email address.');
  if (!country || country.length > 80) errors.push('Please select an interested country.');
  if (!visaType || visaType.length > 80) errors.push('Please select a visa type.');
  if (message.length < 10 || message.length > 3000) errors.push('Message must be between 10 and 3000 characters.');

  if (errors.length) return res.status(400).json({ message: errors.join(' ') });

  const recipient = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM;
  if (!recipient) return res.status(503).json({ message: 'Contact service is not configured.' });

  const safe = { name: escapeHtml(name), phone: escapeHtml(phone), email: escapeHtml(email), country: escapeHtml(country), visaType: escapeHtml(visaType), message: escapeHtml(message) };
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0c2340;line-height:1.6">
      <h2>New Consultation Enquiry</h2>
      <p><strong>Name:</strong> ${safe.name}</p>
      <p><strong>Phone:</strong> ${safe.phone}</p>
      <p><strong>Email:</strong> ${safe.email}</p>
      <p><strong>Interested Country:</strong> ${safe.country}</p>
      <p><strong>Visa Type:</strong> ${safe.visaType}</p>
      <p><strong>Message:</strong><br>${safe.message.replace(/\r?\n/g, '<br>')}</p>
    </div>`;

  try {
    await ContactEnquiry.create({ name, phone, email, country, visaType, message });
    await mailService.sendMail({
      to: recipient,
      subject: `Consultation Enquiry - ${name} - ${country}`,
      html,
      replyTo: email,
    });
    return res.status(201).json({ message: 'Consultation request submitted successfully.' });
  } catch (error) {
    console.error('Contact enquiry email failed:', error);
    return res.status(502).json({ message: 'Unable to submit your consultation request right now. Please try again later.' });
  }
};
