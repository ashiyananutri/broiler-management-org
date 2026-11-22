const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const SaleEntry = require('../models/SaleEntry');
const Farmer = require('../models/Farmer');
const Trader = require('../models/Trader');
const User = require('../models/User');

// Optional models (agar aapke project mein मौजूद hon toh automatically use honge)
let DailyEntry = null;
let Batch = null;
try { DailyEntry = require('../models/DailyEntry'); } catch (_) {}
try { Batch = require('../models/Batch'); } catch (_) {}

// Helper: Total Pcs, Total Weight (Kg), aur Avg. Body Weight (Kg) calculate karna
function computeLiftingTotals(rows = []) {
    let totalPcs = 0;
    let totalWeightKg = 0;

    for (const r of rows) {
        totalPcs += Number(r.noOfBirds || 0);
        totalWeightKg += Number(r.weightKg || 0);
    }

    totalWeightKg = Number(totalWeightKg.toFixed(2));
    const avgBodyWeightKg = totalPcs > 0
        ? Number((totalWeightKg / totalPcs).toFixed(3))
        : 0;

    return { totalPcs, totalWeightKg, avgBodyWeightKg };
}

// Helper: Farmer Book Totals & FCR recalculate aur sync karna
async function syncFarmerBookAndFCR(farmerId) {
    if (!farmerId) return null;

    const farmer = await Farmer.findById(farmerId);
    if (!farmer) return null;

    // 1. Is farmer ki sabhi sale/lifting entries ka total nikalna
    const sales = await SaleEntry.find({ farmer: farmer._id });
    let totalLiftedPcs = 0;
    let totalLiftedWeightKg = 0;
    let totalSaleAmount = 0;

    for (const s of sales) {
        const pcs = Number(s.totalPcs || 0);
        const wt = Number(s.totalWeightKg || 0);
        const rate = Number(s.rate || 0);
        totalLiftedPcs += pcs;
        totalLiftedWeightKg += wt;
        totalSaleAmount += Number((wt * rate).toFixed(2));
    }

    totalLiftedWeightKg = Number(totalLiftedWeightKg.toFixed(2));
    totalSaleAmount = Number(totalSaleAmount.toFixed(2));

    const liftedAvgBodyWeightKg = totalLiftedPcs > 0
        ? Number((totalLiftedWeightKg / totalLiftedPcs).toFixed(3))
        : 0;

    // 2. Total Feed Consumed (Kg) nikalna (agar DailyEntry model मौजूद ho)
    let totalFeedConsumedKg = 0;
    if (DailyEntry) {
        try {
            const entries = await DailyEntry.find({
                $or: [
                    { farmer: farmer._id },
                    { farmerId: farmer._id },
                    { farmerName: farmer.farmerName }
                ]
            });
            for (const e of entries) {
                totalFeedConsumedKg += Number(
                    e.feedConsumedKg ?? e.feedUsedKg ?? e.feedKg ?? e.dailyFeedKg ?? 0
                );
            }
        } catch (_) {}
    }

    // Agar Farmer/Batch doc mein already feedConsumedKg store hai toh fallback use karein
    if (totalFeedConsumedKg === 0 && Number(farmer.totalFeedConsumedKg || farmer.feedConsumedKg || 0) > 0) {
        totalFeedConsumedKg = Number(farmer.totalFeedConsumedKg || farmer.feedConsumedKg || 0);
    }

    totalFeedConsumedKg = Number(totalFeedConsumedKg.toFixed(2));

    // 3. FCR calculate karna: Total Feed Consumed / Total Lifted Weight
    const fcr = totalLiftedWeightKg > 0
        ? Number((totalFeedConsumedKg / totalLiftedWeightKg).toFixed(2))
        : 0;

    // 4. Farmer document ke common fields ko safely update karna (agar schema mein defined hon)
    const schemaPaths = Farmer.schema.paths;
    const setFields = {};

    if (schemaPaths.liftedBirds) setFields.liftedBirds = totalLiftedPcs;
    if (schemaPaths.totalLiftedPcs) setFields.totalLiftedPcs = totalLiftedPcs;
    if (schemaPaths.liftedWeightKg) setFields.liftedWeightKg = totalLiftedWeightKg;
    if (schemaPaths.totalLiftedWeightKg) setFields.totalLiftedWeightKg = totalLiftedWeightKg;
    if (schemaPaths.avgBodyWeightKg) setFields.avgBodyWeightKg = liftedAvgBodyWeightKg;
    if (schemaPaths.liftedAvgBodyWeightKg) setFields.liftedAvgBodyWeightKg = liftedAvgBodyWeightKg;
    if (schemaPaths.fcr) setFields.fcr = fcr;
    if (schemaPaths.totalSaleAmount) setFields.totalSaleAmount = totalSaleAmount;

    const placedChicks = Number(farmer.chicksPlaced || farmer.openingChicks || farmer.totalChicks || 0);
    const mortality = Number(farmer.mortality || farmer.totalMortality || 0);
    const remainingBirds = Math.max(0, placedChicks - mortality - totalLiftedPcs);

    if (schemaPaths.remainingBirds) setFields.remainingBirds = remainingBirds;
    if (schemaPaths.liveBirds) setFields.liveBirds = remainingBirds;

    if (Object.keys(setFields).length > 0) {
        await Farmer.findByIdAndUpdate(farmer._id, { $set: setFields });
    }

    // 5. Agar Batch model मौजूद ho toh active/latest batch ko bhi update karein
    if (Batch) {
        try {
            const batchSchemaPaths = Batch.schema.paths;
            const batchSet = {};
            if (batchSchemaPaths.liftedBirds) batchSet.liftedBirds = totalLiftedPcs;
            if (batchSchemaPaths.liftedWeightKg) batchSet.liftedWeightKg = totalLiftedWeightKg;
            if (batchSchemaPaths.avgBodyWeightKg) batchSet.avgBodyWeightKg = liftedAvgBodyWeightKg;
            if (batchSchemaPaths.fcr) batchSet.fcr = fcr;

            if (Object.keys(batchSet).length > 0) {
                await Batch.updateMany(
                    { $or: [{ farmer: farmer._id }, { farmerId: farmer._id }] },
                    { $set: batchSet }
                );
            }
        } catch (_) {}
    }

    return {
        farmerId: farmer._id,
        farmerName: farmer.farmerName,
        totalLiftedPcs,
        totalLiftedWeightKg,
        liftedAvgBodyWeightKg,
        totalFeedConsumedKg,
        fcr,
        totalSaleAmount,
        remainingBirds
    };
}

// GET all Sale / Bird Lifting entries
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.farmerId && mongoose.Types.ObjectId.isValid(req.query.farmerId)) {
            filter.farmer = req.query.farmerId;
        }
        const list = await SaleEntry.find(filter).sort({ date: -1, createdAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Farmer Book summary + lifting history for a specific Farmer
router.get('/farmer-book/:farmerId', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.farmerId)) {
            return res.status(400).json({ error: 'Invalid farmer ID' });
        }
        const summary = await syncFarmerBookAndFCR(req.params.farmerId);
        if (!summary) {
            return res.status(404).json({ error: 'Farmer not found!' });
        }
        const liftings = await SaleEntry.find({ farmer: req.params.farmerId }).sort({ date: -1, createdAt: -1 });
        res.json({ summary, liftings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single Sale / Bird Lifting entry by ID
router.get('/:id', async (req, res) => {
    try {
        const doc = await SaleEntry.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Sale entry not found!' });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create new Sale / Bird Lifting entry
router.post('/', async (req, res) => {
    try {
        const {
            slNo,
            date,
            liftingSupervisorId,
            traderId,
            partyName,
            farmerId,
            wtStartingTime,
            wtClosingTime,
            driverName,
            vehicleNo,
            rate,
            age,
            lsName,
            rows,
            feedClosingStock,
            birdStock,
            weakBirds
        } = req.body;

        const farmer = await Farmer.findById(farmerId).populate('branch');
        if (!farmer) {
            return res.status(404).json({ error: 'Farmer not found!' });
        }

        let traderDoc = null;
        if (traderId) {
            traderDoc = await Trader.findById(traderId);
        }

        let supDoc = null;
        if (liftingSupervisorId) {
            supDoc = await User.findById(liftingSupervisorId);
        }

        const cleanRows = Array.isArray(rows)
            ? rows.map((r, idx) => ({
                slNo: idx + 1,
                noOfBirds: Number(r.noOfBirds || 0),
                weightKg: Number(r.weightKg || 0)
            }))
            : [];

        const { totalPcs, totalWeightKg, avgBodyWeightKg } = computeLiftingTotals(cleanRows);

        const entry = new SaleEntry({
            slNo: slNo || `SL-${Date.now().toString().slice(-5)}`,
            date,
            liftingSupervisor: supDoc ? supDoc._id : undefined,
            liftingSupervisorName: supDoc ? supDoc.fullName : '',
            trader: traderDoc ? traderDoc._id : undefined,
            partyName: traderDoc ? traderDoc.traderName : (partyName || ''),
            farmer: farmer._id,
            farmerName: farmer.farmerName,
            branch: farmer.branch ? (farmer.branch._id || farmer.branch) : undefined,
            branchName: farmer.branch && farmer.branch.branchName ? farmer.branch.branchName : '',
            wtStartingTime: wtStartingTime || '',
            wtClosingTime: wtClosingTime || '',
            driverName: driverName || '',
            vehicleNo: vehicleNo || '',
            rate: Number(rate || 0),
            age: Number(age || 0),
            lsName: lsName || '',
            rows: cleanRows,
            totalPcs,
            totalWeightKg,
            avgBodyWeightKg,
            feedClosingStock: feedClosingStock || '',
            birdStock: birdStock || '',
            weakBirds: weakBirds || ''
        });

        await entry.save();
        const farmerBook = await syncFarmerBookAndFCR(farmer._id);

        res.json({
            message: 'Sale / Bird Lifting entry saved & Farmer Book / FCR updated!',
            entry,
            farmerBook
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update existing Sale / Bird Lifting entry
router.put('/:id', async (req, res) => {
    try {
        const {
            slNo,
            date,
            liftingSupervisorId,
            traderId,
            partyName,
            farmerId,
            wtStartingTime,
            wtClosingTime,
            driverName,
            vehicleNo,
            rate,
            age,
            lsName,
            rows,
            feedClosingStock,
            birdStock,
            weakBirds
        } = req.body;

        const existing = await SaleEntry.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Sale entry not found!' });
        }

        const previousFarmerId = existing.farmer;
        const farmer = await Farmer.findById(farmerId).populate('branch');
        if (!farmer) {
            return res.status(404).json({ error: 'Farmer not found!' });
        }

        let traderDoc = null;
        if (traderId) {
            traderDoc = await Trader.findById(traderId);
        }

        let supDoc = null;
        if (liftingSupervisorId) {
            supDoc = await User.findById(liftingSupervisorId);
        }

        const cleanRows = Array.isArray(rows)
            ? rows.map((r, idx) => ({
                slNo: idx + 1,
                noOfBirds: Number(r.noOfBirds || 0),
                weightKg: Number(r.weightKg || 0)
            }))
            : existing.rows;

        const { totalPcs, totalWeightKg, avgBodyWeightKg } = computeLiftingTotals(cleanRows);

        existing.slNo = slNo || existing.slNo;
        existing.date = date;
        existing.liftingSupervisor = supDoc ? supDoc._id : undefined;
        existing.liftingSupervisorName = supDoc ? supDoc.fullName : '';
        existing.trader = traderDoc ? traderDoc._id : undefined;
        existing.partyName = traderDoc ? traderDoc.traderName : (partyName || existing.partyName);
        existing.farmer = farmer._id;
        existing.farmerName = farmer.farmerName;
        existing.branch = farmer.branch ? (farmer.branch._id || farmer.branch) : undefined;
        existing.branchName = farmer.branch && farmer.branch.branchName ? farmer.branch.branchName : '';
        existing.wtStartingTime = wtStartingTime || '';
        existing.wtClosingTime = wtClosingTime || '';
        existing.driverName = driverName || '';
        existing.vehicleNo = vehicleNo || '';
        existing.rate = Number(rate || 0);
        existing.age = Number(age || 0);
        existing.lsName = lsName || '';
        existing.rows = cleanRows;
        existing.totalPcs = totalPcs;
        existing.totalWeightKg = totalWeightKg;
        existing.avgBodyWeightKg = avgBodyWeightKg;
        existing.feedClosingStock = feedClosingStock || '';
        existing.birdStock = birdStock || '';
        existing.weakBirds = weakBirds || '';

        await existing.save();

        // Agar farmer change hua hai toh purane farmer ka book bhi re-sync karein
        if (previousFarmerId && String(previousFarmerId) !== String(farmer._id)) {
            await syncFarmerBookAndFCR(previousFarmerId);
        }
        const farmerBook = await syncFarmerBookAndFCR(farmer._id);

        res.json({
            message: 'Sale / Bird Lifting entry updated & Farmer Book / FCR synced!',
            entry: existing,
            farmerBook
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Sale / Bird Lifting entry
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await SaleEntry.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Sale entry not found!' });
        }

        const farmerBook = await syncFarmerBookAndFCR(deleted.farmer);

        res.json({
            message: 'Sale entry deleted & Farmer Book / FCR recalculated!',
            farmerBook
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
