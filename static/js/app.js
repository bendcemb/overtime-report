/**
 * Overtime Report Frontend Logic (Report & Matrix View)
 * Adheres strictly to DOM security guidelines (textContent, createElement, replaceChildren).
 */

// API Root Helper for reverse proxy (/overtime-report) support
const getApiUrl = (endpoint) => ((window.APP_ROOT || '').replace(/\/$/, '') + endpoint);

// State Management
const AppState = {
    refnos: [],
    selectedRefnos: new Set(),
    reportData: null,
    currentModalEmployees: []
};

// DOM Elements
const DOM = {
    startDateInput: document.getElementById('startDateInput'),
    endDateInput: document.getElementById('endDateInput'),
    fetchRefnosBtn: document.getElementById('fetchRefnosBtn'),
    presetButtons: document.querySelectorAll('.btn-preset'),
    
    refnoSearchInput: document.getElementById('refnoSearchInput'),
    selectAllRefnosBtn: document.getElementById('selectAllRefnosBtn'),
    deselectAllRefnosBtn: document.getElementById('deselectAllRefnosBtn'),
    refnoListContainer: document.getElementById('refnoListContainer'),
    selectedRefnoCount: document.getElementById('selectedRefnoCount'),
    totalRefnoCount: document.getElementById('totalRefnoCount'),
    generateReportBtn: document.getElementById('generateReportBtn'),
    
    // Tabs & Navigation
    navTabs: document.querySelectorAll('.nav-tab'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    
    // Summary Tab
    summaryFilterInput: document.getElementById('summaryFilterInput'),
    summaryRowCount: document.getElementById('summaryRowCount'),
    summaryTableBody: document.getElementById('summaryTableBody'),
    summaryTableFoot: document.getElementById('summaryTableFoot'),
    
    // Matrix Tab
    matrixHead: document.getElementById('matrixHead'),
    matrixBody: document.getElementById('matrixBody'),
    matrixFoot: document.getElementById('matrixFoot'),
    
    // Details Tab
    detailsFilterInput: document.getElementById('detailsFilterInput'),
    detailsRowCount: document.getElementById('detailsRowCount'),
    detailsTableBody: document.getElementById('detailsTableBody'),
    
    // Modal
    drilldownModal: document.getElementById('drilldownModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    modalTableBody: document.getElementById('modalTableBody'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    modalCloseActionBtn: document.getElementById('modalCloseActionBtn'),
    
    // Exports & Utilities
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    printReportBtn: document.getElementById('printReportBtn'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    // Load initial refnos
    loadRefnos();
});

// Show / Hide Loading Overlay
function showLoading(text = 'กำลังโหลดข้อมูล...') {
    DOM.loadingText.textContent = text;
    DOM.loadingOverlay.classList.add('show');
}

function hideLoading() {
    DOM.loadingOverlay.classList.remove('show');
}

// Theme handling
function initTheme() {
    const savedTheme = localStorage.getItem('ot_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon(true);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('ot_theme', nextTheme);
    updateThemeIcon(!isDark);
}

function updateThemeIcon(isDark) {
    DOM.themeToggleBtn.replaceChildren();
    const icon = document.createElement('i');
    icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    DOM.themeToggleBtn.appendChild(icon);
}

// Event Listeners Setup
function setupEventListeners() {
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);
    DOM.fetchRefnosBtn.addEventListener('click', () => loadRefnos());
    
    // Preset date range buttons
    DOM.presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyDatePreset(btn.dataset.preset);
            loadRefnos();
        });
    });
    
    // Refno selection controls
    DOM.selectAllRefnosBtn.addEventListener('click', selectAllRefnos);
    DOM.deselectAllRefnosBtn.addEventListener('click', deselectAllRefnos);
    DOM.refnoSearchInput.addEventListener('input', filterRefnoCards);
    DOM.generateReportBtn.addEventListener('click', generateReport);
    
    // Tab switching
    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            DOM.navTabs.forEach(t => t.classList.remove('active'));
            DOM.tabPanes.forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            const targetPane = document.getElementById(targetId);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
    
    // Filter tables
    DOM.summaryFilterInput.addEventListener('input', filterSummaryTable);
    DOM.detailsFilterInput.addEventListener('input', filterDetailsTable);
    
    // Modal Close
    DOM.closeModalBtn.addEventListener('click', closeModal);
    DOM.modalCloseActionBtn.addEventListener('click', closeModal);
    DOM.drilldownModal.addEventListener('click', (e) => {
        if (e.target === DOM.drilldownModal) closeModal();
    });
    
    // Export & Print
    DOM.exportCsvBtn.addEventListener('click', exportToCsv);
    DOM.printReportBtn.addEventListener('click', () => window.print());
}

// Date Presets Calculation
function applyDatePreset(preset) {
    const today = new Date();
    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    let start = new Date(today);
    let end = new Date(today);
    
    if (preset === 'today') {
        // today
    } else if (preset === 'yesterday') {
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
    } else if (preset === 'last7') {
        start.setDate(today.getDate() - 6);
    } else if (preset === 'thisMonth') {
        start.setDate(1);
    } else if (preset === 'lastMonth') {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
    }
    
    DOM.startDateInput.value = formatDate(start);
    DOM.endDateInput.value = formatDate(end);
}

// Fetch available RefNos for date range
async function loadRefnos() {
    const startDate = DOM.startDateInput.value;
    const endDate = DOM.endDateInput.value;
    
    if (!startDate || !endDate) {
        showCustomNotice('กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด');
        return;
    }
    
    showLoading('กำลังค้นหาเอกสาร OT ในช่วงวันที่เลือก...');
    
    try {
        const response = await fetch(getApiUrl(`/api/refnos?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`));
        const json = await response.json();
        
        hideLoading();
        
        if (!json.success) {
            showCustomNotice(json.error || 'ไม่สามารถโหลดข้อมูลเอกสาร OT ได้');
            return;
        }
        
        AppState.refnos = json.data || [];
        AppState.selectedRefnos = new Set(AppState.refnos.map(r => r.refno));
        
        renderRefnoList(AppState.refnos);
        updateRefnoCounts();
        
        // Auto-generate report if refnos found
        if (AppState.refnos.length > 0) {
            generateReport();
        } else {
            renderEmptyReport();
        }
    } catch (err) {
        hideLoading();
        console.error('Error fetching refnos:', err);
        showCustomNotice('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
    }
}

// Render Refno Checkboxes securely
function renderRefnoList(refnos) {
    DOM.refnoListContainer.replaceChildren();
    
    if (!refnos || refnos.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state-small';
        emptyDiv.textContent = 'ไม่พบเอกสาร OT ในช่วงวันที่เลือก';
        DOM.refnoListContainer.appendChild(emptyDiv);
        return;
    }
    
    refnos.forEach(item => {
        const itemLabel = document.createElement('label');
        itemLabel.className = 'refno-item';
        itemLabel.dataset.refno = item.refno;
        itemLabel.dataset.dept = item.dept;
        itemLabel.dataset.section = item.section;
        
        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item.refno;
        checkbox.checked = AppState.selectedRefnos.has(item.refno);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                AppState.selectedRefnos.add(item.refno);
            } else {
                AppState.selectedRefnos.delete(item.refno);
            }
            updateRefnoCounts();
        });
        
        // Meta container
        const metaDiv = document.createElement('div');
        metaDiv.className = 'refno-meta';
        
        // Top row
        const topRow = document.createElement('div');
        topRow.className = 'refno-top-row';
        
        const codeSpan = document.createElement('span');
        codeSpan.className = 'refno-code';
        codeSpan.textContent = item.refno;
        
        const dateSpan = document.createElement('span');
        dateSpan.className = 'refno-date';
        dateSpan.textContent = item.date;
        
        topRow.appendChild(codeSpan);
        topRow.appendChild(dateSpan);
        
        // Bottom row
        const bottomRow = document.createElement('div');
        bottomRow.className = 'refno-bottom-row';
        
        const deptBadge = document.createElement('span');
        deptBadge.className = 'refno-dept-badge';
        deptBadge.textContent = item.dept;
        
        const countBadge = document.createElement('span');
        countBadge.className = 'refno-count-badge';
        countBadge.textContent = `${item.emp_count} คน (${item.tot_hr} ชม.)`;
        
        bottomRow.appendChild(deptBadge);
        bottomRow.appendChild(countBadge);
        
        metaDiv.appendChild(topRow);
        metaDiv.appendChild(bottomRow);
        
        itemLabel.appendChild(checkbox);
        itemLabel.appendChild(metaDiv);
        
        DOM.refnoListContainer.appendChild(itemLabel);
    });
}

function updateRefnoCounts() {
    DOM.selectedRefnoCount.textContent = AppState.selectedRefnos.size;
    DOM.totalRefnoCount.textContent = AppState.refnos.length;
}

function selectAllRefnos() {
    AppState.selectedRefnos = new Set(AppState.refnos.map(r => r.refno));
    const checkboxes = DOM.refnoListContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.checked = true; });
    updateRefnoCounts();
}

function deselectAllRefnos() {
    AppState.selectedRefnos.clear();
    const checkboxes = DOM.refnoListContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => { cb.checked = false; });
    updateRefnoCounts();
}

function filterRefnoCards() {
    const q = DOM.refnoSearchInput.value.toLowerCase().trim();
    const items = DOM.refnoListContainer.querySelectorAll('.refno-item');
    items.forEach(item => {
        const refno = (item.dataset.refno || '').toLowerCase();
        const dept = (item.dataset.dept || '').toLowerCase();
        const section = (item.dataset.section || '').toLowerCase();
        
        if (!q || refno.includes(q) || dept.includes(q) || section.includes(q)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Generate Report for selected refnos
async function generateReport() {
    const selectedList = Array.from(AppState.selectedRefnos);
    if (selectedList.length === 0) {
        showCustomNotice('กรุณาเลือกเอกสาร OT อย่างน้อย 1 รายการ');
        return;
    }
    
    showLoading('กำลังประมวลผลรายงานสรุปตามแผนกและรายวัน...');
    
    try {
        const response = await fetch(getApiUrl('/api/report'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                refnos: selectedList,
                start_date: DOM.startDateInput.value,
                end_date: DOM.endDateInput.value
            })
        });
        
        const json = await response.json();
        hideLoading();
        
        if (!json.success) {
            showCustomNotice(json.error || 'เกิดข้อผิดพลาดในการประมวลผลรายงาน');
            return;
        }
        
        AppState.reportData = json.data;
        renderReport(AppState.reportData);
    } catch (err) {
        hideLoading();
        console.error('Error generating report:', err);
        showCustomNotice('เกิดข้อผิดพลาดในการประมวลผลรายงาน');
    }
}

// Render report tables
function renderReport(data) {
    renderSummaryTable(data.summary_by_date_dept);
    renderMatrixTable(data.matrix);
    renderDetailsTable(data.details);
}

// Render Summary Table (Date & Department breakdown)
function renderSummaryTable(summaryList) {
    DOM.summaryTableBody.replaceChildren();
    DOM.summaryTableFoot.replaceChildren();
    
    DOM.summaryRowCount.textContent = summaryList.length;
    
    if (!summaryList || summaryList.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'text-center empty-state';
        td.textContent = 'ไม่พบข้อมูลสรุป';
        tr.appendChild(td);
        DOM.summaryTableBody.appendChild(tr);
        return;
    }
    
    let totalPersonsSum = 0;
    let totalRefnoCountSum = 0;
    let totalHoursSum = 0;
    
    summaryList.forEach((row, idx) => {
        totalPersonsSum += row.emp_count;
        totalRefnoCountSum += row.refno_count;
        totalHoursSum += row.total_hours;
        
        const tr = document.createElement('tr');
        tr.dataset.date = row.date;
        tr.dataset.dept = row.dept;
        
        // Col 1: Index
        const tdIdx = document.createElement('td');
        tdIdx.textContent = idx + 1;
        tr.appendChild(tdIdx);
        
        // Col 2: Date
        const tdDate = document.createElement('td');
        tdDate.textContent = row.date;
        tdDate.style.fontWeight = '600';
        tr.appendChild(tdDate);
        
        // Col 3: Department
        const tdDept = document.createElement('td');
        const deptPill = document.createElement('span');
        deptPill.className = 'dept-pill';
        deptPill.textContent = row.dept;
        tdDept.appendChild(deptPill);
        tr.appendChild(tdDept);
        
        // Col 4: Employee Count
        const tdEmpCount = document.createElement('td');
        tdEmpCount.className = 'text-center';
        const countBadge = document.createElement('span');
        countBadge.className = 'count-badge-strong';
        countBadge.textContent = `${row.emp_count} คน`;
        tdEmpCount.appendChild(countBadge);
        tr.appendChild(tdEmpCount);
        
        // Col 5: Refno Count
        const tdRefnoCount = document.createElement('td');
        tdRefnoCount.className = 'text-center';
        tdRefnoCount.textContent = `${row.refno_count} ใบ`;
        tr.appendChild(tdRefnoCount);
        
        // Col 6: Refno list
        const tdRefnos = document.createElement('td');
        const refnoTags = document.createElement('div');
        refnoTags.className = 'refno-tags';
        row.refnos.forEach(r => {
            const tag = document.createElement('span');
            tag.className = 'refno-tag';
            tag.textContent = r;
            refnoTags.appendChild(tag);
        });
        tdRefnos.appendChild(refnoTags);
        tr.appendChild(tdRefnos);
        
        // Col 7: Total Hours
        const tdHours = document.createElement('td');
        tdHours.className = 'text-right';
        tdHours.textContent = row.total_hours.toFixed(1);
        tdHours.style.fontWeight = '600';
        tr.appendChild(tdHours);
        
        // Col 8: Action Drilldown Button
        const tdAction = document.createElement('td');
        tdAction.className = 'text-center';
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn-sm btn-outline';
        viewBtn.title = 'ดูรายชื่อพนักงาน';
        
        const btnIcon = document.createElement('i');
        btnIcon.className = 'fa-solid fa-users-viewfinder';
        viewBtn.appendChild(btnIcon);
        
        const btnText = document.createTextNode(' ดูรายชื่อ');
        viewBtn.appendChild(btnText);
        
        viewBtn.addEventListener('click', () => {
            openDrilldownModal(`${row.date} - แผนก: ${row.dept}`, `จำนวน ${row.emp_count} คน (${row.total_hours} ชม.)`, row.employees);
        });
        
        tdAction.appendChild(viewBtn);
        tr.appendChild(tdAction);
        
        DOM.summaryTableBody.appendChild(tr);
    });
    
    // Totals row in Foot
    const footTr = document.createElement('tr');
    
    const footTdLabel = document.createElement('td');
    footTdLabel.colSpan = 3;
    footTdLabel.textContent = 'รวมทั้งสิ้น:';
    footTr.appendChild(footTdLabel);
    
    const footTdEmp = document.createElement('td');
    footTdEmp.className = 'text-center';
    footTdEmp.textContent = `${totalPersonsSum.toLocaleString()} คน`;
    footTr.appendChild(footTdEmp);
    
    const footTdRefno = document.createElement('td');
    footTdRefno.className = 'text-center';
    footTdRefno.textContent = `${totalRefnoCountSum.toLocaleString()} ใบ`;
    footTr.appendChild(footTdRefno);
    
    const footTdEmpty = document.createElement('td');
    footTr.appendChild(footTdEmpty);
    
    const footTdHours = document.createElement('td');
    footTdHours.className = 'text-right';
    footTdHours.textContent = totalHoursSum.toFixed(1);
    footTr.appendChild(footTdHours);
    
    const footTdAction = document.createElement('td');
    footTr.appendChild(footTdAction);
    
    DOM.summaryTableFoot.appendChild(footTr);
}

// Render Matrix (Date x Department)
function renderMatrixTable(matrix) {
    DOM.matrixHead.replaceChildren();
    DOM.matrixBody.replaceChildren();
    DOM.matrixFoot.replaceChildren();
    
    if (!matrix || !matrix.dates || matrix.dates.length === 0) {
        return;
    }
    
    const depts = matrix.departments;
    
    // 1. Head
    const headTr = document.createElement('tr');
    const thDate = document.createElement('th');
    thDate.textContent = 'วันที่ \\ แผนก (DEPT)';
    headTr.appendChild(thDate);
    
    depts.forEach(dp => {
        const th = document.createElement('th');
        th.textContent = dp;
        headTr.appendChild(th);
    });
    
    const thTotal = document.createElement('th');
    thTotal.textContent = 'รวม (คน)';
    thTotal.className = 'text-center';
    headTr.appendChild(thTotal);
    
    DOM.matrixHead.appendChild(headTr);
    
    // 2. Body
    matrix.dates.forEach(dt => {
        const tr = document.createElement('tr');
        
        const tdDate = document.createElement('td');
        tdDate.textContent = dt;
        tr.appendChild(tdDate);
        
        let rowSum = 0;
        depts.forEach(dp => {
            const td = document.createElement('td');
            const cell = (matrix.data[dt] && matrix.data[dt][dp]) ? matrix.data[dt][dp] : null;
            if (cell && cell.emp_count > 0) {
                const span = document.createElement('span');
                span.className = 'matrix-cell-active';
                span.textContent = cell.emp_count;
                span.title = `${dt} [${dp}]: ${cell.emp_count} คน (${cell.hours} ชม.)`;
                td.appendChild(span);
                rowSum += cell.emp_count;
            } else {
                const span = document.createElement('span');
                span.className = 'matrix-cell-empty';
                span.textContent = '-';
                td.appendChild(span);
            }
            tr.appendChild(td);
        });
        
        // Row total
        const tdTotal = document.createElement('td');
        tdTotal.className = 'text-center';
        const spanTotal = document.createElement('strong');
        spanTotal.textContent = rowSum;
        tdTotal.appendChild(spanTotal);
        tr.appendChild(tdTotal);
        
        DOM.matrixBody.appendChild(tr);
    });
    
    // 3. Foot (Column totals)
    const footTr = document.createElement('tr');
    const footTdLabel = document.createElement('td');
    footTdLabel.textContent = 'รวมทั้งหมด (คน):';
    footTr.appendChild(footTdLabel);
    
    let grandTotal = 0;
    depts.forEach(dp => {
        const td = document.createElement('td');
        td.className = 'text-center';
        const cnt = matrix.totals_by_dept[dp] ? matrix.totals_by_dept[dp].emp_count : 0;
        grandTotal += cnt;
        const strong = document.createElement('strong');
        strong.textContent = cnt;
        td.appendChild(strong);
        footTr.appendChild(td);
    });
    
    const footTdGrand = document.createElement('td');
    footTdGrand.className = 'text-center';
    const strongGrand = document.createElement('strong');
    strongGrand.textContent = grandTotal;
    strongGrand.style.color = 'var(--primary)';
    strongGrand.style.fontSize = '1.05rem';
    footTdGrand.appendChild(strongGrand);
    footTr.appendChild(footTdGrand);
    
    DOM.matrixFoot.appendChild(footTr);
}

// Render All Employee Details
function renderDetailsTable(details) {
    DOM.detailsTableBody.replaceChildren();
    DOM.detailsRowCount.textContent = details ? details.length : 0;
    
    if (!details || details.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 11;
        td.className = 'text-center empty-state';
        td.textContent = 'ไม่มีข้อมูลพนักงาน';
        tr.appendChild(td);
        DOM.detailsTableBody.appendChild(tr);
        return;
    }
    
    details.forEach((d, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.empcode = d.empcode;
        tr.dataset.fullname = d.fullname;
        tr.dataset.dept = d.dept;
        tr.dataset.workdesc = d.workdesc;
        
        // 1. #
        const tdIdx = document.createElement('td');
        tdIdx.textContent = idx + 1;
        tr.appendChild(tdIdx);
        
        // 2. Date
        const tdDate = document.createElement('td');
        tdDate.textContent = d.date;
        tr.appendChild(tdDate);
        
        // 3. Ref No
        const tdRefno = document.createElement('td');
        tdRefno.textContent = d.refno;
        tdRefno.style.fontFamily = 'monospace';
        tr.appendChild(tdRefno);
        
        // 4. Dept
        const tdDept = document.createElement('td');
        tdDept.textContent = d.dept;
        tr.appendChild(tdDept);
        
        // 5. Section
        const tdSection = document.createElement('td');
        tdSection.textContent = d.section;
        tr.appendChild(tdSection);
        
        // 6. Emp Code
        const tdCode = document.createElement('td');
        tdCode.textContent = d.empcode;
        tdCode.style.fontWeight = '600';
        tr.appendChild(tdCode);
        
        // 7. Full Name
        const tdName = document.createElement('td');
        tdName.textContent = d.fullname;
        tr.appendChild(tdName);
        
        // 8. Work desc
        const tdWork = document.createElement('td');
        tdWork.textContent = d.workdesc;
        tr.appendChild(tdWork);
        
        // 9. Time In - Out
        const tdTime = document.createElement('td');
        tdTime.className = 'text-center';
        tdTime.textContent = `${d.timein.toFixed(2)} - ${d.timeout.toFixed(2)}`;
        tr.appendChild(tdTime);
        
        // 10. Total OT hours
        const tdHours = document.createElement('td');
        tdHours.className = 'text-right';
        tdHours.textContent = d.tot_hr.toFixed(1);
        tdHours.style.fontWeight = '600';
        tr.appendChild(tdHours);
        
        // 11. Bus Place
        const tdBus = document.createElement('td');
        tdBus.textContent = d.busplace || '-';
        tr.appendChild(tdBus);
        
        DOM.detailsTableBody.appendChild(tr);
    });
}

// Open Drilldown Modal
function openDrilldownModal(title, subtitle, employees) {
    DOM.modalTitle.textContent = title;
    DOM.modalSubtitle.textContent = subtitle;
    DOM.modalTableBody.replaceChildren();
    
    if (!employees || employees.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'text-center empty-state';
        td.textContent = 'ไม่พบรายชื่อพนักงาน';
        tr.appendChild(td);
        DOM.modalTableBody.appendChild(tr);
    } else {
        employees.forEach((emp, idx) => {
            const tr = document.createElement('tr');
            
            const tdIdx = document.createElement('td');
            tdIdx.textContent = idx + 1;
            tr.appendChild(tdIdx);
            
            const tdCode = document.createElement('td');
            tdCode.textContent = emp.empcode;
            tdCode.style.fontWeight = '600';
            tr.appendChild(tdCode);
            
            const tdName = document.createElement('td');
            tdName.textContent = emp.fullname;
            tr.appendChild(tdName);
            
            const tdRefno = document.createElement('td');
            tdRefno.textContent = emp.refno;
            tdRefno.style.fontFamily = 'monospace';
            tr.appendChild(tdRefno);
            
            const tdWork = document.createElement('td');
            tdWork.textContent = emp.workdesc;
            tr.appendChild(tdWork);
            
            const tdTime = document.createElement('td');
            tdTime.className = 'text-center';
            tdTime.textContent = `${emp.timein.toFixed(2)} - ${emp.timeout.toFixed(2)}`;
            tr.appendChild(tdTime);
            
            const tdHours = document.createElement('td');
            tdHours.className = 'text-right';
            tdHours.textContent = emp.tot_hr.toFixed(1);
            tdHours.style.fontWeight = '600';
            tr.appendChild(tdHours);
            
            const tdBus = document.createElement('td');
            tdBus.textContent = emp.busplace || '-';
            tr.appendChild(tdBus);
            
            DOM.modalTableBody.appendChild(tr);
        });
    }
    
    DOM.drilldownModal.classList.add('show');
}

function closeModal() {
    DOM.drilldownModal.classList.remove('show');
}

// Table live search filters
function filterSummaryTable() {
    const q = DOM.summaryFilterInput.value.toLowerCase().trim();
    const rows = DOM.summaryTableBody.querySelectorAll('tr');
    let visible = 0;
    rows.forEach(r => {
        const date = (r.dataset.date || '').toLowerCase();
        const dept = (r.dataset.dept || '').toLowerCase();
        if (!q || date.includes(q) || dept.includes(q)) {
            r.style.display = '';
            visible++;
        } else {
            r.style.display = 'none';
        }
    });
    DOM.summaryRowCount.textContent = visible;
}

function filterDetailsTable() {
    const q = DOM.detailsFilterInput.value.toLowerCase().trim();
    const rows = DOM.detailsTableBody.querySelectorAll('tr');
    let visible = 0;
    rows.forEach(r => {
        const code = (r.dataset.empcode || '').toLowerCase();
        const name = (r.dataset.fullname || '').toLowerCase();
        const dept = (r.dataset.dept || '').toLowerCase();
        const work = (r.dataset.workdesc || '').toLowerCase();
        if (!q || code.includes(q) || name.includes(q) || dept.includes(q) || work.includes(q)) {
            r.style.display = '';
            visible++;
        } else {
            r.style.display = 'none';
        }
    });
    DOM.detailsRowCount.textContent = visible;
}

// Export CSV handler
async function exportToCsv() {
    const selectedList = Array.from(AppState.selectedRefnos);
    if (selectedList.length === 0) {
        showCustomNotice('กรุณาเลือกเอกสาร OT ก่อนส่งออกข้อมูล');
        return;
    }
    
    showLoading('กำลังจัดเตรียมไฟล์ CSV...');
    
    // Choose active tab export format (summary or matrix or detail)
    const activeTab = document.querySelector('.nav-tab.active');
    let exportType = 'summary';
    if (activeTab && activeTab.dataset.tab === 'tab-matrix') {
        exportType = 'matrix';
    } else if (activeTab && activeTab.dataset.tab === 'tab-details') {
        exportType = 'detail';
    }
    
    try {
        const response = await fetch(getApiUrl('/api/export/csv'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                refnos: selectedList,
                type: exportType
            })
        });
        
        hideLoading();
        
        if (!response.ok) {
            showCustomNotice('เกิดข้อผิดพลาดในการส่งออกไฟล์ CSV');
            return;
        }
        
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        let filename = `ot_report_${exportType}.csv`;
        const match = disposition.match(/filename=(.+)/);
        if (match && match[1]) {
            filename = match[1].replace(/["']/g, '');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (err) {
        hideLoading();
        console.error('Export error:', err);
        showCustomNotice('เกิดข้อผิดพลาดในการส่งออกไฟล์');
    }
}

// Empty report state
function renderEmptyReport() {
    renderSummaryTable([]);
    renderMatrixTable({ dates: [], departments: [], data: {}, totals_by_dept: {}, totals_by_date: {} });
    renderDetailsTable([]);
}

// Custom Non-blocking Notice
function showCustomNotice(msg) {
    const existing = document.getElementById('customNotification');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.id = 'customNotification';
    banner.style.position = 'fixed';
    banner.style.bottom = '20px';
    banner.style.right = '20px';
    banner.style.backgroundColor = '#1f2937';
    banner.style.color = '#ffffff';
    banner.style.padding = '12px 20px';
    banner.style.borderRadius = '8px';
    banner.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    banner.style.zIndex = '9999';
    banner.style.fontSize = '0.9rem';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.gap = '10px';
    banner.style.borderLeft = '4px solid #3b82f6';
    banner.style.animation = 'modal-appear 0.2s ease-out';
    
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-circle-info';
    banner.appendChild(icon);
    
    const textNode = document.createElement('span');
    textNode.textContent = msg;
    banner.appendChild(textNode);
    
    document.body.appendChild(banner);
    
    setTimeout(() => {
        banner.remove();
    }, 4000);
}
