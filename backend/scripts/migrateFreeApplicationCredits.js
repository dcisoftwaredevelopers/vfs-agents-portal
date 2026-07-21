const mongoose = require('mongoose');
const Agent = require('../models/Agent');

async function migrateFreeApplicationCredits({ dryRun = false } = {}) {
  const agentsWithOldField = await Agent.find({ freeBookingsAvailable: { $exists: true } })
    .select('_id freeBookingsAvailable freeApplicationsAvailable freeApplicationsUsed')
    .lean();

  let modified = 0;
  let skipped = 0;

  for (const agent of agentsWithOldField) {
    const set = {};

    if (agent.freeApplicationsAvailable === undefined || agent.freeApplicationsAvailable === null) {
      set.freeApplicationsAvailable = Number(agent.freeBookingsAvailable || 0);
    }

    if (agent.freeApplicationsUsed === undefined || agent.freeApplicationsUsed === null) {
      set.freeApplicationsUsed = 0;
    }

    if (Object.keys(set).length === 0) {
      skipped += 1;
      continue;
    }

    modified += 1;
    if (!dryRun) {
      await Agent.updateOne({ _id: agent._id }, { $set: set });
    }
  }

  const alreadyMigratedWithoutOldField = await Agent.countDocuments({
    freeBookingsAvailable: { $exists: false },
    freeApplicationsAvailable: { $exists: true }
  });

  return {
    modified,
    skipped,
    alreadyMigratedWithoutOldField,
    warning: 'Deprecated field freeBookingsAvailable was intentionally not removed. Run a separate cleanup only after repo-wide grep confirms no runtime code reads it.'
  };
}

async function runCli() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI is required.');
  }

  await mongoose.connect(mongoUri);
  const summary = await migrateFreeApplicationCredits();
  console.log('Free application credit migration summary:', summary);
  await mongoose.disconnect();
}

if (require.main === module) {
  runCli().catch(async (error) => {
    console.error('Migration failed:', error);
    try { await mongoose.disconnect(); } catch (disconnectError) {}
    process.exit(1);
  });
}

module.exports = { migrateFreeApplicationCredits };
