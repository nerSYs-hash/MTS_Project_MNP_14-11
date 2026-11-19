/**
 * Локальное хранилище данных смены, настроек и списка клиентов
 */
import { ClientLead, ShiftStats, TimerSettings, SavedClientRecord, ShiftHistoryRecord } from '../types';

const LEADS_STORAGE_KEY = 'mts_retention_leads_v1';
const STATS_STORAGE_KEY = 'mts_retention_stats_v1';
const SETTINGS_STORAGE_KEY = 'mts_retention_settings_v1';
const SAVED_CLIENTS_STORAGE_KEY = 'mts_retention_saved_clients_v1';
const SHIFT_HISTORY_STORAGE_KEY = 'mts_retention_shift_history_v1';

export const DEFAULT_SETTINGS: TimerSettings = {
  attempt1Minutes: 30,
  attempt2Minutes: 30,
  attempt3Minutes: 30,
  soundEnabled: true,
  volume: 0.8,
  browserNotificationsEnabled: false,
  collapseDelayMinutes: 3,
  formCollapseDelayMinutes: 0,
  standbyDelayMinutes: 3,
  includeWithoutTpInSaved: true,
  includeEiInSaved: true,
  enableNumbersAccounting: true,
  headerCollapseAnimationEnabled: true,
  enablePushNotifications: true,
  pushPosition: 'top-right',
  autoClearShiftAtMidnight: true,
  pearlAnimationMode: 'auto',
};

const BACKUP_STORAGE_KEY = 'mts_retention_leads_backup_v1';

export const INITIAL_STATS: ShiftStats = {
  savedCount: 3,
  totalCallsCount: 6,
  conversionRate: 50.0,
  unreachableCount: 1,
  unreachableAutoCount: 1,
  unreachableCallbackCount: 0,
  refusedCount: 0,
  shiftStartTime: Date.now() - 2.5 * 3600 * 1000,
  savedWithoutTpChange: 1,
  savedWithEi: 1,
};

export const INITIAL_DEMO_LEADS: ClientLead[] = [
  {
    id: 'lead-mts-demo-1',
    uniqueLink: `${typeof window !== 'undefined' ? window.location.origin : ''}?lead=demo1`,
    phone: '+7 (916) 123-45-67',
    rawPhone: '79161234567',
    city: 'Москва',
    regionName: 'г. Москва и Московская область',
    timezoneUtc: 3,
    timezoneMsk: 0,
    status: 'answering_machine',
    attemptCount: 0,
    maxAttempts: 3,
    targetCallbackTime: Date.now() + 18 * 60 * 1000 + 40 * 1000,
    timerDurationMinutes: 30,
    lastCallTime: Date.now() - 11 * 60 * 1000,
    scheduledByAgreedTime: false,
    notes: 'Заявка на перенос в Т-Мобайл. Сработал автоответчик, запущен авто-таймер повторного набора.',
    tariffOffer: 'Тарифище (скидка 50% + 30 ГБ бессрочно)',
    competitorOperator: 'Т-Мобайл',
    createdAt: Date.now() - 12 * 60 * 1000,
    updatedAt: Date.now() - 11 * 60 * 1000,
  },
  {
    id: 'lead-mts-demo-2',
    uniqueLink: `${typeof window !== 'undefined' ? window.location.origin : ''}?lead=demo2`,
    phone: '+7 (921) 987-65-43',
    rawPhone: '79219876543',
    city: 'Санкт-Петербург',
    regionName: 'г. Санкт-Петербург и Ленинградская область',
    timezoneUtc: 3,
    timezoneMsk: 0,
    status: 'callback',
    attemptCount: 0,
    maxAttempts: 3,
    targetCallbackTime: Date.now() + 6 * 60 * 1000 + 15 * 1000,
    timerDurationMinutes: 15,
    lastCallTime: Date.now() - 9 * 60 * 1000,
    scheduledByAgreedTime: true,
    notes: 'Договоренность о перезвоне: клиент просил набрать через 15 минут после совещания.',
    tariffOffer: 'Персональный Smart (скидка 60%)',
    competitorOperator: 'МегаФон',
    createdAt: Date.now() - 25 * 60 * 1000,
    updatedAt: Date.now() - 9 * 60 * 1000,
  },
];

export function loadLeadsFromStorage(): ClientLead[] {
  if (typeof window === 'undefined') return INITIAL_DEMO_LEADS;
  try {
    const raw = localStorage.getItem(LEADS_STORAGE_KEY);
    if (!raw) return INITIAL_DEMO_LEADS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return INITIAL_DEMO_LEADS;
    return parsed.filter(
      (l: ClientLead) =>
        l && l.status !== 'saved' && l.status !== 'refused' && l.status !== 'unreachable'
    );
  } catch (e) {
    console.error('Ошибка загрузки клиентов из localStorage:', e);
    return INITIAL_DEMO_LEADS;
  }
}

export function saveLeadsToStorage(leads: ClientLead[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Если в текущем списке больше 0 записей, обновляем резервную копию
    if (leads.length > 0) {
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(leads));
    }
    localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
  } catch (e) {
    console.error('Ошибка сохранения клиентов в localStorage:', e);
  }
}

export function loadBackupLeadsFromStorage(): ClientLead[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function loadStatsFromStorage(): ShiftStats {
  if (typeof window === 'undefined') return INITIAL_STATS;
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return INITIAL_STATS;
    const parsed = JSON.parse(raw);
    return {
      ...INITIAL_STATS,
      ...parsed,
      savedWithoutTpChange: parsed.savedWithoutTpChange || 0,
      savedWithEi: parsed.savedWithEi || 0,
      conversionRate:
        parsed.totalCallsCount > 0
          ? Number(((parsed.savedCount / parsed.totalCallsCount) * 100).toFixed(1))
          : 0,
    };
  } catch (e) {
    console.error('Ошибка загрузки статистики из localStorage:', e);
    return INITIAL_STATS;
  }
}

export function saveStatsToStorage(stats: ShiftStats): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Ошибка сохранения статистики в localStorage:', e);
  }
}

export function loadSettingsFromStorage(): TimerSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      attempt1Minutes: 30,
      attempt2Minutes: 30,
      attempt3Minutes: 30,
      formCollapseDelayMinutes:
        parsed.formCollapseDelayMinutes !== undefined
          ? parsed.formCollapseDelayMinutes
          : parsed.collapseDelayMinutes ?? 3,
      standbyDelayMinutes:
        parsed.standbyDelayMinutes !== undefined ? parsed.standbyDelayMinutes : 5,
      enablePushNotifications: parsed.enablePushNotifications !== false,
      pushPosition: parsed.pushPosition || 'top-right',
    };
  } catch (e) {
    console.error('Ошибка загрузки настроек из localStorage:', e);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettingsToStorage(settings: TimerSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Ошибка сохранения настроек в localStorage:', e);
  }
}

export const INITIAL_SAVED_CLIENTS: SavedClientRecord[] = [
  {
    id: 'saved_demo_1',
    phone: '79161234567',
    time: '11:15',
    type: 'MNP',
    timestamp: Date.now() - 3.5 * 3600 * 1000,
  },
  {
    id: 'saved_demo_2',
    phone: '79219876543',
    time: '12:40',
    type: 'АВТО',
    timestamp: Date.now() - 2 * 3600 * 1000,
  },
  {
    id: 'saved_demo_3',
    phone: '79855554433',
    time: '13:05',
    type: 'По времени',
    timestamp: Date.now() - 1.2 * 3600 * 1000,
  },
];

export function loadSavedClientsFromStorage(): SavedClientRecord[] {
  if (typeof window === 'undefined') return INITIAL_SAVED_CLIENTS;
  try {
    const raw = localStorage.getItem(SAVED_CLIENTS_STORAGE_KEY);
    if (!raw) return INITIAL_SAVED_CLIENTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return INITIAL_SAVED_CLIENTS;
    return parsed.map((r: any) => ({
      ...r,
      type: r.type === 'По просьбе' ? 'По времени' : r.type,
    }));
  } catch (e) {
    console.error('Ошибка загрузки сохраненных клиентов:', e);
    return INITIAL_SAVED_CLIENTS;
  }
}

export function saveSavedClientsToStorage(records: SavedClientRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_CLIENTS_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Ошибка сохранения сохраненных клиентов:', e);
  }
}

export const INITIAL_SHIFT_HISTORY: ShiftHistoryRecord[] = [
  {
    id: 'hist_demo_1',
    date: '06.11.2026',
    time: '13:05',
    phone: '79855554433',
    type: 'По времени',
    attemptCount: 1,
    link: 'https://crm.mts.ru/mnp/lead/884120',
    city: 'Москва',
    notes: 'Согласована скидка 50% на абонентскую плату + 30 ГБ трафика',
    timestamp: Date.now() - 1.2 * 3600 * 1000,
  },
  {
    id: 'hist_demo_2',
    date: '06.11.2026',
    time: '12:40',
    phone: '79219876543',
    type: 'АВТО',
    attemptCount: 2,
    link: 'https://crm.mts.ru/mnp/lead/884095',
    city: 'Санкт-Петербург',
    notes: 'Клиент принял персональное предложение со второй попытки автодозвона',
    timestamp: Date.now() - 2 * 3600 * 1000,
  },
  {
    id: 'hist_demo_3',
    date: '06.11.2026',
    time: '12:18',
    phone: '79293664010',
    type: 'Отказ',
    attemptCount: 1,
    link: 'https://crm.mts.ru/mnp/lead/884051',
    city: 'Нижний Новгород',
    notes: 'Переходит на корпоративный тариф работодателя',
    timestamp: Date.now() - 2.6 * 3600 * 1000,
  },
  {
    id: 'hist_demo_4',
    deletedByOperator: true,
    date: '06.11.2026',
    time: '11:45',
    phone: '79123456789',
    type: 'Недозвон (Авто)',
    attemptCount: 3,
    link: 'https://crm.mts.ru/mnp/lead/883990',
    city: 'Екатеринбург',
    notes: 'Недозвон после 3 перезвонов (3/3) по Автоответчику',
    timestamp: Date.now() - 3.1 * 3600 * 1000,
  },
  {
    id: 'hist_demo_5',
    date: '06.11.2026',
    time: '11:15',
    phone: '79161234567',
    type: 'MNP',
    attemptCount: 0,
    link: 'https://crm.mts.ru/mnp/lead/883912',
    city: 'Москва',
    notes: 'Прямое сохранение без постановки в очередь перезвона',
    timestamp: Date.now() - 3.5 * 3600 * 1000,
  },
];

export function loadShiftHistoryFromStorage(): ShiftHistoryRecord[] {
  if (typeof window === 'undefined') return INITIAL_SHIFT_HISTORY;
  try {
    const raw = localStorage.getItem(SHIFT_HISTORY_STORAGE_KEY);
    if (!raw) return INITIAL_SHIFT_HISTORY;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_SHIFT_HISTORY;
    return parsed.map((r: any) => ({
      ...r,
      type: r.type === 'По просьбе' ? 'По времени' : r.type,
    }));
  } catch (e) {
    console.error('Ошибка загрузки истории смен:', e);
    return INITIAL_SHIFT_HISTORY;
  }
}

export function saveShiftHistoryToStorage(records: ShiftHistoryRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHIFT_HISTORY_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Ошибка сохранения истории смен:', e);
  }
}

/**
 * Сформировать текстовый отчёт о смене оператора
 */
export function generateShiftReportText(stats: ShiftStats, leads: ClientLead[]): string {
  const dateStr = new Date(stats.shiftStartTime).toLocaleDateString('ru-RU');
  const durationHours = ((Date.now() - stats.shiftStartTime) / (1000 * 60 * 60)).toFixed(1);

  const activeLeads = leads.filter(
    (l) => l.status !== 'saved' && l.status !== 'refused' && l.status !== 'unreachable'
  );
  const isAutoLead = (l: (typeof activeLeads)[0]) => {
    if (l.isAnsweringMachineForced || l.status === 'answering_machine') return true;
    const hasNotes = Boolean(l.notes && l.notes.trim().length > 0);
    if (!hasNotes) return true;
    return !l.scheduledByAgreedTime && l.status !== 'callback';
  };
  const autoCount = activeLeads.filter(isAutoLead).length;
  const clientAgreedCount = activeLeads.filter((l) => !isAutoLead(l)).length;

  let accountInfoLine = '';
  try {
    const rawAcc = typeof window !== 'undefined' ? localStorage.getItem('mts_urm_active_account_session_v1') : null;
    if (rawAcc) {
      const acc = JSON.parse(rawAcc);
      if (acc && acc.login) {
        const namePart = acc.fullName && acc.fullName !== acc.login ? `${acc.fullName} (${acc.login})` : acc.login;
        const leaderPart = acc.groupLeaderName ? ` • ВС / РГ: ${acc.groupLeaderName}` : '';
        accountInfoLine = `Сотрудник: ${namePart}${leaderPart}\n`;
      }
    }
  } catch {
    // ignore
  }

  let text = `📊 ОТЧЁТ О СМЕНЕ: ГРУППА СОХРАНЕНИЯ КЛИЕНТОВ МТС (MNP)\n`;
  if (accountInfoLine) {
    text += accountInfoLine;
  }
  text += `Дата смены: ${dateStr} (в работе: ~${durationHours} ч.)\n`;
  text += `--------------------------------------------------\n`;
  text += `• Сохранено клиентов: ${stats.savedCount}\n`;
  if ((stats.savedWithoutTpChange || 0) > 0 || (stats.savedWithEi || 0) > 0) {
    text += `  - Без смены ТП: ${stats.savedWithoutTpChange || 0}\n`;
    text += `  - ЕИ (Единичный Инцидент): ${stats.savedWithEi || 0}\n`;
  }
  text += `• Всего исходящих звонков: ${stats.totalCallsCount}\n`;
  text += `• Конверсия смены: ${stats.conversionRate.toFixed(1)}%\n`;
  text += `• В очереди перезвонов: ${activeLeads.length} (Авто: ${autoCount}, По времени: ${clientAgreedCount})\n`;
  text += `• Недозвонов (3/3): ${stats.unreachableCount} (Авто: ${stats.unreachableAutoCount || 0}, По времени: ${stats.unreachableCallbackCount || 0})\n`;
  text += `• Отказов: ${stats.refusedCount}\n`;
  text += `• Всего записей в базе: ${leads.length}\n`;
  text += `--------------------------------------------------\n`;

  const savedLeads = leads.filter((l) => l.status === 'saved');
  if (savedLeads.length > 0) {
    text += `\nСписок сохраненных абонентов:\n`;
    savedLeads.forEach((l, i) => {
      text += `${i + 1}. ${l.phone} (${l.city}) - перезвонов ${l.attemptCount}/3 ${l.tariffOffer ? `[${l.tariffOffer}]` : ''}\n`;
    });
  }

  return text;
}
