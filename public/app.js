// =======================================================
// Broiler Management System - public/app.js
// =======================================================

async function apiReq(url, options = {}) {
    const res = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `Request failed (${res.status})`);
    }
    return data;
}

function pickArray(payload, keys = ['data', 'items', 'list', 'rows']) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
        for (const k of keys) {
            if (Array.isArray(payload[k])) return payload[k];
        }
    }
    return [];
}

function toDateInput(val) {
    if (!val) return new Date().toISOString().split('T')[0];
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toISOString().split('T')[0];
}

function fmtDate(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-IN');
}

// =======================================================
// MASTER DROPDOWNS
// =======================================================
async function loadMasterDropdowns() {
    const sources = [
        { url: '/api/master/branches', type: 'branch', keys: ['branches', 'data'] },
        { url: '/api/master/farmers', type: 'farmer', keys: ['farmers', 'data'] },
        { url: '/api/master/supervisors', type: 'supervisor', keys: ['supervisors', 'users', 'data'] },
        { url: '/api/master/users', type: 'supervisor', keys: ['users', 'supervisors', 'data'] },
        { url: '/api/master/traders', type: 'trader', keys: ['traders', 'data'] }
    ];

    const state = { branch: [], farmer: [], supervisor: [], trader: [] };

    for (const s of sources) {
        try {
            const raw = await apiReq(s.url);
            const arr = pickArray(raw, s.keys);
            if (arr.length > 0 && state[s.type].length === 0) {
                state[s.type] = arr;
            }
        } catch (_) {
            // Optional route absent; safe fallback
        }
    }

    const branchFilter = document.getElementById('reportBranchFilter');
    if (branchFilter && state.branch.length > 0) {
        const prev = branchFilter.value;
        branchFilter.innerHTML = '<option value="">All Branches</option>' +
            state.branch.map(b => `<option value="${b._id}">${b.branchName || b.name || 'Branch'}</option>`).join('');
        if (prev) branchFilter.value = prev;
    }

    const farmerOptions = '<option value="">-- Select Farmer --</option>' +
        state.farmer.map(f => {
            const label = `${f.farmerName || f.name || 'Farmer'}${f.farmerId ? ` (${f.farmerId})` : ''}`;
            return `<option value="${f._id}">${label}</option>`;
        }).join('');

    ['saleFarmer', 'fdFarmer', 'deFarmer'].forEach(id => {
        const el = document.getElementById(id);
        if (el && state.farmer.length > 0) {
            const prev = el.value;
            el.innerHTML = farmerOptions;
            if (prev) el.value = prev;
        }
    });

    ['ftFromFarmer', 'ftToFarmer'].forEach(id => {
        const el = document.getElementById(id);
        if (el && state.farmer.length > 0) {
            const prev = el.value;
            el.innerHTML = farmerOptions;
            if (prev) el.value = prev;
        }
    });

    const supEl = document.getElementById('saleSupervisor');
    if (supEl && state.supervisor.length > 0) {
        const prev = supEl.value;
        supEl.innerHTML = '<option value="">-- Select Supervisor --</option>' +
            state.supervisor.map(u => `<option value="${u._id}">${u.fullName || u.name || u.username || 'Supervisor'}</option>`).join('');
        if (prev) supEl.value = prev;
    }

    const traderEl = document.getElementById('saleTrader');
    if (traderEl && state.trader.length > 0) {
        const prev = traderEl.value;
        traderEl.innerHTML = '<option value="">-- Select Trader --</option>' +
            state.trader.map(t => `<option value="${t._id}">${t.traderName || t.partyName || t.name || 'Trader'}</option>`).join('');
        if (prev) traderEl.value = prev;
    }

    const dashFarmers = document.getElementById('dashFarmersCount');
    if (dashFarmers) dashFarmers.textContent = state.farmer.length;
}

// =======================================================
// FEED TRANSFER (FARMER TO FARMER)
// =======================================================
async function populateFeedTransferFarmers() {
    await loadMasterDropdowns();
}

async function loadFeedTransfers() {
    const tbody = document.getElementById('feedTransferTableBody');
    if (!tbody) return;

    try {
        const raw = await apiReq('/api/feed-transfer');
        const list = pickArray(raw, ['transfers', 'data']);

        const dashTransfers = document.getElementById('dashTransferCount');
        if (dashTransfers) dashTransfers.textContent = list.length;

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Koi feed transfer record nahi hai.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(item => {
            const fromName = item.fromFarmerName || (item.fromFarmer && item.fromFarmer.farmerName) || '-';
            const toName = item.toFarmerName || (item.toFarmer && item.toFarmer.farmerName) || '-';
            return `
                <tr>
                    <td>${fmtDate(item.date)}</td>
                    <td>${item.transferNo || '-'}</td>
                    <td>${fromName}</td>
                    <td>${toName}</td>
                    <td>${item.feedType || 'Broiler Feed'}</td>
                    <td>${Number(item.qtyKg || 0).toFixed(2)}</td>
                    <td>${item.remarks || '-'}</td>
                    <td>
                        <button type="button" class="btn btn-danger" style="padding:4px 8px;font-size:0.78rem;" onclick="deleteFeedTransfer('${item._id}')">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#c0392b;">${err.message}</td></tr>`;
    }
}

async function deleteFeedTransfer(id) {
    if (!confirm('Kya aap is feed transfer ko delete karna chahte hain?')) return;
    try {
        const res = await apiReq(`/api/feed-transfer/${id}`, { method: 'DELETE' });
        alert(res.message || 'Feed transfer deleted!');
        await loadFeedTransfers();
        if (document.getElementById('reportsPage')?.classList.contains('active')) {
            await loadFarmerReport();
        }
    } catch (err) {
        alert(err.message || 'Delete karne mein error aaya!');
    }
}

function initFeedTransfer() {
    const form = document.getElementById('feedTransferForm');
    const dateInput = document.getElementById('ftDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    loadMasterDropdowns();
    loadFeedTransfers();

    if (form && !form.dataset.bound) {
        form.dataset.bound = 'true';
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fromFarmerId = document.getElementById('ftFromFarmer')?.value;
            const toFarmerId = document.getElementById('ftToFarmer')?.value;
            const qtyKg = Number(document.getElementById('ftQtyKg')?.value || 0);

            if (!fromFarmerId || !toFarmerId) {
                alert('From Farmer aur To Farmer dono select karein!');
                return;
            }
            if (fromFarmerId === toFarmerId) {
                alert('From Farmer aur To Farmer alag-alag hone chahiye!');
                return;
            }
            if (!qtyKg || qtyKg <= 0) {
                alert('Sahi Quantity (KG) daalein!');
                return;
            }

            const payload = {
                date: document.getElementById('ftDate')?.value,
                fromFarmerId,
                toFarmerId,
                feedType: document.getElementById('ftFeedType')?.value || 'Broiler Feed',
                qtyKg,
                remarks: document.getElementById('ftRemarks')?.value || ''
            };

            try {
                const res = await apiReq('/api/feed-transfer', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                alert(res.message || 'Feed transferred successfully!');
                form.reset();
                if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
                await loadFeedTransfers();
                if (document.getElementById('reportsPage')?.classList.contains('active')) {
                    await loadFarmerReport();
                }
            } catch (err) {
                alert(err.message || 'Feed transfer fail ho gaya!');
            }
        });
    }
}

// =======================================================
// SALE / BIRD LIFTING ENTRY (48 ROWS + SLIP)
// =======================================================
function read48Rows() {
    const rows = [];
    for (let sl = 1; sl <= 48; sl++) {
        const pcs = Number(document.querySelector(`.lift-pcs[data-sl="${sl}"]`)?.value || 0);
        const wt = Number(document.querySelector(`.lift-wt[data-sl="${sl}"]`)?.value || 0);
        rows.push({ slNo: sl, noOfBirds: pcs, weightKg: wt });
    }
    return rows;
}

function write48Rows(rows = []) {
    for (let sl = 1; sl <= 48; sl++) {
        const pcsEl = document.querySelector(`.lift-pcs[data-sl="${sl}"]`);
        const wtEl = document.querySelector(`.lift-wt[data-sl="${sl}"]`);
        const match = Array.isArray(rows)
            ? (rows.find(r => Number(r.slNo) === sl) || rows[sl - 1])
            : null;

        if (pcsEl) {
            const p = match ? Number(match.noOfBirds || 0) : 0;
            pcsEl.value = p > 0 ? p : '';
        }
        if (wtEl) {
            const w = match ? Number(match.weightKg || 0) : 0;
            wtEl.value = w > 0 ? w : '';
        }
    }
    if (typeof recalcLiftingTotals === 'function') recalcLiftingTotals();
}

function clearSaleForm() {
    document.getElementById('saleEntryForm')?.reset();
    const editId = document.getElementById('saleEditId');
    if (editId) editId.value = '';
    const d = document.getElementById('saleDate');
    if (d) d.value = new Date().toISOString().split('T')[0];
    write48Rows([]);
}

async function handleSaleSubmit(e) {
    e.preventDefault();

    const farmerId = document.getElementById('saleFarmer')?.value;
    const date = document.getElementById('saleDate')?.value;
    if (!farmerId || !date) {
        alert('Farmer aur Date select karna zaroori hai!');
        return;
    }

    const editId = document.getElementById('saleEditId')?.value?.trim();
    const traderSel = document.getElementById('saleTrader');
    const partyName = traderSel && traderSel.selectedIndex > 0 ? traderSel.options[traderSel.selectedIndex].text : '';

    const payload = {
        slNo: document.getElementById('saleSlNo')?.value?.trim() || '',
        date,
        liftingSupervisorId: document.getElementById('saleSupervisor')?.value || undefined,
        traderId: document.getElementById('saleTrader')?.value || undefined,
        partyName,
        farmerId,
        rate: Number(document.getElementById('saleRate')?.value || 0),
        age: Number(document.getElementById('saleAge')?.value || 0),
        lsName: document.getElementById('saleLsName')?.value?.trim() || '',
        wtStartingTime: document.getElementById('saleWtStart')?.value || '',
        wtClosingTime: document.getElementById('saleWtClose')?.value || '',
        driverName: document.getElementById('saleDriver')?.value?.trim() || '',
        vehicleNo: document.getElementById('saleVehicle')?.value?.trim() || '',
        rows: read48Rows(),
        feedClosingStock: document.getElementById('saleFeedClosing')?.value?.trim() || '',
        birdStock: document.getElementById('saleBirdStock')?.value?.trim() || '',
        weakBirds: document.getElementById('saleWeakBirds')?.value?.trim() || ''
    };

    try {
        const res = await apiReq(editId ? `/api/sale/${editId}` : '/api/sale', {
            method: editId ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        });
        alert(res.message || 'Bird lifting entry saved!');
        clearSaleForm();
        await loadSaleEntries();
        if (document.getElementById('reportsPage')?.classList.contains('active')) {
            await loadFarmerReport();
        }
    } catch (err) {
        alert(err.message || 'Save karne mein error aaya!');
    }
}

async function loadSaleEntries() {
    const tbody = document.getElementById('saleEntriesTableBody');
    if (!tbody) return;

    try {
        const raw = await apiReq('/api/sale');
        const list = pickArray(raw, ['entries', 'sales', 'data']);

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Koi lifting entry nahi mili.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(item => {
            const pcs = Number(item.totalPcs || 0);
            const wt = Number(item.totalWeightKg || 0);
            const avgBw = Number(item.avgBodyWeightKg || (pcs > 0 ? wt / pcs : 0));

            return `
                <tr>
                    <td>${fmtDate(item.date)}</td>
                    <td>${item.slNo || '-'}</td>
                    <td>${item.farmerName || '-'}</td>
                    <td>${item.partyName || '-'}</td>
                    <td>${pcs}</td>
                    <td>${wt.toFixed(2)}</td>
                    <td>${avgBw.toFixed(3)}</td>
                    <td style="white-space:nowrap;">
                        <button type="button" class="btn btn-primary" style="padding:4px 8px;font-size:0.78rem;" onclick="editSaleEntry('${item._id}')">Edit / Slip</button>
                        <button type="button" class="btn btn-danger" style="padding:4px 8px;font-size:0.78rem;" onclick="deleteSaleEntry('${item._id}')">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#c0392b;">${err.message}</td></tr>`;
    }
}

async function editSaleEntry(id) {
    try {
        const doc = await apiReq(`/api/sale/${id}`);
        if (!doc || !doc._id) return;

        document.getElementById('saleEditId').value = doc._id;
        document.getElementById('saleSlNo').value = doc.slNo || '';
        document.getElementById('saleDate').value = toDateInput(doc.date);
        if (doc.liftingSupervisor && document.getElementById('saleSupervisor')) {
            document.getElementById('saleSupervisor').value = doc.liftingSupervisor;
        }
        if (doc.trader && document.getElementById('saleTrader')) {
            document.getElementById('saleTrader').value = doc.trader;
        }
        if (doc.farmer && document.getElementById('saleFarmer')) {
            document.getElementById('saleFarmer').value = doc.farmer;
        }
        document.getElementById('saleRate').value = doc.rate ?? 0;
        document.getElementById('saleAge').value = doc.age ?? 0;
        document.getElementById('saleLsName').value = doc.lsName || '';
        document.getElementById('saleWtStart').value = doc.wtStartingTime || '';
        document.getElementById('saleWtClose').value = doc.wtClosingTime || '';
        document.getElementById('saleDriver').value = doc.driverName || '';
        document.getElementById('saleVehicle').value = doc.vehicleNo || '';
        document.getElementById('saleFeedClosing').value = doc.feedClosingStock || '';
        document.getElementById('saleBirdStock').value = doc.birdStock || '';
        document.getElementById('saleWeakBirds').value = doc.weakBirds || '';

        write48Rows(doc.rows || []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        alert(err.message || 'Entry load karne mein error aaya!');
    }
}

async function deleteSaleEntry(id) {
    if (!confirm('Kya aap is lifting entry ko delete karna chahte hain?')) return;
    try {
        const res = await apiReq(`/api/sale/${id}`, { method: 'DELETE' });
        alert(res.message || 'Entry deleted!');
        await loadSaleEntries();
        if (document.getElementById('reportsPage')?.classList.contains('active')) {
            await loadFarmerReport();
        }
    } catch (err) {
        alert(err.message || 'Delete karne mein error aaya!');
    }
}

// =======================================================
// REPORTS & FARMER LEDGER MODAL
// =======================================================
async function loadFarmerReport() {
    const tbody = document.getElementById('farmerReportTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">Loading report...</td></tr>';

    try {
        const branchId = document.getElementById('reportBranchFilter')?.value || '';
        const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        const raw = await apiReq(`/api/reports/farmer-wise${query}`);
        const rows = pickArray(raw, ['report', 'rows', 'data']);

        let totalLive = 0;
        let totalLifted = 0;
        rows.forEach(r => {
            totalLive += Number(r.currentLiveChicks || 0);
            totalLifted += Number(r.totalLiftedPcs || 0);
        });
        const dashLive = document.getElementById('dashLiveChicks');
        const dashLifted = document.getElementById('dashLiftedPcs');
        if (dashLive) dashLive.textContent = totalLive;
        if (dashLifted) dashLifted.textContent = totalLifted;

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">Koi report data nahi mila.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const fId = r.farmerMongoId || r._id || r.farmerId || '';
            const label = `${r.farmerName || '-'}${r.farmerId ? ` (${r.farmerId})` : ''}`;

            return `
                <tr>
                    <td>
                        <a href="javascript:void(0)" style="font-weight:700;color:#1b4f72;text-decoration:underline;" onclick="openFarmerLedgerModal('${fId}', '${(r.farmerName || '').replace(/'/g, "\\'")}')">
                            ${label}
                        </a>
                    </td>
                    <td>${r.branchName || 'N/A'}</td>
                    <td>${r.supervisorName || 'N/A'}</td>
                    <td>${r.age ?? 0}</td>
                    <td>${r.totalPlacementChicks ?? 0}</td>
                    <td>${r.totalMortality ?? 0}</td>
                    <td>${r.totalLiftedPcs ?? 0}</td>
                    <td><strong>${r.currentLiveChicks ?? 0}</strong></td>
                    <td>${r.avgBodyWeightGram ?? 0} g</td>
                    <td>${Number(r.totalBodyWeightKg || 0).toFixed(2)}</td>
                    <td>${Number(r.totalFeedInKg || 0).toFixed(2)}</td>
                    <td>${Number(r.totalFeedConsumeKg || 0).toFixed(2)}</td>
                    <td>${Number(r.closingFeedKg || 0).toFixed(2)}</td>
                    <td><strong>${Number(r.fcr || 0).toFixed(2)}</strong></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;color:#c0392b;">${err.message}</td></tr>`;
    }
}

async function openFarmerLedgerModal(farmerMongoId, fallbackName = '') {
    const modal = document.getElementById('farmerLedgerModal');
    const titleEl = document.getElementById('ledgerModalTitle');
    const metaEl = document.getElementById('ledgerFarmerMeta');
    const tbody = document.getElementById('farmerLedgerTableBody');

    if (!modal || !tbody || !farmerMongoId) return;

    modal.classList.add('open');
    titleEl.textContent = `Ledger: ${fallbackName}`;
    metaEl.innerHTML = 'Loading ledger...';
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading...</td></tr>';

    try {
        const data = await apiReq(`/api/reports/farmer-ledger/${farmerMongoId}`);
        const farmer = data.farmer || {};
        const entries = Array.isArray(data.entries) ? data.entries : [];

        titleEl.textContent = `Ledger: ${farmer.farmerName || fallbackName}${farmer.farmerId ? ` (${farmer.farmerId})` : ''}`;
        metaEl.innerHTML = `
            <strong>Branch:</strong> ${farmer.branch?.branchName || 'N/A'} |
            <strong>Supervisor:</strong> ${farmer.supervisor?.fullName || 'N/A'} |
            <strong>Total Feed In:</strong> ${Number(data.totalFeedInKg || 0).toFixed(2)} KG
        `;

        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Koi ledger entries nahi mili.</td></tr>';
            return;
        }

        tbody.innerHTML = entries.map(e => `
            <tr>
                <td>${fmtDate(e.date)}</td>
                <td>${e.days ?? e.age ?? '-'}</td>
                <td>${e.mortality ?? e.dayMortality ?? 0}</td>
                <td>${e.totalMortality ?? 0}</td>
                <td>${e.liftedPcs ?? 0}</td>
                <td><strong>${e.currentLiveChicks ?? 0}</strong></td>
                <td>${e.avgBodyWeightGram ?? 0} g</td>
                <td>${Number(e.totalBodyWeightKg || 0).toFixed(2)}</td>
                <td>${Number(e.totalFeedConsumeKg || 0).toFixed(2)}</td>
                <td>${Number(e.closingFeedKg || 0).toFixed(2)}</td>
                <td><strong>${Number(e.fcr || 0).toFixed(2)}</strong></td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:#c0392b;">${err.message}</td></tr>`;
    }
}

function closeFarmerLedgerModal() {
    document.getElementById('farmerLedgerModal')?.classList.remove('open');
}

async function refreshDashboardStats() {
    await loadMasterDropdowns();
    await loadFeedTransfers();
    await loadFarmerReport();
}

// =======================================================
// INIT
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    const saleForm = document.getElementById('saleEntryForm');
    if (saleForm && !saleForm.dataset.bound) {
        saleForm.dataset.bound = 'true';
        saleForm.addEventListener('submit', handleSaleSubmit);
    }

    loadMasterDropdowns();
    loadFeedTransfers();
    loadSaleEntries();
    initFeedTransfer();
});
