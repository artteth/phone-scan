/**
 * Приложение для инвентаризации рулонов ткани
 * Сканирование QR-кодов, запись измерений, управление заказами
 */

// ИСПОЛЬЗУЕМ ЛОКАЛЬНЫЙ GOOGLE SHEETS API v1
const GOOGLE_SHEETS_URL = '/api/v1/data';

const STORAGE_KEY = 'fabric_inventory_data';
const RECENT_SCANS_KEY = 'recent_scans';
const SYNC_STATUS_KEY = 'last_sync_time';

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
let isSyncing = false;
let lastSyncTime = null;
let forceSync = false;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initializeEventListeners();
    renderRecentScans();
    renderQRCodePage();
    
    // Add focus listener to populate dropdown when opened
    const orderSearchSelect = document.getElementById('order-search');
    if (orderSearchSelect) {
        orderSearchSelect.addEventListener('mousedown', () => {
            console.log('Order search select clicked, populating...');
            populateOrderSearch();
        });
        orderSearchSelect.addEventListener('focus', () => {
            console.log('Order search select focused, populating...');
            populateOrderSearch();
        });
    }
    
    // Show initial sync status
    updateSyncStatus(lastSyncTime ? 'success' : '');
    
    // Try to sync - this will fetch from Google Sheets
    console.log('App loaded, attempting initial sync...');
    syncWithGoogleSheets();
});

// ===== Data Management =====
function loadData() {
    const storedOrders = localStorage.getItem(STORAGE_KEY);
    const storedScans = localStorage.getItem(RECENT_SCANS_KEY);
    const storedSyncTime = localStorage.getItem(SYNC_STATUS_KEY);
    
    if (storedOrders) {
        orders = JSON.parse(storedOrders);
    }
    
    if (storedScans) {
        recentScans = JSON.parse(storedScans);
    }
    
    if (storedSyncTime) {
        lastSyncTime = storedSyncTime;
    }
    
    // Clear old test data - we want fresh data from Google Sheets
    // This ensures old test orders don't persist
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(recentScans));
    
    // Immediately sync to Google Sheets
    syncToGoogleSheets();
}

// ===== Google Sheets Sync =====
// Loading overlay functions
function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
}

async function syncWithGoogleSheets(showLoadingFlag = false) {
    if (isSyncing) return;
    
    isSyncing = true;
    updateSyncStatus('syncing');
    
    // Show loading overlay if manual sync (from button)
    if (showLoadingFlag) {
        showLoading();
    }
    
    console.log('Starting sync from Google Sheets...');
    
    try {
        const url = GOOGLE_SHEETS_URL;
        console.log('Fetching from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow'
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error('Network response was not ok: ' + response.status);
        }
        
        const text = await response.text();
        console.log('Response:', text.substring(0, 200));
        
        const data = JSON.parse(text);
        
        if (data.error) {
            throw new Error('Server error: ' + data.error);
        }
        
        // If force sync, clear local data first
        if (forceSync) {
            console.log('Force sync - clearing local data');
            orders = {};
            recentScans = [];
            forceSync = false;
        }
        
        if (data && data.orders) {
            // Replace local data with data from Google Sheets
            orders = {};
            mergeOrdersData(data.orders);
            
            // Also sync recent scans
            if (data.recentScans && Array.isArray(data.recentScans)) {
                recentScans = data.recentScans;
            }
            
            // Save to local storage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
            localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(recentScans));
            
            renderRecentScans();
            populateOrderSearch();
            renderOrdersList();
            console.log('Data synced from Google Sheets successfully');
            console.log('Orders:', JSON.stringify(orders));
        }
        
        lastSyncTime = new Date().toISOString();
        localStorage.setItem(SYNC_STATUS_KEY, lastSyncTime);
        updateSyncStatus('success');
        showToast('Данные синхронизированы', 'success');
        
    } catch (error) {
        console.error('Error syncing with Google Sheets:', error);
        updateSyncStatus('error');
        showToast('Ошибка синхронизации: ' + error.message, 'error');
    } finally {
        isSyncing = false;
        hideLoading();
    }
}

function forceRefresh() {
    console.log('Force refresh clicked - showing confirmation');
    // Show confirmation modal instead of alert
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.add('active');
    }
}

function executeForceRefresh() {
    console.log('Force refresh - clearing local data and syncing');
    forceSync = true;
    // Clear local storage
    orders = {};
    recentScans = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RECENT_SCANS_KEY);
    renderOrdersList();
    renderRecentScans();
    // Trigger sync with loading overlay
    syncWithGoogleSheets(true);
    // Close modal
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function syncToGoogleSheets() {
    if (isSyncing) return;
    
    isSyncing = true;
    updateSyncStatus('syncing');
    console.log('Starting sync to Google Sheets (single row update)...');
    
    try {
        // Convert orders to array format and send each roll individually
        const sheetsData = convertOrdersToSheetsFormat();
        console.log('Sending data:', JSON.stringify({ data: sheetsData }));
        
        // Use PUT request for single row update (no table flashing!)
        // Send all rolls one by one
        if (sheetsData.orders && sheetsData.orders.length > 0) {
            for (const order of sheetsData.orders) {
                const url = `${GOOGLE_SHEETS_URL}/${order.orderId}/${order.rollNumber}`;
                console.log('PUT to:', url);
                
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        factoryLength: order.factoryLength,
                        measuredLength: order.measuredLength,
                        shrinkage: order.shrinkage,
                        status: order.status
                    })
                });
                
                if (!response.ok) {
                    console.error('Error saving row:', order.orderId, order.rollNumber);
                }
            }
        }
        
        lastSyncTime = new Date().toISOString();
        localStorage.setItem(SYNC_STATUS_KEY, lastSyncTime);
        updateSyncStatus('success');
        console.log('Data synced to Google Sheets successfully (no flashing!)');
        
    } catch (error) {
        console.error('Error syncing to Google Sheets:', error);
        updateSyncStatus('error');
        showToast('Ошибка сохранения: ' + error.message, 'error');
    } finally {
        isSyncing = false;
    }
}

function convertOrdersToSheetsFormat() {
    const ordersData = [];
    
    Object.values(orders).forEach(order => {
        order.rolls.forEach(roll => {
            ordersData.push({
                orderId: order.id,
                rollNumber: roll.rollNumber,
                totalRolls: order.totalRolls,
                factoryLength: roll.factoryLength,
                measuredLength: roll.measuredLength,
                shrinkage: roll.shrinkage,
                status: roll.status
            });
        });
    });
    
    return { orders: ordersData, recentScans: recentScans };
}

function mergeOrdersData(sheetsData) {
    // Create a map from local orders
    const localOrdersMap = {};
    Object.values(orders).forEach(order => {
        localOrdersMap[order.id] = order;
    });
    
    // Process data from Google Sheets
    sheetsData.forEach(item => {
        const orderId = item.orderId;
        const rollNumber = item.rollNumber;
        
        if (!localOrdersMap[orderId]) {
            // Create new order
            localOrdersMap[orderId] = {
                id: orderId,
                totalRolls: item.totalRolls || 1,
                rolls: [],
                status: 'pending'
            };
            orders[orderId] = localOrdersMap[orderId];
        }
        
        const order = localOrdersMap[orderId];
        
        // Update total rolls if needed
        if (item.totalRolls && item.totalRolls > order.totalRolls) {
            order.totalRolls = item.totalRolls;
        }
        
        // Find or create roll
        let roll = order.rolls.find(r => r.rollNumber === rollNumber);
        
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
        
        // Merge data - prioritize more complete data
        if (item.factoryLength !== null && item.factoryLength !== undefined) {
            roll.factoryLength = item.factoryLength;
        }
        
        if (item.measuredLength !== null && item.measuredLength !== undefined) {
            roll.measuredLength = item.measuredLength;
        }
        
        if (item.shrinkage !== null && item.shrinkage !== undefined) {
            roll.shrinkage = item.shrinkage;
        }
        
        // Update status
        if (item.status) {
            roll.status = item.status;
        }
        
        // Update order status
        updateOrderStatus(order);
    });
}

function updateSyncStatus(status) {
    const statusElement = document.getElementById('sync-status');
    const statusText = document.getElementById('sync-status-text');
    const syncBtn = document.getElementById('manual-sync-btn');
    
    if (statusElement) {
        statusElement.className = 'sync-indicator ' + status;
    }
    
    if (statusText) {
        switch(status) {
            case 'syncing':
                statusText.textContent = 'Синхронизация...';
                break;
            case 'success':
                statusText.textContent = 'Синхронизировано';
                break;
            case 'error':
                statusText.textContent = 'Ошибка синхронизации';
                break;
            default:
                statusText.textContent = '';
        }
    }
    
    // Add spinning animation to button
    if (syncBtn) {
        if (status === 'syncing') {
            syncBtn.classList.add('spinning');
        } else {
            syncBtn.classList.remove('spinning');
        }
    }
}

function manualSync() {
    console.log('Manual sync button clicked');
    showToast('Начинаем загрузку данных...', 'info');
    syncWithGoogleSheets(true); // true = show loading overlay
}

function clearAllData() {
    if (confirm('Вы уверены? Все данные будут удалены.')) {
        orders = {};
        recentScans = [];
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(RECENT_SCANS_KEY);
        localStorage.removeItem(SYNC_STATUS_KEY);
        lastSyncTime = null;
        renderOrdersList();
        renderRecentScans();
        showToast('Все данные очищены', 'success');
    }
}

function initializeTestData() {
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
    
    saveData();
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
    document.getElementById('order-search').addEventListener('change', handleSearch);
    
    // Sync buttons
    const manualSyncBtn = document.getElementById('manual-sync-btn');
    if (manualSyncBtn) {
        manualSyncBtn.addEventListener('click', manualSync);
    }
    
    const refreshSyncBtn = document.getElementById('refresh-sync-btn');
    if (refreshSyncBtn) {
        refreshSyncBtn.addEventListener('click', manualSync);
    }
    
    const forceRefreshBtn = document.getElementById('force-refresh-btn');
    if (forceRefreshBtn) {
        forceRefreshBtn.addEventListener('click', forceRefresh);
    }

    // Confirm modal buttons
    const confirmContinueBtn = document.getElementById('confirm-continue');
    if (confirmContinueBtn) {
        confirmContinueBtn.addEventListener('click', executeForceRefresh);
    }

    const confirmCancelBtn = document.getElementById('confirm-cancel');
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', closeConfirmModal);
    }

    const closeConfirmBtn = document.getElementById('close-confirm');
    if (closeConfirmBtn) {
        closeConfirmBtn.addEventListener('click', closeConfirmModal);
    }
    
    // Clear data button
    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', clearAllData);
    }
}

// ===== Navigation =====
function showPage(pageId) {
    console.log('showPage called with:', pageId);
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    
    if (pageId === 'orders-page') {
        console.log('Going to orders page, calling populateOrderSearch');
        populateOrderSearch();
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

function processScannedCode(code) {
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
        
        createOrder(orderId, rollCount, rollNumber);
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

function addToRecentScans(code) {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    // Remove if already exists
    recentScans = recentScans.filter(scan => scan.code !== code);
    
    // Add to beginning
    recentScans.unshift({ code, timestamp });
    
    // Keep only 5 recent
    recentScans = recentScans.slice(0, 5);
    
    saveData();
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
    const roll = order.rolls.find(r => r.rollNumber === rollNumber);
    
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

function saveRollData(complete) {
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
    
    saveData();
    closeRecordModal();
    showToast('Данные сохранены', 'success');
    
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
                <div class="order-progress">${completedCount} из ${order.totalRolls} рулонов</div>
                <div class="order-progress-bar">
                    <div class="order-progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('.order-card').forEach(card => {
        card.addEventListener('click', () => {
            const orderId = card.dataset.orderId;
            showOrderDetail(orderId);
        });
    });
}

function handleSearch(e) {
    renderOrdersList(e.target.value);
}

function populateOrderSearch() {
    const select = document.getElementById('order-search');
    console.log('populateOrderSearch called, orders:', Object.keys(orders));
    if (!select) {
        console.error('order-search select not found!');
        return;
    }
    // Keep the first default option
    select.innerHTML = '<option value="">Выберите номер заказа...</option>';
    
    // Get all order IDs and sort them
    const orderIds = Object.keys(orders).sort();
    console.log('Order IDs:', orderIds);
    
    // Add each order as an option
    orderIds.forEach(orderId => {
        const option = document.createElement('option');
        option.value = orderId;
        option.textContent = 'Заказ ' + orderId;
        select.appendChild(option);
    });
    console.log('Dropdown options added, count:', orderIds.length);
}

// ===== Order Detail =====
function showOrderDetail(orderId) {
    currentOrderId = orderId;
    document.getElementById('detail-order-id').textContent = orderId;
    renderOrderDetail(orderId);
    showPage('order-detail-page');
}

function renderOrderDetail(orderId) {
    const order = orders[orderId];
    const completedCount = order.rolls.filter(r => r.status === 'completed').length;
    
    document.getElementById('order-progress').textContent = `${completedCount}/${order.totalRolls} рулонов`;
    
    let statusClass = 'pending';
    let statusText = 'Ожидает';
    if (order.status === 'in-progress') {
        statusClass = 'in-progress';
        statusText = 'В работе';
    } else if (order.status === 'completed') {
        statusClass = 'completed';
        statusText = 'Завершён';
    }
    
    const statusBadge = document.getElementById('order-status');
    statusBadge.className = `summary-value status-badge ${statusClass}`;
    statusBadge.textContent = statusText;
    
    const tbody = document.getElementById('rolls-tbody');
    tbody.innerHTML = order.rolls.map(roll => {
        let statusClass = 'pending';
        let statusText = 'Ожидает';
        if (roll.status === 'partial') {
            statusClass = 'partial';
            statusText = 'Частично';
        } else if (roll.status === 'completed') {
            statusClass = 'completed';
            statusText = 'Готов';
        }
        
        return `
            <tr>
                <td class="roll-roll-number">${roll.rollNumber}</td>
                <td>${roll.factoryLength !== null ? roll.factoryLength + ' м' : '-'}</td>
                <td>${roll.measuredLength !== null ? roll.measuredLength + ' м' : '-'}</td>
                <td>${roll.shrinkage !== null ? roll.shrinkage + '%' : '-'}</td>
                <td><span class="roll-status ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="edit-roll-btn" data-roll="${roll.rollNumber}">Изменить</button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Add click handlers for edit buttons
    tbody.querySelectorAll('.edit-roll-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const rollNumber = parseInt(btn.dataset.roll);
            openRecordModal(orderId, rollNumber);
        });
    });
}

// ===== New Order =====
function openNewOrderModal() {
    document.getElementById('new-order-modal').classList.add('active');
    document.getElementById('new-order-id').value = '';
    document.getElementById('new-order-rolls').value = '';
}

function closeNewOrderModal() {
    document.getElementById('new-order-modal').classList.remove('active');
}

function handleNewOrderSubmit(e) {
    e.preventDefault();
    
    const orderId = document.getElementById('new-order-id').value.trim();
    const totalRolls = parseInt(document.getElementById('new-order-rolls').value);
    
    if (!orderId || isNaN(totalRolls) || totalRolls < 1) {
        showToast('Заполните все поля корректно', 'error');
        return;
    }
    
    createOrder(orderId, totalRolls);
    closeNewOrderModal();
    showToast('Заказ создан', 'success');
    renderOrdersList();
}

function createOrder(orderId, totalRolls, activeRollNumber = null) {
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
    
    orders[orderId] = {
        id: orderId,
        totalRolls,
        rolls,
        status: 'pending'
    };
    
    saveData();
    
    // Update the order dropdown if on orders page
    const orderSearchSelect = document.getElementById('order-search');
    if (orderSearchSelect) {
        populateOrderSearch();
    }
    
    if (activeRollNumber) {
        openRecordModal(orderId, activeRollNumber);
    }
}

// ===== Add Roll =====
function openAddRollModal() {
    const rollNumber = orders[currentOrderId].rolls.length + 1;
    openRecordModal(currentOrderId, rollNumber);
}

// ===== QR Codes Page =====
function renderQRCodePage() {
    const container = document.getElementById('qr-codes-grid');
    
    container.innerHTML = TEST_CODES.map(code => `
        <div class="qr-code-item">
            <canvas id="qr-${code}"></canvas>
            <div class="qr-code-label">${code}</div>
        </div>
    `).join('');
    
    // Generate QR codes
    TEST_CODES.forEach(code => {
        const canvas = document.getElementById(`qr-${code}`);
        if (canvas) {
            QRCode.toCanvas(canvas, code, {
                width: 120,
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
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
