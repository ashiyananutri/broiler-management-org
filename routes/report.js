const express = require('express');
const router = express.Router();
const DailyEntry = require('../models/DailyEntry');
const Farmer = require('../models/Farmer');
const Branch = require('../models/Branch');
const User = require('../models/User');

// 1. Branch Wise Report (With Total Feed, Avg BW, Total BW & Totals)
router.get('/branch-wise', async (req, res) => {
    try {
        const { branchId } = req.query;
        let farmerQuery = {};
        if (branchId) farmerQuery.branch = branchId;

        const farmers = await Farmer.find(farmerQuery).populate('branch').populate('supervisor');
        const report = [];

        for (let f of farmers) {
            const lastEntry = await DailyEntry.findOne({ farmer: f._id }).sort({ date: -1 });
            report.push({
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
                totalFeedConsumeKg: lastEntry ? lastEntry.totalFeedConsumeKg : 0,
                fcr: lastEntry ? lastEntry.fcr : 0
            });
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Supervisor Wise Report (With Total Feed, Avg BW, Total BW & Totals)
router.get('/supervisor-wise', async (req, res) => {
    try {
        const { supervisorId } = req.query;
        let farmerQuery = {};
        if (supervisorId) farmerQuery.supervisor = supervisorId;

        const farmers = await Farmer.find(farmerQuery).populate('branch').populate('supervisor');
        const report = [];

        for (let f of farmers) {
            const lastEntry = await DailyEntry.findOne({ farmer: f._id }).sort({ date: -1 });
            report.push({
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
                totalFeedConsumeKg: lastEntry ? lastEntry.totalFeedConsumeKg : 0,
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
                totalFeedConsumeKg: lastEntry ? lastEntry.totalFeedConsumeKg : 0,
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
        const entries = await DailyEntry.find({ farmer: farmerId }).sort({ date: 1 });
        res.json({ farmer, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;