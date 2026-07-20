const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const referralController = require('../controllers/ReferralController');

router.get('/status', protect, referralController.getReferralStatus);
router.post('/redeem', protect, referralController.redeemFreeBooking);
router.post('/redeem-gold', protect, referralController.redeemFreeBooking);

module.exports = router;
