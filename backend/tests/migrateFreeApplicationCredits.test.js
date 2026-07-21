const assert = require('assert');

function simulateMigration(docs) {
  let modified = 0;
  let skipped = 0;

  for (const doc of docs) {
    if (!Object.prototype.hasOwnProperty.call(doc, 'freeBookingsAvailable')) continue;

    const set = {};
    if (doc.freeApplicationsAvailable === undefined || doc.freeApplicationsAvailable === null) {
      set.freeApplicationsAvailable = Number(doc.freeBookingsAvailable || 0);
    }
    if (doc.freeApplicationsUsed === undefined || doc.freeApplicationsUsed === null) {
      set.freeApplicationsUsed = 0;
    }

    if (Object.keys(set).length === 0) {
      skipped += 1;
      continue;
    }

    Object.assign(doc, set);
    modified += 1;
  }

  return { modified, skipped };
}

const docs = [
  { freeBookingsAvailable: 2 },
  { freeBookingsAvailable: 1, freeApplicationsAvailable: 1, freeApplicationsUsed: 0 },
  { freeApplicationsAvailable: 3, freeApplicationsUsed: 1 }
];

assert.deepStrictEqual(simulateMigration(docs), { modified: 1, skipped: 1 });
assert.deepStrictEqual(docs[0], {
  freeBookingsAvailable: 2,
  freeApplicationsAvailable: 2,
  freeApplicationsUsed: 0
});

assert.deepStrictEqual(simulateMigration(docs), { modified: 0, skipped: 2 });
assert.strictEqual(docs[0].freeApplicationsAvailable, 2);
assert.strictEqual(docs[0].freeApplicationsUsed, 0);

console.log('migrateFreeApplicationCredits.test.js passed');
