const mongoose = require('mongoose');

const dailyEntrySchema = new mongoose.Schema({
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', required: true },
    date: { type: Date, required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    days: { type: Number, required: true },
    totalPlacementChicks: { type: Number, default: 0 },
    dayMortality: { type: Number, required: true, default: 0 },
    totalMortality: { type: Number, required: true, default: 0 },
    currentLiveChicks: { type: Number, required: true, default: 0 },
    mortalityPercentage: { type: Number, default: 0 },
    dayFeedConsumeKg: { type: Number, required: true, default: 0 },
    totalFeedConsumeKg: { type: Number, required: true, default: 0 },
    avgBodyWeightGram: { type: Number, default: 0 },
    totalBodyWeightKg: { type: Number, default: 0 },
    fcr: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DailyEntry', dailyEntrySchema);