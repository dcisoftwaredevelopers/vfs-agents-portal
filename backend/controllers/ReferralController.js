const Agent = require('../models/Agent');
const rewardService = require('../services/rewardService');

exports.getReferralStatus = async (req, res) => {
  try {
    const agent = await Agent.findById(req.user._id)
      .select('referralCode referredBy discountEligible stars goldCoins freeApplicationsAvailable freeApplicationsUsed completedBookingsCount lastBookingMilestoneReached referralsCount')
      .lean();

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found.' });
    }

    res.json({
      referralCode: agent.referralCode,
      referredBy: agent.referredBy,
      discountEligible: agent.discountEligible,
      stars: agent.stars,
      goldCoins: agent.goldCoins,
      freeApplicationsAvailable: agent.freeApplicationsAvailable,
      freeApplicationsUsed: agent.freeApplicationsUsed,
      completedBookingsCount: agent.completedBookingsCount,
      lastBookingMilestoneReached: agent.lastBookingMilestoneReached,
      referralsCount: agent.referralsCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.redeemFreeBooking = async (req, res) => {
  try {
    const updatedAgent = await rewardService.redeemGoldForFreeBooking(req.user._id, null);
    res.json({
      message: 'Free application credit redeemed successfully. 1 credit has been added to your account.',
      updatedAgent: {
        freeApplicationsAvailable: updatedAgent.freeApplicationsAvailable,
        freeApplicationsUsed: updatedAgent.freeApplicationsUsed,
        goldCoins: updatedAgent.goldCoins,
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
