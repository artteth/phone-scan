# Fabric Roll Inventory - Синхронизация с Google Таблицами

## Возможности

- 📱 Мобильное веб-приложение для сканирования QR-кодов
- 📊 Синхронизация данных с Google Таблицей в реальном времени
- 🔄 Автообновление каждые 5 секунд
- 💾 Локальное хранение данных в браузере
- 📝 Запись измерений рулонов ткани

## Структура Google Таблицы

Создайте таблицу с таким листом и заголовками:

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Order ID | Roll Number | Factory Length | Measured Length | Shrinkage | Status |

**ID Таблицы:** `1Bp6c3Ws8rTvj2TW7YxiAreyyZ8WSdX9cXj3M9C48AOM`

## Настройка Google Apps Script

1. Откройте [Google Apps Script](https://script.google.com/)
2. Создайте новый проект
3. Скопируйте код из файла `Code.gs` в редактор
4. Нажмите **Deploy** → **New deployment**
5. Выберите тип **Web app**
6. Настройте:
   - Description: v1
   - Execute as: Me
   - Who has access: Anyone
7. Нажмите **Deploy**
8. Скопируйте URL веб-приложения (вид: `https://script.google.com/macros/s/AKfycb.../exec`)

## Обновление URL в приложении

В файле `index.html` найдите строку:
```javascript
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/ВАШ_URL/exec';
```
И замените на ваш URL из Google Apps Script.

## Развёртывание

### Вариант 1: GitHub Pages (рекомендуется)
1. Создайте репозиторий на GitHub
2. Загрузите файлы: `index.html`, `styles.css`, `serve.js`
3. Включите GitHub Pages в настройках репозитория
4. Откройте `https://ваш-ник.github.io/репозиторий`

### Вариант 2: Локальный сервер
```bash
npm install
node serve.js
```
Откройте `http://localhost:3000` или IP-адрес компьютера.

## Как работает синхронизация

### JSONP для обхода CORS
Приложение использует JSONP (JSON with Padding) для обхода ограничений CORS:
- Создаётся тег `<script>` с URL Google Apps Script
- Сервер возвращает данные в формате: `callbackName({ ...данные... })`
- Браузер выполняет скрипт и передаёт данные в функцию

### Статусы заказов
Статус автоматически вычисляется в Google Apps Script:
- `pending` - нет измерений
- `partial` - частично измерено (есть Factory Length + Measured Length или Shrinkage)
- `completed` - полностью измерено (есть Measured Length И Shrinkage)

### Автосинхронизация
- При запуске приложение загружает данные из Google Таблицы
- Каждые 5 секунд выполняется синхронизация
- При сохранении данных они автоматически отправляются в таблицу
- Кнопка 🔄 для принудительной синхронизации

## Формат данных

### Пример URL для получения данных:
```
https://script.google.com/macros/s/AKfycb.../exec?mode=jsonp&action=getData&callback=jsonp_callback_123
```

### Ответ:
```json
{
  "orders": {
    "2020": {
      "id": "2020",
      "totalRolls": 5,
      "rolls": [
        {
          "rollNumber": 1,
          "factoryLength": 50,
          "measuredLength": 48.5,
          "shrinkage": 3.0,
          "status": "completed"
        }
      ],
      "status": "in-progress"
    }
  },
  "recentScans": []
}
```

## Использование

1. **Сканирование QR-кода** - отсканируйте код формата `НОМЕР_ЗАКАЗА_НОМЕР_РУЛОНА` (например: `2020_1`)
2. **Ввод вручную** - если QR-код не сканируется, введите код вручную
3. **Запись измерений** - введите Factory Length, Measured Length, Shrinkage
4. **Синхронизация** - данные автоматически сохраняются в Google Таблицу

## Устранение проблем

### Ошибка CORS
Убедитесь что:
- Web App задеплоен с доступом "Anyone"
- Используется режим `mode=jsonp`

### Данные не загружаются
- Проверьте консоль браузера (F12 → Console)
- Убедитесь что URL веб-приложения правильный
- Проверьте что в таблице есть данные

### Статус не обновляется
- Обновите код Google Apps Script
- Выполните повторное развёртывание

## Файлы проекта

- `index.html` - основной HTML файл с JavaScript
- `styles.css` - стили приложения
- `serve.js` - локальный сервер для разработки
- `Code.gs` - Google Apps Script код
- `SPEC.md` - спецификация проекта
