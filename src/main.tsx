import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {CURRENT_APP_VERSION} from './utils/updateManager';

function isVersionNewer(candidate: string | null, current: string): boolean {
  if (!candidate) return false;
  const cParts = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const curParts = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((cParts[i] || 0) > (curParts[i] || 0)) return true;
    if ((cParts[i] || 0) < (curParts[i] || 0)) return false;
  }
  return false;
}

// Поддержка горячего обновления интерфейса из пакета .mtsupdate
let dynamicJs: string | null = null;
let dynamicCss: string | null = null;

if (typeof window !== 'undefined' && !(window as any).__MTS_HOT_BUNDLE_ACTIVE__) {
  try {
    const installedVer = localStorage.getItem('mts_app_installed_version');
    const storedJs = localStorage.getItem('mts_dynamic_bundle_js');
    if (storedJs && (installedVer === CURRENT_APP_VERSION || isVersionNewer(installedVer, CURRENT_APP_VERSION))) {
      dynamicJs = storedJs;
      dynamicCss = localStorage.getItem('mts_dynamic_bundle_css');
    } else if (!isVersionNewer(installedVer, CURRENT_APP_VERSION)) {
      // Ядро app.asar уже новее установленного пакета — очищаем старый кэш бандла
      localStorage.removeItem('mts_dynamic_bundle_js');
      localStorage.removeItem('mts_dynamic_bundle_css');
      localStorage.setItem('mts_app_installed_version', CURRENT_APP_VERSION);
    }
  } catch {
    // ignore storage errors
  }
}

if (dynamicCss) {
  try {
    const existing = document.getElementById('mts-dynamic-css');
    if (!existing) {
      const style = document.createElement('style');
      style.id = 'mts-dynamic-css';
      style.textContent = dynamicCss;
      document.head.appendChild(style);
    }
  } catch (e) {
    console.warn('Ошибка подключения динамических стилей обновления:', e);
  }
}

if (dynamicJs && !(window as any).__MTS_HOT_BUNDLE_ACTIVE__) {
  try {
    (window as any).__MTS_HOT_BUNDLE_ACTIVE__ = true;
    const rootEl = document.getElementById('root');
    if (rootEl) rootEl.innerHTML = '';

    // Внедряем скрипт нового бандла напрямую в DOM (работает и в web, и в file:// Electron)
    const script = document.createElement('script');
    script.textContent = dynamicJs;
    document.body.appendChild(script);
  } catch (err) {
    console.warn('Сбой запуска динамического бандла, запуск стандартного ядра:', err);
    (window as any).__MTS_HOT_BUNDLE_ACTIVE__ = false;
    createRoot(document.getElementById('root')!).render(<App />);
  }
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}

