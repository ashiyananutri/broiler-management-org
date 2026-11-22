const express = require('express');
const router = express.Router();
const DailyEntry = require('../models/DailyEntry');
const Farmer = require('../models/Farmer');
const Branch = require('../models/Branch');
const User = require('../models/User');
const FeedDispatch = require('../models/FeedDispatch');

// Helper: Farmer ka Total Feed In (Dispatched KG) nikalne ke liye
async function getTotalFeedInKg(farmerId) {
    const dispatches = await FeedDispatch.find({ farmer: farmerId });
    const totalIn = dispatches.reduce((sum, item) => sum + Number(item.qtyKg || 0), 0);
    return Number(totalIn.toFixed(2));
}

// Helper: Closing Feed (Feed In - Feed Consume) nikalne ke liye
function getClosingFeedKg(totalFeedInKg, totalFeedConsumeKg) {
    const inKg = Number(totalFeedInKg || 0);
    const consumeKg = Number(totalFeedConsumeKg || 0);
    return Number((inKg - consumeKg).toFixed(2));
}

// 1. Branch Wise Report (With Feed In, Total Feed Consume, Closing Feed & Totals)
router.get('/branch-wise', async (req, res) => {
    try {
        const { branchId } = req.query;
        let farmerQuery = {};
        if (branchId) farmerQuery.branch = branchId;

        const farmers = await Farmer.find(farmerQuery).populate('branch').populate('supervisor');
        const report = [];

        for (let f of farmers) {
            const lastEntry = await DailyEntry.findOne({ farmer: f._id }).sort({ date: -1 });
            const totalFeedInKg = await getTotalFeedInKg(f._id);
            const totalFeedConsumeKg = lastEntry ? Number(lastEntry.totalFeedConsumeKg || 0) : 0;
            const closingFeedKg = getClosingFeedKg(totalFeedInKg, totalFeedConsumeKg);

            report.push({
                farmerMongoId: f._id,
                farmerName: f.farmerName,
                farmerId: f.farmerId,
                branchName: f.branch ? f.branch.branchName : 'N/A',
                supervisorName: f.supervisor ? f.supervisor.fullName : 'N/A',
                age: lastEntry ? lastEntry.days : 0,
                totalPlacementChicks: lastEntry ? lastEntry.totalPlacementChicks : 0,
                totalMortality: lastEntry ? lastEntry.totalMortality : 0,
                mortalityPercentage: lastEntry ? lastEntry.mortalityPercentage : 0,
                currentLiveChicks: lastEntry ? lastEntry.currentLiveChicks : 0,
                avgBodyWeightGram: lastEntry ? lastEntry.avgBodyWeightGram : 0,
                totalBodyWeightKg: lastEntry ? lastEntry.totalBodyWeightKg : 0,
                totalFeedInKg,
                totalFeedConsumeKg,
                closingFeedKg,
                fcr: lastEntry ? lastEntry.fcr : 0
            });
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Supervisor Wise Report (With Feed In, Total Feed Consume, Closing Feed & Totals)
router.get('/supervisor-wise', async (req, res) => {
    try {
        const { supervisorId } = req.query;
        let farmerQuery = {};
        if (supervisorId) farmerQuery.supervisor = supervisorId;

        const farmers = await Farmer.find(farmerQuery).populate('branch').populate('supervisor');
        const report = [];

        for (let f of farmers) {
            const lastEntry = await DailyEntry.findOne({ farmer: f._id }).sort({ date: -1 });
            const totalFeedInKg = await getTotalFeedInKg(f._id);
            const totalFeedConsumeKg = lastEntry ? Number(lastEntry.totalFeedConsumeKg || 0) : 0;
            const closingFeedKg = getClosingFeedKg(totalFeedInKg, totalFeedConsumeKg);

            report.push({
                farmerMongoId: f._id,
                farmerName: f.farmerName,
                farmerId: f.farmerId,
                branchName: f.branch ? f.branch.branchName : 'N/A',
                supervisorName: f.supervisor ? f.supervisor.fullName : 'N/A',
                age: lastEntry ? lastEntry.days : 0,
                totalPlacementChicks: lastEntry ? lastEntry.totalPlacementChicks : 0,
                totalMortality: lastEntry ? lastEntry.totalMortality : 0,
                mortalityPercentage: lastEntry ? lastEntry.mortalityPercentage : 0,
                currentLiveChicks: lastEntry ? lastEntry.currentLiveChicks : 0,
                avgBodyWeightGram: lastEntry ? lastEntry.avgBodyWeightGram : 0,
                totalBodyWeightKg: lastEntry ? lastEntry.totalBodyWeightKg : 0,
                totalFeedInKg,
                totalFeedConsumeKg,
                closingFeedKg,
                fcr: lastEntry ? lastEntry.fcr : 0
            });
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Farmer Wise Summary Report
router.get('/farmer-wise', async (req, res) => {
    try {
        const farmers = await Farmer.find().populate('branch').populate('supervisor');
        const report = [];

        for (let f of farmers) {
            const lastEntry = await DailyEntry.findOne({ farmer: f._id }).sort({ date: -1 });
            const totalFeedInKg = await getTotalFeedInKg(f._id);
            const totalFeedConsumeKg = lastEntry ? Number(lastEntry.totalFeedConsumeKg || 0) : 0;
            const closingFeedKg = getClosingFeedKg(totalFeedInKg, totalFeedConsumeKg);

            report.push({
                farmerMongoId: f._id,
                farmerName: f.farmerName,
                farmerId: f.farmerId,
                branchName: f.branch ? f.branch.branchName : 'N/A',
                supervisorName: f.supervisor ? f.supervisor.fullName : 'N/A',
                age: lastEntry ? lastEntry.days : 0,
                totalPlacementChicks: lastEntry ? lastEntry.totalPlacementChicks : 0,
                totalMortality: lastEntry ? lastEntry.totalMortality : 0,
                mortalityPercentage: lastEntry ? lastEntry.mortalityPercentage : 0,
                currentLiveChicks: lastEntry ? lastEntry.currentLiveChicks : 0,
                avgBodyWeightGram: lastEntry ? lastEntry.avgBodyWeightGram : 0,
                totalBodyWeightKg: lastEntry ? lastEntry.totalBodyWeightKg : 0,
                totalFeedInKg,
                totalFeedConsumeKg,
                closingFeedKg,
                fcr: lastEntry ? lastEntry.fcr : 0
            });
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Specific Farmer Ledger / Detailed History API
router.get('/farmer-ledger/:farmerId', async (req, res) => {
    try {
        const { farmerId } = req.params;
        const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
        const rawEntries = await DailyEntry.find({ farmer: farmerId }).sort({ date: 1 });
        const totalFeedInKg = await getTotalFeedInKg(farmerId);

        const entries = rawEntries.map((entry) => {
            const obj = entry.toObject();
            const consumed = Number(obj.totalFeedConsumeKg || 0);
            return {
                ...obj,
                totalFeedInKg,
                closingFeedKg: getClosingFeedKg(totalFeedInKg, consumed)
            };
        });

        res.json({ farmer, totalFeedInKg, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
