/**
 * Скрипт для добавления заголовков в таблицу
 * Запустите эту функцию один раз
 */

function addHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  // Заголовки столбцов
  var headers = [
    'ID заказа',      // A
    'Номер рулона',  // B
    'Заводской метраж',  // C
    'Измеренный метраж', // D
    'Усадка (%)',    // E
    'Статус',        // F
    'Дата обновления' // G
  ];
  
  // Проверяем, есть ли уже заголовки
  var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  if (existingHeaders[0] && existingHeaders[0] != '') {
    Logger.log('Заголовки уже существуют: ' + existingHeaders);
    return;
  }
  
  // Добавляем заголовки в первую строку
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Закрепляем первую строку
  sheet.setFrozenRows(1);
  
  Logger.log('Заголовки добавлены: ' + headers);
}
