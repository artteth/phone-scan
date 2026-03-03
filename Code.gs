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
  return handleRequest(e);
}

function doPost(e) {
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
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
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
    const factoryLength = row[2];  // Column C: Factory Length
    const measuredLength = row[3];  // Column D: Measured Length
    const shrinkage = row[4];  // Column E: Shrinkage
    const status = row[5];  // Column F: Status
    
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
      status: status || 'pending'
    });
  }
  
  return { orders: orders, recentScans: recentScans };
}

function saveData(data) {
  const sheet = getSheet();
  
  // Clear existing data (keep header)
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
  
  // Write headers
  const headers = ['Order ID', 'Roll Number', 'Factory Length', 'Measured Length', 'Shrinkage', 'Status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  const allRows = [];
  
  // Write orders data
  if (data.orders && data.orders.length > 0) {
    data.orders.forEach(item => {
      allRows.push([
        item.orderId,
        item.rollNumber,
        item.factoryLength || '',
        item.measuredLength || '',
        item.shrinkage || '',
        item.status || 'pending'
      ]);
    });
  }
  
  // Write recent scans
  if (data.recentScans && data.recentScans.length > 0) {
    data.recentScans.forEach(scan => {
      allRows.push([
        'SCAN:' + scan.code,
        scan.timestamp,
        '',
        '',
        '',
        ''
      ]);
    });
  }
  
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
