const assert = require('assert');
const feeService = require('../services/feeService');

function submit({ totalAmount, applicantCount, availableCredits, usedCredits, requested, hasProof }) {
  if (requested && availableCredits <= usedCredits) {
    return { ok: false, status: 400, message: 'No free application credits are available for this agent.' };
  }

  if (!requested) {
    return {
      ok: true,
      status: 'Pending Verification',
      paymentStatus: 'Pending Verification',
      discountAmount: 0,
      payableAmount: totalAmount,
      requiresProof: true
    };
  }

  const discountAmount = Math.min(totalAmount, feeService.calculateFreeApplicationDiscount(totalAmount, applicantCount));
  const payableAmount = totalAmount - discountAmount;
  if (payableAmount > 0 && !hasProof) {
    return { ok: false, status: 400, message: 'Payment screenshot is required.' };
  }

  return {
    ok: true,
    status: 'Pending Verification',
    paymentStatus: payableAmount > 0 ? 'Pending Verification' : 'Pending',
    freeApplicationVerificationStatus: 'PENDING',
    discountAmount,
    payableAmount
  };
}

function guardedApprove(state) {
  if (state.appointment.freeApplicationVerificationStatus !== 'PENDING') {
    return { ok: false, message: 'already processed' };
  }
  if (state.appointment.payableAmount > 0 && state.paymentStatus !== 'SUCCESS') {
    return { ok: false, message: 'Balance payment must be approved before approving the free application credit.' };
  }
  if (state.agent.freeApplicationsUsed >= state.agent.freeApplicationsAvailable) {
    return { ok: false, message: 'Agent has no free application credits remaining.' };
  }

  state.appointment.freeApplicationVerificationStatus = 'APPROVED';
  state.appointment.status = 'BOOKED';
  state.appointment.paymentStatus = 'Paid';
  state.agent.freeApplicationsUsed += 1;
  state.slot.bookedCount += 1;
  return { ok: true };
}

function reject(state, reason) {
  state.appointment.freeApplicationVerificationStatus = 'REJECTED';
  state.appointment.status = 'Payment Rejected';
  state.appointment.paymentStatus = 'Payment Rejected';
  state.appointment.payableAmount = state.appointment.totalAmount;
  state.appointment.freeApplicationDiscountAmount = 0;
  state.appointment.freeApplicationRejectionReason = reason;
  return state.appointment;
}

assert.deepStrictEqual(
  submit({ totalAmount: 9000, applicantCount: 1, availableCredits: 1, usedCredits: 0, requested: true, hasProof: false }),
  {
    ok: true,
    status: 'Pending Verification',
    paymentStatus: 'Pending',
    freeApplicationVerificationStatus: 'PENDING',
    discountAmount: 9000,
    payableAmount: 0
  }
);

assert.deepStrictEqual(
  submit({ totalAmount: 9000, applicantCount: 2, availableCredits: 1, usedCredits: 0, requested: true, hasProof: true }).payableAmount,
  4500
);

assert.deepStrictEqual(
  submit({ totalAmount: 10000, applicantCount: 3, availableCredits: 1, usedCredits: 0, requested: true, hasProof: true }).discountAmount,
  3333
);

assert.strictEqual(
  submit({ totalAmount: 9000, applicantCount: 2, availableCredits: 1, usedCredits: 0, requested: false, hasProof: true }).payableAmount,
  9000
);

assert.strictEqual(
  submit({ totalAmount: 9000, applicantCount: 1, availableCredits: 0, usedCredits: 0, requested: true, hasProof: false }).status,
  400
);

const concurrentState = {
  agent: { freeApplicationsAvailable: 1, freeApplicationsUsed: 0 },
  appointment: { freeApplicationVerificationStatus: 'PENDING', payableAmount: 0 },
  paymentStatus: null,
  slot: { bookedCount: 0 }
};
assert.strictEqual(guardedApprove(concurrentState).ok, true);
assert.strictEqual(guardedApprove(concurrentState).ok, false);
assert.strictEqual(concurrentState.agent.freeApplicationsUsed, 1);
assert.strictEqual(concurrentState.slot.bookedCount, 1);

const unpaidState = {
  agent: { freeApplicationsAvailable: 1, freeApplicationsUsed: 0 },
  appointment: { freeApplicationVerificationStatus: 'PENDING', payableAmount: 4500 },
  paymentStatus: 'PENDING_VERIFICATION',
  slot: { bookedCount: 0 }
};
assert.strictEqual(guardedApprove(unpaidState).ok, false);
assert.notStrictEqual(unpaidState.appointment.status, 'BOOKED');

const otherApprovalState = {
  agent: { freeApplicationsAvailable: 1, freeApplicationsUsed: 1 },
  appointment: { freeApplicationVerificationStatus: 'PENDING', payableAmount: 0 },
  paymentStatus: null,
  slot: { bookedCount: 0 }
};
assert.strictEqual(guardedApprove(otherApprovalState).ok, false);
assert.strictEqual(otherApprovalState.agent.freeApplicationsUsed, 1);

const rejected = reject({
  appointment: {
    totalAmount: 9000,
    freeApplicationVerificationStatus: 'PENDING',
    payableAmount: 0,
    freeApplicationDiscountAmount: 9000
  }
}, 'Invalid claim');
assert.strictEqual(rejected.payableAmount, 9000);
assert.strictEqual(rejected.freeApplicationRejectionReason, 'Invalid claim');
assert.strictEqual(rejected.status, 'Payment Rejected');

console.log('freeApplicationScenarios.test.js passed');
