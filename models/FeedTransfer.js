const mongoose = require('mongoose');

const FeedTransferSchema = new mongoose.Schema(
    {
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
            trim: true,
            default: ''
        },
        toFarmer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Farmer',
            required: true
        },
        toFarmerName: {
            type: String,
            trim: true,
            default: ''
        },
        feedType: {
            type: String,
            trim: true,
            default: 'Broiler Feed'
        },
        qtyKg: {
            type: Number,
            required: true,
            min: [0.01, 'Quantity must be greater than 0']
        },
        remarks: {
            type: String,
            trim: true,
            default: ''
        },
        createdBy: {
            type: String,
            trim: true,
            default: ''
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('FeedTransfer', FeedTransferSchema);
