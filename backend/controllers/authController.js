const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const Agent = require('../models/Agent');
const { generateToken, normalizeEmail, buildAuthResponse } = require('../utils/authUtils');
const rewardService = require('../services/rewardService');
// NOTE: asyncHandler wrapping is done in routes/auth.js via your own
// utils/asyncHandler.js — so these controller functions are plain async
// functions here and don't wrap themselves.

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const RESOLVED_ADMIN_EMAIL = normalizeEmail(ADMIN_EMAIL || 'admindci@gmail.com');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

// ---- validators ----
// NOTE: agencyName/ownerName/email/mobile/address/city/state/country
// are already validated by `validateAgentRegister` middleware on the router
// (which correctly accepts international mobile formats like +91...).
// Removed the old isValidEmail/isValidMobile here — the India-only 10-digit
// mobile regex conflicted with the router's international format and would
// have wrongly rejected valid +91-prefixed numbers.
// Password length is NOT checked by validateAgentRegister, so it stays here.

const registerAgent = async (req, res) => {
  const {
    agencyName, ownerName, email, password, mobile,
    gstNumber, panNumber, aadharNumber, businessRegNumber,
    address, city, state, country, clerkId,
  } = req.body;

  if (!password || password.length < 8) {
    res.status(400);
    throw new Error('Password must be at least 8 characters long.');
  }

  const cleanEmail = normalizeEmail(email);
  // GST is optional; omit it entirely when blank so optional unique indexes never collide on null/empty values.
  const cleanGst = (gstNumber && gstNumber.trim()) ? gstNumber.trim().toUpperCase() : undefined;
  const cleanAadhar = aadharNumber ? aadharNumber.trim().replace(/\s+/g, '') : undefined;
  // Use Cloudinary URL from multer if file was uploaded, otherwise use null
  const logo = req.file ? req.file.path : null;
  const isFirstAdmin = cleanEmail === RESOLVED_ADMIN_EMAIL;

  try {
    // Handle optional referral code
    const referralCodeRaw = req.body.referralCode || req.body.refCode || null;
    let referringAgent = null;
    if (referralCodeRaw) {
      const lookupCode = referralCodeRaw.toString().trim().toUpperCase();
      referringAgent = await Agent.findOne({ referralCode: lookupCode });
    }

    const agentPayload = {
      clerkId,
      agencyName: agencyName.trim(),
      ownerName: ownerName.trim(),
      email: cleanEmail,
      password,
      mobile: mobile.trim(),
      panNumber,
      aadharNumber: cleanAadhar,
      businessRegNumber,
      address,
      city,
      state,
      country,
      logo,
      role: isFirstAdmin ? 'SUPER_ADMIN' : 'Agent',
      status: isFirstAdmin ? 'Active' : 'Pending',
      referredBy: referringAgent ? referringAgent._id : null,
      discountEligible: false,
    };

    if (cleanGst) {
      agentPayload.gstNumber = cleanGst;
    }

    const agent = await Agent.create(agentPayload);

    if (referringAgent) {
      await rewardService.handleReferralRewardOnRegistration(agent, null);
    }

    const token = generateToken(agent._id);
    res.status(201).json(buildAuthResponse(agent, token));
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const duplicateError = new Error(
        field === 'gstNumber'
          ? 'GST Number is already registered.'
          : 'Email is already registered. Please sign in instead.'
      );
      duplicateError.statusCode = 400;
      throw duplicateError;
    }
    throw error;
  }
};

/**
 * Shared login-attempt handler used by both loginAgent and adminLogin.
 * Centralizes: account lockout, generic error messages, failed-attempt logging.
 */
const attemptLogin = async ({ agent, password, req }) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (!agent) {
    console.warn(`[auth] failed login (no account) from ip=${clientIp}`);
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  if (agent.isLocked) {
    console.warn(`[auth] blocked login attempt on locked account=${agent.email} ip=${clientIp}`);
    const err = new Error('Account temporarily locked due to too many failed attempts. Try again in 15 minutes.');
    err.statusCode = 423; // Locked
    throw err;
  }

  const isMatch = await agent.matchPassword(password);
  if (!isMatch) {
    await agent.registerFailedLogin();
    console.warn(`[auth] failed login for=${agent.email} ip=${clientIp} attempts=${agent.loginAttempts}`);
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  if (agent.isActive === false || agent.status === 'Blocked') {
    const err = new Error('Your account is blocked or inactive. Please contact support.');
    err.statusCode = 403;
    throw err;
  }

  await agent.registerSuccessfulLogin();
  console.info(`[auth] successful login for=${agent.email} ip=${clientIp}`);
};

const loginAgent = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required.');
  }

  const searchKey = normalizeEmail(email);
  const agent = await Agent.findOne({ email: searchKey }).select('+password +loginAttempts +lockUntil');

  try {
    await attemptLogin({ agent, password, req });
  } catch (err) {
    res.status(err.statusCode || 401);
    throw err;
  }

  const token = generateToken(agent._id);
  res.json(buildAuthResponse(agent, token));
};

const googleAuth = async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    res.status(400);
    throw new Error('Google credential token is required.');
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503);
    throw new Error('Google authentication is not configured.');
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    res.status(400);
    throw new Error('Invalid Google token payload.');
  }

  const { email, name } = payload;
  const cleanEmail = normalizeEmail(email);
  let agent = await Agent.findOne({ email: cleanEmail });

  if (!agent) {
    const randomPassword = crypto.randomBytes(24).toString('hex') + 'A1!';
    const isFirstAdmin = cleanEmail === RESOLVED_ADMIN_EMAIL;
    try {
      agent = await Agent.create({
        clerkId: payload.sub || `google-${crypto.randomUUID()}`,
        agencyName: isFirstAdmin ? 'Dream Catcher Immigrations' : `Google Agency ${name || ''}`.trim(),
        ownerName: name || email.split('@')[0],
        email: cleanEmail,
        password: randomPassword,
        mobile: null,
        gstNumber: isFirstAdmin ? 'N/A' : `GST-PENDING-${Date.now()}`,
        address: '',
        city: '',
        state: '',
        country: '',
        role: isFirstAdmin ? 'SUPER_ADMIN' : 'Agent',
        status: isFirstAdmin ? 'Active' : 'Pending',
      });
    } catch (error) {
      if (error.code === 11000) {
        res.status(409);
        throw new Error('An account with this email already exists.');
      }
      throw error;
    }
  }

  if (agent.isActive === false || agent.status === 'Blocked') {
    res.status(403);
    throw new Error('Your account is blocked or inactive. Please contact support.');
  }

  const token = generateToken(agent._id);
  res.json(buildAuthResponse(agent, token));
};

const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error('Email and password are required.');
  }

  const agent = await Agent.findOne({ email: normalizeEmail(email), role: 'SUPER_ADMIN' }).select('+password +loginAttempts +lockUntil');

  try {
    await attemptLogin({ agent, password, req });
  } catch (err) {
    res.status(err.statusCode || 401);
    // Keep admin error messages generic regardless of the underlying reason,
    // except for the lockout case which is safe/useful to reveal.
    throw new Error(err.statusCode === 423 ? err.message : 'Invalid admin credentials.');
  }

  const token = generateToken(agent._id);
  res.json(buildAuthResponse(agent, token));
};

const getProfile = async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized.');
  }
  res.json(buildAuthResponse(req.user, null));
};

module.exports = {
  registerAgent,
  loginAgent,
  googleAuth,
  adminLogin,
  getProfile,
};
