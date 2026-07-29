const EMAIL_SENDER_NAME = 'Dream Catcher Immigrations B2B Visa Booking Portal';
const DEFAULT_EMAIL_FROM = 'noreply@dreamcatcherimmigrations.com';

const getEmailFromAddress = () => {
  const configuredAddress = String(process.env.EMAIL_FROM || '').trim();
  return /^[^@\s]+@dreamcatcherimmigrations\.com$/i.test(configuredAddress)
    ? configuredAddress
    : DEFAULT_EMAIL_FROM;
};

const getFormattedEmailSender = () =>
  `${EMAIL_SENDER_NAME} <${getEmailFromAddress()}>`;

const removeLegacyEmailBranding = (value = '') =>
  String(value)
    .replace(/\bVFS-(?=[A-Z0-9])/gi, '')
    .replace(/\bVFS\s+Global\b/gi, EMAIL_SENDER_NAME)
    .replace(/\bVFS\b/gi, EMAIL_SENDER_NAME)
    .replace(/vfsglobal\.world/gi, 'dreamcatcherimmigrations.com');

module.exports = {
  EMAIL_SENDER_NAME,
  DEFAULT_EMAIL_FROM,
  getEmailFromAddress,
  getFormattedEmailSender,
  removeLegacyEmailBranding,
};
