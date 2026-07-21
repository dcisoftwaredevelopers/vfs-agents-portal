const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const SlotLock = require('../models/SlotLock');
const feeService = require('./feeService');

const FREE_APPLICATION_PENDING_STATUS = 'PENDING';

function parseBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function getApplicantCount(appointment) {
  return Math.max(1, Array.isArray(appointment.applicantDetails) ? appointment.applicantDetails.length : 1);
}

function getAvailableFreeApplicationCredits(agent) {
  return Math.max(
    0,
    Number(agent?.freeApplicationsAvailable || 0) - Number(agent?.freeApplicationsUsed || 0)
  );
}

async function assertPendingCreditCapacity(agentId, availableCredits, excludeAppointmentId = null) {
  const query = {
    userId: agentId,
    freeApplicationVerificationStatus: FREE_APPLICATION_PENDING_STATUS
  };

  if (excludeAppointmentId && mongoose.Types.ObjectId.isValid(String(excludeAppointmentId))) {
    query._id = { $ne: excludeAppointmentId };
  }

  const pendingCount = await Appointment.countDocuments(query).maxTimeMS(5000);
  if (pendingCount >= availableCredits) {
    const error = new Error('You already have pending free application requests equal to your available credits. Please wait for admin verification before using another credit.');
    error.statusCode = 400;
    throw error;
  }
}

function buildFreeApplicationAmounts(appointment) {
  const applicantCount = getApplicantCount(appointment);
  const totalAmount = Number(appointment.totalAmount || 0);
  const discountAmount = Math.min(totalAmount, feeService.calculateFreeApplicationDiscount(totalAmount, applicantCount));
  const payableAmount = Math.max(0, totalAmount - discountAmount);

  return { applicantCount, discountAmount, payableAmount };
}

async function createPendingPayment({ appointment, transactionId, screenshot, amount }) {
  if (!transactionId || String(transactionId).trim().length < 6) {
    const error = new Error('Transaction / Reference ID is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!screenshot) {
    const error = new Error('Payment screenshot is required.');
    error.statusCode = 400;
    throw error;
  }

  const existingPayment = await Payment.findOne({ transactionId }).maxTimeMS(5000);
  if (existingPayment) {
    const error = new Error('This Transaction/Reference ID has already been submitted.');
    error.statusCode = 400;
    throw error;
  }

  const payment = new Payment({
    appointmentId: appointment._id,
    amount,
    transactionId,
    screenshot,
    gatewayResponse: { manualVerification: true },
    status: 'PENDING_VERIFICATION'
  });
  await payment.save();
  return payment;
}

async function extendSlotLock(appointment, userId) {
  await SlotLock.findOneAndUpdate(
    { slotId: appointment.slotId, userId },
    { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
  ).maxTimeMS(5000);
}

module.exports = {
  FREE_APPLICATION_PENDING_STATUS,
  parseBoolean,
  getApplicantCount,
  getAvailableFreeApplicationCredits,
  assertPendingCreditCapacity,
  buildFreeApplicationAmounts,
  createPendingPayment,
  extendSlotLock
};
