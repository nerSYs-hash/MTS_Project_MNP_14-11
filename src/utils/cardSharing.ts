import { ClientLead, CallStatus, ShiftHistoryType } from '../types';

const SHARE_PREFIX = 'MTS-SHARE-V1::';
const RECEIPT_PREFIX = 'MTS-SAVED-OK::';
const SENDER_NAME_STORAGE_KEY = 'mts_share_sender_name_v1';

export interface SharedLeadItem {
  oid: string;        // Исходный ID карточки у отправителя
  odt: string;        // Дата первичного контакта у отправителя (ДД.ММ.ГГГГ)
  ph: string;         // Форматированный телефон
  rph: string;        // Чистые 11 цифр
  ct: string;         // Город
  rg: string;         // Регион
  utc: number;        // Часовой пояс UTC
  msk: number;        // Смещение от МСК
  lnk: string;        // Ссылка CRM
  nt: string;         // Заметка
  st: CallStatus;     // Статус
  att: number;        // Выполнено попыток
  max: number;        // Макс попыток
  remSec: number;     // Оставшееся время таймера в секундах на момент отправки
  tgtMs?: number;     // Точная целевая метка времени перезвона (ms) для живого отсчёта с вычетом прошедшего времени
  durMin: number;     // Длительность таймера в минутах
  agr: boolean;       // По договорённости («По времени»)
  autoF: boolean;     // Принудительный автоответчик
}

export interface SharedPackagePayload {
  v: 1;
  batchId?: string;   // Уникальный ID пакета («Умный бокс»)
  sender: string;     // Имя отправителя (или пустая строка)
  sentAt: number;     // Временная метка отправки (ms)
  sentTimeStr: string;// ЧЧ:ММ отправки
  leads: SharedLeadItem[];
}

export interface SavedReceiptItem {
  originalLeadId: string;
  originalDate?: string;
  rawPhone: string;
  formattedPhone: string;
  city: string;
  link?: string;
  notes?: string;
  finalStatus: 'saved' | 'refused' | 'unreachable' | 'returned_to_sender';
  historyType?: ShiftHistoryType;
  attemptCount?: number;
  remSec?: number; // Оставшееся время таймера при возврате неотработанного номера (Б.3)
}

export interface PendingBatchLeadInfo {
  oid: string;
  rph: string;
  ph: string;
  odt?: string;
}

export interface SavedReceiptPayload {
  v: 1;
  batchId?: string;
  batchTotal?: number;
  originalLeadId: string;
  originalDate?: string; // Дата первичного контакта у отправителя (ДД.ММ.ГГГГ)
  rawPhone: string;
  formattedPhone: string;
  city: string;
  link?: string;
  notes?: string;
  finalStatus?: 'saved' | 'refused' | 'unreachable' | 'returned_to_sender';
  historyType?: ShiftHistoryType;
  attemptCount?: number;
  remSec?: number;
  items?: SavedReceiptItem[]; // Все завершённые/возвращённые номера из «Умного бокса» (Вариант Б)
  pendingLeads?: PendingBatchLeadInfo[]; // Номера из пакета, которые ещё остались в очереди у получателя (Б.1)
  savedBy: string;    // Кто завершил (если указано имя)
  savedAt: number;
  savedTimeStr: string;
}

export type ParsedMtsPayload =
  | { type: 'share_package'; payload: SharedPackagePayload }
  | { type: 'saved_receipt'; payload: SavedReceiptPayload };

interface StoredSmartBoxBatch {
  batchId: string;
  sender: string;
  totalCount: number;
  expectedLeads: PendingBatchLeadInfo[];
  completedItems: Record<string, SavedReceiptItem>;
  updatedAt: number;
}

const SMART_BOX_STORAGE_KEY = 'mts_smart_box_batches_v1';

function loadSmartBoxBatches(): Record<string, StoredSmartBoxBatch> {
  try {
    const raw = localStorage.getItem(SMART_BOX_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredSmartBoxBatch>;
  } catch {
    return {};
  }
}

function saveSmartBoxBatches(batches: Record<string, StoredSmartBoxBatch>): void {
  try {
    localStorage.setItem(SMART_BOX_STORAGE_KEY, JSON.stringify(batches));
  } catch {
    // ignore
  }
}

/**
 * Регистрация принятого пакета в памяти «Умного бокса» у получателя
 */
export function registerIncomingShareBatch(pkg: SharedPackagePayload): string {
  const batchId =
    pkg.batchId ||
    `batch_${pkg.sentAt || Date.now()}_${pkg.leads.map((l) => l.rph.slice(-4)).join('_')}`;
  const batches = loadSmartBoxBatches();
  const existing = batches[batchId];

  batches[batchId] = {
    batchId,
    sender: pkg.sender || existing?.sender || '',
    totalCount: pkg.leads.length,
    expectedLeads: pkg.leads.map((l) => ({
      oid: l.oid,
      rph: l.rph,
      ph: l.ph,
      odt: l.odt,
    })),
    completedItems: existing?.completedItems || {},
    updatedAt: Date.now(),
  };

  saveSmartBoxBatches(batches);
  return batchId;
}

function formatDateDdMmYyyy(ts: number): string {
  const d = new Date(ts || Date.now());
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/**
 * Быстрая контрольная сумма FNV-1a (в 8-символьный hex) для 100% защиты от ложных срабатываний
 */
function computeChecksum(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function encodeUtf8Base64(jsonStr: string): string {
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeUtf8Base64(b64Url: string): string {
  const b64 = b64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function loadSenderNameFromStorage(): string {
  try {
    return localStorage.getItem(SENDER_NAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

const LAST_CLIPBOARD_TOKEN_KEY = 'mts_last_clipboard_token_v1';

export function saveSenderNameToStorage(name: string): void {
  try {
    localStorage.setItem(SENDER_NAME_STORAGE_KEY, name.trim());
  } catch {
    // ignore
  }
}

/**
 * Запись токена передачи/результата в системный буфер обмена + резервный буфер приложения
 * (чтобы кнопка «Вставить из буфера обмена» работала даже если браузер/iframe блокирует readText)
 */
export async function writeMtsTokenToClipboard(token: string): Promise<void> {
  try {
    localStorage.setItem(LAST_CLIPBOARD_TOKEN_KEY, token);
  } catch {
    // ignore
  }
  try {
    await navigator.clipboard.writeText(token);
  } catch {
    // fallback via hidden textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = token;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      // ignore
    }
  }
}

/**
 * Чтение из буфера обмена по кнопке «Вставить из буфера обмена» с резервным чтением токена
 */
export async function readClipboardTextWithFallback(): Promise<string> {
  try {
    const sysText = await navigator.clipboard.readText();
    if (sysText && sysText.trim()) {
      return sysText.trim();
    }
  } catch {
    // Если браузер/iframe запретил чтение системного буфера — берём из резервного буфера приложения
  }
  try {
    return localStorage.getItem(LAST_CLIPBOARD_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Формирование защищённой ссылки для передачи выбранных контактов коллеге
 */
export function createSharePackageLink(
  leads: ClientLead[],
  senderName?: string,
  customBatchId?: string
): string {
  const now = Date.now();
  const d = new Date(now);
  const sentTimeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const effectiveSender = (senderName ?? loadSenderNameFromStorage()).trim();
  const batchId =
    customBatchId || `batch_${now}_${Math.random().toString(36).substring(2, 7)}`;

  const items: SharedLeadItem[] = leads.map((l) => {
    const defaultDurationMs = (l.timerDurationMinutes || 30) * 60 * 1000;
    const remainingMs = l.targetCallbackTime ? l.targetCallbackTime - now : defaultDurationMs;
    const remSec = Math.max(0, Math.round(remainingMs / 1000));
    const tgtMs = l.targetCallbackTime || now + remSec * 1000;
    const origDate = l.sharedOriginalDate || formatDateDdMmYyyy(l.createdAt || now);
    return {
      oid: l.sharedOriginalLeadId || l.id,
      odt: origDate,
      ph: l.phone,
      rph: l.rawPhone,
      ct: l.city || '',
      rg: l.regionName || '',
      utc: l.timezoneUtc ?? 3,
      msk: l.timezoneMsk ?? 0,
      lnk: l.uniqueLink || '',
      nt: l.notes || '',
      st:
        l.status === 'saved' || l.status === 'refused' || l.status === 'unreachable'
          ? l.scheduledByAgreedTime
            ? 'callback'
            : 'answering_machine'
          : l.status,
      att: l.attemptCount ?? 0,
      max: l.maxAttempts || 3,
      remSec,
      tgtMs,
      durMin: l.timerDurationMinutes || 30,
      agr: Boolean(l.scheduledByAgreedTime),
      autoF: Boolean(l.isAnsweringMachineForced),
    };
  });

  const payload: SharedPackagePayload = {
    v: 1,
    batchId,
    sender: effectiveSender,
    sentAt: now,
    sentTimeStr,
    leads: items,
  };

  const json = JSON.stringify(payload);
  const encoded = encodeUtf8Base64(json);
  const checksum = computeChecksum(encoded);
  return `${SHARE_PREFIX}${checksum}::${encoded}`;
}

/**
 * Формирование обратной ссылки с результатом (Сохранен / Отказ / Недозвон 3/3 / Возврат + «Умный бокс» для пачки)
 * Возвращает как сам токен, так и сводку по боксу (сколько готово из скольки)
 */
export function recordLeadOutcomeInSmartBox(
  lead: ClientLead,
  options?: {
    finalStatus?: 'saved' | 'refused' | 'unreachable' | 'returned_to_sender';
    historyType?: ShiftHistoryType;
    attemptCount?: number;
    notes?: string;
    savedByName?: string;
  }
): {
  token: string;
  completedCount: number;
  totalCount: number;
  pendingCount: number;
  isMultiBatch: boolean;
} {
  const now = Date.now();
  const d = new Date(now);
  const savedTimeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const finalStatus = options?.finalStatus || 'saved';
  const finalNotes = options?.notes !== undefined ? options.notes : lead.notes || '';
  const hasNotes = Boolean(finalNotes.trim().length > 0);
  const isAgreed =
    !lead.isAnsweringMachineForced &&
    Boolean(lead.scheduledByAgreedTime || lead.status === 'callback' || hasNotes);

  const defaultHistoryType: ShiftHistoryType =
    finalStatus === 'saved'
      ? isAgreed
        ? 'По времени'
        : 'АВТО'
      : finalStatus === 'refused'
      ? 'Отказ'
      : finalStatus === 'returned_to_sender'
      ? isAgreed
        ? 'По времени'
        : 'АВТО'
      : isAgreed
      ? 'Недозвон (По времени)'
      : 'Недозвон (Авто)';

  const remainingMs = lead.targetCallbackTime
    ? Math.max(0, lead.targetCallbackTime - now)
    : (lead.timerDurationMinutes || 30) * 60 * 1000;
  const remSec = Math.round(remainingMs / 1000);
  const origId = lead.sharedOriginalLeadId || lead.id;
  const origDate = lead.sharedOriginalDate || formatDateDdMmYyyy(lead.createdAt || now);

  const currentItem: SavedReceiptItem = {
    originalLeadId: origId,
    originalDate: origDate,
    rawPhone: lead.rawPhone,
    formattedPhone: lead.phone,
    city: lead.city || '',
    link: lead.uniqueLink || '',
    notes: finalNotes,
    finalStatus,
    historyType: options?.historyType || defaultHistoryType,
    attemptCount: options?.attemptCount ?? lead.attemptCount ?? 0,
    remSec,
  };

  const batchId = lead.sharedBatchId;
  const batches = loadSmartBoxBatches();
  const batchRecord = batchId ? batches[batchId] : undefined;

  let itemsList: SavedReceiptItem[] = [currentItem];
  let pendingLeads: PendingBatchLeadInfo[] = [];
  let totalCount = lead.sharedBatchTotal || 1;

  if (batchId && batchRecord) {
    batchRecord.completedItems[origId] = currentItem;
    batchRecord.updatedAt = now;
    saveSmartBoxBatches(batches);

    itemsList = Object.values(batchRecord.completedItems);
    totalCount = Math.max(batchRecord.totalCount, itemsList.length, lead.sharedBatchTotal || 1);
    const completedKeys = new Set(
      itemsList.flatMap((it) => [it.originalLeadId, it.rawPhone])
    );
    pendingLeads = batchRecord.expectedLeads.filter(
      (exp) => !completedKeys.has(exp.oid) && !completedKeys.has(exp.rph)
    );
  }

  const completedCount = itemsList.length;
  const pendingCount = Math.max(0, totalCount - completedCount);
  const isMultiBatch = totalCount > 1;

  const payload: SavedReceiptPayload = {
    v: 1,
    batchId,
    batchTotal: totalCount,
    originalLeadId: origId,
    originalDate: origDate,
    rawPhone: lead.rawPhone,
    formattedPhone: lead.phone,
    city: lead.city || '',
    link: lead.uniqueLink || '',
    notes: finalNotes,
    finalStatus,
    historyType: currentItem.historyType,
    attemptCount: currentItem.attemptCount,
    remSec,
    items: itemsList,
    pendingLeads: pendingLeads.length > 0 ? pendingLeads : undefined,
    savedBy: (options?.savedByName ?? loadSenderNameFromStorage()).trim(),
    savedAt: now,
    savedTimeStr,
  };

  const json = JSON.stringify(payload);
  const encoded = encodeUtf8Base64(json);
  const checksum = computeChecksum(encoded);
  const token = `${RECEIPT_PREFIX}${checksum}::${encoded}`;

  return {
    token,
    completedCount,
    totalCount,
    pendingCount,
    isMultiBatch,
  };
}

/**
 * Обёртка для обратной совместимости (возвращает строку токена)
 */
export function createSavedReceiptToken(
  lead: ClientLead,
  options?: {
    finalStatus?: 'saved' | 'refused' | 'unreachable' | 'returned_to_sender';
    historyType?: ShiftHistoryType;
    attemptCount?: number;
    notes?: string;
    savedByName?: string;
  }
): string {
  return recordLeadOutcomeInSmartBox(lead, options).token;
}

/**
 * Строгий парсер вставленного текста:
 * - Возвращает null для ЛЮБЫХ обычных ссылок CRM, телефонов, городов, заметок.
 * - Срабатывает ТОЛЬКО если внутри есть точный токен MTS-SHARE-V1:: или MTS-SAVED-OK:: с верной контрольной суммой.
 */
export function parseMtsClipboardPayload(rawText: string): ParsedMtsPayload | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  if (!trimmed.includes(SHARE_PREFIX) && !trimmed.includes(RECEIPT_PREFIX)) {
    return null;
  }

  // 1. Проверяем пакет контактов MTS-SHARE-V1::<8-hex>::<base64url>
  const shareMatch = trimmed.match(/MTS-SHARE-V1::([0-9A-F]{8})::([A-Za-z0-9\-_]+)/);
  if (shareMatch) {
    const [, checksum, encoded] = shareMatch;
    if (computeChecksum(encoded) !== checksum) return null;
    try {
      const json = decodeUtf8Base64(encoded);
      const parsed = JSON.parse(json) as SharedPackagePayload;
      if (parsed && parsed.v === 1 && Array.isArray(parsed.leads) && parsed.leads.length > 0) {
        return { type: 'share_package', payload: parsed };
      }
    } catch {
      return null;
    }
  }

  // 2. Проверяем обратную ссылку результата MTS-SAVED-OK::<8-hex>::<base64url>
  const receiptMatch = trimmed.match(/MTS-SAVED-OK::([0-9A-F]{8})::([A-Za-z0-9\-_]+)/);
  if (receiptMatch) {
    const [, checksum, encoded] = receiptMatch;
    if (computeChecksum(encoded) !== checksum) return null;
    try {
      const json = decodeUtf8Base64(encoded);
      const parsed = JSON.parse(json) as SavedReceiptPayload;
      if (
        parsed &&
        parsed.v === 1 &&
        typeof parsed.rawPhone === 'string' &&
        parsed.rawPhone.length >= 10
      ) {
        return { type: 'saved_receipt', payload: parsed };
      }
    } catch {
      return null;
    }
  }

  return null;
}
