const { contextBridge, ipcRenderer } = require('electron');

// Безопасный IPC мост между десктопной средой и веб-интерфейсом (включая выносные окна Кальки и Таймера Ready)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  hasExternalOverlays: true,
  platform: process.platform,
  getShellInfo: () => ipcRenderer.invoke('get-shell-info'),
  showNotification: (title, body) => {
    try {
      ipcRenderer.send('show-notification', { title, body });
    } catch (e) {
      console.warn('IPC showNotification error:', e);
    }
  },
  urmGetOsUser: () => ipcRenderer.invoke('urm-get-os-user'),
  urmSyncWrite: (folderPath, fileName, content) =>
    ipcRenderer.invoke('urm-sync-write', { folderPath, fileName, content }),
  urmSyncReadAll: (folderPath) =>
    ipcRenderer.invoke('urm-sync-read-all', { folderPath }),

  // Выносные окна «Калька» за пределами главного окна
  kalkaSyncWindows: (payload) =>
    ipcRenderer.invoke('kalka-sync-windows', payload),
  onKalkaTrigger: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('kalka-triggered-from-overlay', handler);
    return () => ipcRenderer.removeListener('kalka-triggered-from-overlay', handler);
  },
  onKalkaStateChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('kalka-state-changed-from-overlay', handler);
    return () => ipcRenderer.removeListener('kalka-state-changed-from-overlay', handler);
  },
  kalkaOverlaySendAction: (payload) => {
    ipcRenderer.send('kalka-overlay-action', payload);
  },

  // Выносное окно «Таймер Ready» за пределами главного окна
  readyTimerSyncWindow: (payload) =>
    ipcRenderer.invoke('ready-timer-sync-window', payload),
  onReadyTimerAction: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ready-timer-action-from-overlay', handler);
    return () => ipcRenderer.removeListener('ready-timer-action-from-overlay', handler);
  },
  readyTimerSendAction: (payload) => {
    ipcRenderer.send('ready-timer-overlay-action', payload);
  },

  // Получение живого состояния внутри выносных окон без перезагрузки
  onOverlayStatePush: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('overlay-state-push', handler);
    return () => ipcRenderer.removeListener('overlay-state-push', handler);
  },
});

