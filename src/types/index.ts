/**
 * Типы данных рабочего места оператора группы сохранения клиентов МТС (MNP)
 */

export type CallStatus =
  | 'new'                 // Новый клиент, еще не звонили
  | 'answering_machine'  // Автоответчик (идут попытки 1-3)
  | 'callback'           // Перезвон по договоренности с клиентом
  | 'saved'              // Клиент успешно сохранен в МТС
  | 'refused'            // Отказ от предложения
  | 'unreachable';       // Недозвон (исчерпано 3 попытки автоответчика)

export interface ClientLead {
  id: string;
  uniqueLink: string;
  phone: string;              // Отформатированный +7 (XXX) XXX-XX-XX
  rawPhone: string;           // Чистые цифры 79XXXXXXXXX
  city: string;
  regionName: string;
  timezoneUtc: number;        // Например, 3 (Москва), 5 (Екатеринбург)
  timezoneMsk: number;        // Разница с Москвой: 0, +2, +4 и т.д.
  status: CallStatus;
  attemptCount: number;       // Выполнено перезвонов из очереди (0..3)
  maxAttempts: number;        // Максимум перезвонов (3)
  targetCallbackTime: number | null; // Временная метка Unix ms для перезвона
  timerDurationMinutes: number | null;
  lastCallTime: number | null;
  scheduledByAgreedTime: boolean;    // Запланировано ли по времени с клиентом («По времени»)
  notes: string;
  tariffOffer?: string;       // Предложенный тариф/скидка
  competitorOperator?: string;// К какому оператору уходит (Теле2, МегаФон, Билайн, Т-Мобайл и др.)
  isAnsweringMachineForced?: boolean; // Принудительно зафиксирован в блоке Автоответчик (не убирать даже при наличии комментария)
  // Метаданные функции «Поделиться карточкой клиента» и «Умного бокса»
  sharedFromName?: string;         // Имя/позывной сотрудника, от которого получен контакт
  sharedReceivedAt?: number;       // Время получения контакта по ссылке
  sharedOriginalLeadId?: string;   // Исходный ID карточки у отправителя (для связки обратной ссылки)
  sharedOriginalDate?: string;     // Дата первичного контакта у отправителя (ДД.ММ.ГГГГ)
  sharedBatchId?: string;          // ID группового пакета («Умный бокс»), если передано несколько номеров
  sharedBatchTotal?: number;       // Общее количество номеров в переданном пакете
  sharedOutToColleague?: boolean;  // Пометка у отправителя: контакт передан коллеге
  sharedOutAt?: number;            // Время передачи контакта коллеге
  createdAt: number;
  updatedAt: number;
}

export interface ShiftStats {
  savedCount: number;
  totalCallsCount: number;
  conversionRate: number;     // В процентах, например 50.0
  unreachableCount: number;
  unreachableAutoCount?: number;     // Недозвоны 3/3 по «Авто»
  unreachableCallbackCount?: number; // Недозвоны 3/3 по «По времени»
  refusedCount: number;
  shiftStartTime: number;
  savedWithoutTpChange?: number; // Сохранен без смены ТП
  savedWithEi?: number;          // ЕИ (Единичный Инцидент)
}

export type PushNotificationPosition =
  | 'top-right'
  | 'top-left'
  | 'top-center'
  | 'bottom-right'
  | 'center-right';

export type PearlAnimationMode =
  | 'auto'
  | 'loop_horiz_spin'
  | 'loop_multi_orbits'
  | 'loop_flight';

export interface TimerSettings {
  attempt1Minutes: number;    // По умолчанию 30 мин
  attempt2Minutes: number;    // По умолчанию 30 мин
  attempt3Minutes: number;    // По умолчанию 30 мин
  soundEnabled: boolean;
  volume: number;             // 0.0 - 1.0
  browserNotificationsEnabled: boolean;
  collapseDelayMinutes: number; // Время автосворачивания в режим ожидания (0 = выкл)
  formCollapseDelayMinutes?: number;
  standbyDelayMinutes?: number;
  includeWithoutTpInSaved?: boolean; // Учитывать "Без смены ТП" в общем числе сохранений
  includeEiInSaved?: boolean;        // Учитывать "ЕИ" в общем числе сохранений
  enableNumbersAccounting?: boolean; // Тумблер учёта номеров (поле ввода и журнал сохраненных номеров)
  headerCollapseAnimationEnabled?: boolean; // Плавный уезд верхней панели при сворачивании
  kpiFontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'; // Начертание цифр в блоках KPI
  enablePushNotifications?: boolean; // Всплывающие экранные Push-карточки (дублируют блок срочных вызовов)
  pushPosition?: PushNotificationPosition; // Позиция появления push на экране
  autoClearShiftAtMidnight?: boolean; // Автоочистка прошедшей смены (карточек KPI и очереди) после 00:00 каждый день
  pearlAnimationMode?: PearlAnimationMode; // Режим анимации свободной Жемчужины (авто или зацикливание выбранной анимации)
}

export interface RegionInfo {
  defPrefixes: string[];
  city: string;
  regionName: string;
  utcOffset: number;
  mskOffset: number;
  aliases?: string[];
}

export type SavedClientType = 'MNP' | 'АВТО' | 'По времени';

export interface SavedClientRecord {
  id: string;
  phone: string; // Строго 11 цифр слитного написания, например 79293664010
  time: string;  // Формат 00:00 местного времени ПК сотрудника
  type: SavedClientType;
  timestamp: number;
}

export type ShiftHistoryType =
  | 'MNP'
  | 'АВТО'
  | 'По времени'
  | 'Недозвон (Авто)'
  | 'Недозвон (По времени)'
  | 'Отказ'
  | 'Удален';

export interface ShiftHistoryRecord {
  id: string;
  leadId?: string;
  savedRecordId?: string;
  deletedByOperator?: boolean; // Был ли номер удален сотрудником из таблицы номеров / очереди
  attemptCount?: number;       // Количество выполненных перезвонов (0..3)
  shareDirection?: 'sent' | 'received'; // 'sent' (↗ отправлен коллеге) | 'received' (↙ получен от коллеги)
  sharedPeerName?: string;     // Имя коллеги (от кого получен)
  sharedOriginalLeadId?: string; // Исходный ID карточки у отправителя (для ретроспективной связки результата)
  shareBatchId?: string;       // ID группового пакета («Умный бокс»)
  sharePendingColleague?: boolean; // Ожидает ли переданный номер обработки от коллеги (Б.1)
  creditedByColleagueReceipt?: boolean; // Защита от повторного начисления KPI при досылке полного бокса (Б.1)
  sharedLeadSnapshot?: Partial<ClientLead>; // Снимок карточки для мгновенного возврата в очередь в 1 клик (Б.1)
  operatorId?: string;        // Логин сотрудника в УРМ (например, kiklimenko)
  operatorName?: string;      // Имя / Фамилия сотрудника в УРМ
  groupLeaderName?: string;   // Руководитель группы (РГ / ВС)
  date: string;       // Формат ДД.ММ.ГГГГ, например 06.11.2026
  time: string;       // Формат ЧЧ:ММ, например 13:05
  phone: string;      // Строго 11 цифр 79XXXXXXXXX
  type: ShiftHistoryType;
  link: string;       // Ссылка из карточки клиента
  city: string;       // Город из карточки клиента
  notes: string;      // Заметка из карточки клиента
  timestamp: number;
}



