const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const SaleEntry = require('../models/SaleEntry');
const Farmer = require('../models/Farmer');

function getSafeModel(modelName, fileCandidates = []) {
    if (mongoose.models[modelName]) {
        return mongoose.models[modelName];
    }
    for (const relPath of fileCandidates) {
        try {
            const loaded = require(relPath);
            if (loaded && loaded.modelName) return loaded;
        } catch (_) {}
    }
    return null;
}

const DailyEntry = getSafeModel('DailyEntry', [
    '../models/DailyEntry',
    '../models/Entry',
    '../models/DailyReport'
]);

const Batch = getSafeModel('Batch', [
    '../models/Batch',
    '../models/Placement'
]);

function toDayStart(d) {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return 0;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
}

function formatDateDMY(d) {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d || '');
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function toNum(...vals) {
    for (const v of vals) {
        if (v !== undefined && v !== null && v !== '') {
            const n = Number(v);
            if (!Number.isNaN(n)) return n;
        }
    }
    return 0;
}

async function buildFarmerReport(farmerId) {
    const farmer = await Farmer.findById(farmerId).populate('branch liftingSupervisor');
    if (!farmer) return null;

    let dailyEntries = [];
    if (DailyEntry) {
        dailyEntries = await DailyEntry.find({
            $or: [
                { farmer: farmer._id },
                { farmerId: farmer._id },
                { farmerName: farmer.farmerName }
            ]
        }).sort({ date: 1, createdAt: 1 });
    }

    const saleEntries = await SaleEntry.find({
        $or: [
            { farmer: farmer._id },
            { farmerName: farmer.farmerName }
        ]
    }).sort({ date: 1, createdAt: 1 });

    let activeBatch = null;
    if (Batch) {
        activeBatch = await Batch.findOne({
            $or: [{ farmer: farmer._id }, { farmerId: farmer._id }]
        }).sort({ createdAt: -1 });
    }

    const placement = toNum(
        activeBatch && activeBatch.chicksPlaced,
        activeBatch && activeBatch.openingChicks,
        activeBatch && activeBatch.totalChicks,
        activeBatch && activeBatch.birdsPlaced,
        farmer.chicksPlaced,
        farmer.openingChicks,
        farmer.placementChicks,
        farmer.totalChicks,
        farmer.birdsPlaced
    );

    const feedIn = toNum(
        activeBatch && activeBatch.feedIn,
        activeBatch && activeBatch.feedInKg,
        activeBatch && activeBatch.openingFeed,
        farmer.feedIn,
        farmer.feedInKg,
        farmer.totalFeedIn,
        800
    );

    let totalMort = 0;
    let totalFeed = 0;
    let totalLiftedPcsSoFar = 0;
    let totalLiftedWeightSoFar = 0;
    let latestLiftedAvgBwKg = 0;

    const ledger = [];
    const processedSaleIds = new Set();

    for (let i = 0; i < dailyEntries.length; i++) {
        const e = dailyEntries[i];
        const dayKey = toDayStart(e.date);

        const dayMort = toNum(e.mortality, e.dayMortality, e.mort, e.deaths);
        totalMort += dayMort;

        const dayFeed = toNum(
            e.feedConsumedKg,
            e.feedConsumed,
            e.dailyFeedKg,
            e.feedUsed,
            e.feedKg,
            e.feed
        );
        totalFeed += dayFeed;

        let dayLiftedPcs = 0;
        let dayLiftedWt = 0;

        for (const s of saleEntries) {
            if (processedSaleIds.has(String(s._id))) continue;
            const sKey = toDayStart(s.date);
            if (!dayKey || sKey <= dayKey) {
                const pcs = toNum(s.totalPcs, s.totalBirds, s.noOfBirds);
                const wt = toNum(s.totalWeightKg, s.totalWeight, s.weightKg);
                dayLiftedPcs += pcs;
                dayLiftedWt += wt;
                totalLiftedPcsSoFar += pcs;
                totalLiftedWeightSoFar += wt;
                if (pcs > 0 && wt > 0) {
                    latestLiftedAvgBwKg = wt / pcs;
                }
                processedSaleIds.add(String(s._id));
            }
        }

        const liveChicks = Math.max(0, placement - totalMort - totalLiftedPcsSoFar);

        let avgBwKg = toNum(e.avgBodyWeightKg, e.avgWeightKg, e.avgBwKg);
        if (!avgBwKg) {
            const rawGramsOrBw = toNum(e.avgBodyWeightGrams, e.avgWeightGrams, e.avgBw, e.avgWeight, e.bodyWeight);
            if (rawGramsOrBw > 0) {
                avgBwKg = rawGramsOrBw > 10 ? rawGramsOrBw / 1000 : rawGramsOrBw;
            }
        }
        if (dayLiftedPcs > 0 && dayLiftedWt > 0) {
            avgBwKg = dayLiftedWt / dayLiftedPcs;
        } else if (latestLiftedAvgBwKg > 0 && !avgBwKg) {
            avgBwKg = latestLiftedAvgBwKg;
        }

        let totalBwKg = toNum(e.totalWeightKg, e.totalBwKg, e.totalBw, e.totalWeight);
        if (totalLiftedWeightSoFar > 0) {
            totalBwKg = Number((totalLiftedWeightSoFar + (liveChicks * avgBwKg)).toFixed(2));
        } else if (!totalBwKg && liveChicks > 0 && avgBwKg > 0) {
            totalBwKg = Number((liveChicks * avgBwKg).toFixed(2));
        }

        const closingFeed = toNum(
            e.closingFeedKg,
            e.closingFeed,
            Math.max(0, feedIn - totalFeed)
        );

        const fcr = totalBwKg > 0 ? Number((totalFeed / totalBwKg).toFixed(2)) : 0;
        const avgBwGrams = Math.round(avgBwKg * 1000);
        const age = toNum(e.age, e.dayAge) || (i + 1);
        const dateStr = formatDateDMY(e.date);

        ledger.push({
            date: dateStr,
            age,
            dayMort,
            mortality: totalMort,
            totalMort,
            liftedPcs: dayLiftedPcs,
            liftedWeightKg: Number(dayLiftedWt.toFixed(2)),
            liveChicks,
            liveBirds: liveChicks,
            avgBwGrams,
            avgBw: `${avgBwGrams} g`,
            avgWeight: avgBwGrams,
            avgBwKg: Number(avgBwKg.toFixed(3)),
            totalBwKg: Number(totalBwKg.toFixed(2)),
            totalBw: Number(totalBwKg.toFixed(2)),
            totalWeight: Number(totalBwKg.toFixed(2)),
            totalFeedKg: Number(totalFeed.toFixed(2)),
            totalFeed: Number(totalFeed.toFixed(2)),
            feedConsumed: Number(totalFeed.toFixed(2)),
            closingFeedKg: Number(closingFeed.toFixed(2)),
            closingFeed: Number(closingFeed.toFixed(2)),
            fcr
        });
    }

    for (const s of saleEntries) {
        if (!processedSaleIds.has(String(s._id))) {
            const pcs = toNum(s.totalPcs, s.totalBirds, s.noOfBirds);
            const wt = toNum(s.totalWeightKg, s.totalWeight, s.weightKg);
            totalLiftedPcsSoFar += pcs;
            totalLiftedWeightSoFar += wt;
            if (pcs > 0 && wt > 0) {
                latestLiftedAvgBwKg = wt / pcs;
            }
            processedSaleIds.add(String(s._id));

            const liveChicks = Math.max(0, placement - totalMort - totalLiftedPcsSoFar);
            const avgBwKg = latestLiftedAvgBwKg || 0;
            const totalBwKg = Number((totalLiftedWeightSoFar + (liveChicks * avgBwKg)).toFixed(2));
            const fcr = totalBwKg > 0 ? Number((totalFeed / totalBwKg).toFixed(2)) : 0;
            const avgBwGrams = Math.round(avgBwKg * 1000);
            const lastRow = ledger[ledger.length - 1];

            ledger.push({
                date: formatDateDMY(s.date),
                age: lastRow ? lastRow.age : toNum(s.age, 0),
                dayMort: 0,
                mortality: totalMort,
                totalMort,
                liftedPcs: pcs,
                liftedWeightKg: Number(wt.toFixed(2)),
                liveChicks,
                liveBirds: liveChicks,
                avgBwGrams,
                avgBw: `${avgBwGrams} g`,
                avgWeight: avgBwGrams,
                avgBwKg: Number(avgBwKg.toFixed(3)),
                totalBwKg,
                totalBw: totalBwKg,
                totalWeight: totalBwKg,
                totalFeedKg: Number(totalFeed.toFixed(2)),
                totalFeed: Number(totalFeed.toFixed(2)),
                feedConsumed: Number(totalFeed.toFixed(2)),
                closingFeedKg: lastRow ? lastRow.closingFeedKg : Number(Math.max(0, feedIn - totalFeed).toFixed(2)),
                closingFeed: lastRow ? lastRow.closingFeed : Number(Math.max(0, feedIn - totalFeed).toFixed(2)),
                fcr
            });
        }
    }

    const latest = ledger[ledger.length - 1] || {
        age: 0,
        mortality: 0,
        totalMort: 0,
        liftedPcs: totalLiftedPcsSoFar,
        liftedWeightKg: Number(totalLiftedWeightSoFar.toFixed(2)),
        liveChicks: Math.max(0, placement - totalLiftedPcsSoFar),
        liveBirds: Math.max(0, placement - totalLiftedPcsSoFar),
        avgBwGrams: Math.round(latestLiftedAvgBwKg * 1000),
        avgBw: `${Math.round(latestLiftedAvgBwKg * 1000)} g`,
        avgWeight: Math.round(latestLiftedAvgBwKg * 1000),
        avgBwKg: Number(latestLiftedAvgBwKg.toFixed(3)),
        totalBwKg: Number(totalLiftedWeightSoFar.toFixed(2)),
        totalBw: Number(totalLiftedWeightSoFar.toFixed(2)),
        totalWeight: Number(totalLiftedWeightSoFar.toFixed(2)),
        totalFeedKg: Number(totalFeed.toFixed(2)),
        totalFeed: Number(totalFeed.toFixed(2)),
        feedConsumed: Number(totalFeed.toFixed(2)),
        closingFeedKg: Number(Math.max(0, feedIn - totalFeed).toFixed(2)),
        closingFeed: Number(Math.max(0, feedIn - totalFeed).toFixed(2)),
        fcr: totalLiftedWeightSoFar > 0 ? Number((totalFeed / totalLiftedWeightSoFar).toFixed(2)) : 0
    };

    const branchName = farmer.branch && farmer.branch.branchName
        ? farmer.branch.branchName
        : (farmer.branchName || '');

    const supervisorName = farmer.liftingSupervisor && farmer.liftingSupervisor.fullName
        ? farmer.liftingSupervisor.fullName
        : (farmer.supervisorName || '');

    return {
        farmer: {
            _id: farmer._id,
            farmerName: farmer.farmerName,
            farmerCode: farmer.farmerCode || '',
            branch: branchName,
            branchName,
            supervisor: supervisorName,
            supervisorName,
            mobile: farmer.mobile || farmer.phone || ''
        },
        summary: {
            placement,
            chicksPlaced: placement,
            birdsPlaced: placement,
            mortality: latest.totalMort,
            totalMort: latest.totalMort,
            liftedPcs: totalLiftedPcsSoFar,
            liftedWeightKg: Number(totalLiftedWeightSoFar.toFixed(2)),
            liveChicks: latest.liveChicks,
            liveBirds: latest.liveChicks,
            avgBwGrams: latest.avgBwGrams,
            avgBw: latest.avgBw,
            avgWeight: latest.avgWeight,
            avgBwKg: latest.avgBwKg,
            totalBwKg: latest.totalBwKg,
            totalBw: latest.totalBw,
            totalWeight: latest.totalWeight,
            feedIn,
            feedInKg: feedIn,
            totalFeedKg: latest.totalFeedKg,
            totalFeed: latest.totalFeed,
            feedConsumed: latest.feedConsumed,
            closingFeedKg: latest.closingFeedKg,
            closingFeed: latest.closingFeed,
            fcr: latest.fcr
        },
        ledger
    };
}

async function handleSummaryList(req, res) {
    try {
        const farmers = await Farmer.find().sort({ farmerName: 1 });
        const rows = [];
        for (const f of farmers) {
            const data = await buildFarmerReport(f._id);
            if (data) {
                rows.push({
                    _id: data.farmer._id,
                    farmerId: data.farmer._id,
                    farmerName: data.farmer.farmerName,
                    farmerCode: data.farmer.farmerCode,
                    branch: data.farmer.branchName,
                    branchName: data.farmer.branchName,
                    supervisor: data.farmer.supervisorName,
                    supervisorName: data.farmer.supervisorName,
                    age: data.ledger.length ? data.ledger[data.ledger.length - 1].age : 0,
                    ...data.summary
                });
            }
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

router.get('/', handleSummaryList);
router.get('/farmer-performance', handleSummaryList);
router.get('/farmer-wise', handleSummaryList);
router.get('/farmers', handleSummaryList);
router.get('/summary', handleSummaryList);

async function handleLedgerDetail(req, res) {
    try {
        const id = req.params.farmerId || req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid farmer ID' });
        }
        const data = await buildFarmerReport(id);
        if (!data) return res.status(404).json({ error: 'Farmer not found' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

router.get('/farmer-ledger/:farmerId', handleLedgerDetail);
router.get('/ledger/:farmerId', handleLedgerDetail);
router.get('/farmer/:farmerId', handleLedgerDetail);

module.exports = router;
