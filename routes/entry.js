const express = require('express');
const router = express.Router();
const FeedDispatch = require('../models/FeedDispatch');
const DailyEntry = require('../models/DailyEntry');
const ChicksPlacement = require('../models/ChicksPlacement');
const Farmer = require('../models/Farmer');

// ==========================================
// 1. CHICKS PLACEMENT ROUTES
// ==========================================
router.post('/chicks-placement', async (req, res) => {
    try {
        const { placementId, date, farmerId, chicksQty } = req.body;
        const farmer = await Farmer.findById(farmerId);
        if (!farmer) return res.status(404).json({ error: 'Farmer not found' });

        const placement = new ChicksPlacement({
            placementId,
            date: date || Date.now(),
            farmer: farmer._id,
            branch: farmer.branch,
            supervisor: farmer.supervisor,
            chicksQty
        });
        await placement.save();
        res.status(201).json({ message: 'Chicks placement saved successfully', placement });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/chicks-placement', async (req, res) => {
    try {
        const placements = await ChicksPlacement.find().populate('farmer').populate('branch').populate('supervisor').sort({ date: -1 });
        res.json(placements);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/chicks-placement/:id', async (req, res) => {
    try {
        const updated = await ChicksPlacement.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Placement updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/chicks-placement/:id', async (req, res) => {
    try {
        await ChicksPlacement.findByIdAndDelete(req.params.id);
        res.json({ message: 'Placement deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 2. FEED DISPATCH ROUTES (With Approval & Ledger Logic)
// ==========================================
router.post('/feed-dispatch', async (req, res) => {
    try {
        const { challanNo, date, farmerId, feedType, qtyKg } = req.body;
        
        const existingChallan = await FeedDispatch.findOne({ challanNo });
        if (existingChallan) {
            return res.status(400).json({ error: 'Yeh Challan Number pehle se entered hai! Duplicate entry allowed nahi hai.' });
        }

        const farmer = await Farmer.findById(farmerId).populate('supervisor');
        if (!farmer) return res.status(404).json({ error: 'Farmer not found' });

        const feedDispatch = new FeedDispatch({
            challanNo,
            date: date || Date.now(),
            farmer: farmer._id,
            branch: farmer.branch,
            supervisor: farmer.supervisor ? farmer.supervisor._id : null,
            feedType,
            qtyKg,
            status: 'Pending'
        });
        await feedDispatch.save();
        res.status(201).json({ message: 'Feed dispatch entry created! Pending Supervisor Approval.', feedDispatch });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/feed-dispatch/approve/:id', async (req, res) => {
    try {
        const dispatch = await FeedDispatch.findById(req.params.id);
        if (!dispatch) return res.status(404).json({ error: 'Dispatch entry nahi mili' });
        
        if (dispatch.status === 'Approved') {
            return res.status(400).json({ error: 'Yeh entry pehle se Approved hai!' });
        }

        dispatch.status = 'Approved';
        await dispatch.save();

        await Farmer.findByIdAndUpdate(dispatch.farmer, {
            $inc: { 
                totalFeedReceivedKg: dispatch.qtyKg,
                totalFeedBags: (dispatch.qtyKg / 50)
            }
        });

        res.json({ message: 'Feed Dispatch Approved aur Farmer Ledger me update ho gaya!', dispatch });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/feed-dispatch', async (req, res) => {
    try {
        const feeds = await FeedDispatch.find().populate('farmer').populate('branch').populate('supervisor').sort({ date: -1 });
        res.json(feeds);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/feed-dispatch/:id', async (req, res) => {
    try {
        const { challanNo } = req.body;
        const existing = await FeedDispatch.findOne({ challanNo, _id: { $ne: req.params.id } });
        if (existing) {
            return res.status(400).json({ error: 'Yeh Challan Number kisi aur entry me use ho raha hai!' });
        }

        const updated = await FeedDispatch.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Feed entry updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/feed-dispatch/:id', async (req, res) => {
    try {
        await FeedDispatch.findByIdAndDelete(req.params.id);
        res.json({ message: 'Feed entry deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 3. DAILY FARM LOG ROUTES
// ==========================================
router.post('/daily-entry', async (req, res) => {
    try {
        const { farmerId, date, dayMortality, dayFeedConsumeKg, avgBodyWeightGram } = req.body;
        
        const placement = await ChicksPlacement.findOne({ farmer: farmerId }).sort({ date: -1 });
        if (!placement) return res.status(400).json({ error: 'Pehle is farmer ka Chicks Placement karein!' });

        const totalPlacementChicks = Number(placement.chicksQty);
        const placementDate = new Date(placement.date);
        const entryDate = new Date(date || Date.now());
        const diffTime = Math.abs(entryDate - placementDate);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const previousEntries = await DailyEntry.find({ farmer: farmerId });
        
        const prevTotalMortality = previousEntries.reduce((sum, entry) => sum + (entry.dayMortality || 0), 0);
        const prevTotalFeed = previousEntries.reduce((sum, entry) => sum + (entry.dayFeedConsumeKg || 0), 0);

        const totalMortality = prevTotalMortality + Number(dayMortality);
        const totalFeedConsumeKg = prevTotalFeed + Number(dayFeedConsumeKg);

        const currentLiveChicks = Math.max(0, totalPlacementChicks - totalMortality);
        const mortalityPercentage = totalPlacementChicks > 0 ? ((totalMortality / totalPlacementChicks) * 100).toFixed(2) : 0;

        const lastEntry = await DailyEntry.findOne({ farmer: farmerId }).sort({ date: -1 });
        let effectiveBodyWeightGram = avgBodyWeightGram ? Number(avgBodyWeightGram) : 0;
        if (!effectiveBodyWeightGram && lastEntry) {
            effectiveBodyWeightGram = lastEntry.avgBodyWeightGram;
        }

        const totalBodyWeightKg = (currentLiveChicks * effectiveBodyWeightGram) / 1000;
        const fcr = totalBodyWeightKg > 0 ? (totalFeedConsumeKg / totalBodyWeightKg) : 0;
        const farmer = await Farmer.findById(farmerId);

        const newDailyEntry = new DailyEntry({
            farmer: farmerId,
            date: entryDate,
            branch: farmer.branch,
            supervisor: farmer.supervisor,
            days,
            dayMortality: Number(dayMortality),
            totalMortality,
            totalPlacementChicks,
            currentLiveChicks,
            mortalityPercentage: Number(mortalityPercentage),
            dayFeedConsumeKg: Number(dayFeedConsumeKg),
            totalFeedConsumeKg,
            avgBodyWeightGram: effectiveBodyWeightGram,
            totalBodyWeightKg: parseFloat(totalBodyWeightKg.toFixed(2)),
            fcr: parseFloat(fcr.toFixed(3))
        });

        await newDailyEntry.save();
        res.status(201).json({ message: `Daily entry recorded. Age: ${days} Days`, data: newDailyEntry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/daily-entry', async (req, res) => {
    try {
        const entries = await DailyEntry.find().populate('farmer').populate('branch').populate('supervisor').sort({ date: -1 });
        res.json(entries);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/daily-entry/:id', async (req, res) => {
    try {
        const updated = await DailyEntry.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: 'Daily entry updated successfully', updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/daily-entry/:id', async (req, res) => {
    try {
        await DailyEntry.findByIdAndDelete(req.params.id);
        res.json({ message: 'Daily entry deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;