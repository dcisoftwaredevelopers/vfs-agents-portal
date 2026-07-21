const assert = require('assert');
const feeService = require('../services/feeService');
const freeApplicationService = require('../services/freeApplicationService');

function appointment(totalAmount, applicants) {
  return {
    totalAmount,
    applicantDetails: Array.from({ length: applicants }, (_, index) => ({ firstName: `A${index}` }))
  };
}

assert.strictEqual(feeService.calculateFreeApplicationDiscount(9000, 1), 9000);
assert.strictEqual(feeService.calculateFreeApplicationDiscount(9000, 2), 4500);
assert.strictEqual(feeService.calculateFreeApplicationDiscount(10000, 3), 3333);

assert.deepStrictEqual(
  freeApplicationService.buildFreeApplicationAmounts(appointment(9000, 1)),
  { applicantCount: 1, discountAmount: 9000, payableAmount: 0 }
);

assert.deepStrictEqual(
  freeApplicationService.buildFreeApplicationAmounts(appointment(9000, 2)),
  { applicantCount: 2, discountAmount: 4500, payableAmount: 4500 }
);

assert.deepStrictEqual(
  freeApplicationService.buildFreeApplicationAmounts(appointment(10000, 3)),
  { applicantCount: 3, discountAmount: 3333, payableAmount: 6667 }
);

assert.strictEqual(
  freeApplicationService.getAvailableFreeApplicationCredits({ freeApplicationsAvailable: 1, freeApplicationsUsed: 1 }),
  0
);

assert.strictEqual(
  freeApplicationService.getAvailableFreeApplicationCredits({ freeApplicationsAvailable: 2, freeApplicationsUsed: 1 }),
  1
);

console.log('freeApplicationLogic.test.js passed');
