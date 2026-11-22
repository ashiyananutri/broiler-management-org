const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const FeedTransfer = require('../models/FeedTransfer');
const Farmer = require('../models/Farmer');
const FeedDispatch = require('../models/FeedDispatch');

// GET all Feed Transfers
router.get('/', async (req, res) => {
    try {
        const list = await FeedTransfer.find()
            .populate('fromFarmer', 'farmerName farmerId')
            .populate('toFarmer', 'farmerName farmerId')
            .sort({ date: -1, createdAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create Feed Transfer (From Farmer -> To Farmer)
router.post('/', async (req, res) => {
    try {
        const {
            date,
            fromFarmerId,
            toFarmerId,
            feedType,
            qtyKg,
            remarks,
            createdBy
        } = req.body;

        const transferQty = Number(qtyKg || 0);

        if (!fromFarmerId || !toFarmerId) {
            return res.status(400).json({ error: 'From Farmer aur To Farmer dono select karna zaroori hai!' });
        }
        if (
            !mongoose.Types.ObjectId.isValid(fromFarmerId) ||
            !mongoose.Types.ObjectId.isValid(toFarmerId)
        ) {
            return res.status(400).json({ error: 'Invalid Farmer ID!' });
        }
        if (String(fromFarmerId) === String(toFarmerId)) {
            return res.status(400).json({ error: 'From Farmer aur To Farmer alag-alag hone chahiye!' });
        }
        if (!transferQty || transferQty <= 0) {
            return res.status(400).json({ error: 'Transfer quantity (KG) 0 se zyada honi chahiye!' });
        }

        const [fromFarmer, toFarmer] = await Promise.all([
            Farmer.findById(fromFarmerId),
            Farmer.findById(toFarmerId)
        ]);

        if (!fromFarmer) return res.status(404).json({ error: 'From Farmer nahi mila!' });
        if (!toFarmer) return res.status(404).json({ error: 'To Farmer nahi mila!' });

        const transferDate = date ? new Date(date) : new Date();
        if (Number.isNaN(transferDate.getTime())) {
            return res.status(400).json({ error: 'Invalid transfer date!' });
        }

        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const transferNo = `FT-${Date.now().toString().slice(-6)}${randomSuffix}`;

        const transfer = new FeedTransfer({
            transferNo,
            date: transferDate,
            fromFarmer: fromFarmer._id,
            fromFarmerName: fromFarmer.farmerName,
            toFarmer: toFarmer._id,
            toFarmerName: toFarmer.farmerName,
            feedType: (feedType || 'Broiler Feed').trim(),
            qtyKg: Number(transferQty.toFixed(2)),
            remarks: (remarks || '').trim(),
            createdBy: (createdBy || '').trim()
        });

        await transfer.save();

        const dispatchBase = {
            date: transferDate,
            feedType: transfer.feedType,
            remarks: transfer.remarks
                ? `Feed Transfer (${transferNo}): ${transfer.remarks}`
                : `Feed Transfer (${transferNo}) ${fromFarmer.farmerName} -> ${toFarmer.farmerName}`,
            transferId: transfer._id
        };

        await Promise.all([
            FeedDispatch.create({
                ...dispatchBase,
                farmer: fromFarmer._id,
                qtyKg: Number((-transfer.qtyKg).toFixed(2))
            }),
            FeedDispatch.create({
                ...dispatchBase,
                farmer: toFarmer._id,
                qtyKg: Number(transfer.qtyKg.toFixed(2))
            })
        ]);

        res.status(201).json({
            message: `${transfer.qtyKg.toFixed(2)} KG feed ${fromFarmer.farmerName} se ${toFarmer.farmerName} ko transfer ho gaya!`,
            transfer
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Feed Transfer aur uski linked FeedDispatch entries hatana
router.delete('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid transfer ID!' });
        }

        const deleted = await FeedTransfer.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Feed transfer record nahi mila!' });
        }

        await FeedDispatch.deleteMany({ transferId: deleted._id });

        res.json({ message: 'Feed transfer delete ho gaya aur stock sync ho gaya!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
