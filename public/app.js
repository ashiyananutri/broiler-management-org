let allSupervisors = [];
let allBranches = [];
let allFarmers = [];
let currentUser = null;

window.addEventListener('DOMContentLoaded', () => {
    loadDropdownData();
    loadEntriesData();
    setDefaultDates();
    loadReportDropdowns();
});

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    ['cDate', 'feedDate', 'dailyDate'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = today;
    });
}

function generateBranchCode() {
    const name = document.getElementById('branchName').value.trim();
    if(name.length > 0 && !document.getElementById('editBranchId').value) {
        const prefix = name.substring(0, 3).toUpperCase();
        const rand = Math.floor(10 + Math.random() * 90);
        document.getElementById('branchId').value = `${prefix}-${rand}`;
    }
}

function generateFarmerId() {
    const farmerName = document.getElementById('fName').value.trim();
    const branchSelect = document.getElementById('fBranch');
    const selectedBranchText = branchSelect.selectedIndex > 0 ? branchSelect.options[branchSelect.selectedIndex].text : '';
    
    if(farmerName.length > 0 && selectedBranchText && !document.getElementById('editFarmerId').value) {
        let branchPrefix = "BR";
        if(selectedBranchText.includes('(')) {
            const match = selectedBranchText.match(/\(([^)]+)\)/);
            if(match) branchPrefix = match[1].split('-')[0].toUpperCase();
        }
        const namePrefix = farmerName.substring(0, 3).toUpperCase();
        const randNum = Math.floor(10 + Math.random() * 90);
        document.getElementById('fId').value = `${branchPrefix}-${namePrefix}-${randNum}`;
    }
}

async function loadDropdownData() {
    try {
        const branchRes = await fetch('/api/master/branch');
        allBranches = await branchRes.json();
        const branchSelects = [document.getElementById('uBranch'), document.getElementById('fBranch')];
        branchSelects.forEach(select => {
            if(select) {
                select.innerHTML = '<option value="">-- Branch Chunein --</option>';
                allBranches.forEach(b => {
                    select.innerHTML += `<option value="${b._id}">${b.branchName} (${b.branchId})</option>`;
                });
            }
        });
        renderBranchTable(allBranches);

        const userRes = await fetch('/api/master/user');
        if(userRes.ok) {
            const users = await userRes.json();
            allSupervisors = users.filter(u => u.role && u.role.toLowerCase() === 'supervisor');
            const supSelect = document.getElementById('fSup');
            if(supSelect) {
                supSelect.innerHTML = '<option value="">-- Supervisor Chunein --</option>';
                allSupervisors.forEach(s => {
                    let branchId = s.branch && s.branch._id ? s.branch._id : s.branch;
                    let branchNameStr = s.branch && s.branch.branchName ? ` [${s.branch.branchName}]` : '';
                    supSelect.innerHTML += `<option value="${s._id}" data-branch="${branchId}">${s.fullName} (${s.userId})${branchNameStr}</option>`;
                });
            }
            renderUserTable(users);
        }

        const farmerRes = await fetch('/api/master/farmer');
        if(farmerRes.ok) {
            allFarmers = await farmerRes.json();
            const farmerSelects = [
                document.getElementById('cFarmer'),
                document.getElementById('feedFarmer'),
                document.getElementById('dailyFarmer')
            ];
            farmerSelects.forEach(farmerSelect => {
                if(farmerSelect) {
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
        }

        const traderRes = await fetch('/api/master/trader');
        if(traderRes.ok) renderTraderTable(await traderRes.json());

        const itemRes = await fetch('/api/master/item');
        if(itemRes.ok) {
            const items = await itemRes.json();
            renderItemTable(items);

            const feedTypeSelect = document.getElementById('feedType');
            if(feedTypeSelect) {
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
        const branchRes = await fetch('/api/master/branch');
        if(branchRes.ok) {
            const branches = await branchRes.json();
            const bSelect = document.getElementById('reportBranchSelect');
            if(bSelect) {
                bSelect.innerHTML = '<option value="">-- Sabhi Branches --</option>';
                branches.forEach(b => {
                    bSelect.innerHTML += `<option value="${b._id}">${b.branchName}</option>`;
                });
            }
        }

        const userRes = await fetch('/api/master/user');
        if(userRes.ok) {
            const users = await userRes.json();
            const supervisors = users.filter(u => u.role && u.role.toLowerCase() === 'supervisor');
            const sSelect = document.getElementById('reportSupSelect');
            if(sSelect) {
                sSelect.innerHTML = '<option value="">-- Sabhi Supervisors --</option>';
                supervisors.forEach(s => {
                    sSelect.innerHTML += `<option value="${s._id}">${s.fullName} (${s.userId})</option>`;
                });
            }
        }
    } catch(e) {
        console.log("Report dropdown error:", e);
    }
}

async function loadEntriesData() {
    try {
        const placementRes = await fetch('/api/entry/chicks-placement');
        if(placementRes.ok) renderChicksTable(await placementRes.json());

        const feedRes = await fetch('/api/entry/feed-dispatch');
        if(feedRes.ok) renderFeedTable(await feedRes.json());

        const dailyRes = await fetch('/api/entry/daily-entry');
        if(dailyRes.ok) renderDailyTable(await dailyRes.json());
    } catch (e) {
        console.log("Entries load error:", e);
    }
}

function calculateBags() {
    const qty = Number(document.getElementById('qtyKg').value) || 0;
    const bagsSpan = document.getElementById('bagCalcText');
    if(qty > 0) {
        const bags = (qty / 50).toFixed(2);
        bagsSpan.innerText = `= ${bags} Bags`;
    } else {
        bagsSpan.innerText = '';
    }
}

function renderBranchTable(branches) {
    const tbody = document.getElementById('branchTableBody');
    if(!tbody) return;
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
    if(!tbody) return;
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
    if(!tbody) return;
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
    if(!tbody) return;
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
    if(!tbody) return;
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
    if(!tbody) return;
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
    if(!tbody) return;
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
    if(!confirm("Kya aap is feed dispatch ko approve karna chahte hain?")) return;
    try {
        const res = await fetch(`/api/entry/feed-dispatch/approve/${id}`, { method: 'PUT' });
        const data = await res.json();
        if(res.ok) { 
            alert(data.message); 
            loadEntriesData(); 
            refreshActiveReportTab();
        } else { 
            alert(data.error || "Approval fail ho gaya!"); 
        }
    } catch(e) { alert("Server Error!"); }
}

function renderDailyTable(entries) {
    const tbody = document.getElementById('dailyTableBody');
    if(!tbody) return;
    tbody.innerHTML = entries.map(d => `
        <tr>
            <td>${d.date ? new Date(d.date).toLocaleDateString('en-GB') : ''}</td>
            <td>${d.farmer ? d.farmer.farmerName : 'N/A'}</td>
            <td>${d.days}</td>
            <td style="font-weight:600; color:#3b82f6;">${d.totalPlacementChicks || 0}</td>
            <td>${d.dayMortality || 0}</td>
            <td style="color:#ef4444; font-weight:600;">${d.totalMortality || 0} (${d.mortalityPercentage || 0}%)</td>
            <td style="color:#10b981; font-weight:600;">${d.currentLiveChicks || 0}</td>
            <td>${d.avgBodyWeightGram || 0} g</td>
            <td style="font-weight:600; color:#2563eb;">${d.totalBodyWeightKg || 0} KG</td>
            <td>${d.totalFeedConsumeKg || 0} KG</td>
            <td style="font-weight:bold;">${d.fcr || 0}</td>
            <td>
                <button class="action-btn btn-edit" onclick="editDaily('${d._id}', '${d.date ? d.date.split('T')[0] : ''}', '${d.farmer ? d.farmer._id : ''}', '${d.dayMortality}', '${d.dayFeedConsumeKg}', '${d.avgBodyWeightGram}')">Edit</button>
                <button class="action-btn btn-delete" onclick="deleteRecord('/api/entry/daily-entry/${d._id}')">Delete</button>
            </td>
        </tr>`).join('');
}

// --- REPORT LOADERS WITH TOTALS & CLICKABLE LEDGER ---
function loadReportData(type) {
    if(type === 'branch') {
        const branchId = document.getElementById('reportBranchSelect').value;
        fetch(`/api/reports/branch-wise?branchId=${branchId}`)
            .then(res => res.json())
            .then(data => renderReportTable(data, 'branchReportTableBody', 'branchReportTableFoot', false));
    } else if(type === 'supervisor') {
        const supervisorId = document.getElementById('reportSupSelect').value;
        fetch(`/api/reports/supervisor-wise?supervisorId=${supervisorId}`)
            .then(res => res.json())
            .then(data => renderReportTable(data, 'supervisorReportTableBody', 'supervisorReportTableFoot', false));
    } else if(type === 'farmer') {
        fetch('/api/reports/farmer-wise')
            .then(res => res.json())
            .then(data => renderReportTable(data, 'farmerReportTableBody', 'farmerReportTableFoot', true));
    }
}

function renderReportTable(data, tbodyId, tfootId, isFarmerWise) {
    const tbody = document.getElementById(tbodyId);
    const tfoot = document.getElementById(tfootId);

    if(data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#64748b;">Koi data nahi mila</td></tr>`;
        tfoot.innerHTML = '';
        return;
    }

    let totPlacement = 0, totMortality = 0, totLive = 0, totWeight = 0, totFeed = 0;

    tbody.innerHTML = data.map(r => {
        totPlacement += (r.totalPlacementChicks || 0);
        totMortality += (r.totalMortality || 0);
        totLive += (r.currentLiveChicks || 0);
        totWeight += (r.totalBodyWeightKg || 0);
        totFeed += (r.totalFeedConsumeKg || 0);

        let farmerCol = isFarmerWise 
            ? `<a href="#" onclick="openFarmerLedger('${r.farmerMongoId}', '${r.farmerName}', '${r.farmerId}')" style="color:#2563eb; font-weight:bold; text-decoration:underline;">${r.farmerName} (${r.farmerId})</a>`
            : `<b>${r.farmerName}</b> (${r.farmerId})`;

        return `
            <tr>
                <td>${farmerCol}</td>
                <td>${r.branchName}</td>
                <td>${r.supervisorName}</td>
                <td>${r.age} Days</td>
                <td style="color:#2563eb; font-weight:600;">${r.totalPlacementChicks}</td>
                <td style="color:#ef4444; font-weight:600;">${r.totalMortality} (${r.mortalityPercentage}%)</td>
                <td style="color:#10b981; font-weight:600;">${r.currentLiveChicks}</td>
                <td>${r.avgBodyWeightGram} g</td>
                <td style="color:#2563eb; font-weight:600;">${r.totalBodyWeightKg} KG</td>
                <td>${r.totalFeedConsumeKg} KG</td>
                <td style="font-weight:bold;">${r.fcr}</td>
            </tr>
        `;
    }).join('');

    tfoot.innerHTML = `
        <tr>
            <td colspan="4" style="text-align:right;">GRAND TOTAL:</td>
            <td style="color:#2563eb;">${totPlacement}</td>
            <td style="color:#ef4444;">${totMortality}</td>
            <td style="color:#10b981;">${totLive}</td>
            <td>-</td>
            <td style="color:#2563eb;">${totWeight.toFixed(2)} KG</td>
            <td>${totFeed.toFixed(2)} KG</td>
            <td>-</td>
        </tr>
    `;
}

// --- FARMER LEDGER MODAL LOGIC ---
async function openFarmerLedger(farmerMongoId, farmerName, farmerId) {
    try {
        const res = await fetch(`/api/reports/farmer-ledger/${farmerMongoId}`);
        const data = await res.json();
        
        document.getElementById('modalFarmerTitle').innerText = `Ledger History: ${farmerName} (${farmerId})`;
        document.getElementById('modalFarmerInfo').innerHTML = `
            <b>Branch:</b> ${data.farmer.branch ? data.farmer.branch.branchName : 'N/A'} | 
            <b>Supervisor:</b> ${data.farmer.supervisor ? data.farmer.supervisor.fullName : 'N/A'} | 
            <b>Mobile:</b> ${data.farmer.mobileNo || 'N/A'}
        `;

        const tbody = document.getElementById('modalLedgerBody');
        if(data.entries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Koi daily log entry nahi mili</td></tr>`;
        } else {
            tbody.innerHTML = data.entries.map(e => `
                <tr>
                    <td>${new Date(e.date).toLocaleDateString('en-GB')}</td>
                    <td>${e.days} Days</td>
                    <td>${e.dayMortality}</td>
                    <td style="color:#ef4444;">${e.totalMortality} (${e.mortalityPercentage}%)</td>
                    <td style="color:#10b981; font-weight:600;">${e.currentLiveChicks}</td>
                    <td>${e.avgBodyWeightGram || 0} g</td>
                    <td style="font-weight:600; color:#2563eb;">${e.totalBodyWeightKg || 0} KG</td>
                    <td>${e.totalFeedConsumeKg || 0} KG</td>
                    <td style="font-weight:bold;">${e.fcr || 0}</td>
                </tr>
            `).join('');
        }

        document.getElementById('ledgerModal').style.display = 'flex';
    } catch(e) {
        alert("Farmer ledger load karne me error aayi!");
    }
}

function closeLedgerModal() {
    document.getElementById('ledgerModal').style.display = 'none';
}

// --- EXPORT TO EXCEL ---
function exportTableToExcel(tableId, filename = 'report') {
    const table = document.getElementById(tableId);
    const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

// --- EXPORT TO PDF ---
function exportTableToPDF(title, tableId) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, 14, 22);

    doc.autoTable({
        html: `#${tableId}`,
        startY: 28,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
}

// --- EDIT & DELETE HELPERS ---
function editBranch(id, branchId, branchName, address) {
    if(!checkMasterPermission()) return;
    document.getElementById('editBranchId').value = id;
    document.getElementById('branchId').value = branchId;
    document.getElementById('branchName').value = branchName;
    document.getElementById('branchAddress').value = address;
    document.getElementById('branchSaveBtn').innerText = "Update Branch";
}

function editUser(id, userId, fullName, role, branchId, mobile) {
    if(!checkMasterPermission()) return;
    document.getElementById('editUserId').value = id;
    document.getElementById('uId').value = userId;
    document.getElementById('uName').value = fullName;
    document.getElementById('uRole').value = role;
    document.getElementById('uBranch').value = branchId;
    document.getElementById('uMobile').value = mobile;
    document.getElementById('userSaveBtn').innerText = "Update User";
}

function editFarmer(id, farmerId, farmerName, supervisorId, branchId, mobile, address) {
    if(!checkMasterPermission()) return;
    document.getElementById('editFarmerId').value = id;
    document.getElementById('fId').value = farmerId;
    document.getElementById('fName').value = farmerName;
    document.getElementById('fSup').value = supervisorId;
    document.getElementById('fBranch').value = branchId;
    document.getElementById('fMobile').value = mobile;
    document.getElementById('fAddress').value = address;
    document.getElementById('farmerSaveBtn').innerText = "Update Farmer";
}

function editTrader(id, traderId, traderName, mobile, address) {
    if(!checkMasterPermission()) return;
    document.getElementById('editTraderMongoId').value = id;
    document.getElementById('tId').value = traderId;
    document.getElementById('tName').value = traderName;
    document.getElementById('tMobile').value = mobile;
    document.getElementById('tAddress').value = address;
    document.getElementById('traderSaveBtn').innerText = "Update Trader";
}

function editItem(id, itemId, itemName, category, unit) {
    if(!checkMasterPermission()) return;
    document.getElementById('editItemMongoId').value = id;
    document.getElementById('iId').value = itemId;
    document.getElementById('iName').value = itemName;
    document.getElementById('iCat').value = category;
    document.getElementById('iUnit').value = unit;
    document.getElementById('itemSaveBtn').innerText = "Update Item";
}

function editPlacement(id, placementId, date, farmerId, qty) {
    if(!checkMasterPermission()) return;
    document.getElementById('editPlacementMongoId').value = id;
    document.getElementById('cPlacementId').value = placementId;
    document.getElementById('cDate').value = date;
    document.getElementById('cFarmer').value = farmerId;
    autofillChicksDetails();
    document.getElementById('cQty').value = qty;
    document.getElementById('chicksSaveBtn').innerText = "Update Placement";
}

function editFeed(id, challanNo, date, farmerId, feedType, qty) {
    if(!checkMasterPermission()) return;
    document.getElementById('editFeedMongoId').value = id;
    document.getElementById('challanNo').value = challanNo;
    document.getElementById('feedDate').value = date;
    document.getElementById('feedFarmer').value = farmerId;
    autofillFeedDetails();
    document.getElementById('feedType').value = feedType;
    document.getElementById('qtyKg').value = qty;
    calculateBags();
    document.getElementById('feedSaveBtn').innerText = "Update Feed";
}

function editDaily(id, date, farmerId, mort, feed, bw) {
    if(!checkMasterPermission()) return;
    document.getElementById('editDailyMongoId').value = id;
    document.getElementById('dailyDate').value = date;
    document.getElementById('dailyFarmer').value = farmerId;
    autofillDailyDetails();
    document.getElementById('dMort').value = mort;
    document.getElementById('dFeed').value = feed;
    document.getElementById('dBw').value = bw !== 'undefined' ? bw : '';
    document.getElementById('dailySaveBtn').innerText = "Update Daily Log";
}

function checkMasterPermission() {
    if (!currentUser) { alert("Pehle Login Karein!"); return false; }
    const role = currentUser.role ? currentUser.role.toLowerCase() : '';
    if (role !== 'admin' && role !== 'accountant') {
        alert("Access Denied: Sirf Admin aur Accountant hi Edit/Delete kar sakte hain!");
        return false;
    }
    return true;
}

async function deleteRecord(url) {
    if(!checkMasterPermission()) return;
    if(!confirm("Kya aap ise delete karna chahte hain?")) return;
    try {
        const res = await fetch(url, { method: 'DELETE' });
        const data = await res.json();
        if(res.ok) { 
            alert(data.message); 
            loadDropdownData(); 
            loadEntriesData(); 
            refreshActiveReportTab();
        } else { 
            alert(data.error || "Delete fail ho gaya!"); 
        }
    } catch(e) { alert("Server error!"); }
}

function autofillBranchFromSupervisor() {
    const supSelect = document.getElementById('fSup');
    const selectedOption = supSelect.options[supSelect.selectedIndex];
    const branchId = selectedOption.getAttribute('data-branch');
    const branchDropdown = document.getElementById('fBranch');
    if(branchId) { branchDropdown.value = branchId; generateFarmerId(); }
    else { branchDropdown.value = ""; }
}

function autofillChicksDetails() {
    const farmerSelect = document.getElementById('cFarmer');
    const selectedOption = farmerSelect.options[farmerSelect.selectedIndex];
    if(farmerSelect && farmerSelect.value) {
        document.getElementById('cSupName').value = selectedOption.getAttribute('data-supname');
        document.getElementById('cBranchName').value = selectedOption.getAttribute('data-branchname');
        if(!document.getElementById('editPlacementMongoId').value) {
            const farmerCode = selectedOption.getAttribute('data-farmerid');
            const branchCode = selectedOption.getAttribute('data-branchcode').split('-')[0];
            const rand = Math.floor(10 + Math.random() * 90);
            document.getElementById('cPlacementId').value = `PLC-${branchCode}-${farmerCode}-${rand}`;
        }
    } else {
        document.getElementById('cSupName').value = '';
        document.getElementById('cBranchName').value = '';
        if(!document.getElementById('editPlacementMongoId').value) document.getElementById('cPlacementId').value = '';
    }
}

function autofillFeedDetails() {
    const farmerSelect = document.getElementById('feedFarmer');
    const selectedOption = farmerSelect.options[farmerSelect.selectedIndex];
    if(farmerSelect && farmerSelect.value) {
        document.getElementById('feedSupName').value = selectedOption.getAttribute('data-supname');
        document.getElementById('feedBranchName').value = selectedOption.getAttribute('data-branchname');
    } else {
        document.getElementById('feedSupName').value = '';
        document.getElementById('feedBranchName').value = '';
    }
}

function autofillDailyDetails() {
    const farmerSelect = document.getElementById('dailyFarmer');
    const selectedOption = farmerSelect.options[farmerSelect.selectedIndex];
    if(farmerSelect && farmerSelect.value) {
        document.getElementById('dailySupName').value = selectedOption.getAttribute('data-supname');
        document.getElementById('dailyBranchName').value = selectedOption.getAttribute('data-branchname');
    } else {
        document.getElementById('dailySupName').value = '';
        document.getElementById('dailyBranchName').value = '';
    }
}

function toggleSubMenu(element) {
    element.parentElement.classList.toggle('open');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('backdrop');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('active');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

// --- AUTO-HIDE SIDEBAR & AUTO-REFRESH REPORTS ON TAB SWITCH ---
function switchTab(tabId, element) {
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');

    if(tabId === 'branchReportTab') loadReportData('branch');
    if(tabId === 'supervisorReportTab') loadReportData('supervisor');
    if(tabId === 'farmerReportTab') loadReportData('farmer');

    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('backdrop');
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('active');
    } else {
        sidebar.classList.add('collapsed');
    }
}

// --- REFRESH ACTIVE REPORT HELPER ---
function refreshActiveReportTab() {
    if(document.getElementById('branchReportTab').classList.contains('active')) {
        loadReportData('branch');
    } else if(document.getElementById('supervisorReportTab').classList.contains('active')) {
        loadReportData('supervisor');
    } else if(document.getElementById('farmerReportTab').classList.contains('active')) {
        loadReportData('farmer');
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('loginUserId').value;
    const password = document.getElementById('loginPassword').value;
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, password })
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('userDisplayName').innerText = currentUser.fullName;
            document.getElementById('userRoleBadge').innerText = currentUser.role + " | " + currentUser.userId;
            document.getElementById('avatarIcon').innerText = currentUser.fullName.charAt(0).toUpperCase();
        } else {
            document.getElementById('loginMsg').style.color = '#ef4444';
            document.getElementById('loginMsg').innerText = data.error || "Login Failed!";
        }
    } catch (err) {
        document.getElementById('loginMsg').innerText = "Server Error!";
    }
});

function logout() { location.reload(); }

async function sendPost(url, data, msgId, formId) {
    const msgEl = document.getElementById(msgId);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if(res.ok) {
            msgEl.style.color = '#10b981';
            msgEl.innerText = result.message || "Saved Successfully!";
            if(formId) {
                document.getElementById(formId).reset();
                setDefaultDates();
                const bagSpan = document.getElementById('bagCalcText');
                if(bagSpan) bagSpan.innerText = '';
            }
            loadDropdownData();
            loadEntriesData();
            refreshActiveReportTab();
        } else {
            msgEl.style.color = '#ef4444';
            msgEl.innerText = result.error || "Error occurred!";
        }
    } catch (e) {
        msgEl.style.color = '#ef4444';
        msgEl.innerText = "Network Error!";
    }
}

async function sendPut(url, data, msgId, formId, saveBtnId, defaultBtnText, editInputId) {
    const msgEl = document.getElementById(msgId);
    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if(res.ok) {
            msgEl.style.color = '#10b981';
            msgEl.innerText = result.message || "Updated Successfully!";
            if(formId) document.getElementById(formId).reset();
            if(editInputId) document.getElementById(editInputId).value = '';
            if(saveBtnId) document.getElementById(saveBtnId).innerText = defaultBtnText;
            const bagSpan = document.getElementById('bagCalcText');
            if(bagSpan) bagSpan.innerText = '';
            loadDropdownData();
            loadEntriesData();
            refreshActiveReportTab();
        } else {
            msgEl.style.color = '#ef4444';
            msgEl.innerText = result.error || "Update error!";
        }
    } catch(e) {
        msgEl.style.color = '#ef4444';
        msgEl.innerText = "Network Error!";
    }
}

// Master & Transaction Form Handlers
document.getElementById('branchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if(!checkMasterPermission()) return;
    const editId = document.getElementById('editBranchId').value;
    const bodyData = { branchId: document.getElementById('branchId').value, branchName: document.getElementById('branchName').value, address: document.getElementById('branchAddress').value };
    if(editId) sendPut(`/api/master/branch/${editId}`, bodyData, 'branchMsg', 'branchForm', 'branchSaveBtn', 'Save Branch', 'editBranchId');
    else sendPost('/api/master/branch', bodyData, 'branchMsg', 'branchForm');
});

document.getElementById('userForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if(!checkMasterPermission()) return;
    const editId = document.getElementById('editUserId').value;
    const bodyData = { userId: document.getElementById('uId').value, fullName: document.getElementById('uName').value, password: document.getElementById('uPass').value, role: document.getElementById('uRole').value, branch: document.getElementById('uBranch').value, mobileNumber: document.getElementById('uMobile').value };
    if(editId) sendPut(`/api/master/user/${editId}`, bodyData, 'userMsg', 'userForm', 'userSaveBtn', 'Save User', 'editUserId');
    else sendPost('/api/master/user', bodyData, 'userMsg', 'userForm');
});

document.getElementById('farmerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if(!checkMasterPermission()) return;
    const editId = document.getElementById('editFarmerId').value;
    const bodyData = { farmerId: document.getElementById('fId').value, farmerName: document.getElementById('fName').value, supervisor: document.getElementById('fSup').value, branch: document.getElementById('fBranch').value, mobileNo: document.getElementById('fMobile').value, address: document.getElementById('fAddress').value, bankDetails: { bankName: document.getElementById('fBank').value, accountNo: document.getElementById('fAcc').value, ifsc: document.getElementById('fIfsc').value } };
    if(editId) sendPut(`/api/master/farmer/${editId}`, bodyData, 'farmerMsg', 'farmerForm', 'farmerSaveBtn', 'Save Farmer', 'editFarmerId');
    else sendPost('/api/master/farmer', bodyData, 'farmerMsg', 'farmerForm');
});

document.getElementById('traderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if(!checkMasterPermission()) return;
    const editId = document.getElementById('editTraderMongoId').value;
    const bodyData = { traderId: document.getElementById('tId').value, traderName: document.getElementById('tName').value, mobileNo: document.getElementById('tMobile').value, address: document.getElementById('tAddress').value };
    if(editId) sendPut(`/api/master/trader/${editId}`, bodyData, 'traderMsg', 'traderForm', 'traderSaveBtn', 'Save Trader', 'editTraderMongoId');
    else sendPost('/api/master/trader', bodyData, 'traderMsg', 'traderForm');
});

document.getElementById('itemForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if(!checkMasterPermission()) return;
    const editId = document.getElementById('editItemMongoId').value;
    const bodyData = { itemId: document.getElementById('iId').value, itemName: document.getElementById('iName').value, category: document.getElementById('iCat').value, unit: document.getElementById('iUnit').value };
    if(editId) sendPut(`/api/master/item/${editId}`, bodyData, 'itemMsg', 'itemForm', 'itemSaveBtn', 'Save Item', 'editItemMongoId');
    else sendPost('/api/master/item', bodyData, 'itemMsg', 'itemForm');
});

document.getElementById('chicksForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('editPlacementMongoId').value;
    const bodyData = { placementId: document.getElementById('cPlacementId').value, date: document.getElementById('cDate').value, farmerId: document.getElementById('cFarmer').value, chicksQty: Number(document.getElementById('cQty').value) };
    if(editId) sendPut(`/api/entry/chicks-placement/${editId}`, bodyData, 'chicksMsg', 'chicksForm', 'chicksSaveBtn', 'Place Chicks', 'editPlacementMongoId');
    else sendPost('/api/entry/chicks-placement', bodyData, 'chicksMsg', 'chicksForm');
});

document.getElementById('feedForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('editFeedMongoId').value;
    const bodyData = { challanNo: document.getElementById('challanNo').value, date: document.getElementById('feedDate').value, farmerId: document.getElementById('feedFarmer').value, feedType: document.getElementById('feedType').value, qtyKg: Number(document.getElementById('qtyKg').value) };
    if(editId) sendPut(`/api/entry/feed-dispatch/${editId}`, bodyData, 'feedMsg', 'feedForm', 'feedSaveBtn', 'Send Feed Dispatch', 'editFeedMongoId');
    else sendPost('/api/entry/feed-dispatch', bodyData, 'feedMsg', 'feedForm');
});

document.getElementById('dailyEntryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('editDailyMongoId').value;
    const bodyData = { farmerId: document.getElementById('dailyFarmer').value, date: document.getElementById('dailyDate').value, dayMortality: Number(document.getElementById('dMort').value), dayFeedConsumeKg: Number(document.getElementById('dFeed').value), avgBodyWeightGram: document.getElementById('dBw').value ? Number(document.getElementById('dBw').value) : undefined };
    if(editId) sendPut(`/api/entry/daily-entry/${editId}`, bodyData, 'dailyEntryMsg', 'dailyEntryForm', 'dailySaveBtn', 'Submit Daily Log & Calculate FCR', 'editDailyMongoId');
    else sendPost('/api/entry/daily-entry', bodyData, 'dailyEntryMsg', 'dailyEntryForm');
});