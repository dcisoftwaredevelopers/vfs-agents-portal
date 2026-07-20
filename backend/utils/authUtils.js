const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV !== 'production') return 'dev-secret-change-in-production';
  return null;
};

const generateToken = (id) => {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign({ id }, secret, {
    expiresIn: '30d',
  });
};

const normalizeEmail = (email) => (email || '').toLowerCase().trim();

/**
 * Whitelist of Agent fields that are safe to send to the frontend.
 * Add new fields here ONLY (never spread the raw Mongoose doc) —
 * this is what stops fields like password/hash from ever leaking,
 * and stops future fields from silently going missing like `mobile` did.
 */
const SAFE_AGENT_FIELDS = [
  '_id',
  'agentId',
  'agencyName',
  'ownerName',
  'email',
  'mobile',       // <-- was missing, this was the bug
  'gstNumber',
  'panNumber',
  'aadharNumber',
  'businessRegNumber',
  'address',
  'city',
  'state',
  'country',
  'logo',
  'role',
  'status',
  'isActive',
  'preferredLanguage',
  'referralCode',
  'referredBy',
  'discountEligible',
  'stars',
  'goldCoins',
  'freeBookingsAvailable',
  'completedBookingsCount',
  'lastBookingMilestoneReached',
  'referralsCount',
  'createdAt',
];

const buildAuthResponse = (agent, token) => {
  if (!agent) {
    throw new Error('buildAuthResponse: agent object is required');
  }

  // agent can be a Mongoose document (from findOne/create) or a plain
  // object (e.g. req.user set by auth middleware) — normalize both.
  const agentObj = typeof agent.toObject === 'function' ? agent.toObject() : agent;

  const safeAgent = SAFE_AGENT_FIELDS.reduce((acc, field) => {
    if (agentObj[field] !== undefined) {
      acc[field] = agentObj[field];
    }
    return acc;
  }, {});

  const response = { ...safeAgent };
  // Only include `token` when one is actually provided (e.g. getProfile
  // calls this with token = null and shouldn't send a `token: null` key).
  if (token) {
    response.token = token;
  }

  return response;
};

module.exports = {
  getJwtSecret,
  generateToken,
  normalizeEmail,
  buildAuthResponse,
};