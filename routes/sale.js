const express = require('express');
const router = express.Router();
const SaleEntry = require('../models/SaleEntry');
const Farmer = require('../models/Farmer');
const Trader = require('../models/Trader');
const User = require('../models/User');

// Helper: Total Pcs, Total Weight (Kg), aur Avg. Body Weight (Kg) calculate karna
function computeTotals(rows = []) {
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

// GET all Sale / Bird Lifting entries
router.get('/', async (req, res) => {
    try {
        const list = await SaleEntry.find().sort({ date: -1, createdAt: -1 });
        res.json(list);
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

        const { totalPcs, totalWeightKg, avgBodyWeightKg } = computeTotals(cleanRows);

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
        res.json({ message: 'Sale / Bird Lifting entry saved successfully!', entry });
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

        const { totalPcs, totalWeightKg, avgBodyWeightKg } = computeTotals(cleanRows);

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
        res.json({ message: 'Sale / Bird Lifting entry updated successfully!', entry: existing });
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
        res.json({ message: 'Sale entry deleted successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
