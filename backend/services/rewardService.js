const Agent = require('../models/Agent');
const Referral = require('../models/Referral');
const AgentNotification = require('../models/AgentNotification');

const STAR_REWARD_PER_REFERRAL = 5;
const STARS_PER_GOLD_COIN = 50;
const GOLD_COINS_PER_FREE_BOOKING = 1;
const BOOKING_MILESTONE_SIZE = 50;
const GOLD_PER_BOOKING_MILESTONE = 1;

function sessionOptions(session) {
  return session ? { session } : {};
}

async function awardReferralReward(agent, session, source) {
  if (!agent || !agent.referredBy) return null;

  const referrer = await Agent.findById(agent.referredBy)
    .select('_id')
    .setOptions(sessionOptions(session));
  if (!referrer) return null;

  const existingReferral = await Referral.findOne({
    referrerId: referrer._id,
    referredAgentId: agent._id,
  }).setOptions(sessionOptions(session));

  if (existingReferral) return null;

  const updatedReferrer = await Agent.findByIdAndUpdate(
    referrer._id,
    {
      $inc: { stars: STAR_REWARD_PER_REFERRAL, referralsCount: 1 },
      $set: { discountEligible: true },
    },
    { new: true, ...sessionOptions(session) }
  );

  await Referral.create([{
    referrerId: referrer._id,
    referredAgentId: agent._id,
    starsAwarded: STAR_REWARD_PER_REFERRAL,
  }], sessionOptions(session));

  const goldCoinsEarned = Math.floor((updatedReferrer.stars || 0) / STARS_PER_GOLD_COIN);
  let finalReferrer = updatedReferrer;

  if (goldCoinsEarned > 0) {
    finalReferrer = await Agent.findOneAndUpdate(
      { _id: referrer._id, stars: { $gte: goldCoinsEarned * STARS_PER_GOLD_COIN } },
      {
        $inc: {
          stars: -(goldCoinsEarned * STARS_PER_GOLD_COIN),
          goldCoins: goldCoinsEarned,
        },
      },
      { new: true, ...sessionOptions(session) }
    ) || updatedReferrer;
  }

  await AgentNotification.create([{
    agentId: referrer._id,
    title: 'Referral reward received',
    message: 'Your referral registered! You earned 5 stars.',
    type: 'REFERRAL_REWARD',
    metadata: {
      referredAgentId: agent._id,
      starsAwarded: STAR_REWARD_PER_REFERRAL,
      discountEligible: true,
      referralsCount: finalReferrer.referralsCount,
      totalStars: finalReferrer.stars,
      source,
    },
  }], sessionOptions(session));

  if (goldCoinsEarned > 0) {
    await AgentNotification.create([{
      agentId: referrer._id,
    title: 'Gold Coin earned',
      message: goldCoinsEarned === 1
        ? '🪙 You earned 1 Gold Coin! (50 stars converted)'
        : `You earned ${goldCoinsEarned} Gold Coins! (${goldCoinsEarned * STARS_PER_GOLD_COIN} stars converted)`,
      type: 'GOLD_COIN_REWARD',
      metadata: {
        goldCoinsAwarded: goldCoinsEarned,
        starsConverted: goldCoinsEarned * STARS_PER_GOLD_COIN,
        totalStars: finalReferrer.stars,
        goldCoins: finalReferrer.goldCoins,
      },
    }], sessionOptions(session));
  }

  return {
    referrerId: referrer._id,
    goldAwarded: goldCoinsEarned,
    starsAwarded: STAR_REWARD_PER_REFERRAL,
    referralsCount: finalReferrer.referralsCount,
  };
}

async function handleReferralRewardOnRegistration(agent, session) {
  return awardReferralReward(agent, session, 'REGISTRATION');
}

async function handleReferralRewardOnFirstPaidSubscription(agent, session, isFirstPaidSubscription) {
  if (!isFirstPaidSubscription) return null;
  return awardReferralReward(agent, session, 'FIRST_SUBSCRIPTION');
}

async function handleBookingMilestone(agentId, session) {
  const updatedAgent = await Agent.findByIdAndUpdate(
    agentId,
    { $inc: { completedBookingsCount: 1 } },
    { new: true, ...sessionOptions(session) }
  );

  if (!updatedAgent) return null;

  const currentMilestones = Math.floor(updatedAgent.completedBookingsCount / BOOKING_MILESTONE_SIZE);
  const previousMilestones = Math.floor(updatedAgent.lastBookingMilestoneReached / BOOKING_MILESTONE_SIZE);

  if (currentMilestones <= previousMilestones) {
    return { milestoneReached: false, completedBookingsCount: updatedAgent.completedBookingsCount };
  }

  const updatedWithReward = await Agent.findOneAndUpdate(
    {
      _id: agentId,
      lastBookingMilestoneReached: updatedAgent.lastBookingMilestoneReached,
    },
    {
      $inc: { goldCoins: GOLD_PER_BOOKING_MILESTONE },
      $set: { lastBookingMilestoneReached: updatedAgent.completedBookingsCount },
    },
    { new: true, ...sessionOptions(session) }
  );

  if (!updatedWithReward) {
    return { milestoneReached: false, completedBookingsCount: updatedAgent.completedBookingsCount };
  }

  await AgentNotification.create([{
    agentId,
    title: 'Booking milestone unlocked!',
    message: `You completed ${updatedWithReward.completedBookingsCount} paid bookings and earned 1 Gold Coin.`,
    type: 'BOOKING_MILESTONE',
    metadata: {
      completedBookingsCount: updatedWithReward.completedBookingsCount,
      goldCoinsAwarded: GOLD_PER_BOOKING_MILESTONE,
    },
  }], sessionOptions(session));

  return { milestoneReached: true, completedBookingsCount: updatedWithReward.completedBookingsCount };
}

async function redeemGoldForFreeBooking(agentId, session) {
  const agent = await Agent.findById(agentId).setOptions(sessionOptions(session));
  if (!agent) {
    throw new Error('Agent not found');
  }

  if ((agent.goldCoins || 0) < GOLD_COINS_PER_FREE_BOOKING) {
    throw new Error('Not enough Gold Coins to redeem. 1 Gold Coin required.');
  }

  const updatedAgent = await Agent.findOneAndUpdate(
    { _id: agentId, goldCoins: { $gte: GOLD_COINS_PER_FREE_BOOKING } },
    { $inc: { goldCoins: -GOLD_COINS_PER_FREE_BOOKING, freeBookingsAvailable: 1 } },
    { new: true, ...sessionOptions(session) }
  );

  if (!updatedAgent) {
    throw new Error('Not enough Gold Coins to redeem. 1 Gold Coin required.');
  }

  await AgentNotification.create([{
    agentId,
    title: 'Free booking redeemed',
    message: 'You redeemed 1 Gold Coin for 1 free booking.',
    type: 'REDEEM_FREE_BOOKING',
    metadata: {
      goldCoinsRedeemed: GOLD_COINS_PER_FREE_BOOKING,
      freeBookingsAvailable: updatedAgent.freeBookingsAvailable,
      goldCoinsRemaining: updatedAgent.goldCoins,
    },
  }], sessionOptions(session));

  return updatedAgent;
}

async function backfillMissingReferralRewards() {
  const referredAgents = await Agent.find({ referredBy: { $exists: true, $ne: null } })
    .select('_id referredBy')
    .lean();

  let awardedCount = 0;
  for (const referredAgent of referredAgents) {
    const result = await awardReferralReward(referredAgent, null, 'REGISTRATION_BACKFILL');
    if (result) awardedCount += 1;
  }

  return awardedCount;
}

module.exports = {
  handleReferralRewardOnRegistration,
  handleReferralRewardOnFirstPaidSubscription,
  handleBookingMilestone,
  redeemGoldForFreeBooking,
  backfillMissingReferralRewards,
};
