/**
 * Приложение для инвентаризации рулонов ткани
 * Сканирование QR-кодов, запись измерений, управление заказами
 * ИНТЕГРАЦИЯ С GOOGLE TABLES
 */

// ===== CONFIGURATION =====
const GOOGLE_SHEET_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE'; // Замените на ваш URL
const USE_GOOGLE_SHEETS = true; // Включить интеграцию с Google Sheets
const USE_LOCAL_STORAGE = !USE_GOOGLE_SHEETS; // Fallback to localStorage

// ===== Constants (Local Storage) =====
const STORAGE_KEY = 'fabric_inventory_data';
const RECENT_SCANS_KEY = 'recent_scans';

// Test data codes for QR generation
const TEST_CODES = [
    '2020_1', '2020_2', '2020_3', '2020_4', '2020_5',
    '2021_1', '2021_2', '2021_3',
    '2022_1', '2022_2', '2022_3', '2022_4'
];

// ===== State =====
let orders = {};
let recentScans = [];
let currentOrderId = null;
let currentRollNumber = null;
let html5QrcodeScanner = null;
let isOnline = false;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    
    if (USE_GOOGLE_SHEETS && GOOGLE_SHEET_URL !== 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
        // Initialize with Google Sheets
        initializeGoogleSheets();
    } else {
        // Fallback to localStorage
        console.log('Using localStorage mode');
        loadDataLocal();
        initializeTestDataLocal();
        renderOrdersList();
        renderRecentScans();
        renderQRCodePage();
    }
});

// ===== Google Sheets Initialization =====
async function initializeGoogleSheets() {
    showToast('Подключение к Google Sheets...', 'info');
    
    try {
        await loadDataFromGoogleSheets();
        renderOrdersList();
        renderRecentScans();
        renderQRCodePage();
        showToast('Подключено к Google Sheets', 'success');
        isOnline = true;
    } catch (error) {
        console.error('Google Sheets error:', error);
        showToast('Ошибка подключения. Используем локальное хранилище.', 'error');
        loadDataLocal();
        initializeTestDataLocal();
        renderOrdersList();
    }
    
    // Check connection periodically
    setInterval(async () => {
        if (USE_GOOGLE_SHEETS) {
            try {
                await syncWithGoogleSheets();
                isOnline = true;
            } catch (e) {
                isOnline = false;
            }
            updateConnectionStatus();
        }
    }, 30000); // Every 30 seconds
}

function updateConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.textContent = isOnline ? '🟢 Онлайн' : '🔴 Офлайн';
        statusEl.className = isOnline ? 'status-online' : 'status-offline';
    }
}

// ===== Google Sheets API Functions =====
async function loadDataFromGoogleSheets() {
    const url = `${GOOGLE_SHEET_URL}?action=getOrders`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error('Failed to load from Google Sheets');
    }
    
    const data = await response.json();
    
    if (data.orders) {
        orders = {};
        data.orders.forEach(order => {
            orders[order.id] = order;
        });
    }
    
    // Load recent scans from localStorage (not in Google Sheets)
    const storedScans = localStorage.getItem(RECENT_SCANS_KEY);
    if (storedScans) {
        recentScans = JSON.parse(storedScans);
    }
}

async function syncWithGoogleSheets() {
    // Silent sync - just check connection
    const url = `${GOOGLE_SHEET_URL}?action=getOrders`;
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
}

async function saveRollToGoogleSheets(orderId, rollNumber, factoryLength, measuredLength, shrinkage, status) {
    const url = `${GOOGLE_SHEET_URL}?action=saveRoll`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            orderId,
            rollNumber,
            factoryLength,
            measuredLength,
            shrinkage,
            status
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to save to Google Sheets');
    }
    
    return await response.json();
}

async function createOrderInGoogleSheets(orderId, totalRolls, rolls) {
    const url = `${GOOGLE_SHEET_URL}?action=createOrder`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            orderId,
            totalRolls,
            rolls
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to create order in Google Sheets');
    }
    
    return await response.json();
}

async function deleteOrderFromGoogleSheets(orderId) {
    const url = `${GOOGLE_SHEET_URL}?action=deleteOrder&orderId=${orderId}`;
    
    const response = await fetch(url, {
        method: 'POST'
    });
    
    if (!response.ok) {
        throw new Error('Failed to delete order from Google Sheets');
    }
    
    return await response.json();
}

// ===== Local Storage Functions (Fallback) =====
function loadDataLocal() {
    const storedOrders = localStorage.getItem(STORAGE_KEY);
    const storedScans = localStorage.getItem(RECENT_SCANS_KEY);
    
    if (storedOrders) {
        orders = JSON.parse(storedOrders);
    }
    
    if (storedScans) {
        recentScans = JSON.parse(storedScans);
    }
}

function saveDataLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(recentScans));
}

function initializeTestDataLocal() {
    if (Object.keys(orders).length === 0) {
        // Заказ 2020 - 5 рулонов
        orders['2020'] = {
            id: '2020',
            totalRolls: 5,
            rolls: [
                { rollNumber: 1, factoryLength: 50, measuredLength: null, shrinkage: null, status: 'pending' },
                { rollNumber: 2, factoryLength: 48, measuredLength: null, shrinkage: null, status: 'pending' },
                { rollNumber: 3, factoryLength: 52, measuredLength: null, shrinkage: null, status: 'pending' },
                { rollNumber: 4, factoryLength: 49, measuredLength: null, shrinkage: null, status: 'pending' },
                { rollNumber: 5, factoryLength: 51, measuredLength: null, shrinkage: null, status: 'pending' }
            ]
        };
        
        // Заказ 2021 - 3 рулона
        orders['2021'] = {
            id: '2021',
            totalRolls: 3,
            rolls: [
                { rollNumber: 1, factoryLength: 45, measuredLength: 43.5, shrinkage: 3.3, status: 'completed' },
                { rollNumber: 2, factoryLength: 47, measuredLength: null, shrinkage: null, status: 'pending' },
                { rollNumber: 3, factoryLength: 46, measuredLength: null, shrinkage: null, status: 'pending' }
            ]
        };
        
        // Заказ 2022 - 4 рулона
        orders['2022'] = {
            id: '2022',
            totalRolls: 4,
            rolls: [
                { rollNumber: 1, factoryLength: 55, measuredLength: 53.8, shrinkage: 2.2, status: 'completed' },
                { rollNumber: 2, factoryLength: 53, measuredLength: 51.5, shrinkage: 2.8, status: 'completed' },
                { rollNumber: 3, factoryLength: 54, measuredLength: null, shrinkage: null, status: 'pending' },
                { rollNumber: 4, factoryLength: 52, measuredLength: null, shrinkage: null, status: 'pending' }
            ]
        };
        
        saveDataLocal();
    }
}

// ===== Event Listeners =====
function initializeEventListeners() {
    // Scan button
    document.getElementById('scan-btn').addEventListener('click', openScanner);
    
    // Manual input
    document.getElementById('manual-submit').addEventListener('click', handleManualInput);
    document.getElementById('manual-code').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleManualInput();
    });
    
    // Navigation
    document.getElementById('view-orders-btn').addEventListener('click', () => showPage('orders-page'));
    document.getElementById('view-qr-codes-btn').addEventListener('click', () => showPage('qr-codes-page'));
    document.getElementById('back-to-scanner').addEventListener('click', () => showPage('scanner-page'));
    document.getElementById('back-to-scanner2').addEventListener('click', () => showPage('scanner-page'));
    document.getElementById('back-to-orders').addEventListener('click', () => showPage('orders-page'));
    
    // Scanner modal
    document.getElementById('close-scanner').addEventListener('click', closeScanner);
    
    // Record modal
    document.getElementById('close-record').addEventListener('click', closeRecordModal);
    document.getElementById('record-form').addEventListener('submit', handleRecordSubmit);
    document.getElementById('save-partial').addEventListener('click', handlePartialSave);
    
    // New order modal
    document.getElementById('add-order-btn').addEventListener('click', openNewOrderModal);
    document.getElementById('close-new-order').addEventListener('click', closeNewOrderModal);
    document.getElementById('new-order-form').addEventListener('submit', handleNewOrderSubmit);
    
    // Add roll button
    document.getElementById('add-roll-btn').addEventListener('click', openAddRollModal);
    
    // Search
    document.getElementById('order-search').addEventListener('input', handleSearch);
    
    // Sync button
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', manualSync);
    }
}

async function manualSync() {
    if (USE_GOOGLE_SHEETS) {
        showToast('Синхронизация...', 'info');
        try {
            await loadDataFromGoogleSheets();
            renderOrdersList();
            showToast('Синхронизация завершена', 'success');
        } catch (error) {
            showToast('Ошибка синхронизации', 'error');
        }
    }
}

// ===== Navigation =====
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    
    if (pageId === 'orders-page') {
        renderOrdersList();
    }
}

// ===== Scanner Functions =====
function openScanner() {
    const modal = document.getElementById('scanner-modal');
    modal.classList.add('active');
    
    // Initialize QR scanner
    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
            'qr-reader',
            { fps: 10, qrbox: { width: 250, height: 250 } },
            false
        );
    }
    
    html5QrcodeScanner.render(handleQRCodeScan, (error) => {
        console.log('Scanner error:', error);
    });
}

function closeScanner() {
    const modal = document.getElementById('scanner-modal');
    modal.classList.remove('active');
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.log('Error clearing scanner:', err));
    }
}

function handleQRCodeScan(decodedText) {
    closeScanner();
    processScannedCode(decodedText);
}

function handleManualInput() {
    const input = document.getElementById('manual-code');
    const code = input.value.trim();
    
    if (code) {
        processScannedCode(code);
        input.value = '';
    } else {
        showToast('Введите код', 'error');
    }
}

async function processScannedCode(code) {
    // Parse code format: ORDER_ROLL (e.g., 2020_1)
    const parts = code.split('_');
    
    if (parts.length !== 2) {
        showToast('Неверный формат кода. Используйте формат: НОМЕР_РУЛОН (например, 2020_1)', 'error');
        return;
    }
    
    const orderId = parts[0];
    const rollNumber = parseInt(parts[1]);
    
    if (isNaN(rollNumber)) {
        showToast('Неверный номер рулона', 'error');
        return;
    }
    
    // Add to recent scans
    addToRecentScans(code);
    
    // Check if order exists
    if (!orders[orderId]) {
        // Create new order with this roll
        const totalRolls = prompt('Заказ не найден. Введите общее количество рулонов:', '5');
        if (totalRolls === null) return;
        
        const rollCount = parseInt(totalRolls);
        if (isNaN(rollCount) || rollCount < 1) {
            showToast('Неверное количество рулонов', 'error');
            return;
        }
        
        await createOrder(orderId, rollCount, rollNumber);
    } else {
        // Check if roll exists
        const order = orders[orderId];
        if (rollNumber > order.totalRolls) {
            showToast(`В заказе ${order.totalRolls} рулонов. Рулон ${rollNumber} не существует.`, 'error');
            return;
        }
    }
    
    // Open record modal
    openRecordModal(orderId, rollNumber);
}

async function createOrder(orderId, totalRolls, firstRollNumber = 1) {
    // Create rolls array
    const rolls = [];
    for (let i = 1; i <= totalRolls; i++) {
        rolls.push({
            rollNumber: i,
            factoryLength: null,
            measuredLength: null,
            shrinkage: null,
            status: 'pending'
        });
    }
    
    const newOrder = {
        id: orderId,
        totalRolls,
        rolls,
        status: 'pending'
    };
    
    orders[orderId] = newOrder;
    
    // Save to storage
    if (USE_GOOGLE_SHEETS && isOnline) {
        try {
            await createOrderInGoogleSheets(orderId, totalRolls, rolls);
            showToast('Заказ создан в Google Sheets', 'success');
        } catch (error) {
            console.error('Error creating order in Google Sheets:', error);
            showToast('Заказ создан локально (ошибка синхронизации)', 'warning');
        }
    }
    
    if (USE_LOCAL_STORAGE || !USE_GOOGLE_SHEETS) {
        saveDataLocal();
    }
    
    renderOrdersList();
}

function addToRecentScans(code) {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    // Remove if already exists
    recentScans = recentScans.filter(scan => scan.code !== code);
    
    // Add to beginning
    recentScans.unshift({ code, timestamp });
    
    // Keep only 5 recent
    recentScans = recentScans.slice(0, 5);
    
    // Save to localStorage (not synced to Google Sheets)
    localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(recentScans));
    
    renderRecentScans();
}

function renderRecentScans() {
    const container = document.getElementById('recent-list');
    
    if (recentScans.length === 0) {
        container.innerHTML = '<p class="empty-state">Пока нет сканирований</p>';
        return;
    }
    
    container.innerHTML = recentScans.map(scan => `
        <div class="recent-item" data-code="${scan.code}">
            <span class="recent-code">${scan.code}</span>
            <span class="recent-time">${scan.timestamp}</span>
        </div>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', () => {
            const code = item.dataset.code;
            processScannedCode(code);
        });
    });
}

// ===== Record Modal =====
function openRecordModal(orderId, rollNumber) {
    currentOrderId = orderId;
    currentRollNumber = rollNumber;
    
    const order = orders[orderId];
    let roll = order.rolls.find(r => r.rollNumber === rollNumber);
    
    // If roll doesn't exist, create it
    if (!roll) {
        roll = {
            rollNumber: rollNumber,
            factoryLength: null,
            measuredLength: null,
            shrinkage: null,
            status: 'pending'
        };
        order.rolls.push(roll);
    }
    
    document.getElementById('record-order-id').textContent = orderId;
    document.getElementById('record-roll-number').textContent = rollNumber;
    
    // Fill form with existing data
    document.getElementById('factory-length').value = roll.factoryLength || '';
    document.getElementById('measured-length').value = roll.measuredLength || '';
    document.getElementById('shrinkage').value = roll.shrinkage || '';
    
    document.getElementById('record-modal').classList.add('active');
}

function closeRecordModal() {
    document.getElementById('record-modal').classList.remove('active');
    currentOrderId = null;
    currentRollNumber = null;
}

function handleRecordSubmit(e) {
    e.preventDefault();
    saveRollData(true);
}

function handlePartialSave() {
    saveRollData(false);
}

async function saveRollData(complete) {
    const factoryLength = parseFloat(document.getElementById('factory-length').value);
    const measuredLength = parseFloat(document.getElementById('measured-length').value) || null;
    const shrinkage = parseFloat(document.getElementById('shrinkage').value) || null;
    
    if (isNaN(factoryLength)) {
        showToast('Введите заводской метраж', 'error');
        return;
    }
    
    const order = orders[currentOrderId];
    let roll = order.rolls.find(r => r.rollNumber === currentRollNumber);
    
    if (!roll) {
        // Create roll if doesn't exist
        roll = {
            rollNumber: currentRollNumber,
            factoryLength,
            measuredLength: null,
            shrinkage: null,
            status: 'pending'
        };
        order.rolls.push(roll);
    }
    
    // Update roll data
    roll.factoryLength = factoryLength;
    
    // Determine status
    if (measuredLength !== null && shrinkage !== null) {
        roll.measuredLength = measuredLength;
        roll.shrinkage = shrinkage;
        roll.status = 'completed';
    } else if (measuredLength !== null || shrinkage !== null) {
        roll.measuredLength = measuredLength;
        roll.shrinkage = shrinkage;
        roll.status = 'partial';
    } else {
        roll.status = 'pending';
    }
    
    // Recalculate order status
    updateOrderStatus(order);
    
    // Save to storage
    if (USE_GOOGLE_SHEETS && isOnline) {
        try {
            await saveRollToGoogleSheets(
                currentOrderId,
                currentRollNumber,
                roll.factoryLength,
                roll.measuredLength,
                roll.shrinkage,
                roll.status
            );
            showToast('Сохранено в Google Sheets', 'success');
        } catch (error) {
            console.error('Error saving to Google Sheets:', error);
            showToast('Сохранено локально (ошибка синхронизации)', 'warning');
            saveDataLocal();
        }
    } else {
        saveDataLocal();
    }
    
    closeRecordModal();
    
    // Refresh views
    if (document.getElementById('order-detail-page').classList.contains('active')) {
        renderOrderDetail(currentOrderId);
    }
}

function updateOrderStatus(order) {
    const completedCount = order.rolls.filter(r => r.status === 'completed').length;
    const partialCount = order.rolls.filter(r => r.status === 'partial').length;
    
    if (completedCount === order.totalRolls) {
        order.status = 'completed';
    } else if (completedCount > 0 || partialCount > 0) {
        order.status = 'in-progress';
    } else {
        order.status = 'pending';
    }
}

// ===== Orders List =====
function renderOrdersList(filter = '') {
    const container = document.getElementById('orders-list');
    const filteredOrders = Object.values(orders).filter(order => 
        order.id.includes(filter)
    );
    
    if (filteredOrders.length === 0) {
        container.innerHTML = '<p class="empty-state">Заказов не найдено</p>';
        return;
    }
    
    container.innerHTML = filteredOrders.map(order => {
        const completedCount = order.rolls.filter(r => r.status === 'completed').length;
        const progress = (completedCount / order.totalRolls) * 100;
        
        let statusClass = 'pending';
        let statusText = 'Ожидает';
        if (order.status === 'in-progress') {
            statusClass = 'in-progress';
            statusText = 'В работе';
        } else if (order.status === 'completed') {
            statusClass = 'completed';
            statusText = 'Завершён';
        }
        
        return `
            <div class="order-card" data-order-id="${order.id}">
                <div class="order-header">
                    <span class="order-id">Заказ ${order.id}</span>
                    <span class="order-status ${statusClass}">${statusText}</span>
                </div>
                <div class="order-progress-bar">
                    <div class="order-progress-fill" style="width: ${progress}%"></div>
                </div>
                <div class="order-progress">${completedCount} / ${order.totalRolls} рулонов</div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('.order-card').forEach(card => {
        card.addEventListener('click', () => {
            const orderId = card.dataset.orderId;
            showPage('order-detail-page');
            renderOrderDetail(orderId);
        });
    });
}

// ===== Order Detail =====
function renderOrderDetail(orderId) {
    const order = orders[orderId];
    
    if (!order) return;
    
    document.getElementById('detail-order-id').textContent = orderId;
    
    const completedCount = order.rolls.filter(r => r.status === 'completed').length;
    const progress = Math.round((completedCount / order.totalRolls) * 100);
    
    document.getElementById('detail-progress').textContent = `${completedCount}/${order.totalRolls} (${progress}%)`;
    
    // Render rolls table
    const tbody = document.getElementById('rolls-table-body');
    
    tbody.innerHTML = order.rolls.map(roll => {
        let statusBadge = '';
        if (roll.status === 'completed') {
            statusBadge = '<span class="status-badge status-completed">Готов</span>';
        } else if (roll.status === 'partial') {
            statusBadge = '<span class="status-badge status-partial">Частично</span>';
        } else {
            statusBadge = '<span class="status-badge status-pending">Ожидает</span>';
        }
        
        return `
            <tr data-roll="${roll.rollNumber}">
                <td class="roll-roll-number">${roll.rollNumber}</td>
                <td>${roll.factoryLength || '-'}</td>
                <td>${roll.measuredLength || '-'}</td>
                <td>${roll.shrinkage !== null ? roll.shrinkage + '%' : '-'}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
    
    // Add click handlers for editing
    tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('click', () => {
            const rollNumber = parseInt(row.dataset.roll);
            openRecordModal(orderId, rollNumber);
        });
    });
    
    // Update status badge
    let detailStatus = document.getElementById('detail-status');
    detailStatus.className = 'order-status ' + order.status;
    if (order.status === 'pending') detailStatus.textContent = 'Ожидает';
    else if (order.status === 'in-progress') detailStatus.textContent = 'В работе';
    else detailStatus.textContent = 'Завершён';
}

// ===== Search =====
function handleSearch(e) {
    const query = e.target.value;
    renderOrdersList(query);
}

// ===== New Order Modal =====
function openNewOrderModal() {
    document.getElementById('new-order-modal').classList.add('active');
}

function closeNewOrderModal() {
    document.getElementById('new-order-modal').classList.remove('active');
}

async function handleNewOrderSubmit(e) {
    e.preventDefault();
    
    const orderId = document.getElementById('new-order-id').value.trim();
    const totalRolls = parseInt(document.getElementById('new-order-rolls').value);
    
    if (!orderId || isNaN(totalRolls) || totalRolls < 1) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    if (orders[orderId]) {
        showToast('Заказ уже существует', 'error');
        return;
    }
    
    await createOrder(orderId, totalRolls);
    
    closeNewOrderModal();
    document.getElementById('new-order-form').reset();
    showPage('orders-page');
    showToast('Заказ создан', 'success');
}

// ===== Add Roll Modal =====
function openAddRollModal() {
    document.getElementById('add-roll-modal').classList.add('active');
}

function closeAddRollModal() {
    document.getElementById('add-roll-modal').classList.remove('active');
}

function handleAddRoll(e) {
    e.preventDefault();
    
    const rollNumber = parseInt(document.getElementById('new-roll-number').value);
    const factoryLength = parseFloat(document.getElementById('new-roll-factory-length').value);
    
    if (!currentOrderId || isNaN(rollNumber) || isNaN(factoryLength)) {
        showToast('Заполните все поля', 'error');
        return;
    }
    
    const order = orders[currentOrderId];
    
    if (order.rolls.find(r => r.rollNumber === rollNumber)) {
        showToast('Рулон уже существует', 'error');
        return;
    }
    
    order.rolls.push({
        rollNumber,
        factoryLength,
        measuredLength: null,
        shrinkage: null,
        status: 'pending'
    });
    
    order.totalRolls = Math.max(order.totalRolls, rollNumber);
    
    if (USE_GOOGLE_SHEETS && isOnline) {
        saveRollToGoogleSheets(currentOrderId, rollNumber, factoryLength, null, null, 'pending')
            .then(() => showToast('Рулон добавлен в Google Sheets', 'success'))
            .catch(err => {
                console.error(err);
                showToast('Рулон добавлен локально', 'warning');
            });
    }
    
    if (USE_LOCAL_STORAGE || !USE_GOOGLE_SHEETS) {
        saveDataLocal();
    }
    
    renderOrderDetail(currentOrderId);
    closeAddRollModal();
    document.getElementById('add-roll-form').reset();
    showToast('Рулон добавлен', 'success');
}

// ===== QR Code Generation =====
function renderQRCodePage() {
    const container = document.getElementById('qr-codes-grid');
    
    container.innerHTML = TEST_CODES.map(code => `
        <div class="qr-code-item">
            <canvas id="qr-${code}"></canvas>
            <span class="qr-code-label">${code}</span>
        </div>
    `).join('');
    
    // Generate QR codes
    TEST_CODES.forEach(code => {
        const canvas = document.getElementById(`qr-${code}`);
        if (canvas) {
            QRCode.toCanvas(canvas, code, {
                width: 150,
                margin: 2,
                color: {
                    dark: '#1e293b',
                    light: '#ffffff'
                }
            });
        }
    });
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Initialize add roll form handler
document.addEventListener('DOMContentLoaded', () => {
    const addRollForm = document.getElementById('add-roll-form');
    if (addRollForm) {
        addRollForm.addEventListener('submit', handleAddRoll);
    }
});
