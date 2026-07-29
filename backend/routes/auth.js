const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { validateAgentRegister, validateLogin } = require('../middleware/validators');
const { asyncHandler } = require('../utils/asyncHandler');
const { loginLimiter, adminLoginLimiter, registerLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiter'); // ADDED
const upload = require('../config/multer'); // ADDED: Import multer config
const {
  registerAgent,
  loginAgent,
  googleAuth,
  completeGoogleProfile,
  adminLogin,
  forgotAgentPassword,
  resetAgentPassword,
  getProfile,
  logout,
} = require('../controllers/authController');

// ADDED: rate limiters placed before validation/controller so brute-force
// requests get rejected early, before hitting DB or bcrypt (cheap to expensive).
router.post('/register', registerLimiter, upload.single('logo'), validateAgentRegister, asyncHandler(registerAgent));
router.post('/login', loginLimiter, validateLogin, asyncHandler(loginAgent));
router.post('/forgot-password', forgotPasswordLimiter, asyncHandler(forgotAgentPassword));
router.post('/reset-password', forgotPasswordLimiter, asyncHandler(resetAgentPassword));
router.post('/google', loginLimiter, asyncHandler(googleAuth));
router.put('/complete-profile', protect, upload.single('logo'), asyncHandler(completeGoogleProfile));
router.post('/admin-login', adminLoginLimiter, asyncHandler(adminLogin));
router.post('/logout', asyncHandler(logout));
router.get('/me', protect, asyncHandler(getProfile));

// Update user language preference
router.put('/profile/language', protect, async (req, res) => {
  const { language } = req.body;
  if (!language || language.length !== 2) {
    return res.status(400).json({ message: 'Invalid language code' });
  }

  try {
    const Agent = require('../models/Agent');
    const agent = await Agent.findById(req.user._id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    
    agent.preferredLanguage = language;
    await agent.save();
    
    res.json({
      message: 'Language updated successfully',
      preferredLanguage: agent.preferredLanguage
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
