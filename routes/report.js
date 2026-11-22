const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let Farmer, Branch, User, ChicksPlacement, FeedDispatch, FeedTransfer, DailyEntry, SaleEntry;

try { Farmer = require('../models/Farmer'); } catch (_) {}
try { Branch = require('../models/Branch'); } catch (_) {}
try { User = require('../models/User'); } catch (_) {}
try { ChicksPlacement = require('../models/ChicksPlacement'); } catch (_) {}
try { FeedDispatch = require('../models/FeedDispatch'); } catch (_) {}
try { FeedTransfer = require('../models/FeedTransfer'); } catch (_) {}
try { DailyEntry = require('../models/DailyEntry'); } catch (_) {}
try { SaleEntry = require('../models/SaleEntry'); } catch (_) {}

function safeModel(model) {
    if (model) return model;
    for (const name of Object.keys(mongoose.models)) {
        if (mongoose.models[name]) return mongoose.models[name];
    }
    return null;
}

async function buildFarmerMetrics() {
    const FarmerModel = Farmer || safeModel('Farmer');
    if (!FarmerModel) return [];

    const PlacementModel = ChicksPlacement || safeModel('ChicksPlacement');
    const FeedModel = FeedDispatch || safeModel('FeedDispatch');
    const TransferModel = FeedTransfer || safeModel('FeedTransfer');
    const DailyModel = DailyEntry || safeModel('DailyEntry');
    const SaleModel = SaleEntry || safeModel('SaleEntry');

    const [farmers, placements, feeds, transfers, dailies, sales] = await Promise.all([
        FarmerModel.find().populate('branch').populate('supervisor').lean().catch(() => []),
        PlacementModel ? PlacementModel.find().lean().catch(() => []) : [],
        FeedModel ? FeedModel.find().lean().catch(() => []) : [],
        TransferModel ? TransferModel.find().lean().catch(() => []) : [],
        DailyModel ? DailyModel.find().sort({ date: -1, createdAt: -1 }).lean().catch(() => []) : [],
        SaleModel ? SaleModel.find().lean().catch(() => []) : []
    ]);

    return farmers.map((f) => {
        const fIdStr = String(f._id);

        const placedChicks = placements
            .filter(p => String(p.farmer?._id || p.farmer) === fIdStr)
            .reduce((s, p) => s + Number(p.chicksQty || 0), 0);

        const feedDispatched = feeds
            .filter(fd => String(fd.farmer?._id || fd.farmer) === fIdStr)
            .reduce((s, fd) => s + Number(fd.qtyKg || 0), 0);

        const feedTransferIn = transfers
            .filter(tr => String(tr.toFarmer?._id || tr.toFarmer) === fIdStr)
            .reduce((s, tr) => s + Number(tr.qtyKg || 0), 0);

        const feedTransferOut = transfers
            .filter(tr => String(tr.fromFarmer?._id || tr.fromFarmer) === fIdStr)
            .reduce((s, tr) => s + Number(tr.qtyKg || 0), 0);

        const totalFeedInKg = Number((feedDispatched + feedTransferIn - feedTransferOut).toFixed(2));

        const farmerDailies = dailies.filter(d => String(d.farmer?._id || d.farmer) === fIdStr);
        const latestDaily = farmerDailies[0] || null;

        const totalMortality = farmerDailies.length
            ? farmerDailies.reduce((s, d) => s + Number(d.dayMortality || 0), 0)
            : Number(latestDaily?.totalMortality || 0);

        const liftedBirds = sales
            .filter(sl => String(sl.farmer?._id || sl.farmer) === fIdStr)
            .reduce((s, sl) => s + Number(sl.totalPcs || 0), 0);

        const totalPlacementChicks = placedChicks || Number(latestDaily?.totalPlacementChicks || 0);
        const liveChicks = Math.max(0, totalPlacementChicks - totalMortality - liftedBirds);

        const totalFeedConsumed = farmerDailies.length
            ? farmerDailies.reduce((s, d) => s + Number(d.dayFeedConsumeKg || 0), 0)
            : Number(latestDaily?.totalFeedConsumeKg || 0);

        const closingFeedKg = Number((totalFeedInKg - totalFeedConsumed).toFixed(2));
        const avgBodyWeightGram = Number(latestDaily?.avgBodyWeightGram || 0);
        const totalBodyWeightKg = Number(((liveChicks * avgBodyWeightGram) / 1000).toFixed(2));
        const fcr = totalBodyWeightKg > 0 ? Number((totalFeedConsumed / totalBodyWeightKg).toFixed(2)) : 0;

        const branchObj = f.branch && typeof f.branch === 'object' ? f.branch : null;
        const supObj = f.supervisor && typeof f.supervisor === 'object' ? f.supervisor : null;

        return {
            farmerId: f._id,
            farmerCode: f.farmerId || '',
            farmerName: f.farmerName || f.name || 'Farmer',
            branchId: branchObj?._id ? String(branchObj._id) : String(f.branch || ''),
            branchName: branchObj?.branchName || 'N/A',
            supervisorId: supObj?._id ? String(supObj._id) : String(f.supervisor || ''),
            supervisorName: supObj?.fullName || supObj?.name || 'N/A',
            liveChicks,
            avgBodyWeightGram,
            closingFeedKg,
            fcr
        };
    });
}

// Branch-wise report
router.get('/branch', async (req, res) => {
    try {
        const { branchId } = req.query;
        const BranchModel = Branch || safeModel('Branch');
        const [branches, metrics] = await Promise.all([
            BranchModel ? BranchModel.find().lean().catch(() => []) : [],
            buildFarmerMetrics()
        ]);

        const map = new Map();
        for (const b of branches) {
            map.set(String(b._id), {
                branchId: String(b._id),
                branchName: b.branchName || 'Branch',
                farmerCount: 0,
                liveChicks: 0,
                closingFeedKg: 0
            });
        }

        for (const m of metrics) {
            const key = m.branchId || 'unassigned';
            if (!map.has(key)) {
                map.set(key, {
                    branchId: key,
                    branchName: m.branchName || 'N/A',
                    farmerCount: 0,
                    liveChicks: 0,
                    closingFeedKg: 0
                });
            }
            const row = map.get(key);
            row.farmerCount += 1;
            row.liveChicks += Number(m.liveChicks || 0);
            row.closingFeedKg = Number((row.closingFeedKg + Number(m.closingFeedKg || 0)).toFixed(2));
        }

        let list = Array.from(map.values());
        if (branchId) {
            list = list.filter(r => String(r.branchId) === String(branchId));
        }

        res.json({ report: list });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Supervisor-wise report
router.get('/supervisor', async (req, res) => {
    try {
        const { supervisorId } = req.query;
        const UserModel = User || safeModel('User');
        const [users, metrics] = await Promise.all([
            UserModel ? UserModel.find({ role: /supervisor/i }).populate('branch').lean().catch(() => []) : [],
            buildFarmerMetrics()
        ]);

        const map = new Map();
        for (const u of users) {
            map.set(String(u._id), {
                supervisorId: String(u._id),
                supervisorName: u.fullName || u.userId || 'Supervisor',
                branchName: u.branch?.branchName || 'N/A',
                farmerCount: 0,
                liveChicks: 0
            });
        }

        for (const m of metrics) {
            if (!m.supervisorId || m.supervisorId === 'undefined') continue;
            if (!map.has(m.supervisorId)) {
                map.set(m.supervisorId, {
                    supervisorId: m.supervisorId,
                    supervisorName: m.supervisorName || 'Supervisor',
                    branchName: m.branchName || 'N/A',
                    farmerCount: 0,
                    liveChicks: 0
                });
            }
            const row = map.get(m.supervisorId);
            row.farmerCount += 1;
            row.liveChicks += Number(m.liveChicks || 0);
        }

        let list = Array.from(map.values());
        if (supervisorId) {
            list = list.filter(r => String(r.supervisorId) === String(supervisorId));
        }

        res.json({ report: list });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Farmer-wise report
router.get('/farmer', async (req, res) => {
    try {
        const list = await buildFarmerMetrics();
        res.json({ report: list });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
