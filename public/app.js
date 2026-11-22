// =======================================================
// Broiler Management System - public/app.js (Complete)
// =======================================================

let allSupervisors = [];
let allBranches = [];
let allFarmers = [];
let allTraders = [];
let allItems = [];
let allFeedDispatches = [];
let allSaleEntries = [];
let currentUser = null;

const SESSION_STORAGE_KEY = 'bms_session_v1';
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
let idleTimerId = null;
let sessionPollId = null;

function extractList(payload, keys = []) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const k of [...keys, 'data', 'items', 'records', 'results']) {
        if (Array.isArray(payload[k])) return payload[k];
    }
    return [];
}

function getSavedSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
    } catch (_) {
        return null;
    }
}

function saveSession(sessionData) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        ...sessionData,
        lastActivityAt: Date.now()
    }));
}

function clearSavedSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
}

function getAuthHeaders() {
    const sess = getSavedSession();
    const headers = {};
    if (sess && sess.sessionId && sess.user?._id) {
        headers['x-session-id'] = sess.sessionId;
        headers['x-user-id'] = sess.user._id;
    }
    return headers;
}

function applyLoggedInUI(user) {
    currentUser = user;
    document.body.classList.add('is-logged-in');
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';

    const displayName = user?.fullName || user?.userId || 'User';
    const nameEl = document.getElementById('userDisplayName');
    const roleEl = document.getElementById('userRoleBadge');
    const avatarEl = document.getElementById('avatarIcon');

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = user?.role || 'Active';
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

    loadDropdownData();
    loadEntriesData();
    loadSaleEntries();
    loadReportDropdowns();
    populateFeedTransferFarmers().catch(() => {});
    loadFeedTransfers();
}

function forceLogout(reasonMessage = 'Aap logout ho gaye hain. Kripya dobara login karein.') {
    currentUser = null;
    document.body.classList.remove('is-logged-in');
    clearSavedSession();
    if (idleTimerId) clearTimeout(idleTimerId);
    if (sessionPollId) clearInterval(sessionPollId);

    const nameEl = document.getElementById('userDisplayName');
    const roleEl = document.getElementById('userRoleBadge');
    const avatarEl = document.getElementById('avatarIcon');
    if (nameEl) nameEl.textContent = 'Guest';
    if (roleEl) roleEl.textContent = 'Not Logged In';
    if (avatarEl) avatarEl.textContent = 'R';

    const overlay = document.getElementById('loginOverlay');
    const loginMsg = document.getElementById('loginMsg');
    if (overlay) overlay.style.display = 'flex';
    if (loginMsg) {
        loginMsg.style.color = '#dc2626';
        loginMsg.textContent = reasonMessage;
    }
}

async function logout() {
    const sess = getSavedSession();
    try {
        if (sess && sess.sessionId && sess.user?._id) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-id': sess.sessionId,
                    'x-user-id': sess.user._id
                },
                body: JSON.stringify({ userId: sess.user._id })
            }).catch(() => {});
        }
    } finally {
        forceLogout('Aap logout ho chuke hain.');
    }
}

function resetIdleTimer() {
    const sess = getSavedSession();
    if (!sess || !sess.sessionId) return;

    sess.lastActivityAt = Date.now();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sess));

    if (idleTimerId) clearTimeout(idleTimerId);
    idleTimerId = setTimeout(() => {
        forceLogout('5 minute tak koi activity na hone ke karan aap auto-logout ho gaye hain.');
    }, IDLE_TIMEOUT_MS);
}

function initActivityListeners() {
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
        window.addEventListener(evt, resetIdleTimer, { passive: true });
    });
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            ...getAuthHeaders(),
            ...(options.headers || {})
        }
    });

    if (res.status === 401 && !url.includes('/api/auth/login')) {
        const errData = await res.json().catch(() => ({}));
        forceLogout(errData.error || errData.message || 'Session expire ya kisi aur device par login ho gaya hai.');
    }

    return res;
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('loginUserId')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value || '';
    const msgEl = document.getElementById('loginMsg');

    try {
        if (msgEl) {
            msgEl.style.color = '#0f172a';
            msgEl.textContent = 'Logging in...';
        }
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, password })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || data.message || 'Login fail ho gaya.');
        }

        saveSession(data);
        applyLoggedInUI(data.user);
        resetIdleTimer();
        startSessionWatcher();
        if (msgEl) msgEl.textContent = '';
    } catch (err) {
        if (msgEl) {
            msgEl.style.color = '#dc2626';
            msgEl.textContent = err.message;
        }
    }
}

function startSessionWatcher() {
    if (sessionPollId) clearInterval(sessionPollId);
    sessionPollId = setInterval(async () => {
        const sess = getSavedSession();
        if (!sess || !sess.sessionId) return;

        if (Date.now() - Number(sess.lastActivityAt || 0) >= IDLE_TIMEOUT_MS) {
            forceLogout('5 minute tak koi activity na hone ke karan aap auto-logout ho gaye hain.');
            return;
        }

        try {
            await apiFetch('/api/auth/check-session');
        } catch (_) {}
    }, 15000);
}

window.addEventListener('DOMContentLoaded', () => {
    buildLiftingRows();
    setDefaultDates();
    initActivityListeners();
    initFeedTransferModule();
    bindFormHandlers();

    const loginForm = document.getElementById('loginForm');
    if (loginForm && !loginForm.dataset.authBound) {
        loginForm.dataset.authBound = 'true';
        loginForm.addEventListener('submit', handleLoginSubmit);
    }

    const sess = getSavedSession();
    if (!sess || !sess.sessionId || !sess.user) {
        forceLogout('');
        const loginMsg = document.getElementById('loginMsg');
        if (loginMsg) loginMsg.textContent = '';
        return;
    }

    if (Date.now() - Number(sess.lastActivityAt || 0) >= IDLE_TIMEOUT_MS) {
        forceLogout('5 minute inactivity ke karan session expire ho gaya. Dobara login karein.');
        return;
    }

    applyLoggedInUI(sess.user);
    resetIdleTimer();
    startSessionWatcher();
});

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    ['cDate', 'feedDate', 'dailyDate', 'saleDate', 'ftDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = today;
    });
}

function generateBranchCode() {
    const name = document.getElementById('branchName')?.value.trim() || '';
    if (name.length > 0 && !document.getElementById('editBranchId')?.value) {
        const prefix = name.substring(0, 3).toUpperCase();
        const rand = Math.floor(10 + Math.random() * 90);
        const target = document.getElementById('branchId');
        if (target) target.value = `${prefix}-${rand}`;
    }
}

function autofillBranchFromSupervisor() {
    const supSel = document.getElementById('fSup');
    const brSel = document.getElementById('fBranch');
    if (!supSel || !brSel) return;
    const opt = supSel.options[supSel.selectedIndex];
    const brId = opt?.getAttribute('data-branch');
    if (brId && brId !== 'undefined' && brId !== 'null') {
        brSel.value = brId;
        generateFarmerId();
    }
}

function generateFarmerId() {
    const farmerName = document.getElementById('fName')?.value.trim() || '';
    const branchSelect = document.getElementById('fBranch');
    if (!branchSelect) return;
    const selectedBranchText = branchSelect.selectedIndex > 0 ? branchSelect.options[branchSelect.selectedIndex].text : '';

    if (farmerName.length > 0 && selectedBranchText && !document.getElementById('editFarmerId')?.value) {
        let branchPrefix = "BR";
        if (selectedBranchText.includes('(')) {
            const match = selectedBranchText.match(/\(([^)]+)\)/);
            if (match) branchPrefix = match[1].split('-')[0].toUpperCase();
        }
        const namePrefix = farmerName.substring(0, 3).toUpperCase();
        const randNum = Math.floor(10 + Math.random() * 90);
        const target = document.getElementById('fId');
        if (target) target.value = `${branchPrefix}-${namePrefix}-${randNum}`;
    }
}

async function loadDropdownData() {
    try {
        let users = [];
        const branchRes = await apiFetch('/api/master/branch');
        if (branchRes.ok) {
            allBranches = extractList(await branchRes.json(), ['branches']);
            const branchSelects = [document.getElementById('uBranch'), document.getElementById('fBranch')];
            branchSelects.forEach(select => {
                if (select) {
                    select.innerHTML = '<option value="">-- Branch Chunein --</option>';
                    allBranches.forEach(b => {
                        select.innerHTML += `<option value="${b._id}">${b.branchName} (${b.branchId})</option>`;
                    });
                }
            });
            renderBranchTable(allBranches);
        }

        const userRes = await apiFetch('/api/master/user');
        if (userRes.ok) {
            users = extractList(await userRes.json(), ['users']);
            allSupervisors = users.filter(u => u.role && u.role.toLowerCase() === 'supervisor');
            const supSelect = document.getElementById('fSup');
            if (supSelect) {
                supSelect.innerHTML = '<option value="">-- Supervisor Chunein --</option>';
                allSupervisors.forEach(s => {
                    const branchId = s.branch && s.branch._id ? s.branch._id : s.branch;
                    const branchNameStr = s.branch && s.branch.branchName ? ` [${s.branch.branchName}]` : '';
                    supSelect.innerHTML += `<option value="${s._id}" data-branch="${branchId || ''}">${s.fullName} (${s.userId})${branchNameStr}</option>`;
                });
            }
            renderUserTable(users);
        }

        const farmerRes = await apiFetch('/api/master/farmer');
        if (farmerRes.ok) {
            allFarmers = extractList(await farmerRes.json(), ['farmers']);
            const farmerSelects = [
                document.getElementById('cFarmer'),
                document.getElementById('feedFarmer'),
                document.getElementById('dailyFarmer')
            ];
            farmerSelects.forEach(farmerSelect => {
                if (farmerSelect) {
                    farmerSelect.innerHTML = '<option value="">-- Farmer Chunein --</option>';
                    allFarmers.forEach(f => {
                        const supName = f.supervisor && f.supervisor.fullName ? f.supervisor.fullName : 'N/A';
                        const branchName = f.branch && f.branch.branchName ? f.branch.branchName : 'Branch';
                        const branchCode = f.branch && f.branch.branchId ? f.branch.branchId : 'BR';

                        farmerSelect.innerHTML += `<option value="${f._id}"
                            data-supname="${supName}"
                            data-branchname="${branchName}"
                            data-branchcode="${branchCode}"
                            data-farmerid="${f.farmerId}">
                            ${f.farmerName} (${f.farmerId})
                        </option>`;
                    });
                }
            });
            renderFarmerTable(allFarmers);
            populateFeedTransferFarmers();
        }

        const traderRes = await apiFetch('/api/master/trader');
        if (traderRes.ok) {
            allTraders = extractList(await traderRes.json(), ['traders']);
            renderTraderTable(allTraders);
        }

        populateSaleDropdowns(users, allTraders);

        const itemRes = await apiFetch('/api/master/item');
        if (itemRes.ok) {
            allItems = extractList(await itemRes.json(), ['items']);
            renderItemTable(allItems);

            const feedTypeSelect = document.getElementById('feedType');
            if (feedTypeSelect) {
                feedTypeSelect.innerHTML = '<option value="">-- Feed Type Chunein --</option>';
                const feedItems = allItems.filter(i => i.category && i.category.toLowerCase() === 'feed');
                (feedItems.length ? feedItems : allItems).forEach(item => {
                    feedTypeSelect.innerHTML += `<option value="${item.itemName}">${item.itemName} (${item.itemId || ''})</option>`;
                });
            }
        }
    } catch (e) {
        console.log("Master load error:", e);
    }
}

async function loadReportDropdowns() {
    try {
        const branchRes = await apiFetch('/api/master/branch');
        if (branchRes.ok) {
            const branches = extractList(await branchRes.json(), ['branches']);
            const bSelect = document.getElementById('reportBranchSelect');
            if (bSelect) {
                bSelect.innerHTML = '<option value="">-- Sabhi Branches --</option>';
                branches.forEach(b => {
                    bSelect.innerHTML += `<option value="${b._id}">${b.branchName}</option>`;
                });
            }
        }

        const userRes = await apiFetch('/api/master/user');
        if (userRes.ok) {
            const users = extractList(await userRes.json(), ['users']);
            const supervisors = users.filter(u => u.role && u.role.toLowerCase() === 'supervisor');
            const sSelect = document.getElementById('reportSupSelect');
            if (sSelect) {
                sSelect.innerHTML = '<option value="">-- Sabhi Supervisors --</option>';
                supervisors.forEach(s => {
                    sSelect.innerHTML += `<option value="${s._id}">${s.fullName} (${s.userId})</option>`;
                });
            }
        }
    } catch (e) {
        console.log("Report dropdown error:", e);
    }
}

async function loadEntriesData() {
    try {
        const [placementRes, feedRes, dailyRes] = await Promise.all([
            apiFetch('/api/entry/chicks-placement'),
            apiFetch('/api/entry/feed-dispatch'),
            apiFetch('/api/entry/daily-entry')
        ]);

        if (placementRes.ok) {
            renderChicksTable(extractList(await placementRes.json(), ['placements', 'chicksPlacements']));
        }

        let feeds = [];
        if (feedRes.ok) {
            feeds = extractList(await feedRes.json(), ['feeds', 'feedDispatches']);
            allFeedDispatches = feeds;
            renderFeedTable(feeds);
        }

        if (dailyRes.ok) {
            const dailies = extractList(await dailyRes.json(), ['entries', 'dailyEntries']);
            renderDailyTable(dailies, feeds);
        }
    } catch (e) {
        console.log("Entries load error:", e);
    }
}

function calculateBags() {
    const qty = Number(document.getElementById('qtyKg')?.value) || 0;
    const bagsSpan = document.getElementById('bagCalcText');
    if (!bagsSpan) return;
    bagsSpan.innerText = qty > 0 ? `= ${(qty / 50).toFixed(2)} Bags` : '';
}

function renderBranchTable(branches) {
    const tbody = document.getElementById('branchTableBody');
    if (!tbody) return;
    tbody.innerHTML = branches.map(b => `
        <tr>
            <td>${b.branchId || ''}</td><td>${b.branchName || ''}</td><td>${b.address || ''}</td>
            <td>
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/master/branch/${b._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.userId || ''}</td><td>${u.fullName || ''}</td><td>${u.role || ''}</td><td>${u.branch ? u.branch.branchName : 'N/A'}</td><td>${u.mobileNumber || ''}</td>
            <td>
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/master/user/${u._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderFarmerTable(farmers) {
    const tbody = document.getElementById('farmerTableBody');
    if (!tbody) return;
    tbody.innerHTML = farmers.map(f => `
        <tr>
            <td>${f.farmerId || ''}</td><td>${f.farmerName || ''}</td><td>${f.supervisor ? f.supervisor.fullName : 'N/A'}</td><td>${f.branch ? f.branch.branchName : 'N/A'}</td><td>${f.mobileNo || ''}</td>
            <td>
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/master/farmer/${f._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderTraderTable(traders) {
    const tbody = document.getElementById('traderTableBody');
    if (!tbody) return;
    tbody.innerHTML = traders.map(t => `
        <tr>
            <td>${t.traderId || ''}</td><td>${t.traderName || ''}</td><td>${t.mobileNo || ''}</td><td>${t.address || ''}</td>
            <td>
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/master/trader/${t._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderItemTable(items) {
    const tbody = document.getElementById('itemTableBody');
    if (!tbody) return;
    tbody.innerHTML = items.map(i => `
        <tr>
            <td>${i.itemId || ''}</td><td>${i.itemName || ''}</td><td>${i.category || ''}</td><td>${i.unit || ''}</td>
            <td>
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/master/item/${i._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderChicksTable(placements) {
    const tbody = document.getElementById('chicksTableBody');
    if (!tbody) return;
    tbody.innerHTML = placements.map(p => `
        <tr>
            <td>${p.placementId || ''}</td>
            <td>${p.date ? new Date(p.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${p.farmer ? p.farmer.farmerName : 'N/A'}</td>
            <td>${p.branch ? p.branch.branchName : 'N/A'}</td>
            <td>${p.chicksQty || 0}</td>
            <td>
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/entry/chicks-placement/${p._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderFeedTable(feeds) {
    const tbody = document.getElementById('feedTableBody');
    if (!tbody) return;
    tbody.innerHTML = feeds.map(f => {
        const bags = (Number(f.qtyKg || 0) / 50).toFixed(2);
        const isApproved = f.status === 'Approved';
        const statusBadge = isApproved ? `<span class="badge-approved">Approved</span>` : `<span class="badge-pending">Pending</span>`;
        const approveBtn = !isApproved ? `<button type="button" class="action-btn btn-approve" onclick="approveFeedDispatch('${f._id}')">Approve</button>` : '';

        return `
        <tr>
            <td>${f.challanNo || ''}</td>
            <td>${f.date ? new Date(f.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${f.farmer ? f.farmer.farmerName : 'N/A'}</td>
            <td>${f.feedType || ''}</td>
            <td>${f.qtyKg || 0} KG</td>
            <td style="font-weight:600; color:#059669;">${bags} Bags</td>
            <td>${statusBadge}</td>
            <td>
                ${approveBtn}
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/entry/feed-dispatch/${f._id}')">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

async function approveFeedDispatch(id) {
    if (!confirm("Kya aap is feed dispatch ko approve karna chahte hain?")) return;
    try {
        const res = await apiFetch(`/api/entry/feed-dispatch/approve/${id}`, { method: 'PUT' });
        const data = await res.json();
        if (res.ok) {
            alert(data.message || 'Approved');
            loadEntriesData();
        } else {
            alert(data.error || "Approval fail ho gaya!");
        }
    } catch (e) { alert("Server Error!"); }
}

function getFarmerTotalFeedIn(farmerId, feedsList = allFeedDispatches) {
    if (!farmerId || !Array.isArray(feedsList)) return 0;
    return feedsList
        .filter(f => {
            const fId = f.farmer && f.farmer._id ? f.farmer._id : f.farmer;
            return String(fId) === String(farmerId);
        })
        .reduce((sum, f) => sum + Number(f.qtyKg || 0), 0);
}

function renderDailyTable(entries, feedsList = allFeedDispatches) {
    const tbody = document.getElementById('dailyTableBody');
    if (!tbody) return;
    tbody.innerHTML = entries.map((d, idx) => {
        const farmerId = d.farmer && d.farmer._id ? d.farmer._id : d.farmer;
        const feedIn = d.totalFeedInKg !== undefined
            ? Number(d.totalFeedInKg)
            : getFarmerTotalFeedIn(farmerId, feedsList);
        const totalFeedConsume = Number(d.totalFeedConsumeKg || 0);
        const closingFeed = d.closingFeedKg !== undefined
            ? Number(d.closingFeedKg)
            : Number((feedIn - totalFeedConsume).toFixed(2));

        const prevSameFarmerEntry = entries.slice(idx + 1).find(item => {
            const itemFarmerId = item.farmer && item.farmer._id ? item.farmer._id : item.farmer;
            return String(itemFarmerId) === String(farmerId);
        });

        const prevLiveForCalc = prevSameFarmerEntry
            ? Number(prevSameFarmerEntry.currentLiveChicks || 0)
            : Number(d.totalPlacementChicks || 0);

        const avgBw = Number(d.avgBodyWeightGram || 0);
        const totalBw = Number(d.totalBodyWeightKg || 0) > 0
            ? Number(d.totalBodyWeightKg)
            : Number(((prevLiveForCalc * avgBw) / 1000).toFixed(2));

        const fcrVal = Number(d.fcr || 0) > 0
            ? Number(d.fcr)
            : (totalBw > 0 ? Number((totalFeedConsume / totalBw).toFixed(2)) : 0);

        const closingColor = closingFeed < 0 ? '#ef4444' : '#059669';

        return `
        <tr>
            <td>${d.date ? new Date(d.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${d.farmer ? d.farmer.farmerName : 'N/A'}</td>
            <td>${d.days || 0}</td>
            <td style="font-weight:600; color:#3b82f6;">${d.totalPlacementChicks || 0}</td>
            <td>${d.dayMortality || 0}</td>
            <td style="color:#ef4444; font-weight:600;">${d.totalMortality || 0} (${d.mortalityPercentage || 0}%)</td>
            <td style="color:#10b981; font-weight:600;">${d.currentLiveChicks || 0}</td>
            <td>${avgBw} g</td>
            <td style="font-weight:600; color:#2563eb;">${totalBw.toFixed(2)} KG</td>
            <td>${feedIn.toFixed(2)} KG</td>
            <td>${totalFeedConsume.toFixed(2)} KG</td>
            <td style="font-weight:700; color:${closingColor};">${closingFeed.toFixed(2)} KG</td>
            <td style="font-weight:bold;">${fcrVal}</td>
            <td>
                <button type="button" class="action-btn btn-delete" onclick="deleteRecord('/api/entry/daily-entry/${d._id}')">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

// =========================================================
// FEED TRANSFER (FARMER TO FARMER)
// =========================================================
async function populateFeedTransferFarmers() {
    const fromSel = document.getElementById('ftFromFarmer');
    const toSel = document.getElementById('ftToFarmer');
    if (!fromSel && !toSel) return;

    let farmers = allFarmers;
    if (!Array.isArray(farmers) || farmers.length === 0) {
        const res = await apiFetch('/api/master/farmer');
        if (res.ok) {
            farmers = extractList(await res.json(), ['farmers']);
            allFarmers = farmers;
        }
    }

    const optionsHtml = '<option value="">-- Select Farmer --</option>' +
        (farmers || []).map(f => {
            const name = f.farmerName || f.name || 'Farmer';
            const code = f.farmerId ? ` (${f.farmerId})` : '';
            return `<option value="${f._id}">${name}${code}</option>`;
        }).join('');

    if (fromSel) {
        const prevFrom = fromSel.value;
        fromSel.innerHTML = optionsHtml;
        if (prevFrom) fromSel.value = prevFrom;
    }
    if (toSel) {
        const prevTo = toSel.value;
        toSel.innerHTML = optionsHtml;
        if (prevTo) toSel.value = prevTo;
    }
}

async function loadFeedTransfers() {
    const tbody = document.getElementById('feedTransferTableBody');
    if (!tbody) return;

    try {
        const res = await apiFetch('/api/feed-transfer');
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(raw.error || raw.message || 'Feed transfer load nahi ho paya.');
        }

        const list = extractList(raw, ['transfers']);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Koi feed transfer record nahi hai.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(t => {
            const fromName = t.fromFarmerName || t.fromFarmer?.farmerName || '-';
            const toName = t.toFarmerName || t.toFarmer?.farmerName || '-';
            const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-IN') : '-';

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td>${t.transferNo || '-'}</td>
                    <td>${fromName}</td>
                    <td>${toName}</td>
                    <td>${t.feedType || 'Broiler Feed'}</td>
                    <td>${Number(t.qtyKg || 0).toFixed(2)}</td>
                    <td>${t.remarks || '-'}</td>
                    <td>
                        <button type="button" class="action-btn btn-delete" onclick="deleteFeedTransfer('${t._id}')">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#dc2626;">${err.message}</td></tr>`;
    }
}

async function deleteFeedTransfer(id) {
    if (!confirm('Kya aap is feed transfer entry ko delete karna chahte hain?')) return;
    try {
        const res = await apiFetch(`/api/feed-transfer/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Delete karne mein error aaya.');
        await loadFeedTransfers();
    } catch (err) {
        alert(err.message || 'Delete karne mein error aaya.');
    }
}

function initFeedTransferModule() {
    const form = document.getElementById('feedTransferForm');
    const dateInput = document.getElementById('ftDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    const sess = getSavedSession();
    if (sess && sess.sessionId) {
        populateFeedTransferFarmers().catch(() => {});
        loadFeedTransfers();
    }

    if (form && !form.dataset.ftBound) {
        form.dataset.ftBound = 'true';
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgEl = document.getElementById('ftMsg');

            const fromFarmerId = document.getElementById('ftFromFarmer')?.value;
            const toFarmerId = document.getElementById('ftToFarmer')?.value;
            const qtyKg = Number(document.getElementById('ftQtyKg')?.value || 0);

            if (!fromFarmerId || !toFarmerId) {
                if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = 'From Farmer aur To Farmer dono select karein.'; }
                return;
            }
            if (fromFarmerId === toFarmerId) {
                if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = 'From Farmer aur To Farmer alag-alag hone chahiye.'; }
                return;
            }
            if (!qtyKg || qtyKg <= 0) {
                if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = 'Sahi Quantity (KG) daalein.'; }
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
                if (msgEl) { msgEl.style.color = '#0f172a'; msgEl.textContent = 'Saving transfer...'; }
                const res = await apiFetch('/api/feed-transfer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.message || 'Transfer save nahi ho paya.');

                if (msgEl) {
                    msgEl.style.color = '#059669';
                    msgEl.textContent = data.message || 'Feed transfer save ho gaya.';
                }
                form.reset();
                if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
                await loadFeedTransfers();
            } catch (err) {
                if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = err.message; }
            }
        });
    }
}

// =========================================================
// SALE / BIRD LIFTING ENTRY & PRINT SHEET LOGIC
// =========================================================
function buildLiftingRows() {
    const tbody = document.getElementById('liftingInputBody');
    if (!tbody) return;

    let html = '';
    for (let r = 0; r < 12; r++) {
        html += '<tr>';
        for (let c = 0; c < 4; c++) {
            const sl = c * 12 + r + 1;
            html += `
                <td style="font-weight:700; background:#f8fafc;">${sl}.</td>
                <td><input type="number" min="0" class="lift-birds" data-sl="${sl}" oninput="recalcSaleSummary()" placeholder="0" style="padding:5px 6px; width:74px;"></td>
                <td><input type="number" step="0.01" min="0" class="lift-wt" data-sl="${sl}" oninput="recalcSaleSummary()" placeholder="0.00" style="padding:5px 6px; width:82px;"></td>
            `;
        }
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function recalcSaleSummary() {
    const birdInputs = document.querySelectorAll('.lift-birds');
    const wtInputs = document.querySelectorAll('.lift-wt');

    let totalPcs = 0;
    let totalWt = 0;

    birdInputs.forEach(inp => { totalPcs += Number(inp.value || 0); });
    wtInputs.forEach(inp => { totalWt += Number(inp.value || 0); });

    totalWt = Number(totalWt.toFixed(2));
    const avgBodyWt = totalPcs > 0 ? (totalWt / totalPcs).toFixed(3) : '0.000';

    const pcsEl = document.getElementById('saleTotalPcs');
    const wtEl = document.getElementById('saleTotalWeight');
    const avgEl = document.getElementById('saleAvgBodyWeight');

    if (pcsEl) pcsEl.value = totalPcs;
    if (wtEl) wtEl.value = totalWt.toFixed(2);
    if (avgEl) avgEl.value = avgBodyWt;
}

function collectLiftingRows() {
    const rows = [];
    for (let sl = 1; sl <= 48; sl++) {
        const bInp = document.querySelector(`.lift-birds[data-sl="${sl}"]`);
        const wInp = document.querySelector(`.lift-wt[data-sl="${sl}"]`);
        rows.push({
            slNo: sl,
            noOfBirds: bInp ? Number(bInp.value || 0) : 0,
            weightKg: wInp ? Number(wInp.value || 0) : 0
        });
    }
    return rows;
}

function autofillSaleFarmerDetails() {
    const fSel = document.getElementById('saleFarmer');
    if (!fSel) return;
    const opt = fSel.options[fSel.selectedIndex];
    const brInp = document.getElementById('saleBranch');
    const lsInp = document.getElementById('saleLsName');
    if (fSel.value && opt) {
        if (brInp) brInp.value = opt.getAttribute('data-branchname') || '';
        if (lsInp && !lsInp.value) lsInp.value = opt.getAttribute('data-supname') || '';
    } else if (brInp) {
        brInp.value = '';
    }
}

function populateSaleDropdowns(users, traders) {
    const supSel = document.getElementById('saleSupervisor');
    if (supSel) {
        supSel.innerHTML = '<option value="">-- Lifting Supervisor Chunein --</option>';
        users.forEach(u => {
            supSel.innerHTML += `<option value="${u._id}">${u.fullName} (${u.role})</option>`;
        });
    }

    const trSel = document.getElementById('saleTrader');
    if (trSel) {
        trSel.innerHTML = '<option value="">-- Trader Name Chunein --</option>';
        traders.forEach(t => {
            trSel.innerHTML += `<option value="${t._id}">${t.traderName} (${t.traderId})</option>`;
        });
    }

    const fSel = document.getElementById('saleFarmer');
    if (fSel && Array.isArray(allFarmers)) {
        fSel.innerHTML = '<option value="">-- Farmer Name Chunein --</option>';
        allFarmers.forEach(f => {
            const supName = f.supervisor && f.supervisor.fullName ? f.supervisor.fullName : '';
            const branchName = f.branch && f.branch.branchName ? f.branch.branchName : '';
            fSel.innerHTML += `<option value="${f._id}" data-supname="${supName}" data-branchname="${branchName}">${f.farmerName} (${f.farmerId})</option>`;
        });
    }
}

async function loadSaleEntries() {
    try {
        const res = await apiFetch('/api/sale');
        if (res.ok) {
            allSaleEntries = extractList(await res.json(), ['sales', 'entries']);
            renderSaleTable(allSaleEntries);
        }
    } catch (e) {
        console.log('Sale load error:', e);
    }
}

function renderSaleTable(list) {
    const tbody = document.getElementById('saleTableBody');
    if (!tbody) return;
    if (!Array.isArray(list) || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#64748b;">Koi sale entry nahi mili</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(s => `
        <tr>
            <td><b>${s.slNo || ''}</b></td>
            <td>${s.date ? new Date(s.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${s.partyName || 'N/A'}</td>
            <td>${s.farmerName || 'N/A'}</td>
            <td>${s.liftingSupervisorName || 'N/A'}</td>
            <td style="font-weight:600; color:#2563eb;">${s.totalPcs || 0}</td>
            <td style="font-weight:600; color:#059669;">${Number(s.totalWeightKg || 0).toFixed(2)} Kg</td>
            <td style="font-weight:700; color:#b45309;">${Number(s.avgBodyWeightKg || 0).toFixed(3)} Kg</td>
            <td>
                <button type="button" class="action-btn btn-approve" onclick="openSalePrintSheet('${s._id}')">Print</button>
                <button type="button" class="action-btn btn-delete" onclick="deleteSaleEntry('${s._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function resetSaleForm() {
    const form = document.getElementById('saleEntryForm');
    if (form) form.reset();
    const editId = document.getElementById('editSaleMongoId');
    if (editId) editId.value = '';
    const saveBtn = document.getElementById('saleSaveBtn');
    if (saveBtn) saveBtn.innerText = 'Save Sale Entry';
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('saleDate')) document.getElementById('saleDate').value = today;
    buildLiftingRows();
    recalcSaleSummary();
}

async function deleteSaleEntry(id) {
    if (!confirm('Kya aap is sale entry ko delete karna chahte hain?')) return;
    const res = await apiFetch(`/api/sale/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
        alert(data.message || 'Deleted');
        loadSaleEntries();
    } else {
        alert(data.error || 'Delete fail hua!');
    }
}

async function deleteRecord(url) {
    if (!confirm('Kya aap is record ko delete karna chahte hain?')) return;
    try {
        const res = await apiFetch(url, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || data.message || 'Delete fail hua!');
            return;
        }
        alert(data.message || 'Record delete ho gaya.');
        loadDropdownData();
        loadEntriesData();
        loadSaleEntries();
    } catch (e) {
        alert('Server Error!');
    }
}

function openSalePrintSheet(id) {
    const s = allSaleEntries.find(item => item._id === id);
    if (!s) return;

    const rowsMap = {};
    (s.rows || []).forEach(r => { rowsMap[r.slNo] = r; });

    let gridRowsHtml = '';
    for (let r = 0; r < 12; r++) {
        gridRowsHtml += '<tr>';
        for (let c = 0; c < 4; c++) {
            const sl = c * 12 + r + 1;
            const bVal = rowsMap[sl]?.noOfBirds ? rowsMap[sl].noOfBirds : '';
            const wVal = rowsMap[sl]?.weightKg ? Number(rowsMap[sl].weightKg).toFixed(2) : '';
            gridRowsHtml += `
                <td style="text-align:center; font-weight:600;">${sl}.</td>
                <td style="text-align:center;">${bVal}</td>
                <td style="text-align:right;">${wVal}</td>
            `;
        }
        gridRowsHtml += '</tr>';
    }

    const formattedDate = s.date ? new Date(s.date).toLocaleDateString('en-GB') : '';
    const html = `
        <div style="border:2px solid #be185d; padding:12px; background:#fff1f2; color:#111827; font-size:12px;">
            <div style="display:flex; justify-content:space-between; border-bottom:1.5px solid #9d174d; padding-bottom:6px; margin-bottom:8px;">
                <div><b>ASHIYANA NUTRITION</b></div>
                <div><b>BIRD LIFTING SHEET</b></div>
                <div><b>Sl. No.: ${s.slNo || ''}</b></div>
            </div>
            <div style="margin-bottom:8px;">
                <b>Date:</b> ${formattedDate} | <b>Party:</b> ${s.partyName || ''} | <b>Farmer:</b> ${s.farmerName || ''} | <b>Branch:</b> ${s.branchName || ''}
            </div>
            <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
                <tbody>${gridRowsHtml}</tbody>
            </table>
            <div>
                <b>Total Birds:</b> ${s.totalPcs || 0} | <b>Total Weight:</b> ${Number(s.totalWeightKg || 0).toFixed(2)} Kg | <b>Avg Weight:</b> ${Number(s.avgBodyWeightKg || 0).toFixed(3)} Kg
            </div>
        </div>
    `;

    const modal = document.getElementById('ledgerModal');
    const titleEl = document.getElementById('ledgerModalTitle');
    const bodyEl = document.getElementById('ledgerModalBody');
    if (titleEl) titleEl.textContent = `Bird Lifting Sheet — Sl. No. ${s.slNo || ''}`;
    if (bodyEl) bodyEl.innerHTML = html;
    if (modal) modal.style.display = 'flex';
}

// =========================================================
// REPORTS
// =========================================================
async function loadBranchReport() {
    const tbody = document.getElementById('branchReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading branch report...</td></tr>';

    const branchId = document.getElementById('reportBranchSelect')?.value || '';
    const url = branchId ? `/api/reports/branch?branchId=${encodeURIComponent(branchId)}` : '/api/reports/branch';
    try {
        const res = await apiFetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Branch report load nahi ho paya');

        const rows = extractList(data, ['report', 'branches']);
        tbody.innerHTML = rows.length ? rows.map(r => `
            <tr>
                <td>${r.branchName || r.name || '-'}</td>
                <td>${r.farmerCount ?? r.farmers ?? 0}</td>
                <td>${r.liveChicks ?? 0}</td>
                <td>${Number(r.closingFeedKg ?? r.closingFeed ?? 0).toFixed(2)} KG</td>
            </tr>
        `).join('') : '<tr><td colspan="4" style="text-align:center;">Koi report data nahi mila.</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#dc2626;">${err.message}</td></tr>`;
    }
}

async function loadSupervisorReport() {
    const tbody = document.getElementById('supervisorReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading supervisor report...</td></tr>';

    const supId = document.getElementById('reportSupSelect')?.value || '';
    const url = supId ? `/api/reports/supervisor?supervisorId=${encodeURIComponent(supId)}` : '/api/reports/supervisor';
    try {
        const res = await apiFetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Supervisor report load nahi ho paya');

        const rows = extractList(data, ['report', 'supervisors']);
        tbody.innerHTML = rows.length ? rows.map(r => `
            <tr>
                <td>${r.supervisorName || r.fullName || '-'}</td>
                <td>${r.branchName || '-'}</td>
                <td>${r.farmerCount ?? r.farmers ?? 0}</td>
                <td>${r.liveChicks ?? 0}</td>
            </tr>
        `).join('') : '<tr><td colspan="4" style="text-align:center;">Koi report data nahi mila.</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#dc2626;">${err.message}</td></tr>`;
    }
}

async function loadFarmerReport() {
    const tbody = document.getElementById('farmerReportBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading farmer report...</td></tr>';

    try {
        const res = await apiFetch('/api/reports/farmer');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.message || 'Farmer report load nahi ho paya');

        const rows = extractList(data, ['report', 'farmers']);
        tbody.innerHTML = rows.length ? rows.map(r => `
            <tr>
                <td>${r.farmerName || '-'}</td>
                <td>${r.branchName || '-'}</td>
                <td>${r.liveChicks ?? 0}</td>
                <td>${r.avgBodyWeightGram ?? r.avgBw ?? 0} g</td>
                <td>${Number(r.closingFeedKg ?? r.closingFeed ?? 0).toFixed(2)} KG</td>
                <td>${r.fcr ?? 0}</td>
            </tr>
        `).join('') : '<tr><td colspan="6" style="text-align:center;">Koi report data nahi mila.</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#dc2626;">${err.message}</td></tr>`;
    }
}

// =========================================================
// FORM SUBMIT BINDINGS
// =========================================================
function bindFormHandlers() {
    const bindPost = (formId, msgId, getUrl, buildBody, onSuccess) => {
        const form = document.getElementById(formId);
        if (!form || form.dataset.bound) return;
        form.dataset.bound = 'true';
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgEl = document.getElementById(msgId);
            try {
                if (msgEl) { msgEl.style.color = '#0f172a'; msgEl.textContent = 'Saving...'; }
                const res = await apiFetch(getUrl(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildBody())
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.message || 'Save fail hua');
                if (msgEl) { msgEl.style.color = '#059669'; msgEl.textContent = data.message || 'Saved successfully!'; }
                form.reset();
                setDefaultDates();
                if (typeof onSuccess === 'function') onSuccess();
            } catch (err) {
                if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = err.message; }
            }
        });
    };

    bindPost('branchForm', 'branchMsg', () => '/api/master/branch', () => ({
        branchId: document.getElementById('branchId')?.value?.trim(),
        branchName: document.getElementById('branchName')?.value?.trim(),
        address: document.getElementById('branchAddress')?.value?.trim()
    }), loadDropdownData);

    bindPost('userForm', 'userMsg', () => '/api/master/user', () => ({
        userId: document.getElementById('uId')?.value?.trim(),
        fullName: document.getElementById('uName')?.value?.trim(),
        password: document.getElementById('uPass')?.value,
        role: document.getElementById('uRole')?.value,
        branch: document.getElementById('uBranch')?.value || undefined,
        mobileNumber: document.getElementById('uMobile')?.value?.trim()
    }), loadDropdownData);

    bindPost('farmerForm', 'farmerMsg', () => '/api/master/farmer', () => ({
        supervisor: document.getElementById('fSup')?.value,
        branch: document.getElementById('fBranch')?.value,
        farmerName: document.getElementById('fName')?.value?.trim(),
        farmerId: document.getElementById('fId')?.value?.trim(),
        mobileNo: document.getElementById('fMobile')?.value?.trim(),
        address: document.getElementById('fAddress')?.value?.trim(),
        bankName: document.getElementById('fBank')?.value?.trim(),
        accountNo: document.getElementById('fAcc')?.value?.trim(),
        ifscCode: document.getElementById('fIfsc')?.value?.trim()
    }), loadDropdownData);

    bindPost('traderForm', 'traderMsg', () => '/api/master/trader', () => ({
        traderId: document.getElementById('tId')?.value?.trim(),
        traderName: document.getElementById('tName')?.value?.trim(),
        mobileNo: document.getElementById('tMobile')?.value?.trim(),
        address: document.getElementById('tAddress')?.value?.trim()
    }), loadDropdownData);

    bindPost('itemForm', 'itemMsg', () => '/api/master/item', () => ({
        itemId: document.getElementById('itemId')?.value?.trim(),
        itemName: document.getElementById('itemName')?.value?.trim(),
        category: document.getElementById('itemCategory')?.value?.trim(),
        unit: document.getElementById('itemUnit')?.value?.trim()
    }), loadDropdownData);

    bindPost('chicksForm', 'cpMsg', () => '/api/entry/chicks-placement', () => ({
        date: document.getElementById('cDate')?.value,
        farmer: document.getElementById('cFarmer')?.value,
        chicksQty: Number(document.getElementById('cQty')?.value || 0)
    }), loadEntriesData);

    bindPost('feedForm', 'fdMsg', () => '/api/entry/feed-dispatch', () => ({
        date: document.getElementById('feedDate')?.value,
        farmer: document.getElementById('feedFarmer')?.value,
        feedType: document.getElementById('feedType')?.value,
        qtyKg: Number(document.getElementById('qtyKg')?.value || 0)
    }), loadEntriesData);

    bindPost('dailyLogForm', 'dlMsg', () => '/api/entry/daily-entry', () => ({
        date: document.getElementById('dailyDate')?.value,
        farmer: document.getElementById('dailyFarmer')?.value,
        dayMortality: Number(document.getElementById('dayMortality')?.value || 0),
        dayFeedConsumeKg: Number(document.getElementById('dayFeedConsumeKg')?.value || 0),
        avgBodyWeightGram: Number(document.getElementById('avgBodyWeightGram')?.value || 0)
    }), loadEntriesData);

    bindPost('saleEntryForm', 'saleMsg', () => '/api/sale', () => ({
        slNo: document.getElementById('saleSlNo')?.value?.trim(),
        date: document.getElementById('saleDate')?.value,
        liftingSupervisor: document.getElementById('saleSupervisor')?.value || undefined,
        trader: document.getElementById('saleTrader')?.value || undefined,
        farmer: document.getElementById('saleFarmer')?.value || undefined,
        branchName: document.getElementById('saleBranch')?.value?.trim(),
        wtStartingTime: document.getElementById('wtStartTime')?.value,
        wtClosingTime: document.getElementById('wtCloseTime')?.value,
        driverName: document.getElementById('saleDriver')?.value?.trim(),
        vehicleNo: document.getElementById('saleVehicle')?.value?.trim(),
        rate: Number(document.getElementById('saleRate')?.value || 0),
        age: Number(document.getElementById('saleAge')?.value || 0),
        lsName: document.getElementById('saleLsName')?.value?.trim(),
        feedClosingStock: document.getElementById('saleFeedClosing')?.value?.trim(),
        birdStock: document.getElementById('saleBirdStock')?.value?.trim(),
        weakBirds: document.getElementById('saleWeakBirds')?.value?.trim(),
        totalPcs: Number(document.getElementById('saleTotalPcs')?.value || 0),
        totalWeightKg: Number(document.getElementById('saleTotalWeight')?.value || 0),
        avgBodyWeightKg: Number(document.getElementById('saleAvgBodyWeight')?.value || 0),
        rows: collectLiftingRows()
    }), () => {
        resetSaleForm();
        loadSaleEntries();
    });
}
