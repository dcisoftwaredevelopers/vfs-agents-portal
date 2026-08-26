const express = require('express');
const WeeklyClassLink = require('../models/WeeklyClassLink');
const { protect, verifyActiveSubscription } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/:className/current', protect, verifyActiveSubscription, async (req, res) => {
  try {
    await WeeklyClassLink.ensureMultipleLinkIndexes();
    if (!['german', 'french'].includes(req.params.className)) {
      return res.status(400).json({ message: 'Unsupported class.' });
    }

    const today = new Date();
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    const weekStart = monday.toISOString().slice(0, 10);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const weekEnd = sunday.toISOString().slice(0, 10);

    const links = await WeeklyClassLink.find({
      className: req.params.className,
      weekStart: { $gte: weekStart, $lte: weekEnd },
      isPublished: true,
    }).sort({ weekStart: 1, createdAt: 1 }).lean();

    return res.json({ links, link: links[0] || null, weekStart, weekEnd });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch the weekly class link.' });
  }
});

module.exports = router;
