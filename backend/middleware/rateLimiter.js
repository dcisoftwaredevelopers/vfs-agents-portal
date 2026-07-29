// npm i express-rate-limit
const rateLimit = require('express-rate-limit');

// Applies to /login and /admin/login — limits by IP.
// 10 attempts per 15 minutes per IP is generous enough for real users
// but stops automated brute-force scripts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true, // return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  // Skip counting successful logins against the limit (optional, keep simple: count all)
});

// Slightly stricter for admin login since it's a higher-value target.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many admin login attempts. Please try again after 15 minutes.' },
});

// Looser limiter for registration (still worth protecting from spam signups)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again later.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests. Please try again after 15 minutes.' },
});

module.exports = { loginLimiter, adminLoginLimiter, registerLimiter, forgotPasswordLimiter };
