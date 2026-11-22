const express = require('express');
const router = express.Router();
const ChicksPlacement = require('../models/ChicksPlacement');
const FeedDispatch = require('../models/FeedDispatch');
const DailyEntry = require('../models/DailyEntry');
const Farmer = require('../models/Farmer');

// Helper: Farmer ka total placed chicks nikalne ke liye
async function getFarmerPlacementQty(farmerId) {
    const placements = await ChicksPlacement.find({ farmer: farmerId });
    return placements.reduce((sum, p) => sum + Number(p.chicksQty || 0), 0);
}

// Helper: Farmer ke liye entry date ke hisaab se 'days' (Age) nikalne ke liye
async function computeEntryDays(farmerId, entryDate) {
    const placementDoc = await ChicksPlacement.findOne({ farmer: farmerId }).sort({ date: 1 });
    if (placementDoc && placementDoc.date && entryDate) {
        const pDate = new Date(placementDoc.date);
        pDate.setHours(0, 0, 0, 0);
        const eDate = new Date(entryDate);
        eDate.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((eDate - pDate) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 0) return diffDays;
    }

    const existingCount = await DailyEntry.countDocuments({ farmer: farmerId });
    return Math.max(1, existingCount + 1);
}

// Helper: Farmer ki saari daily entries ko date-wise recalculate karne ke liye
async function recalculateFarmerDailyEntries(farmerId) {
    const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
    const farmerBranchId = farmer && farmer.branch
        ? (farmer.branch._id ? farmer.branch._id : farmer.branch)
        : undefined;
    const farmerSupervisorId = farmer && farmer.supervisor
        ? (farmer.supervisor._id ? farmer.supervisor._id : farmer.supervisor)
        : undefined;

    const totalPlacementChicks = await getFarmerPlacementQty(farmerId);
    const placementDoc = await ChicksPlacement.findOne({ farmer: farmerId }).sort({ date: 1 });
    const entries = await DailyEntry.find({ farmer: farmerId }).sort({ date: 1, createdAt: 1 });

    let prevLiveChicks = totalPlacementChicks;
    let cumulativeFeedConsumeKg = 0;
    let lastKnownAvgBwGram = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        let calculatedDays = entry.days || (i + 1);
        if (placementDoc && placementDoc.date && entry.date) {
            const pDate = new Date(placementDoc.date);
            pDate.setHours(0, 0, 0, 0);
            const eDate = new Date(entry.date);
            eDate.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((eDate - pDate) / (1000 * 60 * 60 * 24)) + 1;
            if (diffDays > 0) calculatedDays = diffDays;
        }

        const dayMort = Number(entry.dayMortality || 0);
        const dayFeedKg = Number(entry.dayFeedConsumeKg || 0);

        // Previous entry ka live bird count (Day 1 ke liye totalPlacementChicks)
        const liveBirdsForCalc = Number(prevLiveChicks || 0);

        // Aaj ki mortality ke baad current live chicks aur total mortality
        const currentLiveChicks = Math.max(0, liveBirdsForCalc - dayMort);
        const totalMortality = Math.max(0, totalPlacementChicks - currentLiveChicks);
        const mortalityPercentage = totalPlacementChicks > 0
            ? Number(((totalMortality / totalPlacementChicks) * 100).toFixed(2))
            : 0;

        // Cumulative feed consume (Day Feed Consume KG add karte hue)
        cumulativeFeedConsumeKg = Number((cumulativeFeedConsumeKg + dayFeedKg).toFixed(2));

        // Avg Body Weight (Gram): agar is entry me weight diya hai toh update, warna pichla weight carry forward
        const entryBw = Number(entry.avgBodyWeightGram || 0);
        if (entryBw > 0) {
            lastKnownAvgBwGram = entryBw;
        }
        const effectiveAvgBwGram = entryBw > 0 ? entryBw : lastKnownAvgBwGram;

        // Total Body Weight (KG) & FCR -> Previous entry ke live birds se
        const totalBodyWeightKg = Number(((liveBirdsForCalc * effectiveAvgBwGram) / 1000).toFixed(2));
        const fcr = totalBodyWeightKg > 0
            ? Number((cumulativeFeedConsumeKg / totalBodyWeightKg).toFixed(2))
            : 0;

        if (!entry.branch && farmerBranchId) {
            entry.branch = farmerBranchId;
        }
        if (!entry.supervisor && farmerSupervisorId) {
            entry.supervisor = farmerSupervisorId;
        }

        entry.days = calculatedDays;
        entry.totalPlacementChicks = totalPlacementChicks;
        entry.dayMortality = dayMort;
        entry.totalMortality = totalMortality;
        entry.mortalityPercentage = mortalityPercentage;
        entry.currentLiveChicks = currentLiveChicks;
        entry.dayFeedConsumeKg = dayFeedKg;
        entry.totalFeedConsumeKg = cumulativeFeedConsumeKg;
        entry.avgBodyWeightGram = effectiveAvgBwGram;
        entry.totalBodyWeightKg = totalBodyWeightKg;
        entry.fcr = fcr;

        await entry.save();

        // Agli entry ke liye aaj ka closing live bird hi previous live bird banega
        prevLiveChicks = currentLiveChicks;
    }
}

// =========================================================
// 1. CHICKS PLACEMENT ROUTES
// =========================================================
router.get('/chicks-placement', async (req, res) => {
    try {
        const list = await ChicksPlacement.find()
            .populate({
                path: 'farmer',
                populate: [{ path: 'branch' }, { path: 'supervisor' }]
            })
            .populate('branch')
            .sort({ date: -1, createdAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chicks-placement', async (req, res) => {
    try {
        const { placementId, date, farmerId, chicksQty } = req.body;
        const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
        if (!farmer) return res.status(404).json({ error: 'Farmer not found!' });

        const placement = new ChicksPlacement({
            placementId,
            date,
            farmer: farmer._id,
            branch: farmer.branch ? farmer.branch._id : undefined,
            supervisor: farmer.supervisor ? farmer.supervisor._id : undefined,
            chicksQty: Number(chicksQty)
        });

        await placement.save();
        await recalculateFarmerDailyEntries(farmer._id);

        res.json({ message: 'Chicks placement saved successfully!', placement });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/chicks-placement/:id', async (req, res) => {
    try {
        const { placementId, date, farmerId, chicksQty } = req.body;
        const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
        if (!farmer) return res.status(404).json({ error: 'Farmer not found!' });

        const updated = await ChicksPlacement.findByIdAndUpdate(
            req.params.id,
            {
                placementId,
                date,
                farmer: farmer._id,
                branch: farmer.branch ? farmer.branch._id : undefined,
                supervisor: farmer.supervisor ? farmer.supervisor._id : undefined,
                chicksQty: Number(chicksQty)
            },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: 'Placement not found!' });
        await recalculateFarmerDailyEntries(farmer._id);

        res.json({ message: 'Chicks placement updated successfully!', updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/chicks-placement/:id', async (req, res) => {
    try {
        const deleted = await ChicksPlacement.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Placement not found!' });
        if (deleted.farmer) await recalculateFarmerDailyEntries(deleted.farmer);

        res.json({ message: 'Chicks placement deleted successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================
// 2. FEED DISPATCH ROUTES
// =========================================================
router.get('/feed-dispatch', async (req, res) => {
    try {
        const list = await FeedDispatch.find()
            .populate({
                path: 'farmer',
                populate: [{ path: 'branch' }, { path: 'supervisor' }]
            })
            .populate('branch')
            .sort({ date: -1, createdAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/feed-dispatch', async (req, res) => {
    try {
        const { challanNo, date, farmerId, feedType, qtyKg } = req.body;
        const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
        if (!farmer) return res.status(404).json({ error: 'Farmer not found!' });

        const feed = new FeedDispatch({
            challanNo,
            date,
            farmer: farmer._id,
            branch: farmer.branch ? farmer.branch._id : undefined,
            supervisor: farmer.supervisor ? farmer.supervisor._id : undefined,
            feedType,
            qtyKg: Number(qtyKg),
            status: 'Pending'
        });

        await feed.save();
        res.json({ message: 'Feed dispatch saved successfully!', feed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/feed-dispatch/:id', async (req, res) => {
    try {
        const { challanNo, date, farmerId, feedType, qtyKg } = req.body;
        const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
        if (!farmer) return res.status(404).json({ error: 'Farmer not found!' });

        const updated = await FeedDispatch.findByIdAndUpdate(
            req.params.id,
            {
                challanNo,
                date,
                farmer: farmer._id,
                branch: farmer.branch ? farmer.branch._id : undefined,
                supervisor: farmer.supervisor ? farmer.supervisor._id : undefined,
                feedType,
                qtyKg: Number(qtyKg)
            },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: 'Feed dispatch not found!' });
        res.json({ message: 'Feed dispatch updated successfully!', updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/feed-dispatch/approve/:id', async (req, res) => {
    try {
        const updated = await FeedDispatch.findByIdAndUpdate(
            req.params.id,
            { status: 'Approved' },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Feed dispatch not found!' });
        res.json({ message: 'Feed dispatch approved successfully!', updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/feed-dispatch/:id', async (req, res) => {
    try {
        const deleted = await FeedDispatch.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Feed dispatch not found!' });
        res.json({ message: 'Feed dispatch deleted successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================
// 3. DAILY FARM LOG ROUTES
// =========================================================
router.get('/daily-entry', async (req, res) => {
    try {
        const entries = await DailyEntry.find()
            .populate({
                path: 'farmer',
                populate: [{ path: 'branch' }, { path: 'supervisor' }]
            })
            .sort({ date: -1, createdAt: -1 });

        const dispatches = await FeedDispatch.find();
        const feedInMap = {};
        for (let d of dispatches) {
            const fId = d.farmer ? String(d.farmer) : '';
            if (fId) feedInMap[fId] = (feedInMap[fId] || 0) + Number(d.qtyKg || 0);
        }

        const enriched = entries.map((e) => {
            const obj = e.toObject();
            const fId = obj.farmer && obj.farmer._id ? String(obj.farmer._id) : String(obj.farmer || '');
            const totalFeedInKg = Number((feedInMap[fId] || 0).toFixed(2));
            const totalFeedConsumeKg = Number(obj.totalFeedConsumeKg || 0);
            const closingFeedKg = Number((totalFeedInKg - totalFeedConsumeKg).toFixed(2));
            return {
                ...obj,
                totalFeedInKg,
                closingFeedKg
            };
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/daily-entry', async (req, res) => {
    try {
        const { farmerId, date, dayMortality, dayFeedConsumeKg, avgBodyWeightGram } = req.body;
        const farmer = await Farmer.findById(farmerId).populate('branch').populate('supervisor');
        if (!farmer) return res.status(404).json({ error: 'Farmer not found!' });

        const branchId = farmer.branch && farmer.branch._id ? farmer.branch._id : farmer.branch;
        if (!branchId) {
            return res.status(400).json({ error: 'Is Farmer ki Branch set nahi hai. Pehle Farmer Master me Branch assign karein!' });
        }

        const supervisorId = farmer.supervisor && farmer.supervisor._id ? farmer.supervisor._id : farmer.supervisor;
        const initialDays = await computeEntryDays(farmer._id, date);
        const totalPlacementChicks = await getFarmerPlacementQty(farmer._id);

        const newEntry = new DailyEntry({
            farmer: farmer._id,
            branch: branchId,
            supervisor: supervisorId,
            date,
            days: initialDays,
            totalPlacementChicks,
            dayMortality: Number(dayMortality || 0),
            dayFeedConsumeKg: Number(dayFeedConsumeKg || 0),
            avgBodyWeightGram: avgBodyWeightGram !== undefined && avgBodyWeightGram !== null && avgBodyWeightGram !== ''
                ? Number(avgBodyWeightGram)
                : 0
        });

        await newEntry.save();
        await recalculateFarmerDailyEntries(farmer._id);

        const savedEntry = await DailyEntry.findById(newEntry._id).populate('farmer');
        res.json({ message: 'Daily log saved & FCR calculated successfully!', entry: savedEntry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/daily-entry/:id', async (req, res) => {
    try {
        const { farmerId, date, dayMortality, dayFeedConsumeKg, avgBodyWeightGram } = req.body;
        const existing = await DailyEntry.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Daily entry not found!' });

        const oldFarmerId = existing.farmer;
        const targetFarmerId = farmerId || oldFarmerId;
        const farmer = await Farmer.findById(targetFarmerId).populate('branch').populate('supervisor');
        if (!farmer) return res.status(404).json({ error: 'Farmer not found!' });

        const branchId = farmer.branch && farmer.branch._id
            ? farmer.branch._id
            : (farmer.branch || existing.branch);
        if (!branchId) {
            return res.status(400).json({ error: 'Is Farmer ki Branch set nahi hai!' });
        }

        const supervisorId = farmer.supervisor && farmer.supervisor._id
            ? farmer.supervisor._id
            : (farmer.supervisor || existing.supervisor);

        existing.farmer = targetFarmerId;
        existing.branch = branchId;
        existing.supervisor = supervisorId;
        existing.date = date;
        existing.days = await computeEntryDays(targetFarmerId, date);
        existing.dayMortality = Number(dayMortality || 0);
        existing.dayFeedConsumeKg = Number(dayFeedConsumeKg || 0);
        existing.avgBodyWeightGram = avgBodyWeightGram !== undefined && avgBodyWeightGram !== null && avgBodyWeightGram !== ''
            ? Number(avgBodyWeightGram)
            : 0;

        await existing.save();

        await recalculateFarmerDailyEntries(targetFarmerId);
        if (String(oldFarmerId) !== String(targetFarmerId)) {
            await recalculateFarmerDailyEntries(oldFarmerId);
        }

        const updatedEntry = await DailyEntry.findById(existing._id).populate('farmer');
        res.json({ message: 'Daily entry updated successfully!', entry: updatedEntry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/daily-entry/:id', async (req, res) => {
    try {
        const deleted = await DailyEntry.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Daily entry not found!' });
        if (deleted.farmer) await recalculateFarmerDailyEntries(deleted.farmer);

        res.json({ message: 'Daily entry deleted successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
