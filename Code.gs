/**
 * Google Apps Script для инвентаризации рулонов ткани
 * Полное веб-приложение с HTML интерфейсом
 */

const SHEET_NAME = 'Inventory';

// ===== Web App Interface =====
function doGet() {
  const template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()
    .setTitle('Сканер рулонов ткани')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Включить CSS в HTML
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===== API Endpoints =====

function doPost(e) {
  const action = e.parameter.action;
  const postData = JSON.parse(e.postData.contents);
  
  try {
    switch (action) {
      case 'saveRoll':
        return saveRoll(postData);
      case 'createOrder':
        return createOrder(postData);
      case 'getOrders':
        return getOrders();
      case 'getOrder':
        return getOrder(postData.orderId);
      case 'deleteOrder':
        return deleteOrder(postData.orderId);
      default:
        return jsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// ===== Get Sheet =====
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Заголовки на РУССКОМ
    const headers = [
      'ID заказа',         // A
      'Номер рулона',     // B
      'Заводской метраж', // C
      'Измеренный метраж', // D
      'Усадка (%)',       // E
      'Статус',           // F
      'Дата обновления'   // G
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
    const orderId = row[0];
    
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
  
  return jsonResponse({ orders: Object.values(orders) });
}

// ===== API: Get single order =====
function getOrder(orderId) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  
  const order = {
    id: orderId,
    totalRolls: 0,
    rolls: [],
    status: 'pending'
  };
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === orderId) {
      const row = data[i];
      order.rolls.push({
        rollNumber: row[1],
        factoryLength: row[2],
        measuredLength: row[3],
        shrinkage: row[4],
        status: row[5],
        lastUpdated: row[6]
      });
      order.totalRolls++;
      
      if (row[5] === 'completed') order.status = 'completed';
      else if (order.status !== 'completed') order.status = 'in-progress';
    }
  }
  
  order.rolls.sort(function(a, b) { return a.rollNumber - b.rollNumber; });
  return jsonResponse({ order });
}

// ===== API: Save roll =====
function saveRoll(data) {
  const sheet = getSheet();
  var orderId = data.orderId;
  var rollNumber = data.rollNumber;
  var factoryLength = data.factoryLength;
  var measuredLength = data.measuredLength;
  var shrinkage = data.shrinkage;
  var status = data.status;
  var lastUpdated = new Date().toLocaleString('ru-RU');
  
  var existingRow = findRow(orderId, rollNumber);
  
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
  
  return jsonResponse({ success: true });
}

// ===== API: Create order =====
function createOrder(data) {
  var sheet = getSheet();
  var orderId = data.orderId;
  var totalRolls = data.totalRolls;
  var rolls = data.rolls;
  var lastUpdated = new Date().toLocaleString('ru-RU');
  
  for (var i = 0; i < rolls.length; i++) {
    var roll = rolls[i];
    sheet.appendRow([
      orderId, roll.rollNumber, roll.factoryLength || '', 
      roll.measuredLength || '', roll.shrinkage || '', 
      roll.status || 'pending', lastUpdated
    ]);
  }
  
  return jsonResponse({ success: true });
}

// ===== API: Delete order =====
function deleteOrder(orderId) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === orderId) {
      sheet.deleteRow(i + 1);
    }
  }
  
  return jsonResponse({ success: true });
}

// ===== Helper: Find row =====
function findRow(orderId, rollNumber) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === orderId && data[i][1] === rollNumber) {
      return i + 1;
    }
  }
  return null;
}

// ===== Helper: JSON response =====
function jsonResponse(data, statusCode) {
  statusCode = statusCode || 200;
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode(statusCode);
}
