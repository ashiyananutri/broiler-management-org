const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const SaleEntry = require('../models/SaleEntry');
const Farmer = require('../models/Farmer');

let DailyEntry = null;
let Placement = null;
try { DailyEntry = require('../models/DailyEntry'); } catch (_) {}
try { Placement = require('../models/Placement'); } catch (_) {}

function toDayStart(d) {
    const dt = new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function formatDateDMY(d) {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d || '');
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

async function buildFarmerLedgerAndSummary(farmerId) {
    const farmer = await Farmer.findById(farmerId).populate('branch liftingSupervisor');
    if (!farmer) return null;

    // 1. Daily entries fetch karna
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

    // 2. Sale / Lifting entries fetch karna
    const saleEntries = await SaleEntry.find({
        $or: [
            { farmer: farmer._id },
            { farmerName: farmer.farmerName }
        ]
    }).sort({ date: 1, createdAt: 1 });

    // Opening / Placement chicks
    let openingChicks = Number(
        farmer.chicksPlaced ?? farmer.openingChicks ?? farmer.placementChicks ?? farmer.totalChicks ?? 0
    );
    if (openingChicks === 0 && Placement) {
        const p = await Placement.findOne({
            $or: [{ farmer: farmer._id }, { farmerId: farmer._id }]
        }).sort({ createdAt: -1 });
        if (p) {
            openingChicks = Number(p.chicksCount ?? p.totalChicks ?? p.chicksPlaced ?? 0);
        }
    }

    let totalMort = 0;
    let totalFeed = 0;
    let totalLiftedPcsSoFar = 0;
    let totalLiftedWeightSoFar = 0;
    let latestLiftedAvgBwKg = 0;

    // Sale entries ko date ke hisab se map karna
    const salesByDay = new Map();
    for (const s of saleEntries) {
        const key = toDayStart(s.date).getTime();
        if (!salesByDay.has(key)) salesByDay.set(key, []);
        salesByDay.get(key).push(s);
    }

    const ledger = [];
    const processedSaleIds = new Set();

    // Daily entries ke saath sale lifting merge karna
    for (let i = 0; i < dailyEntries.length; i++) {
        const e = dailyEntries[i];
        const dayKey = toDayStart(e.date).getTime();

        const dayMort = Number(e.mortality ?? e.dayMortality ?? e.mort ?? 0);
        totalMort += dayMort;

        const feedConsumed = Number(
            e.feedConsumedKg ?? e.feedConsumed ?? e.dailyFeedKg ?? e.feedUsed ?? 0
        );
        totalFeed += feedConsumed;

        // Is din ya isse pehle ke unapplied sales ko apply karna
        let dayLiftedPcs = 0;
        let dayLiftedWt = 0;

        for (const s of saleEntries) {
            if (processedSaleIds.has(String(s._id))) continue;
            const sKey = toDayStart(s.date).getTime();
            if (sKey <= dayKey) {
                const pcs = Number(s.totalPcs || 0);
                const wt = Number(s.totalWeightKg || 0);
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

        const liveChicks = Math.max(0, openingChicks - totalMort - totalLiftedPcsSoFar);

        // Avg BW (kg): agar lifting hui hai toh lifted avg BW ya entry avg BW; grams mein display ke liye * 1000
        let avgBwKg = Number(e.avgBodyWeightKg ?? e.avgWeightKg ?? 0);
        if (!avgBwKg && Number(e.avgBodyWeightGrams ?? e.avgWeightGrams ?? 0) > 0) {
            avgBwKg = Number(e.avgBodyWeightGrams || e.avgWeightGrams) / 1000;
        }
        if (dayLiftedPcs > 0 && dayLiftedWt > 0) {
            avgBwKg = dayLiftedWt / dayLiftedPcs;
        } else if (latestLiftedAvgBwKg > 0 && !avgBwKg) {
            avgBwKg = latestLiftedAvgBwKg;
        }

        // Total BW (kg): lifting ke saath lifted weight aur bache live chicks ka weight reflect karega
        let totalBwKg = Number(e.totalWeightKg ?? e.totalBwKg ?? 0);
        if (totalLiftedWeightSoFar > 0) {
            const remainingLiveWtKg = liveChicks * avgBwKg;
            totalBwKg = Number((totalLiftedWeightSoFar + remainingLiveWtKg).toFixed(2));
        } else if (!totalBwKg && liveChicks > 0 && avgBwKg > 0) {
            totalBwKg = Number((liveChicks * avgBwKg).toFixed(2));
        }

        const closingFeed = Number(
            e.closingFeedKg ?? e.closingFeed ?? Math.max(0, Number(e.feedInKg || e.openingFeedKg || 800) - totalFeed)
        );

        const fcr = totalBwKg > 0
            ? Number((totalFeed / totalBwKg).toFixed(2))
            : 0;

        ledger.push({
            date: formatDateDMY(e.date),
            age: e.age ?? (i + 1),
            dayMort,
            totalMort,
            liftedPcs: dayLiftedPcs,
            liftedWeightKg: Number(dayLiftedWt.toFixed(2)),
            liveChicks,
            avgBwGrams: Math.round(avgBwKg * 1000),
            avgBwKg: Number(avgBwKg.toFixed(3)),
            totalBwKg: Number(totalBwKg.toFixed(2)),
            totalFeedKg: Number(totalFeed.toFixed(2)),
            closingFeedKg: Number(closingFeed.toFixed(2)),
            fcr
        });
    }

    // Agar sale entry aisi date ki hai jiske aage koi daily entry nahi hai, toh use bhi end mein apply karein
    for (const s of saleEntries) {
        if (!processedSaleIds.has(String(s._id))) {
            const pcs = Number(s.totalPcs || 0);
            const wt = Number(s.totalWeightKg || 0);
            totalLiftedPcsSoFar += pcs;
            totalLiftedWeightSoFar += wt;
            if (pcs > 0 && wt > 0) {
                latestLiftedAvgBwKg = wt / pcs;
            }
            processedSaleIds.add(String(s._id));

            const liveChicks = Math.max(0, openingChicks - totalMort - totalLiftedPcsSoFar);
            const avgBwKg = latestLiftedAvgBwKg || 0;
            const totalBwKg = Number((totalLiftedWeightSoFar + (liveChicks * avgBwKg)).toFixed(2));
            const fcr = totalBwKg > 0 ? Number((totalFeed / totalBwKg).toFixed(2)) : 0;

            const lastRow = ledger[ledger.length - 1];
            ledger.push({
                date: formatDateDMY(s.date),
                age: lastRow ? lastRow.age : '',
                dayMort: 0,
                totalMort,
                liftedPcs: pcs,
                liftedWeightKg: Number(wt.toFixed(2)),
                liveChicks,
                avgBwGrams: Math.round(avgBwKg * 1000),
                avgBwKg: Number(avgBwKg.toFixed(3)),
                totalBwKg,
                totalFeedKg: Number(totalFeed.toFixed(2)),
                closingFeedKg: lastRow ? lastRow.closingFeedKg : 0,
                fcr
            });
        }
    }

    const latest = ledger[ledger.length - 1] || {
        age: 0,
        totalMort: 0,
        liftedPcs: totalLiftedPcsSoFar,
        liftedWeightKg: Number(totalLiftedWeightSoFar.toFixed(2)),
        liveChicks: Math.max(0, openingChicks - totalLiftedPcsSoFar),
        avgBwGrams: Math.round(latestLiftedAvgBwKg * 1000),
        avgBwKg: Number(latestLiftedAvgBwKg.toFixed(3)),
        totalBwKg: Number(totalLiftedWeightSoFar.toFixed(2)),
        totalFeedKg: Number(totalFeed.toFixed(2)),
        closingFeedKg: 0,
        fcr: totalLiftedWeightSoFar > 0 ? Number((totalFeed / totalLiftedWeightSoFar).toFixed(2)) : 0
    };

    return {
        farmer: {
            _id: farmer._id,
            farmerName: farmer.farmerName,
            farmerCode: farmer.farmerCode || '',
            branchName: farmer.branch && farmer.branch.branchName ? farmer.branch.branchName : '',
            supervisorName: farmer.liftingSupervisor && farmer.liftingSupervisor.fullName
                ? farmer.liftingSupervisor.fullName
                : (farmer.supervisorName || ''),
            mobile: farmer.mobile || farmer.phone || ''
        },
        summary: {
            placement: openingChicks,
            mortality: latest.totalMort,
            liftedPcs: totalLiftedPcsSoFar,
            liftedWeightKg: Number(totalLiftedWeightSoFar.toFixed(2)),
            liveChicks: latest.liveChicks,
            avgBwGrams: latest.avgBwGrams,
            avgBwKg: latest.avgBwKg,
            totalBwKg: latest.totalBwKg,
            totalFeedKg: latest.totalFeedKg,
            closingFeedKg: latest.closingFeedKg,
            fcr: latest.fcr
        },
        ledger
    };
}

// GET Farmer-wise Performance Summary
router.get('/farmer-performance', async (req, res) => {
    try {
        const farmers = await Farmer.find().sort({ farmerName: 1 });
        const rows = [];
        for (const f of farmers) {
            const data = await buildFarmerLedgerAndSummary(f._id);
            if (data) {
                rows.push({
                    farmerId: data.farmer._id,
                    farmerName: data.farmer.farmerName,
                    farmerCode: data.farmer.farmerCode,
                    branchName: data.farmer.branchName,
                    supervisorName: data.farmer.supervisorName,
                    ...data.summary
                });
            }
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Single Farmer Ledger History
router.get('/farmer-ledger/:farmerId', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.farmerId)) {
            return res.status(400).json({ error: 'Invalid farmer ID' });
        }
        const data = await buildFarmerLedgerAndSummary(req.params.farmerId);
        if (!data) return res.status(404).json({ error: 'Farmer not found' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
