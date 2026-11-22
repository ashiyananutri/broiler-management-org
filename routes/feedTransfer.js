const express = require('express');
const router = express.Router();
const FeedTransfer = require('../models/FeedTransfer');
const Farmer = require('../models/Farmer');
const { verifySingleSession } = require('./auth');

router.use(verifySingleSession);

async function generateTransferNo() {
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await FeedTransfer.countDocuments();
    return `FT-${ymd}-${String(count + 1).padStart(4, '0')}`;
}

// List all feed transfers
router.get('/', async (req, res) => {
    try {
        const transfers = await FeedTransfer.find()
            .populate('fromFarmer', 'farmerName farmerId branch')
            .populate('toFarmer', 'farmerName farmerId branch')
            .sort({ date: -1, createdAt: -1 });

        res.json({ transfers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Farmer-to-Farmer Feed Transfer
router.post('/', async (req, res) => {
    try {
        const { date, fromFarmerId, toFarmerId, feedType, qtyKg, remarks } = req.body;
        const qty = Number(qtyKg || 0);

        if (!fromFarmerId || !toFarmerId) {
            return res.status(400).json({ error: 'From Farmer aur To Farmer dono zaroori hain.' });
        }

        if (String(fromFarmerId) === String(toFarmerId)) {
            return res.status(400).json({ error: 'From Farmer aur To Farmer alag-alag hone chahiye.' });
        }

        if (!Number.isFinite(qty) || qty <= 0) {
            return res.status(400).json({ error: 'Quantity (KG) 0 se zyada honi chahiye.' });
        }

        const [fromFarmerDoc, toFarmerDoc] = await Promise.all([
            Farmer.findById(fromFarmerId).lean(),
            Farmer.findById(toFarmerId).lean()
        ]);

        if (!fromFarmerDoc || !toFarmerDoc) {
            return res.status(404).json({ error: 'Selected Farmer record nahi mila.' });
        }

        const transferNo = await generateTransferNo();

        const transfer = await FeedTransfer.create({
            transferNo,
            date: date ? new Date(date) : new Date(),
            fromFarmer: fromFarmerDoc._id,
            fromFarmerName: fromFarmerDoc.farmerName || fromFarmerDoc.name || '',
            toFarmer: toFarmerDoc._id,
            toFarmerName: toFarmerDoc.farmerName || toFarmerDoc.name || '',
            feedType: (feedType || 'Broiler Feed').trim(),
            qtyKg: Number(qty.toFixed(2)),
            remarks: (remarks || '').trim(),
            createdBy: req.currentUser?.userId || req.currentUser?.fullName || ''
        });

        res.status(201).json({
            message: 'Feed transfer successfully save ho gaya.',
            transfer
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a feed transfer
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await FeedTransfer.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Feed transfer record nahi mila.' });
        }
        res.json({ message: 'Feed transfer delete ho gaya.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
