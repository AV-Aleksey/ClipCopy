const { app, BrowserWindow, clipboard, globalShortcut, ipcMain } = require('electron')
const path = require('path')
const ClipboardDatabase = require('./database')

let mainWindow
let clipboardDB
let lastClipboardText = ''
let isProgrammaticCopy = false // Флаг для отслеживания программных копирований

function createWindow() {
  // Создаем окно браузера
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false, // Не показываем окно сразу
    titleBarStyle: 'hidden', // Полностью скрываем панель заголовка
    frame: false, // Убираем рамку окна полностью
    vibrancy: 'under-window', // Добавляем эффект вибрации
    visualEffectState: 'active',
    transparent: false,
    backgroundColor: '#F2F2F7', // Системный цвет фона
    title: 'Clipboard History Manager',
    icon: path.join(__dirname, 'assets', 'icon.png'), // Добавьте иконку если есть
    resizable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false
  })

  // Загружаем index.html
  mainWindow.loadFile('index.html')

  // Показываем окно когда оно готово
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Открываем DevTools в режиме разработки
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }
}

// Функция для мониторинга буфера обмена
function startClipboardMonitoring() {
  // Проверяем буфер обмена каждые 500мс
  setInterval(() => {
    const currentText = clipboard.readText()
    
    // Если текст изменился и не пустой
    if (currentText && currentText !== lastClipboardText && currentText.trim() !== '') {
      lastClipboardText = currentText
      
      // Не добавляем в историю, если это программное копирование
      if (!isProgrammaticCopy) {
        // Сохраняем в базу данных
        clipboardDB.addClipboardText(currentText).then(() => {
          // Уведомляем renderer процесс о новом тексте
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('new-clipboard-text', {
              text: currentText,
              timestamp: new Date().toISOString()
            })
          }
        }).catch(err => {
          console.error('Ошибка при сохранении текста в БД:', err)
        })
      } else {
        // Сбрасываем флаг после обработки программного копирования
        isProgrammaticCopy = false
      }
    }
  }, 500)
}

// IPC обработчики
ipcMain.handle('get-clipboard-history', async () => {
  try {
    return await clipboardDB.getClipboardHistory()
  } catch (err) {
    console.error('Ошибка при получении истории:', err)
    return []
  }
})

ipcMain.handle('clear-clipboard-history', async () => {
  try {
    await clipboardDB.clearHistory()
    return { success: true }
  } catch (err) {
    console.error('Ошибка при очистке истории:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('copy-to-clipboard', async (event, text) => {
  try {
    isProgrammaticCopy = true // Устанавливаем флаг программного копирования
    clipboard.writeText(text)
    return { success: true }
  } catch (err) {
    console.error('Ошибка при копировании в буфер обмена:', err)
    isProgrammaticCopy = false // Сбрасываем флаг в случае ошибки
    return { success: false, error: err.message }
  }
})

// Обработчики для управления окном
ipcMain.handle('close-window', () => {
  mainWindow.close()
})

ipcMain.handle('minimize-window', () => {
  mainWindow.minimize()
})

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})

// Создаем окно когда приложение готово
app.whenReady().then(() => {
  // Инициализируем базу данных
  clipboardDB = new ClipboardDatabase()
  
  createWindow()
  
  // Запускаем мониторинг буфера обмена
  startClipboardMonitoring()

  // Регистрируем глобальные горячие клавиши
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit()
  })

  app.on('activate', function () {
    // На macOS пересоздаем окно когда пользователь кликает на иконку dock
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Закрываем приложение когда все окна закрыты
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    if (clipboardDB) {
      clipboardDB.close()
    }
    app.quit()
  }
})

// Очистка при выходе
app.on('before-quit', () => {
  // Отменяем регистрацию горячих клавиш
  globalShortcut.unregisterAll()
  
  if (clipboardDB) {
    clipboardDB.close()
  }
})
