const mongoose = require('mongoose');

const feedTransferSchema = new mongoose.Schema({
    transferNo: {
        type: String,
        required: true,
        unique: true,
        trim: true
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
        required: true,
        trim: true
    },
    toFarmer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Farmer',
        required: true
    },
    toFarmerName: {
        type: String,
        required: true,
        trim: true
    },
    feedType: {
        type: String,
        default: 'Broiler Feed',
        trim: true
    },
    qtyKg: {
        type: Number,
        required: true,
        min: 0.01
    },
    remarks: {
        type: String,
        default: '',
        trim: true
    },
    createdBy: {
        type: String,
        default: '',
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('FeedTransfer', feedTransferSchema);
