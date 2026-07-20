const express = require('express');
const router = express.Router();
const { trackApplication, trackLimiter } = require('../controllers/Trackingcontroller');

router.get('/track', trackLimiter, trackApplication);

module.exports = router;
