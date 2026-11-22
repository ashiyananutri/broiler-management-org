// ==========================================
// Broiler Management System - public/app.js
// ==========================================

const API_BASE = '';

// Helper: Safe JSON fetch
async function apiFetch(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
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

// Helper: Extract array safely from API response
function extractArray(payload, keys = ['data', 'items', 'list', 'rows']) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
        for (const k of keys) {
            if (Array.isArray(payload[k])) return payload[k];
        }
    }
    return [];
}

// Helper: Format YYYY-MM-DD for input[type="date"]
function toInputDate(val) {
    if (!val) return new Date().toISOString().split('T')[0];
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val).slice(0, 10);
    return d.toISOString().split('T')[0];
}

// Helper: Format date for display
function formatDisplayDate(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-IN');
}

// ==========================================
// 1. MASTER DROPDOWNS (Branches, Farmers, Supervisors, Traders)
// ==========================================
async function loadMasterDropdowns() {
    const endpoints = [
        { url: '/api/master/branches', target: 'branch' },
        { url: '/api/master/farmers', target: 'farmer' },
        { url: '/api/master/supervisors', target: 'supervisor' },
        { url: '/api/master/users', target: 'supervisor' },
        { url: '/api/master/traders', target: 'trader' }
    ];

    const collected = {
        branch: [],
        farmer: [],
        supervisor: [],
        trader: []
    };

    for (const ep of endpoints) {
        try {
            const raw = await apiFetch(ep.url);
            const arr = extractArray(raw, ['branches', 'farmers', 'supervisors', 'users', 'traders', 'data']);
            if (arr.length > 0 && collected[ep.target].length === 0) {
                collected[ep.target] = arr;
            }
        } catch (_) {
            // Optional endpoint missing/different path; ignore safely
        }
    }

    // Populate Report Branch Filter
    const branchFilter = document.getElementById('reportBranchFilter');
    if (branchFilter && collected.branch.length > 0) {
        const currentVal = branchFilter.value;
        branchFilter.innerHTML = '<option value="">All Branches</option>' +
            collected.branch.map(b => `<option value="${b._id}">${b.branchName || b.name || 'Branch'}</option>`).join('');
        if (currentVal) branchFilter.value = currentVal;
    }

    // Populate Sale Farmer Dropdown
    const saleFarmer = document.getElementById('saleFarmer');
    if (saleFarmer && collected.farmer.length > 0) {
        const currentVal = saleFarmer.value;
        saleFarmer.innerHTML = '<option value="">-- Select Farmer --</option>' +
            collected.farmer.map(f => {
                const label = `${f.farmerName || f.name || 'Farmer'}${f.farmerId ? ` (${f.farmerId})` : ''}`;
                return `<option value="${f._id}">${label}</option>`;
            }).join('');
        if (currentVal) saleFarmer.value = currentVal;
    }

    // Populate Sale Supervisor Dropdown
    const saleSupervisor = document.getElementById('saleSupervisor');
    if (saleSupervisor && collected.supervisor.length > 0) {
        const currentVal = saleSupervisor.value;
        saleSupervisor.innerHTML = '<option value="">-- Select Supervisor --</option>' +
            collected.supervisor.map(u => {
                const label = u.fullName || u.name || u.username || 'Supervisor';
                return `<option value="${u._id}">${label}</option>`;
            }).join('');
        if (currentVal) saleSupervisor.value = currentVal;
    }

    // Populate Sale Trader Dropdown
    const saleTrader = document.getElementById('saleTrader');
    if (saleTrader && collected.trader.length > 0) {
        const currentVal = saleTrader.value;
        saleTrader.innerHTML = '<option value="">-- Select Trader --</option>' +
            collected.trader.map(t => {
                const label = t.traderName || t.partyName || t.name || 'Trader';
                return `<option value="${t._id}">${label}</option>`;
            }).join('');
        if (currentVal) saleTrader.value = currentVal;
    }

    // Populate Feed Transfer From/To Farmer Dropdowns
    const ftFrom = document.getElementById('ftFromFarmer');
    const ftTo = document.getElementById('ftToFarmer');
    if (ftFrom && ftTo && collected.farmer.length > 0) {
        const prevFrom = ftFrom.value;
        const prevTo = ftTo.value;
        const opts = '<option value="">-- Select Farmer --</option>' +
            collected.farmer.map(f => {
                const label = `${f.farmerName || f.name || 'Farmer'}${f.farmerId ? ` (${f.farmerId})` : ''}`;
                return `<option value="${f._id}">${label}</option>`;
            }).join('');
        ftFrom.innerHTML = opts;
        ftTo.innerHTML = opts;
        if (prevFrom) ftFrom.value = prevFrom;
        if (prevTo) ftTo.value = prevTo;
    }
}

// ==========================================
// 2. SALE / BIRD LIFTING ENTRY (48 ROWS + SAVE/EDIT/DELETE/PRINT)
// ==========================================
function collect48LiftingRows() {
    const rows = [];
    for (let sl = 1; sl <= 48; sl++) {
        const pcsEl = document.querySelector(`.lift-pcs[data-sl="${sl}"]`);
        const wtEl = document.querySelector(`.lift-wt[data-sl="${sl}"]`);
        rows.push({
            slNo: sl,
            noOfBirds: Number(pcsEl?.value || 0),
            weightKg: Number(wtEl?.value || 0)
        });
    }
    return rows;
}

function set48LiftingRows(rows = []) {
    for (let sl = 1; sl <= 48; sl++) {
        const pcsEl = document.querySelector(`.lift-pcs[data-sl="${sl}"]`);
        const wtEl = document.querySelector(`.lift-wt[data-sl="${sl}"]`);
        const match = Array.isArray(rows)
            ? (rows.find(r => Number(r.slNo) === sl) || rows[sl - 1])
            : null;

        if (pcsEl) {
            const pcs = match ? Number(match.noOfBirds || 0) : 0;
            pcsEl.value = pcs > 0 ? pcs : '';
        }
        if (wtEl) {
            const wt = match ? Number(match.weightKg || 0) : 0;
            wtEl.value = wt > 0 ? wt : '';
        }
    }
    if (typeof recalcLiftingTotals === 'function') {
        recalcLiftingTotals();
    }
}

function clearSaleForm() {
    const form = document.getElementById('saleEntryForm');
    if (form) form.reset();

    const editIdEl = document.getElementById('saleEditId');
    if (editIdEl) editIdEl.value = '';

    const dateEl = document.getElementById('saleDate');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

    set48LiftingRows([]);
}

async function handleSaleSubmit(e) {
    e.preventDefault();

    const farmerId = document.getElementById('saleFarmer')?.value;
    const date = document.getElementById('saleDate')?.value;
    if (!farmerId) {
        alert('Kripya Farmer select karein!');
        return;
    }
    if (!date) {
        alert('Kripya Date select karein!');
        return;
    }

    const editId = document.getElementById('saleEditId')?.value?.trim();
    const traderSelect = document.getElementById('saleTrader');
    const partyName = traderSelect && traderSelect.selectedIndex > 0
        ? traderSelect.options[traderSelect.selectedIndex].text
        : '';

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
        rows: collect48LiftingRows(),
        feedClosingStock: document.getElementById('saleFeedClosing')?.value?.trim() || '',
        birdStock: document.getElementById('saleBirdStock')?.value?.trim() || '',
        weakBirds: document.getElementById('saleWeakBirds')?.value?.trim() || ''
    };

    try {
        const url = editId ? `/api/sale/${editId}` : '/api/sale';
        const method = editId ? 'PUT' : 'POST';
        const res = await apiFetch(url, {
            method,
            body: JSON.stringify(payload)
        });

        alert(res.message || 'Sale / Bird Lifting entry saved successfully!');
        clearSaleForm();
        await loadSaleEntries();

        // Agar reports tab open hai ya data dekhna hai toh refresh karein
        if (document.getElementById('reportsTab')?.classList.contains('active')) {
            await loadFarmerReport();
        }
    } catch (err) {
        alert(err.message || 'Sale entry save karne mein error aaya!');
    }
}

async function loadSaleEntries() {
    const tbody = document.getElementById('saleEntriesTableBody');
    if (!tbody) return;

    try {
        const raw = await apiFetch('/api/sale');
        const list = extractArray(raw, ['entries', 'sales', 'data']);

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Koi sale / lifting entry nahi mili.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(item => {
            const pcs = Number(item.totalPcs || 0);
            const wt = Number(item.totalWeightKg || 0);
            const avgBw = Number(item.avgBodyWeightKg || (pcs > 0 ? wt / pcs : 0));

            return `
                <tr>
                    <td>${formatDisplayDate(item.date)}</td>
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
        const doc = await apiFetch(`/api/sale/${id}`);
        if (!doc || !doc._id) return;

        document.getElementById('saleEditId').value = doc._id;
        document.getElementById('saleSlNo').value = doc.slNo || '';
        document.getElementById('saleDate').value = toInputDate(doc.date);
        if (doc.liftingSupervisor && document.getElementById('saleSupervisor')) {
            document.getElementById('saleSupervisor').value = doc.liftingSupervisor;
        }
        if (doc.trader && document.getElementById('saleTrader')) {
            document.getElementById('saleTrader').value = doc.trader;
        }
        if (doc.farmer && document.getElementById('saleFarmer')) {
            document.getElementById('saleFarmer').value = doc.farmer;
        }
        document.getElementById('saleRate').value = doc.rate ?? '';
        document.getElementById('saleAge').value = doc.age ?? '';
        document.getElementById('saleLsName').value = doc.lsName || '';
        document.getElementById('saleWtStart').value = doc.wtStartingTime || '';
        document.getElementById('saleWtClose').value = doc.wtClosingTime || '';
        document.getElementById('saleDriver').value = doc.driverName || '';
        document.getElementById('saleVehicle').value = doc.vehicleNo || '';
        document.getElementById('saleFeedClosing').value = doc.feedClosingStock || '';
        document.getElementById('saleBirdStock').value = doc.birdStock || '';
        document.getElementById('saleWeakBirds').value = doc.weakBirds || '';

        set48LiftingRows(doc.rows || []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        alert(err.message || 'Entry load karne mein error aaya!');
    }
}

async function deleteSaleEntry(id) {
    if (!confirm('Kya aap is Sale / Bird Lifting entry ko delete karna chahte hain?')) return;
    try {
        const res = await apiFetch(`/api/sale/${id}`, { method: 'DELETE' });
        alert(res.message || 'Entry deleted!');
        await loadSaleEntries();
        if (document.getElementById('reportsTab')?.classList.contains('active')) {
            await loadFarmerReport();
        }
    } catch (err) {
        alert(err.message || 'Delete karne mein error aaya!');
    }
}

// ==========================================
// 3. TRANSACTIONS: FEED TRANSFER (FARMER TO FARMER)
// ==========================================
async function populateFeedTransferFarmers() {
    await loadMasterDropdowns();
}

async function loadFeedTransfers() {
    const tbody = document.getElementById('feedTransferTableBody');
    if (!tbody) return;

    try {
        const raw = await apiFetch('/api/feed-transfer');
        const list = extractArray(raw, ['transfers', 'data']);

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Koi feed transfer record nahi hai.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(item => {
            const fromName = item.fromFarmerName || (item.fromFarmer && item.fromFarmer.farmerName) || '-';
            const toName = item.toFarmerName || (item.toFarmer && item.toFarmer.farmerName) || '-';
            return `
                <tr>
                    <td>${formatDisplayDate(item.date)}</td>
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
        const res = await apiFetch(`/api/feed-transfer/${id}`, { method: 'DELETE' });
        alert(res.message || 'Feed transfer deleted!');
        await loadFeedTransfers();
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
                const res = await apiFetch('/api/feed-transfer', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                alert(res.message || 'Feed transferred successfully!');
                form.reset();
                if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
                await loadFeedTransfers();
                if (document.getElementById('reportsTab')?.classList.contains('active')) {
                    await loadFarmerReport();
                }
            } catch (err) {
                alert(err.message || 'Feed transfer fail ho gaya!');
            }
        });
    }
}

// ==========================================
// 4. REPORTS & FARMER LEDGER HISTORY
// ==========================================
async function loadFarmerReport() {
    const tbody = document.getElementById('farmerReportTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">Loading report...</td></tr>';

    try {
        const branchId = document.getElementById('reportBranchFilter')?.value || '';
        const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
        const raw = await apiFetch(`/api/reports/farmer-wise${query}`);
        const rows = extractArray(raw, ['report', 'rows', 'data']);

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">Koi report data nahi mila.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const fMongoId = r.farmerMongoId || r._id || r.farmerId || '';
            const nameText = `${r.farmerName || '-'}${r.farmerId ? ` (${r.farmerId})` : ''}`;

            return `
                <tr>
                    <td>
                        <a href="javascript:void(0)" style="font-weight:700;color:#1b4f72;text-decoration:underline;" onclick="openFarmerLedger('${fMongoId}', '${(r.farmerName || '').replace(/'/g, "\\'")}')">
                            ${nameText}
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

async function openFarmerLedger(farmerMongoId, fallbackName = '') {
    const card = document.getElementById('farmerLedgerCard');
    const titleEl = document.getElementById('ledgerModalTitle');
    const metaEl = document.getElementById('ledgerFarmerMeta');
    const tbody = document.getElementById('farmerLedgerTableBody');

    if (!card || !tbody || !farmerMongoId) return;

    card.style.display = 'block';
    titleEl.textContent = `Ledger History: ${fallbackName}`;
    metaEl.innerHTML = 'Loading ledger...';
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Loading...</td></tr>';
    card.scrollIntoView({ behavior: 'smooth' });

    try {
        const data = await apiFetch(`/api/reports/farmer-ledger/${farmerMongoId}`);
        const farmer = data.farmer || {};
        const entries = Array.isArray(data.entries) ? data.entries : [];

        titleEl.textContent = `Ledger History: ${farmer.farmerName || fallbackName}${farmer.farmerId ? ` (${farmer.farmerId})` : ''}`;
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
                <td>${formatDisplayDate(e.date)}</td>
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

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const saleForm = document.getElementById('saleEntryForm');
    if (saleForm && !saleForm.dataset.bound) {
        saleForm.dataset.bound = 'true';
        saleForm.addEventListener('submit', handleSaleSubmit);
    }

    loadMasterDropdowns();
    loadSaleEntries();
    initFeedTransfer();
});
