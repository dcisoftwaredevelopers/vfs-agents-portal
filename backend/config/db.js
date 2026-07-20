// const mongoose = require('mongoose');

// const connectDB = async () => {
//   try {
//     const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vfs_global');
//     console.log(`MongoDB Connected: ${conn.connection.host}`);
//   } catch (error) {
//     console.error(`Error: ${error.message}`);
//     process.exit(1);
//   }
// };

// module.exports = connectDB;

const mongoose = require('mongoose');

const readPositiveIntEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const ensureOptionalGstIndex = async () => {
  try {
    const Agent = require('../models/Agent');
    const desiredPartial = { gstNumber: { $type: 'string', $gt: '' } };
    const indexes = await Agent.collection.indexes();
    const gstIndex = indexes.find((index) => index.name === 'gstNumber_1');
    const hasDesiredPartial = JSON.stringify(gstIndex?.partialFilterExpression || {}) === JSON.stringify(desiredPartial);

    if (gstIndex && (!gstIndex.unique || !hasDesiredPartial)) {
      await Agent.collection.dropIndex('gstNumber_1');
      console.log('Dropped legacy gstNumber_1 index so GST can remain optional.');
    }

    await Agent.collection.createIndex(
      { gstNumber: 1 },
      {
        name: 'gstNumber_1',
        unique: true,
        partialFilterExpression: desiredPartial
      }
    );
  } catch (error) {
    console.warn(`GST optional index check skipped/failed: ${error.message}`);
  }
};

const backfillReferralRewards = async () => {
  try {
    const rewardService = require('../services/rewardService');
    const awardedCount = await rewardService.backfillMissingReferralRewards();
    if (awardedCount > 0) {
      console.log(`Backfilled ${awardedCount} missing referral reward(s).`);
    }
  } catch (error) {
    console.warn(`Referral reward backfill skipped/failed: ${error.message}`);
  }
};

const ensurePerformanceIndexes = async () => {
  try {
    await Promise.all([
      require('../models/Appointment').createIndexes(),
      require('../models/Slot').createIndexes(),
      require('../models/SlotLock').createIndexes(),
      require('../models/Subscription').createIndexes(),
      require('../models/EmailVerification').createIndexes(),
      require('../models/SlotBlock').createIndexes(),
      require('../models/EmergencyClosure').createIndexes()
    ]);
  } catch (error) {
    console.warn(`Performance index check skipped/failed: ${error.message}`);
  }
};

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vfs_global';

    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: readPositiveIntEnv('MONGO_SERVER_SELECTION_TIMEOUT_MS', 5000),
      connectTimeoutMS: readPositiveIntEnv('MONGO_CONNECT_TIMEOUT_MS', 10000),
      socketTimeoutMS: readPositiveIntEnv('MONGO_SOCKET_TIMEOUT_MS', 30000),
      maxPoolSize: readPositiveIntEnv('MONGO_MAX_POOL_SIZE', 20),
      minPoolSize: readPositiveIntEnv('MONGO_MIN_POOL_SIZE', 2),
      maxIdleTimeMS: readPositiveIntEnv('MONGO_MAX_IDLE_TIME_MS', 60000),
      heartbeatFrequencyMS: readPositiveIntEnv('MONGO_HEARTBEAT_FREQUENCY_MS', 10000),
      retryWrites: true,
      retryReads: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    ensureOptionalGstIndex();
    ensurePerformanceIndexes();
    backfillReferralRewards();

    // Log connection issues after initial connect (e.g. network drop)
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('connected', () => {
      console.log('MongoDB connection established.');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected successfully.');
    });

  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1); // exit so Render/PM2 restarts the service
  }
};

// Graceful shutdown on app termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed due to app termination');
  process.exit(0);
});

module.exports = connectDB;
