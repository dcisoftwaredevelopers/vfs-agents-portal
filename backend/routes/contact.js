const express = require('express');
const contactController = require('../controllers/Contactcontroller');

const router = express.Router();

router.post('/', contactController.submitContact);

module.exports = router;
