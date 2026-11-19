import { ShiftHistoryRecord, ShiftStats } from '../types';

export interface UrmSyncConfig {
  enabled: boolean;
  operatorId: string;
  operatorName: string;
  groupLeaderName: string;
  networkFolderPath: string;
  isSupervisorReader: boolean;
}

export interface UrmEmployeeStatPackage {
  version: 1;
  operatorId: string;
  operatorName: string;
  groupLeaderName?: string;
  updatedAt: number;
  todayDate: string;
  todayStats: {
    totalCalls: number;
    savedCount: number;
    refusedCount: number;
    unreachableCount: number;
    readyTimeSeconds?: number;
  };
  records: ShiftHistoryRecord[];
}

export function formatSecondsToHms(totalSeconds: number | undefined | null): string {
  const safeSec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export interface UrmEmployeeSummary {
  operatorId: string;
  operatorName: string;
  groupLeaderName: string;
  updatedAt: number;
  totalCalls: number;
  savedCount: number;
  mnpCount: number;
  callbackCount: number;
  autoCount: number;
  refusedCount: number;
  unreachableCount: number;
  conversionPct: number;
  recordsCount: number;
}

export interface ConversionThresholdScale {
  tolerance: number;
  target: number;
  aggression: number;
}

export interface EmployeeKpiOverride {
  monthlyPlan: number;
  isTrainee: boolean;
}

export interface GroupKpiTargetsConfig {
  regular: ConversionThresholdScale;
  trainee: ConversionThresholdScale;
  defaultMonthlyPlan: number;
  employees: Record<string, EmployeeKpiOverride>;
}

const STORAGE_URM_SYNC_CONFIG_KEY = 'mts_urm_stat_sync_config_v1';
export const STORAGE_GROUP_KPI_TARGETS_KEY = 'mts_group_kpi_targets_v1';

export const BUILTIN_SAMPLE_EMPLOYEES_OVERRIDES: Record<string, EmployeeKpiOverride> = {
  usmanova: { monthlyPlan: 216, isTrainee: false },
  aliullin: { monthlyPlan: 222, isTrainee: false },
  bespalova: { monthlyPlan: 193, isTrainee: false },
  navlyutova: { monthlyPlan: 400, isTrainee: false },
  polyanskaya: { monthlyPlan: 200, isTrainee: true },
  chadaev: { monthlyPlan: 484, isTrainee: false },
  dankin: { monthlyPlan: 484, isTrainee: false },
  sidorov: { monthlyPlan: 485, isTrainee: false },
  desyatnikova: { monthlyPlan: 220, isTrainee: true },
  klimenko: { monthlyPlan: 421, isTrainee: false },
  arhireev: { monthlyPlan: 391, isTrainee: false },
  dobychina: { monthlyPlan: 244, isTrainee: false },
  polkanov: { monthlyPlan: 489, isTrainee: false },
  bakunov: { monthlyPlan: 488, isTrainee: false },
  sankovskaya: { monthlyPlan: 490, isTrainee: false },
  novotorzhentsev: { monthlyPlan: 236, isTrainee: true },
  vahitova: { monthlyPlan: 359, isTrainee: false },
  antonova: { monthlyPlan: 480, isTrainee: false },
};

export const DEFAULT_GROUP_KPI_TARGETS: GroupKpiTargetsConfig = {
  regular: {
    tolerance: 40,
    target: 44,
    aggression: 52,
  },
  trainee: {
    tolerance: 32,
    target: 40,
    aggression: 46,
  },
  defaultMonthlyPlan: 400,
  employees: { ...BUILTIN_SAMPLE_EMPLOYEES_OVERRIDES },
};

export function loadGroupKpiTargets(): GroupKpiTargetsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_GROUP_KPI_TARGETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        regular: {
          ...DEFAULT_GROUP_KPI_TARGETS.regular,
          ...(parsed.regular || {}),
        },
        trainee: {
          ...DEFAULT_GROUP_KPI_TARGETS.trainee,
          ...(parsed.trainee || {}),
        },
        defaultMonthlyPlan:
          typeof parsed.defaultMonthlyPlan === 'number' && parsed.defaultMonthlyPlan > 0
            ? parsed.defaultMonthlyPlan
            : DEFAULT_GROUP_KPI_TARGETS.defaultMonthlyPlan,
        employees: {
          ...BUILTIN_SAMPLE_EMPLOYEES_OVERRIDES,
          ...(parsed.employees && typeof parsed.employees === 'object' ? parsed.employees : {}),
        },
      };
    }
  } catch {
    // ignore
  }
  return {
    ...DEFAULT_GROUP_KPI_TARGETS,
    employees: { ...BUILTIN_SAMPLE_EMPLOYEES_OVERRIDES },
  };
}

export function saveGroupKpiTargets(config: GroupKpiTargetsConfig): void {
  try {
    localStorage.setItem(STORAGE_GROUP_KPI_TARGETS_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

const IDB_NAME = 'mts_urm_fs_sync_db_v1';
const IDB_STORE = 'dir_handles';
const IDB_DIR_KEY = 'active_urm_stats_dir';
const CIPHER_PREFIX = 'MTS-URM-STAT-V1::';
const CIPHER_SECRET = 'MTS_MNP_URM_SECRET_2026_ADMSK';

interface ElectronUrmBridge {
  isElectron?: boolean;
  urmGetOsUser?: () => Promise<{ username: string; hostname: string }>;
  urmSyncWrite?: (
    folderPath: string,
    fileName: string,
    content: string
  ) => Promise<{ ok: boolean; filePath?: string; error?: string; timestamp?: number }>;
  urmSyncReadAll?: (
    folderPath: string
  ) => Promise<{
    ok: boolean;
    files: { fileName: string; content: string; mtimeMs: number }[];
    error?: string;
    timestamp?: number;
  }>;
}

function getElectronBridge(): ElectronUrmBridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { electronAPI?: ElectronUrmBridge }).electronAPI;
  return api || null;
}

export function hasNativeUrmIpcBridge(): boolean {
  const api = getElectronBridge();
  return Boolean(api && typeof api.urmSyncWrite === 'function' && typeof api.urmSyncReadAll === 'function');
}

export function loadUrmSyncConfig(): UrmSyncConfig {
  const defaultConfig: UrmSyncConfig = {
    enabled: false,
    operatorId: '',
    operatorName: '',
    groupLeaderName: '',
    networkFolderPath: '\\\\msk.mts.ru\\MSK\\User\\Folders\\Homes\\iivanov.ADMSK\\MSK_Stats',
    isSupervisorReader: true,
  };
  try {
    const raw = localStorage.getItem(STORAGE_URM_SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultConfig,
        ...parsed,
      };
    }
  } catch {
    // ignore
  }
  return defaultConfig;
}

export function saveUrmSyncConfig(config: UrmSyncConfig): void {
  try {
    localStorage.setItem(STORAGE_URM_SYNC_CONFIG_KEY, JSON.stringify(config));
    if (config.operatorId) {
      const key = `mts_user_personal_prefs_v1_${config.operatorId.trim().toLowerCase()}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      existing[STORAGE_URM_SYNC_CONFIG_KEY] = JSON.stringify(config);
      localStorage.setItem(key, JSON.stringify(existing));
    }
    window.dispatchEvent(new CustomEvent('mts-urm-sync-config-changed', { detail: config }));
  } catch {
    // ignore
  }
}

export async function detectOsUsername(): Promise<string> {
  try {
    const api = getElectronBridge();
    if (api && typeof api.urmGetOsUser === 'function') {
      const info = await api.urmGetOsUser();
      if (info?.username) return info.username;
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Шифрование пакета статистики сотрудника (.mtsstat),
 * чтобы коллеги в общей папке не могли прочитать чужие файлы через Блокнот
 */
export function encryptStatPackage(pkg: UrmEmployeeStatPackage): string {
  const json = JSON.stringify(pkg);
  const utf8Bytes = new TextEncoder().encode(json);
  const keyBytes = new TextEncoder().encode(CIPHER_SECRET);
  const out = new Uint8Array(utf8Bytes.length);
  for (let i = 0; i < utf8Bytes.length; i++) {
    out[i] = utf8Bytes[i] ^ keyBytes[i % keyBytes.length] ^ ((i * 31) & 0xff);
  }
  let binary = '';
  for (let i = 0; i < out.length; i++) {
    binary += String.fromCharCode(out[i]);
  }
  return `${CIPHER_PREFIX}${btoa(binary)}`;
}

export function decryptStatPackage(rawText: string): UrmEmployeeStatPackage | null {
  try {
    const trimmed = rawText.trim();
    if (trimmed.startsWith(CIPHER_PREFIX)) {
      const b64 = trimmed.slice(CIPHER_PREFIX.length);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      const keyBytes = new TextEncoder().encode(CIPHER_SECRET);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) ^ keyBytes[i % keyBytes.length] ^ ((i * 31) & 0xff);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(jsonStr);
      if (parsed && Array.isArray(parsed.records)) {
        return parsed as UrmEmployeeStatPackage;
      }
    } else if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.records)) {
        return parsed as UrmEmployeeStatPackage;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ======================== IndexedDB для хранения доступа к сетевой папке (работает даже через чистый update.asar!) ========================

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirectoryHandleToIdb(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_DIR_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getDirectoryHandleFromIdb(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_DIR_KEY);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as FileSystemDirectoryHandle) || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function clearDirectoryHandleFromIdb(): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_DIR_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}

/**
 * Выбор и подключение сетевой папки через стандартное окно Windows (работает в update.asar без пересборки .exe!)
 * Предварительно копирует введенный сетевой путь в буфер обмена, чтобы можно было просто вставить его (Ctrl+V).
 */
export async function pickAndConnectUrmFolder(
  suggestedNetworkPath?: string
): Promise<{ ok: boolean; folderName?: string; error?: string }> {
  try {
    if (suggestedNetworkPath && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(suggestedNetworkPath.trim());
      } catch {
        // ignore
      }
    }

    const win = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    };

    if (typeof win.showDirectoryPicker !== 'function') {
      return {
        ok: false,
        error: 'Выбор папки через проводник недоступен в текущем окружении. Используйте прямой путь.',
      };
    }

    const dirHandle = await win.showDirectoryPicker({ mode: 'readwrite' });
    await saveDirectoryHandleToIdb(dirHandle);
    return { ok: true, folderName: dirHandle.name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('abort')) {
      return { ok: false, error: 'Выбор папки отменён' };
    }
    return { ok: false, error: msg };
  }
}

async function ensureDirPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite'
): Promise<boolean> {
  try {
    const h = handle as unknown as {
      queryPermission?: (opts: { mode: string }) => Promise<string>;
      requestPermission?: (opts: { mode: string }) => Promise<string>;
    };
    if (typeof h.queryPermission === 'function') {
      const status = await h.queryPermission({ mode });
      if (status === 'granted') return true;
    }
    if (typeof h.requestPermission === 'function') {
      const status = await h.requestPermission({ mode });
      return status === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

function sanitizeFileId(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 48) || 'operator'
  );
}

function formatTodayDateRu(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}.${m}.${y}`;
}

/**
 * Бесконтактная фоновая отправка статистики сотрудника в сетевую папку группы
 */
export async function pushEmployeeStatsToUrmFolder(
  records: ShiftHistoryRecord[],
  stats: ShiftStats,
  overrideConfig?: UrmSyncConfig
): Promise<{ ok: boolean; mode?: 'ipc' | 'fs_handle'; error?: string; timestamp?: number }> {
  const config = overrideConfig || loadUrmSyncConfig();
  if (!config.enabled) {
    return { ok: false, error: 'Автопередача выключена' };
  }

  const operatorName = (config.operatorName || config.operatorId || '').trim();
  const operatorId = sanitizeFileId(config.operatorId || operatorName || 'operator');
  if (!operatorName) {
    return { ok: false, error: 'Войдите в свой профиль в шапке для синхронизации статистики' };
  }

  const fileName = `stat_${operatorId}.mtsstat`;
  const taggedRecords: ShiftHistoryRecord[] = records.slice(0, 2000).map((r) => ({
    ...r,
    operatorId,
    operatorName,
    groupLeaderName: config.groupLeaderName?.trim() || undefined,
  }));

  const pkg: UrmEmployeeStatPackage = {
    version: 1,
    operatorId,
    operatorName,
    groupLeaderName: config.groupLeaderName?.trim() || '',
    updatedAt: Date.now(),
    todayDate: formatTodayDateRu(),
    todayStats: {
      totalCalls: stats.totalCallsCount || 0,
      savedCount: stats.savedCount || 0,
      refusedCount: stats.refusedCount || 0,
      unreachableCount: stats.unreachableCount || 0,
      readyTimeSeconds: stats.readyTimeSeconds || 0,
    },
    records: taggedRecords,
  };

  const encrypted = encryptStatPackage(pkg);

  // 1. Сначала пробуем прямой сетевой путь через Electron IPC (если в .exe есть мост)
  const api = getElectronBridge();
  if (api && typeof api.urmSyncWrite === 'function' && config.networkFolderPath.trim()) {
    const res = await api.urmSyncWrite(config.networkFolderPath.trim(), fileName, encrypted);
    if (res.ok) {
      return { ok: true, mode: 'ipc', timestamp: Date.now() };
    }
  }

  // 2. Если работаем через чистый update.asar на прежнем .exe — пишем через сохраненный доступ к сетевой папке
  const dirHandle = await getDirectoryHandleFromIdb();
  if (dirHandle) {
    try {
      const granted = await ensureDirPermission(dirHandle, 'readwrite');
      if (granted) {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(encrypted);
        await writable.close();
        return { ok: true, mode: 'fs_handle', timestamp: Date.now() };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Не удалось записать файл в сетевую папку',
      };
    }
  }

  return {
    ok: false,
    error: 'Подключите сетевую папку кнопкой «Подключить папку» или проверьте путь',
  };
}

/**
 * Сбор и расшифровка статистики всех сотрудников из общей папки (для Рустама / ВС / РГ)
 */
export async function fetchAllDepartmentStatsFromUrmFolder(
  overrideConfig?: UrmSyncConfig
): Promise<{
  ok: boolean;
  packages: UrmEmployeeStatPackage[];
  allRecords: ShiftHistoryRecord[];
  error?: string;
  timestamp: number;
}> {
  const config = overrideConfig || loadUrmSyncConfig();
  const packages: UrmEmployeeStatPackage[] = [];

  // 1. Сначала пробуем чтение по прямому пути через Electron IPC
  const api = getElectronBridge();
  let readSuccess = false;

  if (api && typeof api.urmSyncReadAll === 'function' && config.networkFolderPath.trim()) {
    const res = await api.urmSyncReadAll(config.networkFolderPath.trim());
    if (res.ok && Array.isArray(res.files)) {
      readSuccess = true;
      for (const f of res.files) {
        const pkg = decryptStatPackage(f.content);
        if (pkg) {
          packages.push(pkg);
        }
      }
    }
  }

  // 2. Фоллбэк: чтение через подключенную папку FileSystemDirectoryHandle (работает в update.asar без пересборки .exe)
  if (!readSuccess) {
    const dirHandle = await getDirectoryHandleFromIdb();
    if (dirHandle) {
      try {
        const granted = await ensureDirPermission(dirHandle, 'read');
        if (granted) {
          readSuccess = true;
          const iter = (dirHandle as unknown as {
            values: () => AsyncIterable<FileSystemHandle>;
          }).values();
          for await (const entry of iter) {
            if (
              entry.kind === 'file' &&
              (entry.name.endsWith('.mtsstat') ||
                (entry.name.startsWith('stat_') && entry.name.endsWith('.json')))
            ) {
              try {
                const file = await (entry as FileSystemFileHandle).getFile();
                const text = await file.text();
                const pkg = decryptStatPackage(text);
                if (pkg) {
                  packages.push(pkg);
                }
              } catch {
                // пропускаем файл, если он в этот момент перезаписывается
              }
            }
          }
        }
      } catch (err) {
        return {
          ok: false,
          packages: [],
          allRecords: [],
          error: err instanceof Error ? err.message : 'Ошибка чтения сетевой папки',
          timestamp: Date.now(),
        };
      }
    }
  }

  if (!readSuccess) {
    return {
      ok: false,
      packages: [],
      allRecords: [],
      error: 'Сетевая папка не подключена или недоступна',
      timestamp: Date.now(),
    };
  }

  // Сортируем сотрудников по времени активности (самые свежие сверху)
  packages.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // Собираем все записи с привязкой к сотруднику и его РГ
  const mergedRecords: ShiftHistoryRecord[] = [];
  for (const pkg of packages) {
    for (const r of pkg.records || []) {
      mergedRecords.push({
        ...r,
        id: `${pkg.operatorId}__${r.id}`,
        operatorId: pkg.operatorId,
        operatorName: pkg.operatorName,
        groupLeaderName: pkg.groupLeaderName || r.groupLeaderName || '',
      });
    }
  }

  mergedRecords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    ok: true,
    packages,
    allRecords: mergedRecords,
    timestamp: Date.now(),
  };
}
