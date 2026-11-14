const { contextBridge, ipcRenderer } = require('electron');

// Безопасный IPC мост между десктопной средой и веб-интерфейсом
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
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
});
