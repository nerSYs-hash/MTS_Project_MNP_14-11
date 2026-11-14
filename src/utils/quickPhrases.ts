/**
 * Хранилище и утилиты для быстрых фраз оператора MNP
 * По умолчанию в начале дня список пуст и наполняется оператором по ходу смены
 */

const QUICK_PHRASES_STORAGE_KEY = 'mts_retention_quick_phrases_v2';

export const DEFAULT_QUICK_PHRASES: string[] = [];

export function loadQuickPhrasesFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUICK_PHRASES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Ошибка загрузки быстрых фраз:', e);
    return [];
  }
}

export function saveQuickPhrasesToStorage(phrases: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUICK_PHRASES_STORAGE_KEY, JSON.stringify(phrases));
  } catch (e) {
    console.error('Ошибка сохранения быстрых фраз:', e);
  }
}
