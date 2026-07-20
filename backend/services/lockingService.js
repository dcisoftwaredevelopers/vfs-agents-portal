const Redis = require('ioredis');
const Slot = require('../models/Slot');
const SlotLock = require('../models/SlotLock');

let redis = null;
let useRedis = false;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 2000
    });

    redis.on('connect', () => {
      console.log('Redis Connected for Slot Locking.');
      useRedis = true;
    });

    redis.on('error', (err) => {
      console.warn('Redis Connection failed, falling back to MongoDB slot_locks locking:', err.message);
      useRedis = false;
    });
  } catch (err) {
    console.warn('Redis setup failed, falling back to MongoDB slot_locks locking:', err.message);
    useRedis = false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientMongoError = (err) => {
  const message = String(err && err.message ? err.message : err || '').toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('connection') ||
    message.includes('network') ||
    message.includes('server selection') ||
    err?.name === 'MongoNetworkError' ||
    err?.name === 'MongoServerSelectionError'
  );
};

const syncSlotCounters = async (slotId) => {
  const [slot, activeLockCount] = await Promise.all([
    Slot.findById(slotId).select('capacity bookedCount status').lean().maxTimeMS(5000),
    SlotLock.countDocuments({ slotId, expiresAt: { $gt: new Date() } }).maxTimeMS(5000)
  ]);

  if (!slot) return null;

  const availableCount = Math.max(0, Number(slot.capacity || 0) - Number(slot.bookedCount || 0) - activeLockCount);
  await Slot.updateOne(
    { _id: slotId },
    {
      $set: {
        lockedCount: activeLockCount,
        availableCount
      }
    }
  ).maxTimeMS(5000);

  return { slot, activeLockCount, availableCount };
};

const withMongoRetry = async (operation, label) => {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isTransientMongoError(err) || attempt === 2) {
        throw err;
      }
      console.warn(`${label} transient MongoDB error, retrying (${attempt}/2): ${err.message}`);
      await sleep(200);
    }
  }
  throw lastError;
};

exports.acquireLock = async (slotId, userId) => {
  const lockKey = `LOCK:SLOT:${slotId}:${userId}`;
  const ttlSeconds = 600; // 10 minutes

  return withMongoRetry(async () => {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const now = new Date();

    if (useRedis && redis) {
      try {
        const result = await redis.set(lockKey, userId, 'NX', 'EX', ttlSeconds);
        if (result !== 'OK') {
          return false;
        }
      } catch (err) {
        console.error('Redis lock acquisition failed:', err.message);
      }
    }

    // await SlotLock.deleteMany({ slotId, expiresAt: { $lte: now } }).maxTimeMS(5000);

    // const existingUserLock = await SlotLock.findOne({
    //   slotId,
    //   userId,
    //   expiresAt: { $gt: now }
    // }).maxTimeMS(5000);

    const [, existingUserLock ] = await Promise.all([
      SlotLock.deleteMany({ slotId, expiresAt: { $lte: now }}).maxTimeMS(5000),
      SlotLock.findOne({ slotId, userId, expiresAt: { $gt: now }}).maxTimeMS(5000)
    ]);

    if (existingUserLock) {
      existingUserLock.expiresAt = expiresAt;
      await existingUserLock.save();
      await syncSlotCounters(slotId);
      return true;
    }

    const tentativeLock = await SlotLock.create({ slotId, userId, expiresAt });
    const synced = await syncSlotCounters(slotId);

    if (!synced || synced.slot.status !== 'AVAILABLE') {
      await SlotLock.deleteOne({ _id: tentativeLock._id }).maxTimeMS(5000);
      await syncSlotCounters(slotId);
      if (useRedis && redis) {
        try { await redis.del(lockKey); } catch (e) {}
      }
      return false;
    }

    const usableCapacity = Math.max(0, Number(synced.slot.capacity || 0) - Number(synced.slot.bookedCount || 0));
    if (synced.activeLockCount > usableCapacity) {
      await SlotLock.deleteOne({ _id: tentativeLock._id }).maxTimeMS(5000);
      await syncSlotCounters(slotId);
      if (useRedis && redis) {
        try { await redis.del(lockKey); } catch (e) {}
      }
      return false;
    }

    return true;
  }, 'Slot lock acquisition').catch(async (err) => {
    console.error('MongoDB SlotLock acquisition error:', err.message);
    if (useRedis && redis) {
      try { await redis.del(lockKey); } catch (e) {}
    }
    return false;
  });
};

exports.releaseLock = async (slotId, userId, session = null) => {
  const lockKey = `LOCK:SLOT:${slotId}:${userId}`;

  if (useRedis && redis) {
    try {
      const owner = await redis.get(lockKey);
      if (owner === userId) {
        await redis.del(lockKey);
      }
    } catch (err) {
      console.error('Redis lock release error:', err.message);
    }
  }

  try {
    const deleteQuery = SlotLock.findOneAndDelete({ slotId, userId }).maxTimeMS(5000);
    if (session) deleteQuery.session(session);
    const deleted = await deleteQuery;

    if (deleted) {
      const countQuery = SlotLock.countDocuments({
        slotId,
        expiresAt: { $gt: new Date() }
      }).maxTimeMS(5000);
      if (session) countQuery.session(session);
      const activeLockCount = await countQuery;
      const updateQuery = Slot.findOneAndUpdate(
        { _id: slotId },
        [
          {
            $set: {
              lockedCount: activeLockCount,
              availableCount: {
                $max: [
                  0,
                  { $subtract: ['$capacity', { $add: ['$bookedCount', activeLockCount] }] }
                ]
              }
            }
          }
        ]
      ).maxTimeMS(5000);
      if (session) updateQuery.session(session);
      await updateQuery;
    }

    return !!deleted;
  } catch (err) {
    console.error('DB lock release error:', err.message);
    return false;
  }
};

exports.isLockOwner = async (slotId, userId) => {
  const lockKey = `LOCK:SLOT:${slotId}:${userId}`;

  if (useRedis && redis) {
    try {
      const owner = await redis.get(lockKey);
      if (owner === userId) return true;
    } catch (err) {
      console.error('Redis lock owner check error:', err.message);
    }
  }

  try {
    const activeLock = await SlotLock.findOne({
      slotId,
      userId,
      expiresAt: { $gt: new Date() }
    }).maxTimeMS(5000);
    return !!activeLock;
  } catch (err) {
    console.error('DB lock owner verification check error:', err.message);
    return false;
  }
};
