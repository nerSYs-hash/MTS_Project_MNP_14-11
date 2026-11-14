const { app, BrowserWindow, shell, ipcMain, Notification: ElectronNotification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
// В Electron обычный require('fs') считает любой файл .asar виртуальной папкой (stats.isFile() === false).
// Для копирования, проверки размера и удаления самого файла update.asar на диске используем original-fs:
const origFs = (() => {
  try {
    return require('original-fs');
  } catch {
    return fs;
  }
})();

// Устанавливаем AppUserModelId для корректной работы системных Push-уведомлений Windows 10/11
if (process.platform === 'win32') {
  app.setAppUserModelId('ru.mts.mnp.urm');
}

let mainWindow = null;

/**
 * Автоматическое обновление через файл 'update.asar' в корневой папке рядом с .exe:
 * 1. При запуске проверяет наличие 'update.asar' рядом с .exe (включая Portable-режим)
 * 2. Через original-fs проверяет, что файл валидный (> 500 КБ), копирует его в постоянное хранилище профиля УРМ
 * 3. Удаляет 'update.asar' рядом с .exe, чтобы пользователь видел, что обновление применилось
 * 4. Возвращает путь к актуальному index.html (из обновления или встроенный по умолчанию)
 */
function resolveStartupIndexHtml() {
  const defaultIndexPath = path.join(__dirname, '../dist/index.html');
  let justAppliedUpdate = false;

  try {
    const userDataDir = app.getPath('userData');
    const pointerFile = path.join(userDataDir, 'active_update_path.txt');
    let activeUpdateAsar = path.join(userDataDir, 'active_update.asar');

    if (origFs.existsSync(pointerFile)) {
      try {
        const savedPath = origFs.readFileSync(pointerFile, 'utf-8').trim();
        if (savedPath && origFs.existsSync(savedPath)) {
          activeUpdateAsar = savedPath;
        }
      } catch {
        // ignore
      }
    }

    // Список папок, где может лежать .exe у оператора (Portable, обычная папка win-unpacked, resources, рабочая папка)
    const rawDirs = [
      process.env.PORTABLE_EXECUTABLE_DIR,
      process.env.PORTABLE_EXECUTABLE_FILE
        ? path.dirname(process.env.PORTABLE_EXECUTABLE_FILE)
        : null,
      path.dirname(process.execPath),
      path.join(path.dirname(process.execPath), 'resources'),
      process.cwd(),
    ].filter(Boolean);
    const searchDirs = [...new Set(rawDirs)];

    for (const dir of searchDirs) {
      let candidateUpdatePath = path.join(dir, 'update.asar');
      if (!origFs.existsSync(candidateUpdatePath)) {
        try {
          const filesInDir = origFs.readdirSync(dir);
          const versionedAsar = filesInDir
            .filter((f) => /^\d+\.\d+\.\d+\.asar$/i.test(f))
            .sort()
            .pop();
          if (versionedAsar) {
            candidateUpdatePath = path.join(dir, versionedAsar);
          }
        } catch {
          // ignore
        }
      }
      if (origFs.existsSync(candidateUpdatePath)) {
        const stats = origFs.statSync(candidateUpdatePath);
        // Защита от пустых/неполных файлов (полный пакет интерфейса update.asar весит > 500 КБ)
        if (stats.isFile() && stats.size > 500 * 1024) {
          let targetDest = path.join(userDataDir, 'active_update.asar');
          try {
            if (origFs.existsSync(targetDest)) {
              origFs.unlinkSync(targetDest);
            }
            origFs.copyFileSync(candidateUpdatePath, targetDest);
          } catch {
            // Если старый файл занят процессом Windows — сохраняем под новым именем без блокировки
            targetDest = path.join(userDataDir, `active_update_${Date.now()}.asar`);
            origFs.copyFileSync(candidateUpdatePath, targetDest);
          }

          activeUpdateAsar = targetDest;
          justAppliedUpdate = true;
          try {
            origFs.writeFileSync(pointerFile, activeUpdateAsar, 'utf-8');
          } catch {
            // ignore
          }

          try {
            origFs.unlinkSync(candidateUpdatePath);
          } catch (unlinkErr) {
            console.warn('Не удалось удалить исходный update.asar после копирования:', unlinkErr);
          }
          break;
        }
      }
    }

    // Если в профиле установлено обновление active_update.asar (> 500 КБ) — запускаем интерфейс из него
    if (origFs.existsSync(activeUpdateAsar) && origFs.statSync(activeUpdateAsar).size > 500 * 1024) {
      const nestedDistIndex = path.join(activeUpdateAsar, 'dist', 'index.html');
      const rootDistIndex = path.join(activeUpdateAsar, 'index.html');

      if (fs.existsSync(nestedDistIndex)) {
        return { indexPath: nestedDistIndex, activeUpdateAsar, justAppliedUpdate };
      }
      if (fs.existsSync(rootDistIndex)) {
        return { indexPath: rootDistIndex, activeUpdateAsar, justAppliedUpdate };
      }
    }
  } catch (err) {
    console.warn('Ошибка при проверке автоматического обновления update.asar:', err);
  }

  return { indexPath: defaultIndexPath, activeUpdateAsar: null, justAppliedUpdate: false };
}

function createWindow() {
  const { indexPath: targetIndexPath, activeUpdateAsar, justAppliedUpdate } = resolveStartupIndexHtml();

  let windowIconPath = process.platform === 'win32'
    ? path.join(__dirname, '../public/favicon.ico')
    : path.join(__dirname, '../public/pwa-512x512.png');

  if (activeUpdateAsar) {
    const candidateIco = path.join(activeUpdateAsar, process.platform === 'win32' ? 'favicon.ico' : 'pwa-512x512.png');
    if (fs.existsSync(candidateIco)) {
      windowIconPath = candidateIco;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'МТС_MNP_2.8.0',
    icon: windowIconPath,
    backgroundColor: '#F4F5F7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  // Открывать внешние ссылки в стандартном браузере пользователя (Edge, Chrome)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Загружаем актуальный index.html (из автообновления update.asar или встроенный)
    const fallbackIndexPath = path.join(__dirname, '../dist/index.html');
    const loadOptions = justAppliedUpdate ? { query: { updated: '1' } } : undefined;

    mainWindow.loadFile(targetIndexPath, loadOptions).catch(() => {
      mainWindow.loadFile(fallbackIndexPath).catch(() => {
        mainWindow.loadURL('http://localhost:3000');
      });
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC обработчик нативных уведомлений Electron (работает даже при свернутом окне)
ipcMain.on('show-notification', (event, { title, body }) => {
  try {
    if (ElectronNotification.isSupported()) {
      const notif = new ElectronNotification({
        title: title || 'МТС MNP | Требуется звонок',
        body: body || '',
        icon: path.join(__dirname, '../public/pwa-192x192.png'),
        urgency: 'critical',
      });
      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
      notif.show();
    }
  } catch (err) {
    console.warn('Ошибка отображения системного уведомления Electron:', err);
  }
});

// IPC обработчики бесконтактной передачи статистики в сетевую папку УРМ (Вариант 1)
ipcMain.handle('urm-get-os-user', async () => {
  try {
    const info = os.userInfo();
    return {
      username: info.username || process.env.USERNAME || '',
      hostname: os.hostname() || '',
    };
  } catch {
    return {
      username: process.env.USERNAME || '',
      hostname: '',
    };
  }
});

ipcMain.handle('urm-sync-write', async (_event, { folderPath, fileName, content }) => {
  try {
    if (!folderPath || typeof folderPath !== 'string') {
      return { ok: false, error: 'Не указан путь к сетевой папке' };
    }
    const safeFileName = String(fileName || 'stat_operator.mtsstat').replace(/[^a-zA-Z0-9а-яА-ЯёЁ_.-]/g, '_');
    const cleanFolder = folderPath.trim();
    if (!origFs.existsSync(cleanFolder)) {
      return { ok: false, error: `Папка недоступна или не найдена: ${cleanFolder}` };
    }
    const targetFile = path.join(cleanFolder, safeFileName);
    origFs.writeFileSync(targetFile, String(content || ''), 'utf-8');
    return { ok: true, filePath: targetFile, timestamp: Date.now() };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('urm-sync-read-all', async (_event, { folderPath }) => {
  try {
    if (!folderPath || typeof folderPath !== 'string') {
      return { ok: false, error: 'Не указан путь к сетевой папке', files: [] };
    }
    const cleanFolder = folderPath.trim();
    if (!origFs.existsSync(cleanFolder)) {
      return { ok: false, error: `Папка недоступна или не найдена: ${cleanFolder}`, files: [] };
    }
    const entries = origFs.readdirSync(cleanFolder);
    const statFiles = entries.filter(
      (f) => f.endsWith('.mtsstat') || (f.startsWith('stat_') && f.endsWith('.json'))
    );
    const results = [];
    for (const fName of statFiles) {
      try {
        const fullPath = path.join(cleanFolder, fName);
        const stat = origFs.statSync(fullPath);
        if (stat.isFile() && stat.size > 0 && stat.size < 10 * 1024 * 1024) {
          const text = origFs.readFileSync(fullPath, 'utf-8');
          results.push({
            fileName: fName,
            content: text,
            mtimeMs: stat.mtimeMs || Date.now(),
          });
        }
      } catch {
        // пропускаем заблокированный в данный момент файл
      }
    }
    return { ok: true, files: results, timestamp: Date.now() };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err), files: [] };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
