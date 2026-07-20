const express = require('express');
const router = express.Router();
const agentController = require('../controllers/Agentcontroller');
const { protect, admin } = require('../middleware/authMiddleware');

router.delete('/agents/:id', protect, admin, agentController.deleteagents);

module.exports = router;