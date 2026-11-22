const express = require('express');
const router = express.Router();
const DailyEntry = require('../models/DailyEntry');
const Farmer = require('../models/Farmer');
const Branch = require('../models/Branch');
const User = require('../models/User');
const FeedDispatch = require('../models/FeedDispatch');
const SaleEntry = require('../models/SaleEntry');

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

// Helper: Farmer ki Sale / Lifting totals aur latest lifted Avg BW nikalne ke liye
async function getFarmerSaleSummary(farmerId) {
    const sales = await SaleEntry.find({ farmer: farmerId }).sort({ date: 1, createdAt: 1 });
    let totalLiftedPcs = 0;
    let totalLiftedWeightKg = 0;
    let latestLiftedAvgGram = 0;

    for (const s of sales) {
        const pcs = Number(s.totalPcs || 0);
        const wt = Number(s.totalWeightKg || 0);
        totalLiftedPcs += pcs;
        totalLiftedWeightKg += wt;
        if (pcs > 0 && wt > 0) {
            latestLiftedAvgGram = Number(((wt / pcs) * 1000).toFixed(0));
        }
    }

    totalLiftedWeightKg = Number(totalLiftedWeightKg.toFixed(2));
    const overallLiftedAvgGram = totalLiftedPcs > 0
        ? Number(((totalLiftedWeightKg / totalLiftedPcs) * 1000).toFixed(0))
        : latestLiftedAvgGram;

    return {
        sales,
        totalLiftedPcs,
        totalLiftedWeightKg,
        liftedAvgBodyWeightGram: overallLiftedAvgGram
    };
}

// Helper: Summary row build karna (branch-wise, supervisor-wise, farmer-wise ke liye)
async function buildFarmerSummaryRow(f) {
    const lastEntry = await DailyEntry.findOne({ farmer: f._id }).sort({ date: -1 });
    const totalFeedInKg = await getTotalFeedInKg(f._id);
    const totalFeedConsumeKg = lastEntry ? Number(lastEntry.totalFeedConsumeKg || 0) : 0;
    const closingFeedKg = getClosingFeedKg(totalFeedInKg, totalFeedConsumeKg);

    const {
        totalLiftedPcs,
        totalLiftedWeightKg,
        liftedAvgBodyWeightGram
    } = await getFarmerSaleSummary(f._id);

    const basePlacement = lastEntry ? Number(lastEntry.totalPlacementChicks || 0) : 0;
    const baseMortality = lastEntry ? Number(lastEntry.totalMortality || 0) : 0;
    const rawLiveChicks = lastEntry
        ? Number(lastEntry.currentLiveChicks || Math.max(0, basePlacement - baseMortality))
        : 0;

    // Lifting ke baad live chicks minus
    const currentLiveChicks = Math.max(0, rawLiveChicks - totalLiftedPcs);

    // Lifting hui hai toh lifted avg body weight update hoga, warna last entry ka avg weight
    const avgBodyWeightGram = totalLiftedPcs > 0 && liftedAvgBodyWeightGram > 0
        ? liftedAvgBodyWeightGram
        : (lastEntry ? Number(lastEntry.avgBodyWeightGram || 0) : 0);

    // Total Body Weight: lifted weight + bache live chicks ka weight
    const remainingLiveWeightKg = (currentLiveChicks * avgBodyWeightGram) / 1000;
    const totalBodyWeightKg = totalLiftedWeightKg > 0
        ? Number((totalLiftedWeightKg + remainingLiveWeightKg).toFixed(2))
        : (lastEntry ? Number(lastEntry.totalBodyWeightKg || 0) : 0);

    // FCR recalculate: Total Feed Consume / Total Body Weight
    const fcr = totalBodyWeightKg > 0
        ? Number((totalFeedConsumeKg / totalBodyWeightKg).toFixed(2))
        : (lastEntry ? Number(lastEntry.fcr || 0) : 0);

    return {
        farmerMongoId: f._id,
        farmerName: f.farmerName,
        farmerId: f.farmerId,
        branchName: f.branch ? f.branch.branchName : 'N/A',
        supervisorName: f.supervisor ? f.supervisor.fullName : 'N/A',
        age: lastEntry ? lastEntry.days : 0,
        totalPlacementChicks: basePlacement,
        totalMortality: baseMortality,
        mortalityPercentage: lastEntry ? lastEntry.mortalityPercentage : 0,
        totalLiftedPcs,
        totalLiftedWeightKg,
        currentLiveChicks,
        avgBodyWeightGram,
        totalBodyWeightKg,
        totalFeedInKg,
        totalFeedConsumeKg,
        closingFeedKg,
        fcr
    };
}

// 1. Branch Wise Report (With Feed In, Total Feed Consume, Closing Feed & Sale Effect)
router.get('/branch-wise', async (req, res) => {
    try {
        const { branchId } = req.query;
        let farmerQuery = {};
        if (branchId) farmerQuery.branch = branchId;

        const farmers = await Farmer.find(farmerQuery).populate('branch').populate('supervisor');
        const report = [];

        for (let f of farmers) {
            report.push(await buildFarmerSummaryRow(f));
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Supervisor Wise Report (With Feed In, Total Feed Consume, Closing Feed & Sale Effect)
router.get('/supervisor-wise', async (req, res) => {
    try {
        const { supervisorId } = req.query;
        let farmerQuery = {};
        if (supervisorId) farmerQuery.supervisor = supervisorId;

        const farmers = await Farmer.find(farmerQuery).populate('branch').populate('supervisor');
        const report = [];

        for (let f of farmers) {
            report.push(await buildFarmerSummaryRow(f));
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
            report.push(await buildFarmerSummaryRow(f));
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Specific Farmer Ledger / Detailed History API (With Sale / Lifting Subtraction, Avg BW & FCR)
router.get('/farmer-ledger/:farmerId', async (req, res) => {
    try {
        const { farmerId } = req.params;
        const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
        const rawEntries = await DailyEntry.find({ farmer: farmerId }).sort({ date: 1 });
        const totalFeedInKg = await getTotalFeedInKg(farmerId);
        const { sales } = await getFarmerSaleSummary(farmerId);

        let cumulativeLiftedPcs = 0;
        let cumulativeLiftedWeightKg = 0;
        let latestLiftedAvgGram = 0;
        const appliedSaleIds = new Set();

        const entries = rawEntries.map((entry) => {
            const obj = entry.toObject();
            const consumed = Number(obj.totalFeedConsumeKg || 0);
            const entryDate = new Date(obj.date);
            const entryDayEnd = new Date(
                entryDate.getFullYear(),
                entryDate.getMonth(),
                entryDate.getDate(),
                23, 59, 59, 999
            );

            for (const s of sales) {
                if (appliedSaleIds.has(String(s._id))) continue;
                const sDate = new Date(s.date);
                if (sDate <= entryDayEnd) {
                    const pcs = Number(s.totalPcs || 0);
                    const wt = Number(s.totalWeightKg || 0);
                    cumulativeLiftedPcs += pcs;
                    cumulativeLiftedWeightKg += wt;
                    if (pcs > 0 && wt > 0) {
                        latestLiftedAvgGram = Number(((wt / pcs) * 1000).toFixed(0));
                    }
                    appliedSaleIds.add(String(s._id));
                }
            }

            const rawLive = Number(obj.currentLiveChicks || 0);
            const liveChicksAfterSale = Math.max(0, rawLive - cumulativeLiftedPcs);

            const avgGram = cumulativeLiftedPcs > 0 && latestLiftedAvgGram > 0
                ? latestLiftedAvgGram
                : Number(obj.avgBodyWeightGram || 0);

            const remainingLiveWtKg = (liveChicksAfterSale * avgGram) / 1000;
            const totalWtKg = cumulativeLiftedWeightKg > 0
                ? Number((cumulativeLiftedWeightKg + remainingLiveWtKg).toFixed(2))
                : Number(obj.totalBodyWeightKg || 0);

            const updatedFcr = totalWtKg > 0
                ? Number((consumed / totalWtKg).toFixed(2))
                : Number(obj.fcr || 0);

            return {
                ...obj,
                liftedPcs: cumulativeLiftedPcs,
                liftedWeightKg: Number(cumulativeLiftedWeightKg.toFixed(2)),
                currentLiveChicks: liveChicksAfterSale,
                avgBodyWeightGram: avgGram,
                totalBodyWeightKg: totalWtKg,
                fcr: updatedFcr,
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
