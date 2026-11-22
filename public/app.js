// =======================================================
// Broiler Management System - public/app.js
// =======================================================

let allSupervisors = [];
let allBranches = [];
let allFarmers = [];
let allTraders = [];
let allFeedDispatches = [];
let allSaleEntries = [];
let currentUser = null;

const SESSION_STORAGE_KEY = 'bms_session_v1';
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
let idleTimerId = null;
let sessionPollId = null;

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
    const name = document.getElementById('branchName').value.trim();
    if (name.length > 0 && !document.getElementById('editBranchId').value) {
        const prefix = name.substring(0, 3).toUpperCase();
        const rand = Math.floor(10 + Math.random() * 90);
        document.getElementById('branchId').value = `${prefix}-${rand}`;
    }
}

function generateFarmerId() {
    const farmerName = document.getElementById('fName').value.trim();
    const branchSelect = document.getElementById('fBranch');
    const selectedBranchText = branchSelect.selectedIndex > 0 ? branchSelect.options[branchSelect.selectedIndex].text : '';

    if (farmerName.length > 0 && selectedBranchText && !document.getElementById('editFarmerId').value) {
        let branchPrefix = "BR";
        if (selectedBranchText.includes('(')) {
            const match = selectedBranchText.match(/\(([^)]+)\)/);
            if (match) branchPrefix = match[1].split('-')[0].toUpperCase();
        }
        const namePrefix = farmerName.substring(0, 3).toUpperCase();
        const randNum = Math.floor(10 + Math.random() * 90);
        document.getElementById('fId').value = `${branchPrefix}-${namePrefix}-${randNum}`;
    }
}

async function loadDropdownData() {
    try {
        let users = [];
        const branchRes = await apiFetch('/api/master/branch');
        if (branchRes.ok) {
            allBranches = await branchRes.json();
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
            users = await userRes.json();
            allSupervisors = users.filter(u => u.role && u.role.toLowerCase() === 'supervisor');
            const supSelect = document.getElementById('fSup');
            if (supSelect) {
                supSelect.innerHTML = '<option value="">-- Supervisor Chunein --</option>';
                allSupervisors.forEach(s => {
                    let branchId = s.branch && s.branch._id ? s.branch._id : s.branch;
                    let branchNameStr = s.branch && s.branch.branchName ? ` [${s.branch.branchName}]` : '';
                    supSelect.innerHTML += `<option value="${s._id}" data-branch="${branchId}">${s.fullName} (${s.userId})${branchNameStr}</option>`;
                });
            }
            renderUserTable(users);
        }

        const farmerRes = await apiFetch('/api/master/farmer');
        if (farmerRes.ok) {
            allFarmers = await farmerRes.json();
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
            allTraders = await traderRes.json();
            renderTraderTable(allTraders);
        }

        populateSaleDropdowns(users, allTraders);

        const itemRes = await apiFetch('/api/master/item');
        if (itemRes.ok) {
            const items = await itemRes.json();
            renderItemTable(items);

            const feedTypeSelect = document.getElementById('feedType');
            if (feedTypeSelect) {
                feedTypeSelect.innerHTML = '<option value="">-- Feed Type Chunein --</option>';
                const feedItems = items.filter(i => i.category && i.category.toLowerCase() === 'feed');
                feedItems.forEach(item => {
                    feedTypeSelect.innerHTML += `<option value="${item.itemName}">${item.itemName} (${item.itemId})</option>`;
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
            const branches = await branchRes.json();
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
            const users = await userRes.json();
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

        if (placementRes.ok) renderChicksTable(await placementRes.json());

        let feeds = [];
        if (feedRes.ok) {
            feeds = await feedRes.json();
            allFeedDispatches = feeds;
            renderFeedTable(feeds);
        }

        if (dailyRes.ok) {
            const dailies = await dailyRes.json();
            renderDailyTable(dailies, feeds);
        }
    } catch (e) {
        console.log("Entries load error:", e);
    }
}

function calculateBags() {
    const qty = Number(document.getElementById('qtyKg').value) || 0;
    const bagsSpan = document.getElementById('bagCalcText');
    if (qty > 0) {
        const bags = (qty / 50).toFixed(2);
        bagsSpan.innerText = `= ${bags} Bags`;
    } else {
        bagsSpan.innerText = '';
    }
}

function renderBranchTable(branches) {
    const tbody = document.getElementById('branchTableBody');
    if (!tbody) return;
    tbody.innerHTML = branches.map(b => `
        <tr>
            <td>${b.branchId}</td><td>${b.branchName}</td><td>${b.address}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editBranch('${b._id}', '${b.branchId}', '${b.branchName}', '${b.address}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/master/branch/${b._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.userId}</td><td>${u.fullName}</td><td>${u.role}</td><td>${u.branch ? u.branch.branchName : 'N/A'}</td><td>${u.mobileNumber}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editUser('${u._id}', '${u.userId}', '${u.fullName}', '${u.role}', '${u.branch ? u.branch._id : ''}', '${u.mobileNumber}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/master/user/${u._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderFarmerTable(farmers) {
    const tbody = document.getElementById('farmerTableBody');
    if (!tbody) return;
    tbody.innerHTML = farmers.map(f => `
        <tr>
            <td>${f.farmerId}</td><td>${f.farmerName}</td><td>${f.supervisor ? f.supervisor.fullName : 'N/A'}</td><td>${f.branch ? f.branch.branchName : 'N/A'}</td><td>${f.mobileNo}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editFarmer('${f._id}', '${f.farmerId}', '${f.farmerName}', '${f.supervisor ? f.supervisor._id : ''}', '${f.branch ? f.branch._id : ''}', '${f.mobileNo}', '${f.address}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/master/farmer/${f._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderTraderTable(traders) {
    const tbody = document.getElementById('traderTableBody');
    if (!tbody) return;
    tbody.innerHTML = traders.map(t => `
        <tr>
            <td>${t.traderId}</td><td>${t.traderName}</td><td>${t.mobileNo}</td><td>${t.address}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editTrader('${t._id}', '${t.traderId}', '${t.traderName}', '${t.mobileNo}', '${t.address}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/master/trader/${t._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderItemTable(items) {
    const tbody = document.getElementById('itemTableBody');
    if (!tbody) return;
    tbody.innerHTML = items.map(i => `
        <tr>
            <td>${i.itemId}</td><td>${i.itemName}</td><td>${i.category}</td><td>${i.unit}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editItem('${i._id}', '${i.itemId}', '${i.itemName}', '${i.category}', '${i.unit}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/master/item/${i._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderChicksTable(placements) {
    const tbody = document.getElementById('chicksTableBody');
    if (!tbody) return;
    tbody.innerHTML = placements.map(p => `
        <tr>
            <td>${p.placementId}</td>
            <td>${p.date ? new Date(p.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${p.farmer ? p.farmer.farmerName : 'N/A'}</td>
            <td>${p.branch ? p.branch.branchName : 'N/A'}</td>
            <td>${p.chicksQty}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editPlacement('${p._id}', '${p.placementId}', '${p.date ? p.date.split('T')[0] : ''}', '${p.farmer ? p.farmer._id : ''}', '${p.chicksQty}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/entry/chicks-placement/${p._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

function renderFeedTable(feeds) {
    const tbody = document.getElementById('feedTableBody');
    if (!tbody) return;
    tbody.innerHTML = feeds.map(f => {
        const bags = (f.qtyKg / 50).toFixed(2);
        const isApproved = f.status === 'Approved';
        const statusBadge = isApproved ? `<span class="badge-approved">Approved</span>` : `<span class="badge-pending">Pending</span>`;
        const approveBtn = !isApproved ? `<button class="action-btn btn-approve" onclick="approveFeedDispatch('${f._id}')">Approve</button>` : '';

        return `
        <tr>
            <td>${f.challanNo}</td>
            <td>${f.date ? new Date(f.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${f.farmer ? f.farmer.farmerName : 'N/A'}</td>
            <td>${f.feedType}</td>
            <td>${f.qtyKg} KG</td>
            <td style="font-weight:600; color:#059669;">${bags} Bags</td>
            <td>${statusBadge}</td>
            <td>
                ${approveBtn}
                <button class="action-btn btn-edit" onclick="editFeed('${f._id}', '${f.challanNo}', '${f.date ? f.date.split('T')[0] : ''}', '${f.farmer ? f.farmer._id : ''}', '${f.feedType}', '${f.qtyKg}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/entry/feed-dispatch/${f._id}')">Delete</button>
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
            alert(data.message);
            loadEntriesData();
            if (typeof refreshActiveReportTab === 'function') refreshActiveReportTab();
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
            <td>${d.days}</td>
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
                <button class="action-btn btn-edit" onclick="editDaily('${d._id}', '${d.date ? d.date.split('T')[0] : ''}', '${farmerId || ''}', '${d.dayMortality}', '${d.dayFeedConsumeKg}', '${d.avgBodyWeightGram}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/entry/daily-entry/${d._id}')">Delete</button>
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
            const raw = await res.json();
            farmers = Array.isArray(raw) ? raw : (raw.farmers || raw.data || []);
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

        const list = Array.isArray(raw) ? raw : (raw.transfers || raw.data || []);
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

    birdInputs.forEach(inp => {
        totalPcs += Number(inp.value || 0);
    });
    wtInputs.forEach(inp => {
        totalWt += Number(inp.value || 0);
    });

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
    const opt = fSel.options[fSel.selectedIndex];
    const brInp = document.getElementById('saleBranch');
    const lsInp = document.getElementById('saleLsName');
    if (fSel && fSel.value && opt) {
        if (brInp) brInp.value = opt.getAttribute('data-branchname') || '';
        if (lsInp && !lsInp.value) lsInp.value = opt.getAttribute('data-supname') || '';
    } else {
        if (brInp) brInp.value = '';
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
            allSaleEntries = await res.json();
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
            <td><b>${s.slNo}</b></td>
            <td>${s.date ? new Date(s.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${s.partyName || 'N/A'}</td>
            <td>${s.farmerName || 'N/A'}</td>
            <td>${s.liftingSupervisorName || 'N/A'}</td>
            <td style="font-weight:600; color:#2563eb;">${s.totalPcs || 0}</td>
            <td style="font-weight:600; color:#059669;">${Number(s.totalWeightKg || 0).toFixed(2)} Kg</td>
            <td style="font-weight:700; color:#b45309;">${Number(s.avgBodyWeightKg || 0).toFixed(3)} Kg</td>
            <td>
                <button type="button" class="action-btn btn-approve" onclick="openSalePrintSheet('${s._id}')">Print</button>
                <button type="button" class="action-btn btn-edit" onclick="editSaleEntry('${s._id}')">Edit</button>
                <button type="button" class="action-btn btn-delete" onclick="deleteSaleEntry('${s._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function resetSaleForm() {
    const form = document.getElementById('saleEntryForm');
    if (form) form.reset();
    document.getElementById('editSaleMongoId').value = '';
    if (document.getElementById('saleSaveBtn')) {
        document.getElementById('saleSaveBtn').innerText = 'Save Sale Entry';
    }
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('saleDate')) document.getElementById('saleDate').value = today;
    buildLiftingRows();
    recalcSaleSummary();
}

function editSaleEntry(id) {
    const s = allSaleEntries.find(item => item._id === id);
    if (!s) return;

    document.getElementById('editSaleMongoId').value = s._id;
    document.getElementById('saleSlNo').value = s.slNo || '';
    document.getElementById('saleDate').value = s.date ? s.date.split('T')[0] : '';
    document.getElementById('saleSupervisor').value = s.liftingSupervisor || '';
    document.getElementById('saleTrader').value = s.trader || '';
    document.getElementById('saleFarmer').value = s.farmer || '';
    autofillSaleFarmerDetails();
    document.getElementById('wtStartTime').value = s.wtStartingTime || '';
    document.getElementById('wtCloseTime').value = s.wtClosingTime || '';
    document.getElementById('saleDriver').value = s.driverName || '';
    document.getElementById('saleVehicle').value = s.vehicleNo || '';
    document.getElementById('saleRate').value = s.rate || '';
    document.getElementById('saleAge').value = s.age || '';
    document.getElementById('saleLsName').value = s.lsName || '';
    document.getElementById('saleFeedClosing').value = s.feedClosingStock || '';
    document.getElementById('saleBirdStock').value = s.birdStock || '';
    document.getElementById('saleWeakBirds').value = s.weakBirds || '';

    buildLiftingRows();
    (s.rows || []).forEach(r => {
        const bInp = document.querySelector(`.lift-birds[data-sl="${r.slNo}"]`);
        const wInp = document.querySelector(`.lift-wt[data-sl="${r.slNo}"]`);
        if (bInp && r.noOfBirds) bInp.value = r.noOfBirds;
        if (wInp && r.weightKg) wInp.value = r.weightKg;
    });

    recalcSaleSummary();
    if (document.getElementById('saleSaveBtn')) {
        document.getElementById('saleSaveBtn').innerText = 'Update Sale Entry';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteSaleEntry(id) {
    if (!confirm('Kya aap is sale entry ko delete karna chahte hain?')) return;
    const res = await apiFetch(`/api/sale/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
        alert(data.message);
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
    const printArea = document.getElementById('liftingPrintableArea');
    if (!s || !printArea) return;

    const rowsMap = {};
    (s.rows || []).forEach(r => { rowsMap[r.slNo] = r; });

    const colTotals = [0, 1, 2, 3].map(c => {
        let pcs = 0, wt = 0;
        for (let r = 0; r < 12; r++) {
            const sl = c * 12 + r + 1;
            pcs += Number(rowsMap[sl]?.noOfBirds || 0);
            wt += Number(rowsMap[sl]?.weightKg || 0);
        }
        return { pcs, wt: Number(wt.toFixed(2)) };
    });

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

    const colTotalRowHtml = `
        <tr style="font-weight:700; background:#ffe4ec;">
            ${[0, 1, 2, 3].map(c => `
                <td style="text-align:center;">Total</td>
                <td style="text-align:center;">${colTotals[c].pcs || ''}</td>
                <td style="text-align:right;">${colTotals[c].wt ? colTotals[c].wt.toFixed(2) : ''}</td>
            `).join('')}
        </tr>
    `;

    const formattedDate = s.date ? new Date(s.date).toLocaleDateString('en-GB') : '';

    printArea.innerHTML = `
        <div id="sheetPaper" style="background:#ffb6c8; color:#111827; border:2px solid #be185d; padding:12px; font-family:'Segoe UI', Arial, sans-serif; font-size:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1.5px solid #9d174d; padding-bottom:6px; margin-bottom:8px;">
                <div style="font-weight:800; font-size:15px; color:#831843;">
                    ASHIYANA<br><span style="font-size:10px; letter-spacing:1px;">NUTRITION</span>
                </div>
                <div style="text-align:center; flex:1;">
                    <div style="font-size:11px; font-weight:600;">(Commercial Broiler Farm Division)</div>
                    <div style="font-size:10.5px;">Ward No. 10, Basmata, Satsang Road, Near Petrol Pump, Po. + Ps. Deoghar, Dist. B. Deoghar (Jharkhand)-814116</div>
                    <div style="font-size:15px; font-weight:800; margin-top:2px; text-decoration:underline;">BIRD LIFTING SHEET CUM INVOICE</div>
                </div>
                <div style="text-align:right; font-weight:800; font-size:13px; color:#831843;">
                    Sl. No. <span style="font-size:16px; border-bottom:1.5px solid #831843; padding:0 6px;">${s.slNo || ''}</span>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1.25fr 1fr; gap:8px; margin-bottom:8px;">
                <div style="border:1px solid #9d174d; padding:6px 8px; background:rgba(255,255,255,0.45);">
                    <div style="margin-bottom:4px;"><b>Name of the Party:</b> <span style="font-size:13.5px; font-weight:700;">${s.partyName || ''}</span></div>
                    <div><b>Name of the Farmer:</b> <span style="font-size:13.5px; font-weight:700;">${s.farmerName || ''}</span></div>
                </div>
                <div style="border:1px solid #9d174d; padding:6px 8px; background:rgba(255,255,255,0.45); display:grid; grid-template-columns:1fr 1fr; gap:3px 8px; font-size:11px;">
                    <div><b>Date:</b> ${formattedDate}</div>
                    <div><b>Branch:</b> ${s.branchName || ''}</div>
                    <div><b>Wt. Starting Time:</b> ${s.wtStartingTime || ''}</div>
                    <div><b>Rate:</b> ${s.rate || ''}</div>
                    <div><b>Wt. Closing Time:</b> ${s.wtClosingTime || ''}</div>
                    <div><b>Age:</b> ${s.age || ''}</div>
                    <div><b>Driver Name:</b> ${s.driverName || ''}</div>
                    <div><b>L.S. Name:</b> ${s.lsName || ''}</div>
                    <div style="grid-column:span 2;"><b>Vehicles No.:</b> ${s.vehicleNo || ''} | <b>Lifting Supervisor:</b> ${s.liftingSupervisorName || ''}</div>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; background:rgba(255,255,255,0.65); font-size:11px; margin-bottom:8px;">
                <thead>
                    <tr style="background:#f9a8d4;">
                        <th style="border:1px solid #9d174d; padding:3px;">Sl. No.</th>
                        <th style="border:1px solid #9d174d; padding:3px;">No. of Birds</th>
                        <th style="border:1px solid #9d174d; padding:3px;">Weight Kg</th>
                        <th style="border:1px solid #9d174d; padding:3px;">Sl. No.</th>
                        <th style="border:1px solid #9d174d; padding:3px;">No. of Birds</th>
                        <th style="border:1px solid #9d174d; padding:3px;">Weight Kg</th>
                        <th style="border:1px solid #9d174d; padding:3px;">Sl. No.</th>
                        <th style="border:1px solid #9d174d; padding:3px;">No. of Birds</th>
                        <th style="border:1px solid #9d174d; padding:3px;">Weight Kg</th>
                        <th style="border:1px solid #9d174d; padding:3px;">Sl. No.</th>
                        <th style="border:1px solid #9d174d; padding:3px;">No. of Birds</th>
                        <th style="border:1px solid #9d174d; padding:3px;">Weight Kg</th>
                    </tr>
                </thead>
                <tbody>
                    ${gridRowsHtml}
                    ${colTotalRowHtml}
                </tbody>
            </table>

            <div style="display:grid; grid-template-columns:1.1fr 1fr; gap:10px; align-items:end; border-top:1.5px solid #9d174d; padding-top:8px;">
                <div style="font-weight:800; font-size:13px; line-height:1.7;">
                    <div>Total Birds: ${s.totalPcs || 0} Pcs</div>
                    <div>Total Weight: ${Number(s.totalWeightKg || 0).toFixed(2)} Kg</div>
                    <div>Avg. Body Weight: ${Number(s.avgBodyWeightKg || 0).toFixed(3)} Kg</div>
                </div>
                <div style="font-size:11.5px; line-height:1.7; text-align:right;">
                    <div><b>Feed Closing Stock:</b> ${s.feedClosingStock || ''}</div>
                    <div><b>Bird Stock:</b> ${s.birdStock || ''}</div>
                    <div><b>Weak Birds:</b> ${s.weakBirds || ''}</div>
                </div>
            </div>
        </div>
    `;

    const modal = document.getElementById('ledgerModal');
    const titleEl = document.getElementById('ledgerModalTitle');
    const bodyEl = document.getElementById('ledgerModalBody');
    if (titleEl) titleEl.textContent = `Bird Lifting Sheet — Sl. No. ${s.slNo || ''}`;
    if (bodyEl) {
        bodyEl.innerHTML = printArea.innerHTML;
    }
    if (modal) modal.style.display = 'flex';
}
