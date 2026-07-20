const mongoose = require('mongoose');

const dailySequenceSchema = new mongoose.Schema({
  dateKey: { type: String, required: true, unique: true }, // format: DDMMYY
  seq: { type: Number, default: 0 }
});

module.exports = mongoose.model('DailySequence', dailySequenceSchema);
