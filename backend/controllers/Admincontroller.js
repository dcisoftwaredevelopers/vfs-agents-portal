const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Agent = require('../models/Agent');
const Slot = require('../models/Slot');
const Center = require('../models/Center');
const SlotBlock = require('../models/SlotBlock');
const SlotLock = require('../models/SlotLock');
const EmergencyClosure = require('../models/EmergencyClosure');
const AuditLog = require('../models/AuditLog');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const RenewalHistory = require('../models/RenewalHistory');
const AgentNotification = require('../models/AgentNotification');

const { logAuditAction } = require('../services/auditService');
const mailService = require('../services/mailService');
const socketService = require('../services/socketService');
const { isSlotBlocked, DEFAULT_SLOTS, getActiveLocksMap } = require('../services/slotAvailabilityService');
const { buildAppointmentConfirmationHtml, buildPaymentRejectedHtml, buildSubscriptionActivatedHtml, buildSubscriptionRejectedHtml } = require('../services/Emailtemplates');
const {
  buildSubscriptionVerificationReview,
  canApproveManualSubscription
} = require('../services/subscriptionPaymentSecurity');

const SUBSCRIPTION_CYCLE_DAYS = 28;

// ==========================================
// SHARED HELPERS (production hygiene)
// ==========================================

/**
 * Wraps an async route handler so thrown errors are forwarded to Express's
 * error middleware instead of needing a try/catch block in every function.
 * Keeps handlers short and ensures no unhandled promise rejections.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const badRequest = (res, message) => res.status(400).json({ message });
const notFound = (res, message) => res.status(404).json({ message });

/** Validates a Mongo ObjectId route param before hitting the DB. */
const requireValidId = (paramName = 'id') => (req, res, next) => {
  if (!isValidId(req.params[paramName])) {
    return badRequest(res, `Invalid ${paramName}`);
  }
  next();
};

/** Runs a set of mutations inside a transaction; auto commits/aborts. */
const withTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    session.endSession();
  }
};

/** Sends mail without ever letting a delivery failure break the request. */
const sendMailSafely = async (options, fromName) => {
  try {
    await mailService.sendMail(options, fromName);
  } catch (err) {
    console.error(`Mail delivery failed (${options.subject}):`, err.message);
  }
};

// ==========================================
// LEGACY COMPATIBLE ENDPOINTS
// ==========================================

// Get all appointments (Admin/Supervisor only)
exports.getAppointments = asyncHandler(async (req, res) => {
  const appointments = await Appointment.find()
    .populate('userId', 'agencyName ownerName email mobile')
    .populate('centerId', 'name city')
    .sort({ createdAt: -1 })
    .lean(); // read-only list -> skip Mongoose document overhead
  res.json(appointments);
});

const VALID_APPOINTMENT_STATUSES = ['Processing', 'Proceed', 'Delivered', 'Delayed'];

// Update appointment status (Admin only)
exports.updateAppointmentStatus = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const { applicationStatus } = req.body;
    if (!VALID_APPOINTMENT_STATUSES.includes(applicationStatus)) {
      return badRequest(res, 'Invalid status');
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return notFound(res, 'Appointment not found');

    const oldStatus = appointment.applicationStatus;
    appointment.applicationStatus = applicationStatus;
    await appointment.save();

    await logAuditAction(req, 'UPDATE_APPOINTMENT_STATUS', 'Appointment', appointment._id, { status: oldStatus }, { status: applicationStatus });

    res.json(appointment);
  }),
];

// Get admin stats (Admin/Supervisor only)
// Previously loaded every appointment into memory and summed in JS.
// Replaced with a single aggregation pipeline so the work happens in the DB.
exports.getStats = asyncHandler(async (req, res) => {
  const [totalAppointments, revenueAgg, serviceAgg] = await Promise.all([
    Appointment.countDocuments(),
    Appointment.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
    Appointment.aggregate([
      { $unwind: '$servicesSelected' },
      { $group: { _id: '$servicesSelected.name', count: { $sum: 1 } } },
    ]),
  ]);

  const totalRevenue = revenueAgg[0]?.total || 0;
  const servicesCount = Object.fromEntries(serviceAgg.map((s) => [s._id, s.count]));

  res.json({ totalAppointments, totalRevenue, servicesCount });
});

// Get all registered users (Admin only)
exports.getUsers = asyncHandler(async (req, res) => {
  const users = await Agent.find({ role: { $ne: 'SUPER_ADMIN' } })
    .select('-password')
    .sort({ createdAt: -1 })
    .lean();
  res.json(users);
});

// ==========================================
// AUDIT LOGS
// ==========================================

const AUDIT_ACTION_TYPE_MAP = {
  'Block Created': 'BLOCK_SLOTS_HIERARCHICAL',
  'Block Removed': { $in: ['UNBLOCK_SLOTS_HIERARCHICAL', 'UNBLOCK_SLOTS_BULK'] },
  'Capacity Modified': 'UPDATE_CAPACITY',
};
const DEFAULT_AUDIT_ACTIONS = { $in: ['BLOCK_SLOTS_HIERARCHICAL', 'UNBLOCK_SLOTS_HIERARCHICAL', 'UNBLOCK_SLOTS_BULK', 'UPDATE_CAPACITY'] };

// Get Audit Logs with Filters
exports.getAuditLogs = asyncHandler(async (req, res) => {
  const { country, centerId, adminUser, actionType, startDate, endDate } = req.query;
  const query = { action: AUDIT_ACTION_TYPE_MAP[actionType] || DEFAULT_AUDIT_ACTIONS };

  if (adminUser && isValidId(adminUser)) {
    query.performedBy = adminUser;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
  }

  const logs = await AuditLog.find(query)
    .populate('performedBy', 'name email')
    .sort({ timestamp: -1 })
    .lean();

  // Previously issued one Center.findById() per log row (N+1 queries).
  // Batch-fetch every referenced center once, then look up in memory.
  const centerIds = [...new Set(logs.map((l) => l.newValue?.centerId).filter(Boolean).map(String))];
  const centers = centerIds.length ? await Center.find({ _id: { $in: centerIds } }).select('name').lean() : [];
  const centerNameById = new Map(centers.map((c) => [String(c._id), c.name]));

  let populatedLogs = logs.map((log) => ({
    _id: log._id,
    action: log.action,
    performedBy: log.performedBy,
    timestamp: log.timestamp,
    ipAddress: log.ipAddress,
    countryCode: log.newValue?.countryCode || 'N/A',
    centerName: centerNameById.get(String(log.newValue?.centerId)) || log.newValue?.centerName || 'All Centers',
    date: log.newValue?.date || 'N/A',
    timeSlot: log.newValue?.timeSlot || 'N/A',
    previousValue: log.newValue?.previousValue || (log.oldValue ? JSON.stringify(log.oldValue) : 'N/A'),
    newValue: log.newValue?.newValue || (log.newValue ? JSON.stringify(log.newValue) : 'N/A'),
    reason: log.newValue?.reason || 'N/A',
  }));

  if (country) {
    populatedLogs = populatedLogs.filter((l) => l.countryCode.toLowerCase() === country.toLowerCase());
  }
  if (centerId) {
    populatedLogs = populatedLogs.filter((l) => l.centerName.toLowerCase().includes(centerId.toLowerCase()));
  }

  res.json(populatedLogs);
});

// ==========================================
// SLOT MANAGEMENT
// ==========================================

// Create Slot
exports.createSlot = asyncHandler(async (req, res) => {
  const { centerId, date, startTime, endTime, capacity } = req.body;
  if (!centerId || !date || !startTime || !endTime) {
    return badRequest(res, 'All slot parameters are required');
  }
  if (!isValidId(centerId)) return badRequest(res, 'Invalid Center ID');

  const center = await Center.findById(centerId);
  if (!center) return notFound(res, 'Center not found');
  if (!center.active) return badRequest(res, 'Cannot allocate slots to an inactive center');

  const existing = await Slot.findOne({ centerId, date, startTime, endTime });
  if (existing) return badRequest(res, 'A slot for this date and time range already exists.');

  const newSlot = await Slot.create({
    centerId, date, startTime, endTime,
    capacity: capacity || 5,
    bookedCount: 0,
    status: 'AVAILABLE',
  });

  await logAuditAction(req, 'CREATE_SLOT', 'Slot', newSlot._id, null, newSlot);
  res.status(201).json(newSlot);
});

// Block slots for full date
exports.blockDate = asyncHandler(async (req, res) => {
  const { centerId, date } = req.body;
  if (!centerId || !date) return badRequest(res, 'centerId and date are required');
  if (!isValidId(centerId)) return badRequest(res, 'Invalid Center ID');

  await Slot.updateMany({ centerId, date }, { $set: { status: 'BLOCKED' } });
  await logAuditAction(req, 'BLOCK_DATE', 'Center', centerId, null, { centerId, date });

  res.json({ message: `Successfully blocked all slots on ${date}` });
});

// Capacity configuration update
exports.updateCapacity = asyncHandler(async (req, res) => {
  const { slotId, newCapacity } = req.body;
  if (!slotId || newCapacity === undefined) return badRequest(res, 'slotId and newCapacity are required');
  if (!isValidId(slotId)) return badRequest(res, 'Invalid Slot ID');

  const slot = await Slot.findById(slotId);
  if (!slot) return notFound(res, 'Slot not found');
  if (newCapacity < slot.bookedCount) {
    return badRequest(res, `New capacity cannot be lower than current bookings (${slot.bookedCount})`);
  }

  const oldCapacity = slot.capacity;
  slot.capacity = newCapacity;
  await slot.save();

  const centerObj = await Center.findById(slot.centerId).select('name').lean();
  await logAuditAction(req, 'UPDATE_CAPACITY', 'Slot', slot._id, null, {
    countryCode: 'All',
    centerId: slot.centerId,
    centerName: centerObj?.name || 'Unknown',
    date: slot.date,
    timeSlot: `${slot.startTime} - ${slot.endTime}`,
    reason: 'Capacity Configured',
    previousValue: `Capacity: ${oldCapacity}`,
    newValue: `Capacity: ${newCapacity}`,
  });

  await socketService.broadcastSlotUpdate(slot);
  res.json({ message: 'Capacity configured successfully.', slot });
});

// Emergency closure (cancel bookings, reset counts, trigger logs) - simple center+date variant
// Wrapped in a transaction: appointment cancellation, slot reset, and lock cleanup
// must all succeed together or none of them should apply.
exports.emergencyClose = asyncHandler(async (req, res) => {
  const { centerId, date } = req.body;
  if (!centerId || !date) return badRequest(res, 'centerId and date are required');
  if (!isValidId(centerId)) return badRequest(res, 'Invalid Center ID');

  const cancelledCount = await withTransaction(async (session) => {
    const slots = await Slot.find({ centerId, date }).session(session);
    const slotIds = slots.map((s) => s._id);

    const activeAppointments = await Appointment.find({
      slotId: { $in: slotIds },
      status: { $in: ['LOCKED', 'BOOKED'] },
    }).session(session);

    await Appointment.updateMany(
      { _id: { $in: activeAppointments.map((a) => a._id) } },
      { $set: { status: 'CANCELLED', paymentStatus: 'REFUNDED' } },
      { session }
    );

    await Slot.updateMany({ centerId, date }, { $set: { status: 'BLOCKED', bookedCount: 0 } }, { session });
    await SlotLock.deleteMany({ slotId: { $in: slotIds } }, { session });

    await logAuditAction(req, 'EMERGENCY_CLOSURE', 'Center', centerId, null, {
      centerId, date, cancelledBookingsCount: activeAppointments.length,
    });

    slots.forEach((slot) => {
      socketService.broadcastSlotEvent({ slotId: slot._id, bookedCount: 0, lockedCount: 0, capacity: slot.capacity });
    });

    return activeAppointments.length;
  });

  res.json({
    message: `Emergency closure processed. Cancelled ${cancelledCount} appointments, refunded transactions, and blocked dates.`,
    cancelledCount,
  });
});

// Bulk upload slots via CSV text parsing
exports.bulkUploadSlots = asyncHandler(async (req, res) => {
  const { centerId, csvText } = req.body;
  if (!centerId || !csvText) return badRequest(res, 'centerId and csvText are required');
  if (!isValidId(centerId)) return badRequest(res, 'Invalid Center ID');

  const center = await Center.findById(centerId);
  if (!center) return notFound(res, 'Center not found');
  if (!center.active) return badRequest(res, 'Cannot upload slots to an inactive center.');

  const lines = csvText.split('\n');
  const startIndex = lines.length && lines[0].toLowerCase().includes('date') ? 1 : 0;

  // Parse + validate first, so we do a single existence check per row via
  // a bulk query instead of one findOne() per line.
  const parsedRows = [];
  const errorDetails = [];
  let totalRecords = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    totalRecords++;

    const parts = line.split(',');
    if (parts.length < 4) {
      errorDetails.push({ line: i + 1, detail: 'Invalid format. Expected: date,startTime,endTime,capacity' });
      continue;
    }

    const [dateStr, startTimeStr, endTimeStr, capacityStr] = parts;
    const date = dateStr.trim();
    const startTime = startTimeStr.trim();
    const endTime = endTimeStr.trim();
    const capacity = parseInt(capacityStr.trim(), 10);

    if (!date || !startTime || !endTime || isNaN(capacity)) {
      errorDetails.push({ line: i + 1, detail: 'Invalid fields: check date, times, and capacity values.' });
      continue;
    }

    parsedRows.push({ line: i + 1, date, startTime, endTime, capacity });
  }

  const existingSlots = await Slot.find({
    centerId,
    $or: parsedRows.map(({ date, startTime, endTime }) => ({ date, startTime, endTime })),
  }).select('date startTime endTime').lean();
  const existingKeys = new Set(existingSlots.map((s) => `${s.date}|${s.startTime}|${s.endTime}`));

  const toInsert = [];
  for (const row of parsedRows) {
    const key = `${row.date}|${row.startTime}|${row.endTime}`;
    if (existingKeys.has(key)) {
      errorDetails.push({ line: row.line, detail: `Duplicate slot: ${row.date} ${row.startTime}-${row.endTime} already exists.` });
      continue;
    }
    existingKeys.add(key); // guard against duplicates within the same CSV
    toInsert.push({ centerId, date: row.date, startTime: row.startTime, endTime: row.endTime, capacity: row.capacity, bookedCount: 0, status: 'AVAILABLE' });
  }

  const slotsCreated = toInsert.length ? await Slot.insertMany(toInsert, { ordered: false }) : [];
  const successCount = slotsCreated.length;
  const failedCount = totalRecords - successCount;

  await logAuditAction(req, 'BULK_UPLOAD_SLOTS', 'Center', centerId, null, { centerId, count: successCount });

  res.json({
    message: `Bulk upload completed: ${successCount} successful, ${failedCount} failed.`,
    totalRecords, successCount, failedCount, errorDetails, slots: slotsCreated,
  });
});

// ==========================================
// HIERARCHICAL SLOT BLOCKING
// ==========================================

/** Builds the shared audit-log payload for block/unblock actions. */
const buildBlockAuditPayload = (blockRecord, centerName, overrides = {}) => ({
  countryCode: blockRecord.countryCode,
  centerId: blockRecord.centerId,
  centerName,
  date: blockRecord.startDate
    ? (blockRecord.startDate === blockRecord.endDate ? blockRecord.startDate : `${blockRecord.startDate} to ${blockRecord.endDate}`)
    : 'All Dates',
  timeSlot: blockRecord.startTime ? `${blockRecord.startTime} - ${blockRecord.endTime}` : 'All Day',
  ...overrides,
});

// Hierarchical Block Endpoint
exports.blockSlotsHierarchical = asyncHandler(async (req, res) => {
  const { countryCode, centerId, blockType, startDate, endDate, startTime, endTime, reason } = req.body;
  if (!countryCode || !blockType || !reason) {
    return badRequest(res, 'countryCode, blockType, and reason are required');
  }

  const cCode = countryCode.trim().toUpperCase();

  if (blockType !== 'COUNTRY' && !centerId) {
    return badRequest(res, 'centerId is required for center, date, or slot level blocking');
  }

  let center = null;
  if (centerId) {
    if (!isValidId(centerId)) return badRequest(res, 'Invalid Center ID');
    center = await Center.findById(centerId);
    if (!center) return notFound(res, 'Center not found');
    if (!center.active) return badRequest(res, 'Cannot apply block to an inactive center.');
  }

  const duplicate = await SlotBlock.findOne({
    countryCode: cCode,
    centerId: centerId || null,
    blockType,
    startDate: startDate || '',
    endDate: endDate || '',
    startTime: startTime || '',
    endTime: endTime || '',
    active: true,
  });
  if (duplicate) return badRequest(res, 'A duplicate active blocking record already exists.');

  const countryBlock = await SlotBlock.findOne({ countryCode: cCode, blockType: 'COUNTRY', active: true });
  if (countryBlock) return badRequest(res, `A country-level block is already active for ${cCode}.`);

  if (blockType !== 'COUNTRY') {
    const centerBlock = await SlotBlock.findOne({ countryCode: cCode, centerId, blockType: 'CENTER', active: true });
    if (centerBlock) return badRequest(res, `A center-level block is already active for this center under country ${cCode}.`);
  }

  if (blockType === 'DATE' || blockType === 'SLOT') {
    const dateBlocks = await SlotBlock.find({ countryCode: cCode, centerId, blockType: 'DATE', active: true });
    const reqStart = startDate;
    const reqEnd = blockType === 'DATE' ? endDate : startDate;
    const overlapping = dateBlocks.find((db) => reqStart <= db.endDate && reqEnd >= db.startDate);
    if (overlapping) {
      return badRequest(res, `The date range overlaps with an active Date Block (${overlapping.startDate} to ${overlapping.endDate}).`);
    }
  }

  if (blockType === 'SLOT') {
    const matchingSlotBlock = await SlotBlock.findOne({ countryCode: cCode, centerId, blockType: 'SLOT', startDate, startTime, endTime, active: true });
    if (matchingSlotBlock) return badRequest(res, `The slot ${startTime} - ${endTime} is already blocked.`);
  }

  const blockRecord = await SlotBlock.create({
    countryCode: cCode,
    centerId: centerId || null,
    blockType,
    startDate: startDate || '',
    endDate: endDate || '',
    startTime: startTime || '',
    endTime: endTime || '',
    reason,
    blockedBy: req.user._id,
    active: true,
  });

  await logAuditAction(req, 'BLOCK_SLOTS_HIERARCHICAL', 'SlotBlock', blockRecord._id, null, buildBlockAuditPayload(blockRecord, center ? center.name : 'All Centers', {
    reason: blockRecord.reason, previousValue: 'Available', newValue: 'Blocked',
  }));

  socketService.broadcastSlotEvent({ blockCreated: true });
  res.status(201).json({ message: 'Slots blocked successfully', blockRecord });
});

// Unblock Endpoint
exports.unblockSlotsHierarchical = asyncHandler(async (req, res) => {
  const { blockId } = req.body;
  if (!blockId) return badRequest(res, 'blockId is required');
  if (!isValidId(blockId)) return badRequest(res, 'Invalid Block ID');

  const blockRecord = await SlotBlock.findById(blockId);
  if (!blockRecord) return notFound(res, 'Blocking record not found');
  if (!blockRecord.active) return badRequest(res, 'This blocking record is already inactive.');

  blockRecord.active = false;
  blockRecord.unblockedBy = req.user._id;
  blockRecord.unblockedAt = new Date();
  await blockRecord.save();

  const center = blockRecord.centerId ? await Center.findById(blockRecord.centerId).select('name').lean() : null;
  await logAuditAction(req, 'UNBLOCK_SLOTS_HIERARCHICAL', 'SlotBlock', blockRecord._id, null, buildBlockAuditPayload(blockRecord, center?.name || 'All Centers', {
    reason: 'Unblocked by Admin', previousValue: 'Blocked', newValue: 'Available',
  }));

  socketService.broadcastSlotEvent({ blockReleased: true });
  res.json({ message: 'Slots unblocked successfully', blockRecord });
});

// Bulk Unblock Endpoint
exports.unblockSlotsBulk = asyncHandler(async (req, res) => {
  const { blockIds } = req.body;
  if (!blockIds || !Array.isArray(blockIds)) return badRequest(res, 'blockIds array is required');

  const result = await SlotBlock.updateMany(
    { _id: { $in: blockIds }, active: true },
    { $set: { active: false, unblockedBy: req.user._id, unblockedAt: new Date() } }
  );

  await logAuditAction(req, 'UNBLOCK_SLOTS_BULK', 'SlotBlock', null, null, {
    countryCode: 'Multiple',
    centerName: 'Multiple Centers',
    date: 'N/A',
    timeSlot: 'N/A',
    reason: `Bulk Unblocked ${result.modifiedCount} records`,
    previousValue: 'Blocked',
    newValue: 'Available',
  });

  socketService.broadcastSlotEvent({ blockReleased: true });
  res.json({ message: `Successfully unblocked ${result.modifiedCount} slot restrictions.`, count: result.modifiedCount });
});

// GET slots month-summary for calendar view
// Previously ran one `Slot.find` + one locks query PER DAY of the month (~30
// round trips). Now fetches the whole month's slots and all blocks once,
// then computes each day's status in memory.
exports.getMonthSummary = asyncHandler(async (req, res) => {
  const { month, centerId, countryCode } = req.query;
  if (!month || !centerId || !countryCode) {
    return badRequest(res, 'month, centerId, and countryCode parameters are required');
  }

  const [year, monthNum] = month.split('-').map(Number);
  const monthIndex = monthNum - 1;
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0);

  const dates = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0]);
  }

  const [activeBlocks, monthSlots] = await Promise.all([
    SlotBlock.find({ countryCode: countryCode.trim().toUpperCase(), active: true }).lean(),
    Slot.find({ centerId, date: { $in: dates } }).lean(),
  ]);

  const slotsByDate = new Map();
  monthSlots.forEach((s) => {
    if (!slotsByDate.has(s.date)) slotsByDate.set(s.date, []);
    slotsByDate.get(s.date).push(s);
  });

  const allSlotIds = monthSlots.map((s) => s._id);
  const locksMap = await getActiveLocksMap(allSlotIds);

  const summaries = {};
  for (const date of dates) {
    const day = new Date(date).getDay();
    if (day === 0 || day === 6) {
      summaries[date] = 'Closed';
      continue;
    }

    const slots = slotsByDate.get(date)?.length
      ? slotsByDate.get(date)
      : DEFAULT_SLOTS.map((s) => ({ centerId, date, startTime: s.startTime, endTime: s.endTime, capacity: 5, bookedCount: 0, status: 'AVAILABLE' }));

    let blockedCount = 0;
    let fullCount = 0;

    slots.forEach((s) => {
      const lockedCount = locksMap[s._id?.toString()] || 0;
      const blocked = isSlotBlocked(s, activeBlocks);
      if (blocked || s.status === 'BLOCKED') {
        blockedCount++;
      } else if (Math.max(0, s.capacity - s.bookedCount - lockedCount) === 0) {
        fullCount++;
      }
    });

    if (blockedCount === slots.length) summaries[date] = 'Fully Blocked';
    else if (blockedCount > 0) summaries[date] = 'Partially Blocked';
    else if (fullCount === slots.length) summaries[date] = 'Capacity Full';
    else summaries[date] = 'Available';
  }

  res.json(summaries);
});

// Get Blocks History Endpoint
exports.getBlocksHistory = asyncHandler(async (req, res) => {
  const blocks = await SlotBlock.find()
    .populate('centerId', 'name city')
    .sort({ createdAt: -1 })
    .lean();

  const actorIds = [...new Set(blocks
    .flatMap((block) => [block.blockedBy, block.unblockedBy])
    .filter((id) => id && isValidId(String(id)))
    .map(String))];
  const actors = actorIds.length
    ? await Agent.find({ _id: { $in: actorIds } }).select('name ownerName agencyName email role').lean()
    : [];
  const actorById = new Map(actors.map((actor) => [String(actor._id), actor]));
  const formatActor = (id) => {
    const actor = id ? actorById.get(String(id)) : null;
    if (!actor) return null;
    return {
      _id: actor._id,
      name: actor.name || actor.ownerName || actor.agencyName || actor.email,
      email: actor.email,
      role: actor.role,
    };
  };

  res.json(blocks.map((block) => ({
    ...block,
    blockedBy: formatActor(block.blockedBy),
    unblockedBy: formatActor(block.unblockedBy),
  })));
});

/** Shared logic for the three near-identical "update a slot" endpoints below. */
const applySlotUpdate = async (req, res, { strict } = { strict: false }) => {
  const slot = await Slot.findById(req.params.id);
  if (!slot) return notFound(res, 'Slot not found');

  const { status, capacity } = req.body;
  const oldVal = { capacity: slot.capacity, status: slot.status };

  if (capacity !== undefined) {
    const parsedCapacity = strict ? parseInt(capacity, 10) : capacity;
    if (strict && (isNaN(parsedCapacity) || parsedCapacity < 0)) {
      return badRequest(res, 'Invalid capacity count');
    }
    if (parsedCapacity < slot.bookedCount) {
      return badRequest(res, `Capacity cannot be lower than booked count (${slot.bookedCount})`);
    }
    slot.capacity = parsedCapacity;
  }

  if (status !== undefined) {
    if (strict && !['AVAILABLE', 'BLOCKED'].includes(status)) {
      return badRequest(res, 'Invalid status');
    }
    slot.status = status;
  }

  await slot.save();
  await logAuditAction(req, 'UPDATE_SLOT', 'Slot', slot._id, oldVal, { capacity: slot.capacity, status: slot.status });
  await socketService.broadcastSlotUpdate(slot, strict ? { status: slot.status } : undefined);

  return slot;
};

// Update Slot Availability by ID (toggles or updates status/capacity) - strict validation variant
exports.updateSlotAvailability = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const slot = await applySlotUpdate(req, res, { strict: true });
    if (!slot) return; // response already sent by applySlotUpdate
    res.json({ success: true, message: 'Slot availability updated successfully', slot });
  }),
];

// ==========================================
// GENERIC DYNAMIC SLOT ENDPOINTS (/:id)
// `updateSlotLegacyPost` (POST) and `updateSlot` (PUT) were byte-for-byte
// identical bodies; both now delegate to the same shared handler.
// ==========================================
const genericSlotUpdate = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const slot = await applySlotUpdate(req, res, { strict: false });
    if (!slot) return;
    res.json(slot);
  }),
];

exports.updateSlotLegacyPost = genericSlotUpdate; // POST - legacy compatibility
exports.updateSlot = genericSlotUpdate; // PUT - REST spec

// Delete Slot (Super Admin only!)
exports.deleteSlot = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const slot = await Slot.findById(req.params.id);
    if (!slot) return notFound(res, 'Slot not found');
    if (slot.bookedCount > 0) return badRequest(res, 'Cannot delete a slot with active bookings');

    await Slot.deleteOne({ _id: req.params.id });
    await logAuditAction(req, 'DELETE_SLOT', 'Slot', slot._id, slot, null);

    res.json({ message: 'Slot deleted successfully' });
  }),
];

// ==========================================
// EMERGENCY CLOSURE (COUNTRY / CENTER LEVEL)
// ==========================================

exports.declareEmergencyClosure = asyncHandler(async (req, res) => {
  const { countryCode, centerId, reason, startDate, endDate, closureType, startTime, endTime } = req.body;
  if (!countryCode || !reason || !startDate || !endDate) {
    return badRequest(res, 'countryCode, reason, startDate, and endDate are required');
  }

  let centerIds = [];
  if (centerId) {
    if (!isValidId(centerId)) return badRequest(res, 'Invalid Center ID');
    const center = await Center.findById(centerId);
    if (!center) return notFound(res, 'Center not found');
    if (!center.active) return badRequest(res, 'Center is currently inactive.');
    centerIds.push(center._id);
  } else {
    const activeCenters = await Center.find({ countryCode: countryCode.trim().toUpperCase(), active: true }).select('_id').lean();
    if (activeCenters.length === 0) {
      return badRequest(res, `No active centers found under country code ${countryCode}`);
    }
    centerIds = activeCenters.map((c) => c._id);
  }

  const slotQuery = { centerId: { $in: centerIds }, date: { $gte: startDate, $lte: endDate } };
  if (startTime && endTime) {
    slotQuery.startTime = { $gte: startTime };
    slotQuery.endTime = { $lte: endTime };
  }

  const slots = await Slot.find(slotQuery).select('_id').lean();
  const slotIds = slots.map((s) => s._id);
  const cType = closureType || (centerId ? (startTime && endTime ? 'PARTIAL_DAY' : 'FULL_DAY') : 'COUNTRY_WIDE');

  const closure = await EmergencyClosure.create({
    countryCode: countryCode.trim().toUpperCase(),
    centerId: centerId || null,
    closureType: cType,
    reason, startDate, endDate,
    startTime: startTime || null,
    endTime: endTime || null,
    impactedSlotsCount: slots.length,
    declaredBy: req.user._id,
    status: 'ACTIVE',
  });

  await Slot.updateMany({ _id: { $in: slotIds } }, { $set: { status: 'BLOCKED' } });

  const { processEmergencyClosureJobs } = require('../services/queueService');
  const result = await processEmergencyClosureJobs(slotIds, reason, req.user._id);

  await logAuditAction(req, 'EMERGENCY_CLOSURE', 'EmergencyClosure', closure._id, null, closure);

  const totalCancelled = result.cancelledLocks + result.reviewQueueCount;
  res.status(201).json({
    message: centerId
      ? `Emergency closure declared successfully. Cancelled ${totalCancelled} appointments and blocked slots.`
      : `Emergency closure declared successfully for all active centers under country ${countryCode}. Cancelled ${totalCancelled} appointments and blocked slots.`,
    closure,
    affectedSlotsCount: slots.length,
    cancelledLocks: result.cancelledLocks,
    reviewQueueCount: result.reviewQueueCount,
  });
});

// Reopen center
exports.reopenEmergencyClosure = asyncHandler(async (req, res) => {
  const { closureId } = req.body;
  if (!closureId) return badRequest(res, 'closureId is required');
  if (!isValidId(closureId)) return badRequest(res, 'Invalid Closure ID');

  const closure = await EmergencyClosure.findById(closureId);
  if (!closure) return notFound(res, 'Closure record not found');
  if (closure.status === 'REOPENED') return badRequest(res, 'Center/Country is already reopened');

  closure.status = 'REOPENED';
  await closure.save();

  const slotQuery = { date: { $gte: closure.startDate, $lte: closure.endDate } };
  if (closure.centerId) {
    slotQuery.centerId = closure.centerId;
  } else {
    const centers = await Center.find({ countryCode: closure.countryCode }).select('_id').lean();
    slotQuery.centerId = { $in: centers.map((c) => c._id) };
  }
  if (closure.startTime && closure.endTime) {
    slotQuery.startTime = { $gte: closure.startTime };
    slotQuery.endTime = { $lte: closure.endTime };
  }

  const slots = await Slot.find(slotQuery);
  const slotIds = slots.map((s) => s._id);

  await Slot.updateMany({ _id: { $in: slotIds } }, { $set: { status: 'AVAILABLE' } });

  await logAuditAction(req, 'REOPEN_CENTER', 'Center', closure.centerId || null, null, {
    countryCode: closure.countryCode,
    centerId: closure.centerId,
    startDate: closure.startDate,
    endDate: closure.endDate,
  });

  const locksMap = await getActiveLocksMap(slotIds);
  slots.forEach((slot) => {
    const lockedCount = locksMap[slot._id.toString()] || 0;
    socketService.broadcastSlotEvent({
      slotId: slot._id, bookedCount: slot.bookedCount, lockedCount, capacity: slot.capacity, status: 'AVAILABLE',
    });
  });

  res.json({ message: 'Center reopened successfully and slot schedules restored.', closure });
});

// Get all emergency closures
exports.getEmergencyClosures = asyncHandler(async (req, res) => {
  const closures = await EmergencyClosure.find()
    .populate('centerId', 'name city countryName countryCode countryFlag')
    .sort({ createdAt: -1 })
    .lean();

  const { GOING_TO_COUNTRIES } = require('../config/masterData');
  const countryMap = new Map(GOING_TO_COUNTRIES.map((c) => [c.code, c]));

  const populatedClosures = closures.map((closure) => {
    const country = countryMap.get(closure.countryCode);
    return { ...closure, countryName: country?.name || closure.countryCode, countryFlag: country?.flag || '🏳️' };
  });

  res.json(populatedClosures);
});

// Get blocking & emergency dashboard metrics (Admin/Supervisor only)
// Independent counts now run concurrently instead of sequentially.
exports.getBlockingStats = asyncHandler(async (req, res) => {
  const [totalBlocked, vipBlocked, diplomaticBlocked, activeClosures, refundPendingAppts, rescheduleRequiredAppts] = await Promise.all([
    Slot.countDocuments({ status: 'BLOCKED' }),
    SlotBlock.countDocuments({ reason: 'VIP', active: true }),
    SlotBlock.countDocuments({ reason: 'DIPLOMATIC', active: true }),
    EmergencyClosure.countDocuments({ status: 'ACTIVE' }),
    Appointment.countDocuments({ status: 'REFUND_PENDING' }),
    Appointment.countDocuments({ status: 'RESCHEDULE_REQUIRED' }),
  ]);

  res.json({ totalBlocked, vipBlocked, diplomaticBlocked, activeClosures, refundPendingAppts, rescheduleRequiredAppts });
});

// ==========================================
// PAYMENT VERIFICATION (BOOKING PAYMENTS)
// ==========================================

// GET /payments-verification - Retrieve appointments pending manual UPI verification
exports.getPaymentsVerification = asyncHandler(async (req, res) => {
  const appointments = await Appointment.find({ status: 'Pending Verification' })
    .populate('userId', 'name email mobile')
    .populate('centerId', 'name city')
    .sort({ createdAt: -1 })
    .lean();

  // Fire all Payment lookups concurrently instead of one-at-a-time in a for-loop.
  const payments = await Payment.find({ appointmentId: { $in: appointments.map((a) => a._id) } }).lean();
  const paymentByAppointmentId = new Map(payments.map((p) => [String(p.appointmentId), p]));

  const result = appointments.map((appointment) => ({
    appointment,
    payment: paymentByAppointmentId.get(String(appointment._id)) || null,
  }));

  res.json(result);
});

// POST /payments-verification/:id/approve - Approve UPI payment, confirm appointment, generate PDF, and send confirmation email
exports.approvePaymentVerification = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const lockingService = require('../services/lockingService');
    const pdfService = require('../services/pdfService');

    const { appointment, slot, center, payment } = await withTransaction(async (session) => {
      const appointment = await Appointment.findById(req.params.id).populate('userId', 'name email mobile').session(session);
      if (!appointment) throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
      if (appointment.status !== 'Pending Verification') {
        throw Object.assign(new Error('This appointment is not pending verification.'), { statusCode: 400 });
      }

      const slot = await Slot.findById(appointment.slotId).session(session);
      if (!slot) throw Object.assign(new Error('Slot not found'), { statusCode: 404 });

      const center = await Center.findById(appointment.centerId).session(session);

      const payment = await Payment.findOne({ appointmentId: appointment._id }).session(session);
      if (payment) {
        payment.status = 'SUCCESS';
        await payment.save({ session });
      }

      appointment.status = 'BOOKED';
      appointment.paymentStatus = 'Paid';
      await appointment.save({ session });

      slot.bookedCount += 1;
      await slot.save({ session });

      await logAuditAction(
        req, 'VERIFY_PAYMENT_SUCCESS', 'Appointment', appointment._id,
        { status: 'Pending Verification', paymentStatus: 'Pending Verification' },
        { status: 'BOOKED', paymentStatus: 'Paid' }
      );

      return { appointment, slot, center, payment };
    });

    // Side effects that shouldn't roll back the DB transaction if they fail
    // (lock release, socket broadcast, PDF + email) run after commit.
    await lockingService.releaseLock(appointment.slotId.toString(), appointment.userId._id.toString());
    await socketService.broadcastSlotUpdate(slot);

    const pdfBuffer = await pdfService.generateConfirmationPDF(appointment, payment, slot, center);

    const applicantEmail = appointment.applicantDetails?.[0]?.email || appointment.userId.email;
    const userEmail = appointment.userId?.email || '';
    const recipients = [applicantEmail, ...(userEmail && userEmail !== applicantEmail ? [userEmail] : [])];

    await sendMailSafely(
      {
        to: recipients.join(', '),
        subject: 'Appointment Confirmation – Dream Catcher Immigrations',
        html: buildAppointmentConfirmationHtml({ appointment, center }),
        attachments: [{ filename: `Appointment_Confirmation_${appointment.referenceNumber}.pdf`, content: pdfBuffer }],
      },
      'Dream Catcher Immigrations'
    );

    res.json({ message: 'Appointment approved and confirmation email sent.' });
  }),
];

// POST /payments-verification/:id/reject - Reject UPI payment, release slot capacity, and notify applicant
exports.rejectPaymentVerification = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const displayReason = reason || 'The transaction reference number or payment screenshot provided could not be verified with our bank records.';
    const lockingService = require('../services/lockingService');

    const { appointment, slot } = await withTransaction(async (session) => {
      const appointment = await Appointment.findById(req.params.id).populate('userId', 'name email mobile').session(session);
      if (!appointment) throw Object.assign(new Error('Appointment not found'), { statusCode: 404 });
      if (appointment.status !== 'Pending Verification') {
        throw Object.assign(new Error('This appointment is not pending verification.'), { statusCode: 400 });
      }

      const slot = await Slot.findById(appointment.slotId).session(session);
      if (!slot) throw Object.assign(new Error('Slot not found'), { statusCode: 404 });

      const payment = await Payment.findOne({ appointmentId: appointment._id }).session(session);
      if (payment) {
        payment.status = 'REJECTED';
        await payment.save({ session });
      }

      appointment.status = 'Payment Rejected';
      appointment.paymentStatus = 'Payment Rejected';
      await appointment.save({ session });

      await logAuditAction(
        req, 'VERIFY_PAYMENT_REJECT', 'Appointment', appointment._id,
        { status: 'Pending Verification', paymentStatus: 'Pending Verification' },
        { status: 'Payment Rejected', paymentStatus: 'Payment Rejected' }
      );

      return { appointment, slot };
    });

    await lockingService.releaseLock(appointment.slotId.toString(), appointment.userId._id.toString());
    await socketService.broadcastSlotUpdate(slot);

    const applicantEmail = appointment.applicantDetails?.[0]?.email || appointment.userId.email;
    const userEmail = appointment.userId?.email || '';
    const recipients = [applicantEmail, ...(userEmail && userEmail !== applicantEmail ? [userEmail] : [])];

    await sendMailSafely(
      {
        to: recipients.join(', '),
        subject: 'Payment Verification Unsuccessful – Dream Catcher Immigrations',
        html: buildPaymentRejectedHtml({ appointment, reason: displayReason }),
      },
      'Dream Catcher Immigrations'
    );

    res.json({ message: 'Appointment payment verification rejected and email notification sent.' });
  }),
];

// ==========================================
// B2B SAAS AGENT & SUBSCRIPTION ENDPOINTS
// ==========================================

// Get all agent & subscription stats for Admin Dashboard
// All independent counts/aggregations now run in parallel via Promise.all
// instead of sequential awaits, cutting wall-clock time roughly in half+.
exports.getB2BStats = asyncHandler(async (req, res) => {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);

  const [
    totalAgents, verifiedAgents, pendingAgents, blockedAgents, activeAgents, expiredAgents,
    subscribedAgents, recentSubsAgg, upcomingRenewalsCount, topAgents,
  ] = await Promise.all([
    Agent.countDocuments({ role: 'Agent' }),
    Agent.countDocuments({ role: 'Agent', status: 'Verified' }),
    Agent.countDocuments({ role: 'Agent', status: 'Pending' }),
    Agent.countDocuments({ role: 'Agent', status: 'Blocked' }),
    Agent.countDocuments({ role: 'Agent', status: 'Active' }),
    Agent.countDocuments({ role: 'Agent', status: { $in: ['Expired', 'Subscription Expired'] } }),
    Subscription.distinct('agentId', { subscriptionStatus: 'Active', paymentStatus: 'Paid' }),
    Subscription.aggregate([
      { $match: { paymentStatus: 'Paid', paymentDate: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, revenue: { $sum: '$planAmount' }, gst: { $sum: '$gstAmount' } } },
    ]),
    Subscription.countDocuments({ subscriptionStatus: 'Active', paymentStatus: 'Paid', expiryDate: { $gte: today, $lte: sevenDaysFromNow } }),
    Appointment.aggregate([
      { $match: { status: { $in: ['BOOKED', 'Pending Verification'] } } },
      { $group: { _id: '$userId', bookingCount: { $sum: 1 } } },
      { $sort: { bookingCount: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const agentIds = topAgents.map((t) => t._id).filter(Boolean);
  const agents = agentIds.length
    ? await Agent.find({ _id: { $in: agentIds } }).select('agencyName ownerName email mobile').lean()
    : [];
  const agentById = new Map(agents.map((a) => [String(a._id), a]));
  const topPerformingAgents = topAgents
    .filter((t) => agentById.has(String(t._id)))
    .map((t) => ({ agent: agentById.get(String(t._id)), bookingCount: t.bookingCount }));

  res.json({
    totalAgents, verifiedAgents, pendingAgents, blockedAgents, activeAgents, expiredAgents,
    subscribedAgentsCount: subscribedAgents.length,
    monthlyRevenue: recentSubsAgg[0]?.revenue || 0,
    gstCollected: recentSubsAgg[0]?.gst || 0,
    upcomingRenewalsCount,
    topPerformingAgents,
  });
});

/** Shared agent status transition helper (approve / reject / block). */
const transitionAgentStatus = (newStatus, auditAction, notification) => [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return notFound(res, 'Agent not found');

    const oldStatus = agent.status;
    agent.status = newStatus;
    await agent.save();

    if (notification) {
      await AgentNotification.create({ agentId: agent._id, ...notification });
    }

    await logAuditAction(req, auditAction, 'Agent', agent._id, { status: oldStatus }, { status: newStatus });
    res.json({ message: `Agent ${newStatus.toLowerCase()} successfully`, agent });
  }),
];

exports.approveAgent = transitionAgentStatus('Verified', 'APPROVE_AGENT', {
  title: 'Profile Approved',
  message: 'Your travel agency profile has been approved! You can now subscribe to start booking.',
  type: 'REGISTRATION_APPROVED',
});

exports.rejectAgent = transitionAgentStatus('Rejected', 'REJECT_AGENT', {
  title: 'Profile Rejected',
  message: 'Your travel agency profile was rejected. Please review details and resubmit.',
  type: 'REGISTRATION_REJECTED',
});

exports.blockAgent = transitionAgentStatus('Blocked', 'BLOCK_AGENT', null);

// Unblock Agent (status depends on whether a paid subscription is active, so it
// can't use the generic transitionAgentStatus helper above)
exports.unblockAgent = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return notFound(res, 'Agent not found');

    const activeSub = await Subscription.findOne({ agentId: agent._id, subscriptionStatus: 'Active', paymentStatus: 'Paid' });
    const oldStatus = agent.status;
    agent.status = activeSub ? 'Active' : 'Verified';
    await agent.save();

    await logAuditAction(req, 'UNBLOCK_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: agent.status });
    res.json({ message: 'Agent unblocked successfully', agent });
  }),
];

// Grant Complimentary Subscription Days
exports.grantComplimentaryDays = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const { days } = req.body;
    const parsedDays = parseInt(days, 10);
    if (!days || isNaN(parsedDays) || parsedDays <= 0) {
      return badRequest(res, 'Please provide valid days count.');
    }

    const agent = await Agent.findById(req.params.id);
    if (!agent) return notFound(res, 'Agent not found');

    let sub = await Subscription.findOne({ agentId: agent._id, paymentStatus: 'Paid' }).sort({ expiryDate: -1 });
    const today = new Date();
    let newExpiry;

    if (sub) {
      const baseDate = sub.expiryDate > today ? sub.expiryDate : today;
      newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + parsedDays);
      sub.expiryDate = newExpiry;
      sub.renewalDate = newExpiry;
      sub.subscriptionStatus = 'Active';
      await sub.save();
    } else {
      newExpiry = new Date(today);
      newExpiry.setDate(today.getDate() + parsedDays);
      sub = await Subscription.create({
        agentId: agent._id,
        planName: 'Professional Agent Plan (Complimentary)',
        planAmount: 0, gstAmount: 0, totalAmount: 0,
        invoiceNumber: 'COMP-' + Date.now(),
        paymentStatus: 'Paid',
        subscriptionStatus: 'Active',
        paymentDate: today,
        startDate: today,
        expiryDate: newExpiry,
        renewalDate: newExpiry,
        createdBy: req.user._id,
      });
    }

    agent.status = 'Active';
    await agent.save();

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Complimentary Days Granted',
      message: `Admin granted you ${parsedDays} complimentary subscription days. Valid until ${newExpiry.toLocaleDateString('en-GB')}.`,
      type: 'SUBSCRIPTION_ACTIVATED',
    });

    await logAuditAction(req, 'GRANT_COMPLIMENTARY_DAYS', 'Agent', agent._id, {}, { days: parsedDays, newExpiry });
    res.json({ message: `Granted ${parsedDays} complimentary days successfully.`, agent, subscription: sub });
  }),
];

// Cancel Subscription (Suspend/Cancel agent's billing cycle)
exports.cancelAgentSubscription = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return notFound(res, 'Agent not found');

    await Subscription.updateMany({ agentId: agent._id, subscriptionStatus: 'Active' }, { subscriptionStatus: 'Cancelled' });

    const oldStatus = agent.status;
    agent.status = 'Verified';
    await agent.save();

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Subscription Cancelled',
      message: 'Your active monthly subscription has been suspended/cancelled by the administrator.',
      type: 'SUBSCRIPTION_CANCELLED',
    });

    await logAuditAction(req, 'CANCEL_SUBSCRIPTION', 'Agent', agent._id, { status: oldStatus }, { status: 'Verified' });
    res.json({ message: 'Subscription cancelled successfully.', agent });
  }),
];

// ==========================================================
// ADMIN SUBSCRIPTION PAYMENT VERIFICATION ROUTES
// ==========================================================

// Get all Agent Subscription payment requests for verification
exports.getSubscriptionPayments = asyncHandler(async (req, res) => {
  const list = await Subscription.find({ subscriptionStatus: { $in: ['Verification Pending', 'Active', 'Rejected'] } })
    .populate('agentId', 'agencyName ownerName email mobile agentId')
    .sort({ createdAt: -1 })
    .lean();
  res.json(list.map((item) => ({
    ...item,
    verificationReview: buildSubscriptionVerificationReview(item)
  })));
});

// Approve subscription payment request
exports.approveSubscriptionPayment = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const pdfService = require('../services/pdfService');

    const { agent, sub, payment, previousExpiryDate, finalInvoiceNumber, expiryDate } = await withTransaction(async (session) => {
      const sub = await Subscription.findById(req.params.id).session(session);
      if (!sub) throw Object.assign(new Error('Subscription request not found'), { statusCode: 404 });
      if (sub.subscriptionStatus === 'Active') {
        throw Object.assign(new Error('Subscription is already active.'), { statusCode: 400 });
      }
      if (sub.subscriptionStatus !== 'Verification Pending') {
        throw Object.assign(new Error('Only pending verification requests can be approved.'), { statusCode: 400 });
      }

      const approvalCheck = canApproveManualSubscription(sub);
      if (!approvalCheck.canApprove) {
        throw Object.assign(new Error(`Cannot approve payment proof: ${approvalCheck.blockers.join(' ')}`), { statusCode: 400 });
      }

      const agent = await Agent.findById(sub.agentId).session(session);
      if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 });

      const previousPaidSub = await Subscription.findOne({
        agentId: sub.agentId,
        paymentStatus: 'Paid',
        _id: { $ne: sub._id }
      }).session(session);

      const today = new Date();
      let startDate = new Date();
      let previousExpiryDate = null;

      if (previousPaidSub && previousPaidSub.expiryDate > today) {
        previousExpiryDate = previousPaidSub.expiryDate;
        startDate = new Date(previousPaidSub.expiryDate);
      }

      const expiryDate = new Date(startDate);
      expiryDate.setDate(expiryDate.getDate() + SUBSCRIPTION_CYCLE_DAYS);
      const finalInvoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      sub.paymentStatus = 'Paid';
      sub.subscriptionStatus = 'Active';
      sub.paymentDate = today;
      sub.startDate = startDate;
      sub.expiryDate = expiryDate;
      sub.renewalDate = expiryDate;
      sub.invoiceNumber = finalInvoiceNumber;
      await sub.save({ session });

      const [payment] = await Payment.create([{
        appointmentId: new mongoose.Types.ObjectId(), // Dummy ID (subscription payment, not tied to an appointment)
        amount: sub.totalAmount,
        transactionId: sub.transactionId,
        screenshot: sub.screenshot,
        gatewayResponse: { subscriptionId: sub._id, type: 'SubscriptionManualVerify' },
        status: 'SUCCESS',
      }], { session });

      if (previousExpiryDate) {
        await RenewalHistory.create([{
          agentId: agent._id, subscriptionId: sub._id, previousExpiryDate, newExpiryDate: expiryDate,
        }], { session });
      }

      const hadPreviousPaidSubscription = !!previousPaidSub;
      agent.status = 'Active';
      await agent.save({ session });

      if (!hadPreviousPaidSubscription) {
        const rewardService = require('../services/rewardService');
        await rewardService.handleReferralRewardOnFirstPaidSubscription(agent, session, true);
      }

      await logAuditAction(req, 'APPROVE_SUBSCRIPTION_PAYMENT', 'Subscription', sub._id, { status: 'Verification Pending' }, { status: 'Active' });

      return { agent, sub, payment, previousExpiryDate, finalInvoiceNumber, expiryDate };
    });

    // PDF generation / email are best-effort side effects, kept outside the
    // DB transaction so a PDF/email hiccup never rolls back a paid subscription.
    let pdfBuffer;
    try {
      pdfBuffer = await pdfService.generateGSTInvoicePDF(agent, sub, payment);
      await Invoice.create({ invoiceNumber: finalInvoiceNumber, agentId: agent._id, subscriptionId: sub._id, pdfData: pdfBuffer.toString('base64') });
    } catch (pdfErr) {
      console.error('Invoice PDF generation failed during verification:', pdfErr.message);
    }

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Subscription Activated',
      message: `Your payment was verified. Your Professional Agent Plan is active. Valid until ${expiryDate.toLocaleDateString('en-GB')}.`,
      type: 'SUBSCRIPTION_ACTIVATED',
    });

    const mailOptions = {
      to: agent.email,
      subject: 'Visa Booking Portal - Subscription Activated',
      html: buildSubscriptionActivatedHtml({ agent, invoiceNumber: finalInvoiceNumber, expiryDate }),
    };
    if (pdfBuffer) {
      mailOptions.attachments = [{ filename: `Invoice_${finalInvoiceNumber}.pdf`, content: pdfBuffer }];
    }
    await sendMailSafely(mailOptions, 'Dream Catcher SaaS Billing');

    res.json({ message: 'Subscription payment approved successfully.', subscription: sub });
  }),
];

// Reject subscription payment request
exports.rejectSubscriptionPayment = [
  requireValidId('id'),
  asyncHandler(async (req, res) => {
    const { remarks } = req.body;
    if (!remarks || !remarks.trim()) return badRequest(res, 'Please provide rejection remarks/reason.');

    const sub = await Subscription.findById(req.params.id);
    if (!sub) return notFound(res, 'Subscription request not found');
    if (sub.subscriptionStatus === 'Active') return badRequest(res, 'Cannot reject an already approved active subscription.');

    const agent = await Agent.findById(sub.agentId);
    if (!agent) return notFound(res, 'Agent not found');

    sub.paymentStatus = 'Rejected';
    sub.subscriptionStatus = 'Rejected';
    sub.rejectionRemarks = remarks;
    await sub.save();

    if (agent.status === 'Verification Pending') {
      agent.status = 'Verified';
      await agent.save();
    }

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Payment Proof Rejected',
      message: `Your payment proof was rejected. Remarks: ${remarks}. Please upload a new proof.`,
      type: 'REGISTRATION_REJECTED',
    });

    await logAuditAction(req, 'REJECT_SUBSCRIPTION_PAYMENT', 'Subscription', sub._id, { status: 'Verification Pending' }, { status: 'Rejected', remarks });

    await sendMailSafely(
      {
        to: agent.email,
        subject: 'Visa Booking Portal - Subscription Payment Rejected',
        html: buildSubscriptionRejectedHtml({ agent, remarks }),
      },
      'Dream Catcher SaaS Billing'
    );

    res.json({ message: 'Subscription payment rejected. Remarks saved.', subscription: sub });
  }),
];
