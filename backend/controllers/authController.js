const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const Agent = require('../models/Agent');
const { generateToken, setAuthCookie, clearAuthCookie, normalizeEmail, buildAuthResponse } = require('../utils/authUtils');
const rewardService = require('../services/rewardService');
// NOTE: asyncHandler wrapping is done in routes/auth.js via your own
// utils/asyncHandler.js — so these controller functions are plain async
// functions here and don't wrap themselves.

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const RESOLVED_ADMIN_EMAIL = normalizeEmail(ADMIN_EMAIL || 'admindci@gmail.com');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

const PROFILE_COMPLETION_FIELDS = [
  'agencyName',
  'ownerName',
  'mobile',
  'panNumber',
  'aadharNumber',
  'address',
  'city',
  'state',
  'country',
];

const buildProfileIncompleteResponse = (agent) => ({
  ...buildAuthResponse(agent),
  needsProfileCompletion: true,
  redirectTo: '/complete-profile',
  message: 'Please complete your agency profile to finish registration.',
  requiredFields: PROFILE_COMPLETION_FIELDS,
});

const validateCompleteProfilePayload = (body) => {
  const {
    agencyName,
    ownerName,
    mobile,
    gstNumber,
    panNumber,
    aadharNumber,
    address,
    city,
    state,
    country,
  } = body;
  const errors = {};

  if (!agencyName || agencyName.trim().length < 2) {
    errors.agencyName = 'Agency name must be at least 2 characters long';
  }
  if (!ownerName || ownerName.trim().length < 2) {
    errors.ownerName = 'Owner name must be at least 2 characters long';
  }
  if (!mobile || !/^\+?[1-9]\d{1,14}$/.test(String(mobile).replace(/\s+/g, ''))) {
    errors.mobile = 'Please provide a valid mobile number (e.g. +91 9876543210)';
  }
  if (gstNumber && gstNumber.trim()) {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(gstNumber.trim().toUpperCase())) {
      errors.gstNumber = 'Please provide a valid GST number (e.g. 22AAAAA0000A1Z5)';
    }
  }
  if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
    errors.panNumber = 'Please provide a valid 10-character PAN number (e.g. ABCDE1234F)';
  }
  if (!aadharNumber || !/^[0-9]{12}$/.test(aadharNumber.trim().replace(/\s+/g, ''))) {
    errors.aadharNumber = 'Aadhar number must be exactly 12 digits';
  }
  if (!address || address.trim().length < 5) {
    errors.address = 'Office Address must be at least 5 characters long';
  }
  if (!city || city.trim().length < 2) {
    errors.city = 'City is required';
  }
  if (!state || state.trim().length < 2) {
    errors.state = 'State is required';
  }
  if (!country || country.trim().length < 2) {
    errors.country = 'Country is required';
  }

  return errors;
};

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
    setAuthCookie(res, token);
    res.status(201).json(buildAuthResponse(agent));
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
  setAuthCookie(res, token);
  res.json(buildAuthResponse(agent));
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
    const isFirstAdmin = cleanEmail === RESOLVED_ADMIN_EMAIL;
    try {
      if (isFirstAdmin) {
        const randomPassword = crypto.randomBytes(24).toString('hex') + 'A1!';
        agent = await Agent.create({
          clerkId: payload.sub || `google-${crypto.randomUUID()}`,
          agencyName: 'Dream Catcher Immigrations',
          ownerName: name || email.split('@')[0],
          email: cleanEmail,
          password: randomPassword,
          mobile: '0000000000',
          panNumber: 'AAAAA0000A',
          aadharNumber: '000000000000',
          address: 'N/A',
          city: 'N/A',
          state: 'N/A',
          country: 'India',
          role: 'SUPER_ADMIN',
          status: 'Active',
        });
      } else {
        agent = await Agent.create({
          clerkId: payload.sub || `google-${crypto.randomUUID()}`,
          agencyName: `Google Agency ${name || email.split('@')[0]}`.trim(),
          ownerName: name || email.split('@')[0],
          email: cleanEmail,
          role: 'Agent',
          status: 'ProfileIncomplete',
        });
      }
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
  setAuthCookie(res, token);
  if (agent.status === 'ProfileIncomplete') {
    return res.status(200).json(buildProfileIncompleteResponse(agent));
  }

  res.json(buildAuthResponse(agent));
};

const completeGoogleProfile = async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized.');
  }

  if (req.user.status !== 'ProfileIncomplete') {
    res.status(400);
    throw new Error('Profile completion is only available for incomplete Google registrations.');
  }

  const errors = validateCompleteProfilePayload(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const {
    agencyName,
    ownerName,
    mobile,
    gstNumber,
    panNumber,
    aadharNumber,
    businessRegNumber,
    address,
    city,
    state,
    country,
  } = req.body;

  req.user.agencyName = agencyName.trim();
  req.user.ownerName = ownerName.trim();
  req.user.mobile = mobile.trim();
  req.user.panNumber = panNumber.trim().toUpperCase();
  req.user.aadharNumber = aadharNumber.trim().replace(/\s+/g, '');
  req.user.businessRegNumber = businessRegNumber || '';
  req.user.address = address.trim();
  req.user.city = city.trim();
  req.user.state = state.trim();
  req.user.country = country.trim();
  req.user.logo = req.file ? req.file.path : req.user.logo;
  req.user.status = 'Pending';

  if (gstNumber && gstNumber.trim()) {
    req.user.gstNumber = gstNumber.trim().toUpperCase();
  } else {
    req.user.gstNumber = undefined;
  }

  try {
    await req.user.save();
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(400).json({
        message: field === 'gstNumber'
          ? 'GST Number is already registered.'
          : 'Profile could not be completed because a unique field already exists.'
      });
    }
    throw error;
  }

  res.json({
    message: 'Profile completed successfully. Your agency profile is pending verification.',
    ...buildAuthResponse(req.user),
    needsProfileCompletion: false,
  });
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
  setAuthCookie(res, token);
  res.json(buildAuthResponse(agent));
};

const getProfile = async (req, res) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized.');
  }
  res.json(buildAuthResponse(req.user));
};

const logout = async (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully.' });
};

module.exports = {
  registerAgent,
  loginAgent,
  googleAuth,
  completeGoogleProfile,
  adminLogin,
  getProfile,
  logout,
};
