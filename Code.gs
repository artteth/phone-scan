/**
 * Google Apps Script API для инвентаризации рулонов ткани
 * Используется для подключения к GitHub Pages версии
 */

const SHEET_NAME = 'Inventory';

// ===== Get Sheet =====
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'ID заказа',
      'Номер рулона',
      'Заводской метраж',
      'Измеренный метраж',
      'Усадка (%)',
      'Статус',
      'Дата обновления'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

// ===== API: Get all orders =====
function getOrders() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const orders = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const orderId = String(row[0]);
    
    if (!orderId) continue;
    
    if (!orders[orderId]) {
      orders[orderId] = {
        id: orderId,
        totalRolls: 0,
        rolls: [],
        status: 'pending'
      };
    }
    
    orders[orderId].rolls.push({
      rollNumber: row[1],
      factoryLength: row[2],
      measuredLength: row[3],
      shrinkage: row[4],
      status: row[5],
      lastUpdated: row[6]
    });
    orders[orderId].totalRolls++;
    
    if (row[5] === 'completed') {
      orders[orderId].status = 'completed';
    } else if (orders[orderId].status !== 'completed') {
      orders[orderId].status = 'in-progress';
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ orders: Object.values(orders) }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== API: Save roll =====
function saveRoll(data) {
  const sheet = getSheet();
  const orderId = String(data.orderId);
  const rollNumber = parseInt(data.rollNumber);
  const factoryLength = data.factoryLength;
  const measuredLength = data.measuredLength;
  const shrinkage = data.shrinkage;
  const status = data.status;
  const lastUpdated = new Date().toLocaleString('ru-RU');
  
  // Find existing row
  const dataRange = sheet.getDataRange().getValues();
  let existingRow = null;
  
  for (let i = 1; i < dataRange.length; i++) {
    if (String(dataRange[i][0]) === orderId && dataRange[i][1] === rollNumber) {
      existingRow = i + 1;
      break;
    }
  }
  
  if (existingRow) {
    sheet.getRange(existingRow, 1, 1, 7).setValues([[
      orderId, rollNumber, factoryLength || '', measuredLength || '', 
      shrinkage || '', status || 'pending', lastUpdated
    ]]);
  } else {
    sheet.appendRow([
      orderId, rollNumber, factoryLength || '', measuredLength || '', 
      shrinkage || '', status || 'pending', lastUpdated
    ]);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== API: Create order =====
function createOrder(data) {
  const sheet = getSheet();
  const orderId = String(data.orderId);
  const totalRolls = parseInt(data.totalRolls);
  const rolls = data.rolls;
  const lastUpdated = new Date().toLocaleString('ru-RU');
  
  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i];
    sheet.appendRow([
      orderId, roll.rollNumber, roll.factoryLength || '', 
      roll.measuredLength || '', roll.shrinkage || '', 
      roll.status || 'pending', lastUpdated
    ]);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== API: Delete order =====
function deleteOrder(orderId) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === orderId) {
      sheet.deleteRow(i + 1);
    }
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Main Handler for GET/POST =====
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    let action = e.parameter.action;
    let postData = null;
    
    // Parse POST body
    if (e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
      if (postData && postData.action) {
        action = postData.action;
      }
    }
    
    switch (action) {
      case 'getOrders':
        return getOrders();
      case 'saveRoll':
        return saveRoll(postData);
      case 'createOrder':
        return createOrder(postData);
      case 'deleteOrder':
        return deleteOrder(postData.orderId);
      default:
        return ContentService
          .createTextOutput(JSON.stringify({ error: 'Unknown action: ' + action }))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
