/**
 * Google Apps Script for Fabric Roll Inventory
 * Deploy as Web App with:
 * - Execute as: Me
 * - Who has access: Anyone (or Anyone with Google account)
 * 
 * IMPORTANT: This script must be bound to a spreadsheet
 * OR update SPREADSHEET_ID below to your spreadsheet ID
 */

const SHEET_NAME = 'Data';
const SPREADSHEET_ID = '1Bp6c3Ws8rTvj2TW7YxiAreyyZ8WSdX9cXj3M9C48AOM'; // Your spreadsheet ID

function setup() {
  // Run this once to verify connection
  const sheet = getSheet();
  Logger.log('Script connected to: ' + sheet.getParent().getName());
}

function doGet(e) {
  const mode = e.parameter.mode || 'json';
  
  // JSONP mode for CORS bypass
  if (mode === 'jsonp') {
    const callback = e.parameter.callback || 'callback';
    const action = e.parameter.action || 'getData';
    
    let result;
    try {
      if (action === 'getData') {
        result = { ok: true, data: getData() };
      } else if (action === 'saveData') {
        const dataStr = e.parameter.data;
        let data = [];
        if (dataStr) {
          data = JSON.parse(decodeURIComponent(dataStr));
        }
        result = { ok: true, data: saveData(data) };
      } else {
        result = { ok: false, error: 'Unknown action' };
      }
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    
    const output = ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  }
  
  // Regular JSON mode
  return handleRequest(e);
}

function doPost(e) {
  const mode = e.parameter.mode || 'json';
  
  // JSONP mode for CORS bypass (GET only)
  if (mode === 'jsonp') {
    const callback = e.parameter.callback || 'callback';
    const action = e.parameter.action || 'getData';
    
    let result;
    try {
      if (action === 'getData') {
        result = { ok: true, data: getData() };
      } else if (action === 'saveData') {
        // For saveData with JSONP, data must be in parameter
        const dataStr = e.parameter.data;
        let data = [];
        if (dataStr && dataStr.length < 5000) { // Limit size for GET
          try {
            data = JSON.parse(decodeURIComponent(dataStr));
          } catch(err) {
            result = { ok: false, error: 'Invalid data format' };
            const output = ContentService
              .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
              .setMimeType(ContentService.MimeType.JAVASCRIPT);
            return output;
          }
        } else {
          result = { ok: false, error: 'Data too large for GET, use POST' };
          const output = ContentService
            .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
            .setMimeType(ContentService.MimeType.JAVASCRIPT);
          return output;
        }
        result = { ok: true, data: saveData(data) };
      } else {
        result = { ok: false, error: 'Unknown action' };
      }
    } catch (err) {
      result = { ok: false, error: err.message };
    }
    
    const output = ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  }
  
  // POST mode for saving data (handles larger data)
  let postData = null;
  if (e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      if (parsed.action === 'saveData' && parsed.data) {
        return ContentService.createTextOutput(JSON.stringify(saveData(parsed.data))).setMimeType(ContentService.MimeType.JSON);
      }
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  return handleRequest(e);
}

function handleRequest(e) {
  let action = e.parameter.action;
  let postData = null;
  
  // Try to get action from POST body
  if (e.postData && e.postData.contents) {
    try {
      const parsed = JSON.parse(e.postData.contents);
      if (parsed.action) action = parsed.action;
      if (parsed.data) postData = parsed.data;
    } catch (err) {
      // Couldn't parse POST body
    }
  }
  
  // For GET requests, data might be in the 'data' parameter
  if (!postData && e.parameter.data) {
    try {
      postData = JSON.parse(decodeURIComponent(e.parameter.data));
    } catch (err) {
      // Couldn't parse data parameter
    }
  }
  
  try {
    let result;
    
    switch(action) {
      case 'getData':
        result = getData();
        break;
      case 'saveData':
        result = saveData(postData);
        break;
      default:
        result = { error: 'Unknown action' };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getData() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const orders = {};
  const recentScans = [];
  
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let orderId = row[0];  // Column A: Order ID
    
    // Skip empty rows
    if (!orderId && orderId !== 0) continue;
    
    // Convert to string for comparison
    orderId = String(orderId);
    
    // Check if this is a recent scan entry (starts with SCAN:)
    if (orderId.startsWith('SCAN:')) {
      recentScans.push({
        code: orderId.substring(5),
        timestamp: row[1] || ''
      });
      continue;
    }
    
    if (!orders[orderId]) {
      orders[orderId] = {
        id: orderId,
        totalRolls: 0,
        rolls: [],
        status: 'pending'
      };
    }
    
    const rollNumber = row[1] ? parseInt(row[1]) : 0;  // Column B: Roll Number
    let factoryLength = row[2];  // Column C: Factory Length
    let measuredLength = row[3];  // Column D: Measured Length
    let shrinkage = row[4];  // Column E: Shrinkage
    let status = row[5];  // Column F: Status
    
    // Convert string numbers with comma to point
    if (typeof factoryLength === 'string') factoryLength = parseFloat(factoryLength.replace(',', '.'));
    if (typeof measuredLength === 'string') measuredLength = parseFloat(measuredLength.replace(',', '.'));
    if (typeof shrinkage === 'string') shrinkage = parseFloat(shrinkage.replace(',', '.'));
    
    // Calculate status automatically if not set
    if (!status || status === '') {
      if (measuredLength && shrinkage) {
        status = 'completed';
      } else if (factoryLength && (measuredLength || shrinkage)) {
        status = 'partial';
      } else {
        status = 'pending';
      }
    }
    
    // Skip if no roll number
    if (!rollNumber || rollNumber === 0) continue;
    
    // Update total rolls if needed
    if (rollNumber > orders[orderId].totalRolls) {
      orders[orderId].totalRolls = rollNumber;
    }
    
    orders[orderId].rolls.push({
      rollNumber: rollNumber,
      factoryLength: factoryLength || null,
      measuredLength: measuredLength || null,
      shrinkage: shrinkage || null,
      status: status
    });
  }
  
  return { orders: orders, recentScans: recentScans };
}

function saveData(data) {
  const sheet = getSheet();
  
  // Read existing data from sheet
  const existingData = {};
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const existingRows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    existingRows.forEach(row => {
      const key = row[0] + '_' + row[1]; // OrderID_RollNumber
      existingData[key] = row;
    });
  }
  
  // Merge new data with existing
  const headers = ['Order ID', 'Roll Number', 'Factory Length', 'Measured Length', 'Shrinkage', 'Status'];
  
  // Handle both array format and object format
  let ordersArray = [];
  if (Array.isArray(data)) {
    ordersArray = data;
  } else if (data && data.orders && Array.isArray(data.orders)) {
    ordersArray = data.orders;
  }
  
  // Update with new data
  if (ordersArray.length > 0) {
    ordersArray.forEach(item => {
      // Convert string numbers with comma to point
      let factoryLength = item.factoryLength;
      let measuredLength = item.measuredLength;
      let shrinkage = item.shrinkage;
      
      if (typeof factoryLength === 'string') factoryLength = parseFloat(factoryLength.replace(',', '.'));
      if (typeof measuredLength === 'string') measuredLength = parseFloat(measuredLength.replace(',', '.'));
      if (typeof shrinkage === 'string') shrinkage = parseFloat(shrinkage.replace(',', '.'));
      
      // Calculate status automatically
      let status = 'pending';
      if (measuredLength && shrinkage) {
        status = 'completed';
      } else if (factoryLength && (measuredLength || shrinkage)) {
        status = 'partial';
      }
      
      const key = item.orderId + '_' + item.rollNumber;
      existingData[key] = [
        item.orderId,
        item.rollNumber,
        factoryLength || '',
        measuredLength || '',
        shrinkage || '',
        status
      ];
    });
  }
  
  // Convert back to array
  const allRows = Object.values(existingData);
  
  // Clear and write all data
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
  
  // Write headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  if (allRows.length > 0) {
    sheet.getRange(2, 1, allRows.length, headers.length).setValues(allRows);
  }
  
  return { success: true, message: 'Data saved successfully' };
}

function getSheet() {
  // Use the spreadsheet ID directly
  const doc = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  let sheet = doc.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = doc.insertSheet(SHEET_NAME);
    // Create headers
    sheet.getRange(1, 1, 1, 6).setValues([[
      'Order ID', 'Roll Number', 'Factory Length', 'Measured Length', 'Shrinkage', 'Status'
    ]]);
  }
  
  return sheet;
}
