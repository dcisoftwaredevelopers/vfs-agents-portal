const express = require('express');
const router = express.Router();
const { protect, verifyActiveSubscription } = require('../middleware/authMiddleware');
const bookingController = require('../controllers/Bookingcontroller');
const upload = require('../config/multer');

// Public lookup endpoints
router.get('/centers', bookingController.getCenters);
router.get('/countries', bookingController.getCountries);
router.get('/centers-config', bookingController.getCentersConfig);
router.get('/centers-by-country', bookingController.getCentersByCountry);

// Booking drafts
router.get('/draft/active', protect, verifyActiveSubscription, bookingController.getActiveDraft);
router.post('/draft', protect, verifyActiveSubscription, upload.any(), bookingController.saveDraft);
router.delete('/draft/active', protect, verifyActiveSubscription, bookingController.discardDraft);
router.post('/draft/complete', protect, verifyActiveSubscription, bookingController.completeDraft);

// Slot availability
router.get('/slots', protect, verifyActiveSubscription, bookingController.getSlots);
router.get('/emergency-closures', protect, verifyActiveSubscription, bookingController.getEmergencyClosures);

// Email OTP verification
router.post('/otp/send', protect, bookingController.sendOtp);
router.post('/otp/verify', protect, bookingController.verifyOtp);

// Lock / payment / cancel flow
router.post('/lock', protect, verifyActiveSubscription, upload.any(), bookingController.lockSlot);
router.post('/payment', protect, verifyActiveSubscription, upload.single('screenshot'), bookingController.submitPayment);
router.post('/cancel', protect, verifyActiveSubscription, bookingController.cancelAppointment);

// History
router.get('/history', protect, bookingController.getHistory);
router.get('/my-appointments', protect, bookingController.getMyAppointments); // legacy alias

// Legacy direct-create mapper
router.post('/create', protect, verifyActiveSubscription, bookingController.createLegacyBooking);

module.exports = router;
