const mongoose = require('mongoose');

const TraderSchema = new mongoose.Schema({
    traderId: { type: String, unique: true, required: true },
    traderName: { type: String, required: true },
    mobileNo: { type: String, required: true },
    address: { type: String, required: true }
});

module.exports = mongoose.model('Trader', TraderSchema);