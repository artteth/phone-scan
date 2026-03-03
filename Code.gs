/**
 * Google Apps Script for Fabric Roll Inventory
 * Deploy as Web App with:
 * - Execute as: Me
 * - Who has access: Anyone (or Anyone with Google account)
 */

const SHEET_NAME = 'Data';
const SCRIPT_PROP = PropertiesService.getScriptProperties();

function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  SCRIPT_PROP.setProperty('key', doc.getId());
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const action = e.parameter.action || (e.postData ? JSON.parse(e.postData.contents).action : null);
  
  try {
    let result;
    
    switch(action) {
      case 'getData':
        result = getData();
        break;
      case 'saveData':
        const postData = JSON.parse(e.postData.contents);
        result = saveData(postData.data);
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
  
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const orderId = row[0];  // Column A: Order ID
    
    if (!orderId) continue;
    
    if (!orders[orderId]) {
      orders[orderId] = {
        id: orderId,
        totalRolls: 0,
        rolls: [],
        status: 'pending'
      };
    }
    
    const rollNumber = row[1];  // Column B: Roll Number
    const factoryLength = row[2];  // Column C: Factory Length
    const measuredLength = row[3];  // Column D: Measured Length
    const shrinkage = row[4];  // Column E: Shrinkage
    const status = row[5];  // Column F: Status
    
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
  
  return { orders: orders };
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
  
  // Write data
  if (data && data.length > 0) {
    const rows = data.map(item => [
      item.orderId,
      item.rollNumber,
      item.factoryLength || '',
      item.measuredLength || '',
      item.shrinkage || '',
      item.status || 'pending'
    ]);
    
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  
  return { success: true, message: 'Data saved successfully' };
}

function getSheet() {
  const doc = SpreadsheetApp.openById(SCRIPT_PROP.getProperty('key'));
  
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
