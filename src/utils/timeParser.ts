/**
 * Утилиты гибкого и отказоустойчивого парсинга времени и интервалов
 * Поддерживает форматы оператора: 17, 1700, 0017, 17-00, 17/00, 17,00, 17.00, 17:00
 */

export interface ParsedTime {
  hours: number;
  minutes: number;
  formatted: string; // "17:00"
}

/**
 * Интеллектуальный парсер времени
 * Корректно распознает любые разделители (тире, слэш, точка, запятая, двоеточие, пробел)
 * и слитный ввод чисел (17 -> 17:00, 1700 -> 17:00, 0017 -> 17:00, 930 -> 09:30).
 */
export function parseFlexibleTimeInput(raw: string): ParsedTime | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Поиск по разделителям (:, -, /, ., ,, пробел)
  const separatorMatch = trimmed.match(/^(\d{1,2})[\s:\-\/.,](\d{1,2})$/);
  if (separatorMatch) {
    let h = parseInt(separatorMatch[1], 10);
    let m = parseInt(separatorMatch[2], 10);
    if (!isNaN(h) && !isNaN(m)) {
      h = Math.min(23, Math.max(0, h));
      m = Math.min(59, Math.max(0, m));
      return {
        hours: h,
        minutes: m,
        formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      };
    }
  }

  // 2. Только цифры (слитный ввод)
  const cleanDigits = trimmed.replace(/\D/g, '');
  if (!cleanDigits) return null;

  let h = 0;
  let m = 0;

  if (cleanDigits.length <= 2) {
    // Ввод типа "17", "9" -> 17:00, 09:00
    h = Math.min(23, Math.max(0, parseInt(cleanDigits, 10)));
    m = 0;
  } else if (cleanDigits.length === 3) {
    // Ввод типа "930" -> 09:30
    h = Math.min(23, Math.max(0, parseInt(cleanDigits.slice(0, 1), 10)));
    m = Math.min(59, Math.max(0, parseInt(cleanDigits.slice(1), 10)));
  } else if (cleanDigits.length === 4) {
    // Ввод типа "1700" или "0017"
    if (cleanDigits.startsWith('00') && cleanDigits !== '0000') {
      // Пользователь ввел 0017 имея в виду 17:00
      h = Math.min(23, Math.max(0, parseInt(cleanDigits.slice(2), 10)));
      m = 0;
    } else {
      h = Math.min(23, Math.max(0, parseInt(cleanDigits.slice(0, 2), 10)));
      m = Math.min(59, Math.max(0, parseInt(cleanDigits.slice(2, 4), 10)));
    }
  } else {
    // Больше 4 цифр: берем первые 4
    h = Math.min(23, Math.max(0, parseInt(cleanDigits.slice(0, 2), 10)));
    m = Math.min(59, Math.max(0, parseInt(cleanDigits.slice(2, 4), 10)));
  }

  return {
    hours: h,
    minutes: m,
    formatted: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
  };
}

/**
 * Парсер интервала перезвона (в минутах)
 * Поддерживает: "30" -> 30, "1:30" -> 90, "1.5" -> 90, "45м" -> 45
 */
export function parseFlexibleIntervalInput(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // Формат "1:30" (1ч 30м)
  if (trimmed.includes(':') || trimmed.includes('-')) {
    const parts = trimmed.split(/[:\-]/);
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const total = h * 60 + m;
    return total > 0 ? total : null;
  }

  // Дробный формат типа "1.5" или "1,5"
  if (trimmed.includes('.') || trimmed.includes(',')) {
    const hoursFloat = parseFloat(trimmed.replace(',', '.'));
    if (!isNaN(hoursFloat) && hoursFloat > 0) {
      return Math.round(hoursFloat * 60);
    }
  }

  // Чистый номер минут
  const digits = parseInt(trimmed.replace(/\D/g, ''), 10);
  if (!isNaN(digits) && digits > 0) {
    return digits;
  }

  return null;
}

/**
 * Расчёт целевого времени звонка по часам ПК оператора
 * Если оператор ставит звонок на 18:00 по времени абонента, функция вычисляет,
 * сколько в этот момент будет на компьютере оператора.
 */
export function calculateOperatorCallTime(
  clientUtcOffset: number,
  clientTargetHour: number,
  clientTargetMinute: number = 0
): {
  operatorTimeFormatted: string; // "15:00 (ПК)"
  minutesFromNow: number;
  isTomorrow: boolean;
} {
  const now = new Date();
  const operatorUtcMinutes = -now.getTimezoneOffset(); // смещение ПК оператора в минутах
  const clientUtcMinutes = clientUtcOffset * 60; // смещение клиента в минутах
  const diffMinutes = operatorUtcMinutes - clientUtcMinutes; // разница: ПК минус Клиент

  // Текущее время клиента в минутах от начала суток
  const nowUtcMillis = now.getTime() + now.getTimezoneOffset() * 60000;
  const clientNow = new Date(nowUtcMillis + clientUtcMinutes * 60000);
  const clientNowMinutes = clientNow.getHours() * 60 + clientNow.getMinutes();

  const clientTargetMinutes = clientTargetHour * 60 + clientTargetMinute;

  let minutesFromNow = clientTargetMinutes - clientNowMinutes;
  let isTomorrow = false;

  if (minutesFromNow <= 0) {
    minutesFromNow += 24 * 60;
    isTomorrow = true;
  }

  // Вычисляем время на часах оператора
  const targetCallDate = new Date(now.getTime() + minutesFromNow * 60000);
  const opH = String(targetCallDate.getHours()).padStart(2, '0');
  const opM = String(targetCallDate.getMinutes()).padStart(2, '0');

  return {
    operatorTimeFormatted: `${opH}:${opM}`,
    minutesFromNow,
    isTomorrow,
  };
}
