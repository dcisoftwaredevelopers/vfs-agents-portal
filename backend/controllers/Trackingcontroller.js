const rateLimit = require('express-rate-limit');
const Appointment = require('../models/Appointment');
const { asyncHandler } = require('../utils/asyncHandler');

// Public endpoint, no auth — referenceNumber is only a 6-digit code, so this
// is brute-forceable without a limiter. 10 requests / 15 min per IP is enough
// for a genuine applicant re-checking their own status, but not enough to
// scan the reference-number space.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many tracking attempts. Please try again in a few minutes.' },
});

// GET /api/tracking/track?referenceNumber=...&lastName=...
const trackApplication = asyncHandler(async (req, res) => {
  const { referenceNumber, lastName } = req.query;

  if (!referenceNumber || !lastName) {
    return res.status(400).json({ message: 'Reference number and last name are required' });
  }

  const appointment = await Appointment.findOne({ referenceNumber: referenceNumber.trim() });
  if (!appointment) {
    return res.status(404).json({ message: 'Application not found with the provided details' });
  }

  const applicant = appointment.applicantDetails?.find(
    app => app.lastName.trim().toLowerCase() === lastName.trim().toLowerCase()
  );
  if (!applicant) {
    return res.status(404).json({ message: 'Application not found with the provided details' });
  }

  res.json({
    referenceNumber: appointment.referenceNumber,
    applicantName: `${applicant.firstName} ${applicant.lastName}`,
    visaCategory: applicant.visaCategory,
    bookingDate: appointment.bookingDate,
    bookingTime: appointment.bookingTime,
    applicationStatus: appointment.applicationStatus,
    updatedAt: appointment.updatedAt,
  });
});

module.exports = { trackApplication, trackLimiter };
