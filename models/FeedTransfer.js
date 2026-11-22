const mongoose = require('mongoose');

const feedTransferSchema = new mongoose.Schema({
    transferNo: {
        type: String,
        unique: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    fromFarmer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Farmer',
        required: true
    },
    fromFarmerName: {
        type: String,
        required: true
    },
    toFarmer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Farmer',
        required: true
    },
    toFarmerName: {
        type: String,
        required: true
    },
    feedType: {
        type: String,
        default: 'Broiler Feed'
    },
    qtyKg: {
        type: Number,
        required: true,
        min: 0.01
    },
    remarks: {
        type: String,
        default: ''
    },
    createdBy: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('FeedTransfer', feedTransferSchema);
