(() => {
const { app, BrowserWindow, shell, ipcMain, screen, Notification: ElectronNotification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
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
 * Автоматическое обновление через файл 'update.asar' рядом с .exe:
 * 1. При запуске проверяет наличие 'update.asar' / 'update.assar' / '2.x.x.asar' рядом с .exe
 * 2. Через original-fs проверяет, что файл валидный (> 500 КБ), копирует его в профиль УРМ
 * 3. Удаляет 'update.asar' рядом с .exe, чтобы пользователь видел, что обновление применилось
 * 4. Возвращает путь к актуальному index.html и activeUpdateAsar (для полного обновления включая main.cjs)
 */
function resolveStartupIndexHtml() {
  const defaultIndexPath = path.join(__dirname, '../dist/index.html');
  if (global.__MTS_DELEGATED_MAIN__ && global.__MTS_ACTIVE_UPDATE_ASAR__) {
    const delegatedAsar = global.__MTS_ACTIVE_UPDATE_ASAR__;
    const nested = path.join(delegatedAsar, 'dist', 'index.html');
    const root = path.join(delegatedAsar, 'index.html');
    return {
      indexPath: fs.existsSync(nested) ? nested : fs.existsSync(root) ? root : defaultIndexPath,
      activeUpdateAsar: delegatedAsar,
      justAppliedUpdate: Boolean(global.__MTS_JUST_APPLIED_UPDATE__),
    };
  }

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
          // Поддерживаем update.asar, 2.9.0.asar, переименованные браузером update (1).asar и опечатку update.assar
          const matchedAsar = filesInDir
            .filter(
              (f) =>
                /^update.*\.ass?ar$/i.test(f) ||
                /^\d+\.\d+\.\d+.*\.ass?ar$/i.test(f)
            )
            .sort((a, b) => {
              try {
                return (
                  origFs.statSync(path.join(dir, b)).mtimeMs -
                  origFs.statSync(path.join(dir, a)).mtimeMs
                );
              } catch {
                return 0;
              }
            })[0];
          if (matchedAsar) {
            candidateUpdatePath = path.join(dir, matchedAsar);
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

    // Если в профиле установлено обновление active_update.asar (> 500 КБ),
    // проверяем, не новее ли встроенный resources/app.asar (по buildTime в package.json или mtimeMs),
    // чтобы замена resources/app.asar всегда имела приоритет и не откатывалась к старому update.asar
    if (origFs.existsSync(activeUpdateAsar) && origFs.statSync(activeUpdateAsar).size > 500 * 1024) {
      let useActiveUpdate = true;
      if (!justAppliedUpdate) {
        try {
          let builtBuildTime = 0;
          let activeBuildTime = 0;
          const builtPkgPath = path.join(__dirname, '../package.json');
          if (fs.existsSync(builtPkgPath)) {
            const builtPkg = JSON.parse(fs.readFileSync(builtPkgPath, 'utf-8'));
            builtBuildTime = Number(builtPkg.buildTime) || 0;
          }
          const activePkgPath = path.join(activeUpdateAsar, 'package.json');
          if (fs.existsSync(activePkgPath)) {
            const activePkg = JSON.parse(fs.readFileSync(activePkgPath, 'utf-8'));
            activeBuildTime = Number(activePkg.buildTime) || 0;
          }

          if (builtBuildTime > 0 && (activeBuildTime === 0 || builtBuildTime >= activeBuildTime)) {
            useActiveUpdate = false;
          } else {
            const builtAppAsar = process.resourcesPath
              ? path.join(process.resourcesPath, 'app.asar')
              : null;
            if (builtAppAsar && origFs.existsSync(builtAppAsar)) {
              const builtStat = origFs.statSync(builtAppAsar);
              const activeStat = origFs.statSync(activeUpdateAsar);
              if (builtStat.mtimeMs > activeStat.mtimeMs + 2000) {
                useActiveUpdate = false;
              }
            }
          }
        } catch {
          // ignore version comparison error
        }
      }

      if (!useActiveUpdate) {
        try {
          if (origFs.existsSync(pointerFile)) origFs.unlinkSync(pointerFile);
          if (origFs.existsSync(activeUpdateAsar)) origFs.unlinkSync(activeUpdateAsar);
        } catch {
          // ignore cleanup lock
        }
      } else {
        const nestedDistIndex = path.join(activeUpdateAsar, 'dist', 'index.html');
        const rootDistIndex = path.join(activeUpdateAsar, 'index.html');

        if (fs.existsSync(nestedDistIndex)) {
          return { indexPath: nestedDistIndex, activeUpdateAsar, justAppliedUpdate };
        }
        if (fs.existsSync(rootDistIndex)) {
          return { indexPath: rootDistIndex, activeUpdateAsar, justAppliedUpdate };
        }
      }
    }
  } catch (err) {
    console.warn('Ошибка при проверке автоматического обновления update.asar:', err);
  }

  return { indexPath: defaultIndexPath, activeUpdateAsar: null, justAppliedUpdate: false };
}

const startupResolution = resolveStartupIndexHtml();

// Полное самообновление ядра Electron через update.asar:
// если active_update.asar новее встроенного app.asar и содержит свой electron/main.cjs — передаём управление ему!
if (!global.__MTS_DELEGATED_MAIN__ && startupResolution.activeUpdateAsar) {
  const updatedMainCjs = path.join(startupResolution.activeUpdateAsar, 'electron', 'main.cjs');
  if (fs.existsSync(updatedMainCjs) && path.resolve(updatedMainCjs) !== path.resolve(__filename)) {
    try {
      global.__MTS_DELEGATED_MAIN__ = true;
      global.__MTS_ACTIVE_UPDATE_ASAR__ = startupResolution.activeUpdateAsar;
      global.__MTS_JUST_APPLIED_UPDATE__ = startupResolution.justAppliedUpdate;
      require(updatedMainCjs);
      return;
    } catch (delegateErr) {
      global.__MTS_DELEGATED_MAIN__ = false;
      console.warn('Не удалось запустить main.cjs из update.asar, работаем на встроенном ядре:', delegateErr);
    }
  }
}

function createWindow() {
  const { indexPath: targetIndexPath, activeUpdateAsar, justAppliedUpdate } = startupResolution;

  let windowIconPath = process.platform === 'win32'
    ? path.join(__dirname, '../public/favicon.ico')
    : path.join(__dirname, '../public/pwa-512x512.png');

  if (activeUpdateAsar) {
    const candidateIco = path.join(activeUpdateAsar, process.platform === 'win32' ? 'favicon.ico' : 'pwa-512x512.png');
    if (fs.existsSync(candidateIco)) {
      windowIconPath = candidateIco;
    }
  }

  let preloadPath = path.join(__dirname, 'preload.cjs');
  if (activeUpdateAsar) {
    const candidatePreload = path.join(activeUpdateAsar, 'electron', 'preload.cjs');
    if (fs.existsSync(candidatePreload)) {
      preloadPath = candidatePreload;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'МТС_MNP_2.9.0',
    icon: windowIconPath,
    backgroundColor: '#F4F5F7',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  // Открывать только реальные внешние ссылки в стандартном браузере (исключая about:blank от PiP/внутренних окон)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && !url.startsWith('about:') && !url.startsWith('javascript:')) {
      shell.openExternal(url).catch(() => {});
    }
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
    closeAllExternalOverlayWindows();
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

// IPC обработчики бесконтактной передачи статистики в сетевую папку УРМ
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

// ══════════════════════════════════════════════════════════════════════════════
// ВЫНОСНЫЕ ОКНА ЗА ПРЕДЕЛАМИ РАБОЧЕГО ОКНА ПРИЛОЖЕНИЯ: «КАЛЬКА» И «ТАЙМЕР READY»
// ══════════════════════════════════════════════════════════════════════════════
const kalkaOverlayWindows = new Map(); // id -> { win, loaded, suppressBoundsEvent, target, index }
let kalkaControlWin = null;
let kalkaControlLoaded = false;
let latestKalkaPayload = { isOpen: false, zones: [], displayMode: 'setup' };

let readyTimerWin = null;
let readyTimerLoaded = false;
let latestReadyTimerPayload = null;

// Глобальный слушатель кликов мыши Windows (user32.dll GetAsyncKeyState),
// позволяющий окнам Кальки в режиме «Прозрачный» иметь setIgnoreMouseEvents(true)
// и 100% нативно прожимать любую кнопку под калькой (как в чужих программах, так и в нашей)
let win32MouseProc = null;
const lastKalkaTriggerAtByZone = new Map();

function triggerKalkaZoneSignal(zoneId, target) {
  if (!zoneId || !target) return;
  const now = Date.now();
  const prevAt = lastKalkaTriggerAtByZone.get(zoneId) || 0;
  if (now - prevAt < 210) return;
  lastKalkaTriggerAtByZone.set(zoneId, now);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('kalka-triggered-from-overlay', {
      id: zoneId,
      zoneId,
      target,
    });
  }

  const entry = kalkaOverlayWindows.get(zoneId);
  if (entry && entry.win && !entry.win.isDestroyed() && entry.loaded) {
    entry.win.webContents.send('overlay-state-push', {
      kind: 'kalka-stamp',
      id: zoneId,
    });
  }
}

function isPointInsideWin(win, pt) {
  if (!win || win.isDestroyed() || !win.isVisible()) return false;
  try {
    const b = win.getBounds();
    return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height;
  } catch {
    return false;
  }
}

function handleGlobalLeftMouseDown() {
  if (latestKalkaPayload.displayMode !== 'transparent') return;
  if (kalkaOverlayWindows.size === 0) return;
  try {
    const pt = screen.getCursorScreenPoint();
    // Не срабатываем, если клик пришелся по окну управления Калькой или окну Таймера Ready
    if (isPointInsideWin(kalkaControlWin, pt) || isPointInsideWin(readyTimerWin, pt)) {
      return;
    }
    for (const [zoneId, entry] of kalkaOverlayWindows.entries()) {
      if (isPointInsideWin(entry.win, pt)) {
        const zoneObj =
          (latestKalkaPayload.zones || []).find((z) => z.id === zoneId) || entry;
        triggerKalkaZoneSignal(zoneId, zoneObj.target || 'timer');
      }
    }
  } catch {
    // ignore
  }
}

function stopWin32MouseHook() {
  if (win32MouseProc) {
    try {
      win32MouseProc.kill();
    } catch {
      // ignore
    }
    win32MouseProc = null;
  }
}

function ensureWin32MouseHook() {
  if (process.platform !== 'win32') return;
  if (win32MouseProc) return;
  try {
    const psScript = [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public class MtsUrmMouse {',
      '  [DllImport("user32.dll")]',
      '  public static extern short GetAsyncKeyState(int vKey);',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -ErrorAction Stop',
      '[Console]::Out.WriteLine("READY")',
      '[Console]::Out.Flush()',
      '$wasDown = $false',
      'while ($true) {',
      '  $st = [MtsUrmMouse]::GetAsyncKeyState(1)',
      '  $down = ($st -band 0x8000) -ne 0',
      '  if ($down -and -not $wasDown) {',
      '    [Console]::Out.WriteLine("LCLICK")',
      '    [Console]::Out.Flush()',
      '  }',
      '  $wasDown = $down',
      '  Start-Sleep -Milliseconds 16',
      '}',
    ].join('\r\n');

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const winRoot = process.env.SystemRoot || 'C:\\Windows';
    const fullPsPath = path.join(winRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const psExe = origFs.existsSync(fullPsPath) ? fullPsPath : 'powershell.exe';

    const proc = spawn(
      psExe,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    );

    win32MouseProc = proc;
    let buf = '';
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.trim() === 'LCLICK') {
          handleGlobalLeftMouseDown();
        }
      }
    });
    proc.on('exit', () => {
      if (win32MouseProc === proc) {
        win32MouseProc = null;
      }
    });
    proc.on('error', () => {
      if (win32MouseProc === proc) {
        win32MouseProc = null;
      }
    });
  } catch {
    win32MouseProc = null;
  }
}

function getOverlayPreloadPath() {
  try {
    if (startupResolution.activeUpdateAsar) {
      const candidate = path.join(startupResolution.activeUpdateAsar, 'electron', 'preload.cjs');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // ignore
  }
  return path.join(__dirname, 'preload.cjs');
}

function closeAllExternalOverlayWindows() {
  stopWin32MouseHook();
  for (const entry of kalkaOverlayWindows.values()) {
    if (entry.win && !entry.win.isDestroyed()) {
      entry.win.close();
    }
  }
  kalkaOverlayWindows.clear();
  if (kalkaControlWin && !kalkaControlWin.isDestroyed()) {
    kalkaControlWin.close();
  }
  kalkaControlWin = null;
  kalkaControlLoaded = false;
  if (readyTimerWin && !readyTimerWin.isDestroyed()) {
    readyTimerWin.close();
  }
  readyTimerWin = null;
  readyTimerLoaded = false;
}

function buildKalkaZoneHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; font-family: 'Segoe UI', system-ui, sans-serif; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
  #box {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, border-color 0.12s;
  }
  .mode-setup {
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.86);
    border: 2px dashed #0077FF;
    -webkit-app-region: drag;
    cursor: move;
  }
  .mode-transparent {
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1.5px solid rgba(0, 119, 255, 0.28);
    -webkit-app-region: no-drag;
  }
  .mode-transparent.stamped {
    background: rgba(0, 119, 255, 0.22) !important;
    border: 2px solid rgba(0, 119, 255, 0.85) !important;
  }
  .title {
    font-size: 11px;
    font-weight: 700;
    color: #1D2023;
    pointer-events: none;
    text-align: center;
    line-height: 1.15;
  }
  .ghost-badge {
    position: absolute;
    top: 2px;
    left: 5px;
    font-size: 9px;
    font-weight: 700;
    color: rgba(0, 119, 255, 0.55);
    pointer-events: none;
  }
  .test-btn {
    margin-top: 3px;
    padding: 2px 8px;
    border-radius: 6px;
    border: none;
    background: #F2F3F7;
    color: #1D2023;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  .test-btn:hover { background: #E5E7EB; }
  .resize-grip {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: rgba(0, 119, 255, 0.22);
    cursor: nwse-resize;
    -webkit-app-region: no-drag;
  }
  .resize-grip:hover {
    background: rgba(0, 119, 255, 0.45);
  }
</style>
</head>
<body>
  <div id="box" class="mode-setup">
    <div id="ghostBadge" class="ghost-badge" style="display:none;">1</div>
    <div id="label" class="title">1 • Таймер</div>
    <button id="testBtn" class="test-btn" type="button">Тест</button>
    <div id="resizeGrip" class="resize-grip" title="Потяните для изменения размера кальки"></div>
  </div>
  <script>
    const TARGET_NAMES = { calls: 'Звонки', saved: 'Сохранение', timer: 'Таймер' };
    let currentState = { id: '', index: 0, target: 'timer', displayMode: 'setup' };
    const box = document.getElementById('box');
    const label = document.getElementById('label');
    const ghostBadge = document.getElementById('ghostBadge');
    const testBtn = document.getElementById('testBtn');
    const resizeGrip = document.getElementById('resizeGrip');

    function render(st) {
      currentState = { ...currentState, ...st };
      const isSetup = currentState.displayMode === 'setup';
      box.className = isSetup ? 'mode-setup' : 'mode-transparent';
      label.style.display = isSetup ? 'block' : 'none';
      testBtn.style.display = isSetup ? 'inline-block' : 'none';
      resizeGrip.style.display = isSetup ? 'block' : 'none';
      ghostBadge.style.display = isSetup ? 'none' : 'block';
      const txt = (currentState.index + 1) + ' • ' + (TARGET_NAMES[currentState.target] || 'Таймер');
      label.textContent = txt;
      ghostBadge.textContent = String(currentState.index + 1);
    }

    function flashStamp() {
      box.classList.add('stamped');
      setTimeout(() => box.classList.remove('stamped'), 210);
    }

    function triggerSignal() {
      flashStamp();
      if (window.electronAPI && window.electronAPI.kalkaOverlaySendAction) {
        window.electronAPI.kalkaOverlaySendAction({
          type: 'trigger',
          action: 'trigger',
          id: currentState.id,
          zoneId: currentState.id,
          target: currentState.target,
        });
      }
    }

    testBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerSignal();
    });

    resizeGrip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { resizeGrip.setPointerCapture(e.pointerId); } catch {}
      const startX = e.screenX;
      const startY = e.screenY;
      const startW = window.innerWidth;
      const startH = window.innerHeight;

      function onMove(ev) {
        const nextW = Math.max(44, Math.min(520, startW + (ev.screenX - startX)));
        const nextH = Math.max(28, Math.min(360, startH + (ev.screenY - startY)));
        if (window.electronAPI && window.electronAPI.kalkaOverlaySendAction) {
          window.electronAPI.kalkaOverlaySendAction({
            type: 'resize-zone',
            action: 'resize-zone',
            id: currentState.id,
            zoneId: currentState.id,
            width: nextW,
            height: nextH,
          });
        }
      }

      function onUp(ev) {
        try { resizeGrip.releasePointerCapture(ev.pointerId); } catch {}
        resizeGrip.removeEventListener('pointermove', onMove);
        resizeGrip.removeEventListener('pointerup', onUp);
        resizeGrip.removeEventListener('pointercancel', onUp);
      }

      resizeGrip.addEventListener('pointermove', onMove);
      resizeGrip.addEventListener('pointerup', onUp);
      resizeGrip.addEventListener('pointercancel', onUp);
    });

    if (window.electronAPI && window.electronAPI.onOverlayStatePush) {
      window.electronAPI.onOverlayStatePush((data) => {
        if (!data) return;
        if (data.kind === 'kalka-zone') {
          render(data);
        } else if (data.kind === 'kalka-stamp') {
          flashStamp();
        }
      });
    }
  </script>
</body>
</html>`;
}

function buildKalkaControlHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; font-family: 'Segoe UI', system-ui, sans-serif; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
  .card {
    width: 100%;
    height: 100%;
    background: #FFFFFF;
    border-radius: 22px;
    border: 1px solid #EBECEF;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    padding: 11px 15px;
    border-bottom: 1px solid #EBECEF;
    display: flex;
    align-items: center;
    justify-content: space-between;
    -webkit-app-region: drag;
    cursor: move;
  }
  .header h3 { font-size: 15px; font-weight: 800; color: #1D2023; }
  .close-btn {
    width: 28px; height: 28px; border-radius: 999px; border: none;
    background: #F2F3F7; color: #1D2023; font-size: 15px; font-weight: 700;
    cursor: pointer; -webkit-app-region: no-drag;
    display: flex; align-items: center; justify-content: center;
  }
  .close-btn:hover { background: #E5E7EB; }
  .body { padding: 14px; display: flex; flex-direction: column; gap: 12px; flex: 1; overflow-y: auto; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .lbl { font-size: 12px; font-weight: 600; color: #626C77; }
  .seg { display: inline-flex; background: #F2F3F7; padding: 2px; border-radius: 11px; border: 1px solid #E4E7EC; }
  .seg button {
    height: 27px; padding: 0 10px; border-radius: 8px; border: none;
    font-size: 11.5px; font-weight: 700; cursor: pointer; background: transparent; color: #626C77;
  }
  .seg button.active { background: #1D2023; color: #FFFFFF; }
  .stepper { display: flex; align-items: center; gap: 6px; }
  .step-btn {
    width: 30px; height: 30px; border-radius: 10px; border: none;
    background: #F2F3F7; color: #1D2023; font-size: 15px; font-weight: 700; cursor: pointer;
  }
  .step-btn:hover { background: #E5E7EB; }
  .count-inp {
    width: 46px; height: 30px; border-radius: 10px; border: 1px solid #D5D8DD;
    text-align: center; font-size: 12px; font-weight: 700; color: #1D2023; outline: none;
  }
  .count-inp:focus { border-color: #0077FF; }
  .zones-list { display: flex; flex-direction: column; gap: 7px; max-height: 220px; overflow-y: auto; }
  .zone-item {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    background: #F8F9FB; padding: 6px 10px; border-radius: 14px; border: 1px solid #EBECEF;
  }
  .zone-name { font-size: 12px; font-weight: 700; color: #1D2023; width: 62px; flex-shrink: 0; }
  .target-group { display: flex; flex: 1; gap: 4px; }
  .t-btn {
    flex: 1; height: 27px; border-radius: 8px; border: 1px solid #D5D8DD;
    background: #FFFFFF; color: #1D2023; font-size: 11px; font-weight: 600; cursor: pointer;
  }
  .t-btn.active { border-color: #0077FF; background: #F0F7FF; font-weight: 700; color: #0077FF; }
  .del-btn {
    width: 28px; height: 28px; border-radius: 8px; border: none;
    background: transparent; color: #94A3B8; font-size: 14px; cursor: pointer; flex-shrink: 0;
  }
  .del-btn:hover { background: #FEF2F2; color: #FF0032; }
  .add-link {
    border: none; background: transparent; color: #0077FF;
    font-size: 12px; font-weight: 700; cursor: pointer; text-align: left; width: fit-content;
  }
  .add-link:hover { color: #0055CC; }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h3>Калька</h3>
      <button id="closeBtn" class="close-btn" type="button">×</button>
    </div>
    <div class="body">
      <div class="row">
        <span class="lbl">Режим</span>
        <div class="seg" id="modeSeg">
          <button type="button" data-mode="setup">Настройка</button>
          <button type="button" data-mode="transparent">Прозрачный</button>
          <button type="button" data-mode="off">Выкл</button>
        </div>
      </div>
      <div class="row">
        <span class="lbl">Количество</span>
        <div class="stepper">
          <button id="minusBtn" class="step-btn" type="button">−</button>
          <input id="countInp" class="count-inp" type="number" min="0" max="12" value="1" />
          <button id="plusBtn" class="step-btn" type="button">+</button>
        </div>
      </div>
      <div id="zonesList" class="zones-list"></div>
      <button id="addBtn" class="add-link" type="button">+ Добавить кальку</button>
    </div>
  </div>
  <script>
    let state = { zones: [], displayMode: 'setup' };
    const modeSeg = document.getElementById('modeSeg');
    const countInp = document.getElementById('countInp');
    const zonesList = document.getElementById('zonesList');

    function send(payload) {
      if (window.electronAPI && window.electronAPI.kalkaOverlaySendAction) {
        window.electronAPI.kalkaOverlaySendAction(payload);
      }
    }

    function render(next) {
      state = { ...state, ...next };
      countInp.value = state.zones.length;
      Array.from(modeSeg.querySelectorAll('button')).forEach((b) => {
        b.className = b.dataset.mode === state.displayMode ? 'active' : '';
      });
      zonesList.innerHTML = '';
      state.zones.forEach((z, idx) => {
        const row = document.createElement('div');
        row.className = 'zone-item';
        const opts = [
          { k: 'calls', l: 'Звонки' },
          { k: 'saved', l: 'Сохранение' },
          { k: 'timer', l: 'Таймер' },
        ];
        row.innerHTML =
          '<span class="zone-name">Калька ' + (idx + 1) + '</span>' +
          '<div class="target-group">' +
          opts.map((o) =>
            '<button type="button" class="t-btn ' + (z.target === o.k ? 'active' : '') + '" data-id="' + z.id + '" data-t="' + o.k + '">' + o.l + '</button>'
          ).join('') +
          '</div>' +
          '<button type="button" class="del-btn" data-del="' + z.id + '">×</button>';
        zonesList.appendChild(row);
      });
    }

    document.getElementById('closeBtn').addEventListener('click', () => send({ type: 'close-control' }));
    modeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (btn) send({ type: 'set-mode', displayMode: btn.dataset.mode });
    });
    document.getElementById('minusBtn').addEventListener('click', () => send({ type: 'set-count', count: Math.max(0, state.zones.length - 1) }));
    document.getElementById('plusBtn').addEventListener('click', () => send({ type: 'set-count', count: Math.min(12, state.zones.length + 1) }));
    countInp.addEventListener('change', () => send({ type: 'set-count', count: Number(countInp.value) || 0 }));
    document.getElementById('addBtn').addEventListener('click', () => send({ type: 'set-count', count: Math.min(12, state.zones.length + 1) }));
    zonesList.addEventListener('click', (e) => {
      const tBtn = e.target.closest('button[data-t]');
      if (tBtn) {
        send({ type: 'set-zone-target', zoneId: tBtn.dataset.id, target: tBtn.dataset.t });
        return;
      }
      const delBtn = e.target.closest('button[data-del]');
      if (delBtn) {
        send({ type: 'delete-zone', zoneId: delBtn.dataset.del });
      }
    });

    if (window.electronAPI && window.electronAPI.onOverlayStatePush) {
      window.electronAPI.onOverlayStatePush((data) => {
        if (data && data.kind === 'kalka-control') render(data);
      });
    }
  </script>
</body>
</html>`;
}

function buildReadyTimerHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; font-family: 'Segoe UI', system-ui, sans-serif; }
  html, body { width: max-content; height: max-content; overflow: visible; background: transparent; }
  #rootWrap {
    display: inline-flex;
    width: max-content;
    height: max-content;
    align-items: center;
    position: relative;
  }
  .timer-card {
    background: #FFFFFF;
    border: 1px solid #EBECEF;
    border-radius: 16px;
    overflow: hidden;
  }
  .drag-surface {
    -webkit-app-region: drag;
    cursor: move;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }
  /* Полукруглый полупрозрачный язычок справа от прямоугольника таймера для растягивания и увеличения */
  .pull-tab {
    width: 16px;
    height: 36px;
    border-radius: 0 999px 999px 0;
    background: rgba(255, 255, 255, 0.64);
    border: 1px solid rgba(213, 216, 221, 0.88);
    border-left: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: ew-resize;
    -webkit-app-region: no-drag;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .pull-tab:hover {
    background: rgba(255, 255, 255, 0.92);
  }
  .pull-bar {
    width: 1.5px;
    height: 13px;
    border-radius: 2px;
    background: rgba(98, 108, 119, 0.6);
  }
  .header {
    padding: 9px 13px;
    border-bottom: 1px solid #EBECEF;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .header h3 { font-size: 13.5px; font-weight: 800; color: #1D2023; }
  .close-btn {
    width: 26px; height: 26px; border-radius: 999px; border: none;
    background: #F2F3F7; color: #1D2023; font-size: 14px; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .close-btn:hover { background: #E5E7EB; }
  .time-box {
    background: #F8F9FB;
    border: 1px solid #E4E7EC;
    display: flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
    font-weight: 900;
    color: #1D2023;
    letter-spacing: -0.02em;
  }
  .time-box.running { border-color: #0077FF; }
  .btn-start {
    border: none;
    background: #FF0023;
    color: #FFFFFF;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-start:hover { background: #E30613; }
  .btn-pause {
    border: none;
    background: #1D2023;
    color: #FFFFFF;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-pause:hover { background: #2F343A; }
  .btn-reset {
    border: none;
    background: #F2F3F7;
    color: #1D2023;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-reset:hover { background: #E5E7EB; }
  .setup-body { padding: 12px 13px; display: flex; flex-direction: column; gap: 10px; }
  .section { padding-top: 8px; border-top: 1px solid #EBECEF; display: flex; flex-direction: column; gap: 6px; }
  .row-between { display: flex; align-items: center; justify-content: space-between; }
  .lbl { font-size: 11.5px; font-weight: 600; color: #626C77; }
  .fav-add { border: none; background: transparent; color: #0077FF; font-size: 11.5px; font-weight: 700; cursor: pointer; }
  .fav-add:hover { color: #0055CC; }
  .inputs-row { display: flex; align-items: center; gap: 5px; }
  .inp-wrap {
    flex: 1; display: flex; align-items: center; justify-content: space-between;
    background: #FFFFFF; padding: 0 7px; height: 30px; border-radius: 10px; border: 1px solid #D5D8DD;
  }
  .inp-wrap:focus-within { border-color: #0077FF; }
  .inp-wrap input {
    width: 100%; border: none; outline: none; font-size: 12px; font-weight: 700; color: #1D2023;
  }
  .inp-wrap span { font-size: 10.5px; color: #8C95A0; margin-left: 3px; }
  .ok-btn {
    height: 30px; padding: 0 10px; border-radius: 10px; border: none;
    background: #F2F3F7; color: #1D2023; font-size: 11.5px; font-weight: 700; cursor: pointer;
  }
  .ok-btn:hover { background: #E5E7EB; }
  .fav-list { display: flex; flex-wrap: wrap; gap: 5px; max-height: 76px; overflow-y: auto; }
  .fav-chip {
    display: inline-flex; align-items: center; gap: 4px; padding: 0 4px 0 9px; height: 26px;
    border-radius: 10px; border: 1px solid #EBECEF; background: #F8F9FB;
  }
  .fav-chip.active { border-color: #0077FF; background: #F2F3F7; }
  .fav-pick { border: none; background: transparent; font-size: 11.5px; font-weight: 700; color: #1D2023; cursor: pointer; }
  .fav-del {
    width: 18px; height: 18px; border-radius: 5px; border: none;
    background: transparent; color: #94A3B8; font-size: 12px; cursor: pointer;
  }
  .fav-del:hover { background: #FEF2F2; color: #FF0032; }
</style>
</head>
<body>
  <div id="rootWrap">
    <div id="timerCard" class="timer-card"></div>
    <div id="pullTab" class="pull-tab" title="Потяните, чтобы увеличить или уменьшить таймер">
      <span class="pull-bar"></span>
      <span class="pull-bar"></span>
    </div>
  </div>
  <script>
    let state = {
      remainingSeconds: 3600,
      targetSeconds: 3600,
      isRunning: false,
      favorites: [3600, 7200, 14400],
      scale: 1,
    };
    let hVal = '1', mVal = '0', sVal = '0';
    let lastTargetSec = -1;
    let isPullingScale = false;

    const rootWrap = document.getElementById('rootWrap');
    const timerCard = document.getElementById('timerCard');
    const pullTab = document.getElementById('pullTab');

    function fmtHms(total) {
      const safe = Math.max(0, Math.floor(total || 0));
      const h = Math.floor(safe / 3600);
      const m = Math.floor((safe % 3600) / 60);
      const s = safe % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function send(payload) {
      if (window.electronAPI && window.electronAPI.readyTimerSendAction) {
        window.electronAPI.readyTimerSendAction(payload);
      }
    }

    function syncWindowSize() {
      requestAnimationFrame(() => {
        const rect = rootWrap.getBoundingClientRect();
        const w = Math.ceil(rect.width) + 4;
        const h = Math.ceil(rect.height) + 4;
        if (w > 40 && h > 20) {
          send({ type: 'resize-window', width: w, height: h });
        }
      });
    }

    let renderedCompactState = null;
    let renderedScale = null;
    let renderedFavSig = '';

    function render(next) {
      state = { ...state, ...next };
      const s = Math.max(0.85, Math.min(2.25, Number(state.scale) || 1));
      if (state.targetSeconds !== lastTargetSec) {
        lastTargetSec = state.targetSeconds;
        hVal = String(Math.floor(state.targetSeconds / 3600));
        mVal = String(Math.floor((state.targetSeconds % 3600) / 60));
        sVal = String(state.targetSeconds % 60);
      }

      const isPausedMidway = !state.isRunning && state.remainingSeconds > 0 && state.remainingSeconds < state.targetSeconds;
      const isCompact = state.isRunning || isPausedMidway;

      const boxH = Math.round(36 * s);
      const fontTime = Math.round(18 * s);
      const fontBtn = Math.round(12 * s);
      const padXTime = Math.round(12 * s);
      const padXBtn = Math.round(14 * s);
      const padCardX = Math.round(13 * s);
      const padCardY = Math.round(10 * s);
      const gapPx = Math.round(9 * s);
      const radPx = Math.round(12 * s);

      pullTab.style.height = Math.max(32, Math.round(36 * s)) + 'px';
      pullTab.style.width = Math.max(15, Math.round(16 * Math.min(1.35, s))) + 'px';

      if (isCompact) {
        const existingBox = document.getElementById('compactTimeBox');
        const existingToggle = document.getElementById('toggleBtn');
        if (renderedCompactState === true && renderedScale === s && existingBox && existingToggle) {
          existingBox.textContent = fmtHms(state.remainingSeconds);
          existingBox.className = 'time-box ' + (state.isRunning ? 'running' : '');
          existingToggle.textContent = state.isRunning ? 'Пауза' : 'Старт';
          existingToggle.className = 'no-drag ' + (state.isRunning ? 'btn-pause' : 'btn-start');
          return;
        }
        renderedCompactState = true;
        renderedScale = s;
        renderedFavSig = '';

        timerCard.className = 'timer-card drag-surface';
        timerCard.style.width = 'auto';
        timerCard.style.padding = padCardY + 'px ' + padCardX + 'px';
        timerCard.style.borderRadius = Math.round(16 * Math.min(1.4, s)) + 'px';
        timerCard.innerHTML =
          '<div style="display:flex;align-items:center;gap:' + gapPx + 'px;">' +
            '<div id="compactTimeBox" class="time-box ' + (state.isRunning ? 'running' : '') + '" style="height:' + boxH + 'px;padding:0 ' + padXTime + 'px;border-radius:' + radPx + 'px;font-size:' + fontTime + 'px;">' +
              fmtHms(state.remainingSeconds) +
            '</div>' +
            '<button id="toggleBtn" type="button" class="no-drag ' + (state.isRunning ? 'btn-pause' : 'btn-start') + '" style="height:' + boxH + 'px;padding:0 ' + padXBtn + 'px;border-radius:' + radPx + 'px;font-size:' + fontBtn + 'px;">' +
              (state.isRunning ? 'Пауза' : 'Старт') +
            '</button>' +
            '<button id="resetBtn" type="button" class="no-drag btn-reset" style="height:' + boxH + 'px;padding:0 ' + Math.round(12 * s) + 'px;border-radius:' + radPx + 'px;font-size:' + fontBtn + 'px;">' +
              'Сброс' +
            '</button>' +
          '</div>';

        document.getElementById('toggleBtn').addEventListener('click', () => send({ type: 'toggle-run' }));
        document.getElementById('resetBtn').addEventListener('click', () => send({ type: 'reset' }));
      } else {
        const favSig = JSON.stringify(state.favorites || []) + ':' + state.targetSeconds;
        const existingSetupBox = document.getElementById('setupTimeBox');
        if (renderedCompactState === false && renderedScale === s && renderedFavSig === favSig && existingSetupBox) {
          existingSetupBox.textContent = fmtHms(state.remainingSeconds);
          return;
        }
        renderedCompactState = false;
        renderedScale = s;
        renderedFavSig = favSig;

        timerCard.className = 'timer-card';
        timerCard.style.padding = '0';
        timerCard.style.width = Math.max(300, Math.round(300 * s)) + 'px';
        timerCard.style.borderRadius = Math.round(16 * Math.min(1.4, s)) + 'px';

        const favHtml = (state.favorites && state.favorites.length > 0)
          ? '<div class="section">' +
              '<span class="lbl">Избранное</span>' +
              '<div class="fav-list">' +
                state.favorites.map((f) =>
                  '<div class="fav-chip ' + (f === state.targetSeconds ? 'active' : '') + '">' +
                    '<button type="button" class="fav-pick" data-fav="' + f + '">' + fmtHms(f) + '</button>' +
                    '<button type="button" class="fav-del" data-delfav="' + f + '">×</button>' +
                  '</div>'
                ).join('') +
              '</div>' +
            '</div>'
          : '';

        timerCard.innerHTML =
          '<div class="header drag-surface">' +
            '<h3>Таймер Ready</h3>' +
            '<button id="closeBtn" class="close-btn no-drag" type="button">×</button>' +
          '</div>' +
          '<div class="setup-body">' +
            '<div style="display:flex;align-items:center;gap:' + gapPx + 'px;">' +
              '<div id="setupTimeBox" class="time-box" style="flex:1;height:' + boxH + 'px;padding:0 ' + padXTime + 'px;border-radius:' + radPx + 'px;font-size:' + fontTime + 'px;">' +
                fmtHms(state.remainingSeconds) +
              '</div>' +
              '<button id="startBtn" type="button" class="btn-start" style="height:' + boxH + 'px;padding:0 ' + padXBtn + 'px;border-radius:' + radPx + 'px;font-size:' + fontBtn + 'px;">Старт</button>' +
              '<button id="resetBtn" type="button" class="btn-reset" style="height:' + boxH + 'px;padding:0 ' + Math.round(12 * s) + 'px;border-radius:' + radPx + 'px;font-size:' + fontBtn + 'px;">Сброс</button>' +
            '</div>' +
            '<div class="section">' +
              '<div class="row-between">' +
                '<span class="lbl">Время</span>' +
                '<button id="addFavBtn" type="button" class="fav-add">+ В избранное</button>' +
              '</div>' +
              '<div class="inputs-row">' +
                '<label class="inp-wrap"><input id="hInp" type="number" min="0" max="99" value="' + hVal + '" /><span>ч</span></label>' +
                '<label class="inp-wrap"><input id="mInp" type="number" min="0" max="9999" value="' + mVal + '" /><span>м</span></label>' +
                '<label class="inp-wrap"><input id="sInp" type="number" min="0" max="99999" value="' + sVal + '" /><span>с</span></label>' +
                '<button id="okBtn" type="button" class="ok-btn">ОК</button>' +
              '</div>' +
            '</div>' +
            favHtml +
          '</div>';

        const hInp = document.getElementById('hInp');
        const mInp = document.getElementById('mInp');
        const sInp = document.getElementById('sInp');
        hInp.addEventListener('input', (e) => { hVal = e.target.value; });
        mInp.addEventListener('input', (e) => { mVal = e.target.value; });
        sInp.addEventListener('input', (e) => { sVal = e.target.value; });

        function computeSec() {
          const h = Math.max(0, Math.floor(Number(hVal) || 0));
          const m = Math.max(0, Math.floor(Number(mVal) || 0));
          const sec = Math.max(0, Math.floor(Number(sVal) || 0));
          return h * 3600 + m * 60 + sec;
        }

        document.getElementById('closeBtn').addEventListener('click', () => send({ type: 'close' }));
        document.getElementById('startBtn').addEventListener('click', () => {
          const total = computeSec();
          if (total > 0 && total !== state.targetSeconds) {
            send({ type: 'apply-duration', totalSeconds: total });
          }
          send({ type: 'toggle-run' });
        });
        document.getElementById('resetBtn').addEventListener('click', () => send({ type: 'reset' }));
        document.getElementById('okBtn').addEventListener('click', () => {
          const total = computeSec();
          if (total > 0) send({ type: 'apply-duration', totalSeconds: total });
        });
        document.getElementById('addFavBtn').addEventListener('click', () => {
          const total = computeSec() || state.targetSeconds;
          if (total > 0) {
            send({ type: 'apply-duration', totalSeconds: total });
            send({ type: 'add-favorite', totalSeconds: total });
          }
        });
        timerCard.querySelectorAll('button[data-fav]').forEach((b) => {
          b.addEventListener('click', () => send({ type: 'apply-duration', totalSeconds: Number(b.dataset.fav) }));
        });
        timerCard.querySelectorAll('button[data-delfav]').forEach((b) => {
          b.addEventListener('click', () => send({ type: 'remove-favorite', totalSeconds: Number(b.dataset.delfav) }));
        });
      }

      syncWindowSize();
    }

    // Растягивание таймера за полукруглый полупрозрачный язычок справа (с pointer capture)
    pullTab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { pullTab.setPointerCapture(e.pointerId); } catch {}
      isPullingScale = true;
      const startScreenX = e.screenX;
      const startScale = Number(state.scale) || 1;

      function onMove(ev) {
        if (!isPullingScale) return;
        const dx = ev.screenX - startScreenX;
        const nextScale = Math.max(0.85, Math.min(2.25, Number((startScale + dx / 170).toFixed(2))));
        if (nextScale !== state.scale) {
          render({ scale: nextScale });
          send({ type: 'set-scale', scale: nextScale });
        }
      }

      function onUp(ev) {
        isPullingScale = false;
        try { pullTab.releasePointerCapture(ev.pointerId); } catch {}
        pullTab.removeEventListener('pointermove', onMove);
        pullTab.removeEventListener('pointerup', onUp);
        pullTab.removeEventListener('pointercancel', onUp);
      }

      pullTab.addEventListener('pointermove', onMove);
      pullTab.addEventListener('pointerup', onUp);
      pullTab.addEventListener('pointercancel', onUp);
    });

    pullTab.addEventListener('dblclick', () => {
      render({ scale: 1 });
      send({ type: 'set-scale', scale: 1 });
    });

    if (window.electronAPI && window.electronAPI.onOverlayStatePush) {
      window.electronAPI.onOverlayStatePush((data) => {
        if (data && data.kind === 'ready-timer' && !isPullingScale) {
          render(data);
        }
      });
    }
  </script>
</body>
</html>`;
}

// Синхронизация выносных окон «Калька» (окно настроек + прозрачные квадраты поверх всех программ Windows)
ipcMain.handle('kalka-sync-windows', async (_event, payload) => {
  try {
    const { isOpen = false, zones = [], displayMode = 'setup' } = payload || {};
    latestKalkaPayload = { isOpen, zones, displayMode };
    const overlayPreload = getOverlayPreloadPath();

    // 1. Выносное окно управления «Калька»
    if (isOpen) {
      if (!kalkaControlWin || kalkaControlWin.isDestroyed()) {
        kalkaControlLoaded = false;
        kalkaControlWin = new BrowserWindow({
          width: 344,
          height: 390,
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          resizable: false,
          hasShadow: true,
          webPreferences: {
            preload: overlayPreload,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
          },
        });
        kalkaControlWin.setAlwaysOnTop(true, 'screen-saver');
        kalkaControlWin.loadURL(
          'data:text/html;charset=utf-8,' + encodeURIComponent(buildKalkaControlHtml())
        );
        kalkaControlWin.webContents.on('did-finish-load', () => {
          kalkaControlLoaded = true;
          if (kalkaControlWin && !kalkaControlWin.isDestroyed()) {
            kalkaControlWin.webContents.send('overlay-state-push', {
              kind: 'kalka-control',
              ...latestKalkaPayload,
            });
          }
        });
        kalkaControlWin.on('closed', () => {
          kalkaControlWin = null;
          kalkaControlLoaded = false;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('kalka-state-changed-from-overlay', {
              type: 'close-control',
              action: 'close-control',
            });
          }
        });
      } else if (kalkaControlLoaded) {
        kalkaControlWin.webContents.send('overlay-state-push', {
          kind: 'kalka-control',
          ...latestKalkaPayload,
        });
      }
    } else if (kalkaControlWin && !kalkaControlWin.isDestroyed()) {
      kalkaControlWin.close();
      kalkaControlWin = null;
      kalkaControlLoaded = false;
    }

    // 2. Выносные прозрачные квадраты «Калька» поверх всех окон Windows
    if (displayMode === 'off' || !Array.isArray(zones) || zones.length === 0) {
      stopWin32MouseHook();
      for (const entry of kalkaOverlayWindows.values()) {
        if (entry.win && !entry.win.isDestroyed()) entry.win.close();
      }
      kalkaOverlayWindows.clear();
      return { ok: true, external: true };
    }

    if (displayMode === 'transparent') {
      ensureWin32MouseHook();
    } else {
      stopWin32MouseHook();
    }

    const activeIds = new Set(zones.map((z) => z.id));
    for (const [id, entry] of kalkaOverlayWindows.entries()) {
      if (!activeIds.has(id)) {
        if (entry.win && !entry.win.isDestroyed()) entry.win.close();
        kalkaOverlayWindows.delete(id);
      }
    }

    const isSetup = displayMode === 'setup';

    zones.forEach((zone, idx) => {
      let entry = kalkaOverlayWindows.get(zone.id);
      if (!entry || !entry.win || entry.win.isDestroyed()) {
        const initX = typeof zone.x === 'number' ? Math.round(zone.x) : 160 + idx * 28;
        const initY = typeof zone.y === 'number' ? Math.round(zone.y) : 140 + idx * 28;
        const win = new BrowserWindow({
          x: initX,
          y: initY,
          width: Math.max(44, Math.round(zone.width || 112)),
          height: Math.max(28, Math.round(zone.height || 56)),
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          resizable: false,
          movable: isSetup,
          focusable: isSetup,
          hasShadow: false,
          webPreferences: {
            preload: overlayPreload,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
          },
        });
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        // В режиме «Прозрачный» окно 100% пропускает клики сквозь себя на кнопку под ним!
        win.setIgnoreMouseEvents(!isSetup, { forward: true });

        entry = {
          win,
          loaded: false,
          suppressBoundsEvent: false,
          target: zone.target,
          index: idx,
        };
        kalkaOverlayWindows.set(zone.id, entry);

        win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildKalkaZoneHtml()));
        win.webContents.on('did-finish-load', () => {
          entry.loaded = true;
          if (!win.isDestroyed()) {
            win.webContents.send('overlay-state-push', {
              kind: 'kalka-zone',
              id: zone.id,
              index: idx,
              target: zone.target,
              displayMode,
            });
          }
        });

        const sendBoundsToMain = () => {
          if (entry.suppressBoundsEvent || win.isDestroyed()) return;
          const b = win.getBounds();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('kalka-state-changed-from-overlay', {
              type: 'zone-bounds',
              action: 'zone-bounds',
              id: zone.id,
              zoneId: zone.id,
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
            });
          }
        };

        win.on('moved', sendBoundsToMain);
        win.on('resized', sendBoundsToMain);
        win.on('closed', () => {
          kalkaOverlayWindows.delete(zone.id);
        });
      } else {
        const { win } = entry;
        entry.target = zone.target;
        entry.index = idx;
        win.setResizable(false);
        win.setMovable(isSetup);
        win.setFocusable(isSetup);
        win.setIgnoreMouseEvents(!isSetup, { forward: true });
        win.setAlwaysOnTop(true, 'screen-saver');
        if (entry.loaded) {
          win.webContents.send('overlay-state-push', {
            kind: 'kalka-zone',
            id: zone.id,
            index: idx,
            target: zone.target,
            displayMode,
          });
        }
      }
    });

    return { ok: true, external: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

// Обработка сигналов от выносных окон «Калька»
ipcMain.on('kalka-overlay-action', (_event, payload) => {
  const act = payload && (payload.type || payload.action);
  if (!act) return;
  const zId = payload.zoneId || payload.id;

  if (act === 'trigger') {
    triggerKalkaZoneSignal(zId, payload.target);
    return;
  }

  if (act === 'resize-zone' && zId) {
    const entry = kalkaOverlayWindows.get(zId);
    if (entry && entry.win && !entry.win.isDestroyed()) {
      const b = entry.win.getBounds();
      const nextW = Math.max(44, Math.min(520, Math.round(Number(payload.width) || b.width)));
      const nextH = Math.max(28, Math.min(360, Math.round(Number(payload.height) || b.height)));
      try {
        entry.win.setResizable(true);
        entry.win.setBounds({ x: b.x, y: b.y, width: nextW, height: nextH });
        entry.win.setResizable(false);
      } catch {
        // ignore
      }
    }
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('kalka-state-changed-from-overlay', {
      ...payload,
      type: act,
      action: act,
      id: zId,
      zoneId: zId,
    });
  }
});

// Синхронизация выносного окна «Таймер Ready» за пределами главного окна
ipcMain.handle('ready-timer-sync-window', async (_event, payload) => {
  try {
    const { isOpen = false } = payload || {};
    latestReadyTimerPayload = payload;
    const overlayPreload = getOverlayPreloadPath();

    if (!isOpen) {
      if (readyTimerWin && !readyTimerWin.isDestroyed()) {
        readyTimerWin.close();
      }
      readyTimerWin = null;
      readyTimerLoaded = false;
      return { ok: true, external: true };
    }

    if (!readyTimerWin || readyTimerWin.isDestroyed()) {
      readyTimerLoaded = false;
      let startX = 180;
      let startY = 120;
      try {
        const refBounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
        const wa = refBounds
          ? screen.getDisplayMatching(refBounds).workArea
          : screen.getPrimaryDisplay().workArea;
        startX = refBounds
          ? Math.min(wa.x + wa.width - 350, Math.max(wa.x + 12, refBounds.x + refBounds.width - 360))
          : wa.x + wa.width - 360;
        startY = refBounds
          ? Math.max(wa.y + 12, refBounds.y + 84)
          : wa.y + 84;
      } catch {
        // ignore
      }
      readyTimerWin = new BrowserWindow({
        x: Math.round(startX),
        y: Math.round(startY),
        width: 332,
        height: 235,
        useContentSize: true,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: true,
        hasShadow: true,
        webPreferences: {
          preload: overlayPreload,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
        },
      });
      readyTimerWin.setAlwaysOnTop(true, 'screen-saver');
      readyTimerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      readyTimerWin.loadURL(
        'data:text/html;charset=utf-8,' + encodeURIComponent(buildReadyTimerHtml())
      );
      readyTimerWin.webContents.on('did-finish-load', () => {
        readyTimerLoaded = true;
        if (readyTimerWin && !readyTimerWin.isDestroyed() && latestReadyTimerPayload) {
          readyTimerWin.webContents.send('overlay-state-push', {
            kind: 'ready-timer',
            ...latestReadyTimerPayload,
          });
        }
      });
      readyTimerWin.on('closed', () => {
        readyTimerWin = null;
        readyTimerLoaded = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ready-timer-action-from-overlay', {
            type: 'close',
            action: 'close',
          });
        }
      });
    } else if (readyTimerLoaded) {
      readyTimerWin.webContents.send('overlay-state-push', {
        kind: 'ready-timer',
        ...latestReadyTimerPayload,
      });
    }

    return { ok: true, external: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.on('ready-timer-overlay-action', (_event, payload) => {
  const act = payload && (payload.type || payload.action);
  if (!act) return;
  if (act === 'resize-window') {
    if (readyTimerWin && !readyTimerWin.isDestroyed()) {
      const w = Math.max(180, Math.min(920, Math.round(payload.width || 320)));
      const h = Math.max(44, Math.min(640, Math.round(payload.height || 100)));
      try {
        const [curW, curH] = readyTimerWin.getContentSize();
        if (Math.abs(curW - w) > 2 || Math.abs(curH - h) > 2) {
          readyTimerWin.setResizable(true);
          readyTimerWin.setContentSize(w, h);
          readyTimerWin.setResizable(false);
        }
      } catch {
        // ignore
      }
    }
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ready-timer-action-from-overlay', {
      ...payload,
      type: act,
      action: act,
    });
  }
});

ipcMain.handle('get-shell-info', async () => {
  return {
    execPath: process.execPath,
    resourcesPath: process.resourcesPath || '',
    activeUpdateAsar: startupResolution.activeUpdateAsar || null,
    hasExternalOverlays: true,
  };
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
  stopWin32MouseHook();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
})();


