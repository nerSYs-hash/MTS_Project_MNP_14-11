/**
 * Менеджер пакетов обновлений для рабочего места оператора МТС
 * Формирует и скачивает бинарные архивы Electron ASAR (update.asar / app.asar)
 * для обновления настольного приложения рядом с .exe.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 📜 РЕГЛАМЕНТ И ПРАВИЛА ВЕРСИОНИРОВАНИЯ СИСТЕМЫ (SemVer: X.Y.Z)
 * ══════════════════════════════════════════════════════════════════════════════
 * 1. ТРЕТЬЯ ЦИФРА (Z — Patch, e.g. 2.7.0 -> 2.7.1):
 *    МЕЛКИЕ ОБНОВЛЕНИЯ: исправления багов, точечные доработки UI/UX, анимации,
 *    стили кнопок, правка текстов, мелкие косметические улучшения.
 *
 * 2. ВТОРАЯ ЦИФРА (Y — Minor, e.g. 2.7.x -> 2.8.0):
 *    КРУПНЫЕ ОБНОВЛЕНИЯ: появление новых разделов, новых функциональных блоков,
 *    существенное расширение возможностей (учёт номеров, новые модули очередей).
 *
 * 3. ПЕРВАЯ ЦИФРА (X — Major, e.g. 2.x.x -> 3.0.0):
 *    ГЛОБАЛЬНЫЕ ОБНОВЛЕНИЯ: фундаментальная смена архитектуры, глобальный
 *    редизайн всей дизайн-системы, переход на новую технологическую платформу.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const MTS_VERSIONING_RULES = {
  patch: 'Мелкое обновление (3-я цифра, e.g. 2.7.1): точечные фиксы, стили, анимации, мелкие правки UI',
  minor: 'Крупное обновление (2-я цифра, e.g. 2.8.0): новые разделы, блоки, системный функционал',
  major: 'Глобальное обновление (1-я цифра, e.g. 3.0.0): глобальный редизайн, новая архитектура платформы',
} as const;

export interface UpdateChangeItem {
  type: 'feature' | 'update' | 'fix' | 'system';
  title: string;
  desc: string;
}

export interface MtsUpdatePackage {
  format: 'mts-urm-asar-package';
  formatVersion: number;
  appId: string;
  version: string;
  releaseDate: string;
  releaseDateFormatted: string;
  title: string;
  description: string;
  changes: UpdateChangeItem[];
  bundle?: {
    js?: string;
    css?: string;
  };
  clientPatch?: {
    enableNumbersAccountingDefault?: boolean;
    targetVersion?: string;
    changelogCount?: number;
    [key: string]: unknown;
  };
  checksum?: string;
}

export const CURRENT_APP_VERSION = '2.9.0';
export const CURRENT_RELEASE_DATE = '18 ноября 2026';

export const CURRENT_UPDATE_PACKAGE: MtsUpdatePackage = {
  format: 'mts-urm-asar-package',
  formatVersion: 1,
  appId: 'mts-mnp-urm',
  version: CURRENT_APP_VERSION,
  releaseDate: '2026-11-18',
  releaseDateFormatted: CURRENT_RELEASE_DATE,
  title: 'Пакет обновлений v2.9.0 (2.9.0.asar) — Жемчужина, Калька и Таймер Ready',
  description:
    'Обновление рабочего места (v2.9.0): интерактивная Жемчужина с каплями быстрого доступа у края экрана, модуль «Калька» во второй капле для вынесения прозрачных функциональных областей поверх внешних рабочих программ (Звонки, Сохранение, Таймер), компактный прямоугольный «Таймер Ready» в третьей капле с форматом ЧЧ:ММ:СС, избранным временем и автоматическим сворачиванием до 3 элементов во время работы, а также настройка полного отключения анимации Жемчужины.',
  changes: [
    {
      type: 'feature',
      title: 'Интерактивная Жемчужина с каплями быстрого доступа',
      desc: 'Плавающая и закрепляемая у края экрана Жемчужина с 4 каплями для мгновенного вызова рабочих инструментов поверх интерфейса.',
    },
    {
      type: 'feature',
      title: 'Модуль «Калька» во второй капле Жемчужины',
      desc: 'Настройка количества прозрачных областей и привязка каждой кальки к сигналу в программу: «Звонки», «Сохранение» или «Таймер» (пауза и продолжение отсчёта).',
    },
    {
      type: 'feature',
      title: 'Прямоугольный «Таймер Ready» в третьей капле',
      desc: 'Пересчёт часов, минут и секунд в формат ЧЧ:ММ:СС, сохранение времени в избранное и максимальное сворачивание в работе до 3 элементов (время и две кнопки).',
    },
    {
      type: 'update',
      title: 'Управление полной анимацией Жемчужины в настройках',
      desc: 'В настройки приложения (разделы «Интерфейс» и «Анимации») добавлен переключатель полного отключения анимации Жемчужины и её капель.',
    },
    {
      type: 'system',
      title: 'Бинарный архив обновления 2.9.0.asar / update.asar',
      desc: 'Установка на рабочий стол выполняется через бинарный архив (update.asar / 2.9.0.asar). Все карточки, настройки и таймеры сохраняются.',
    },
  ],
  clientPatch: {
    enableNumbersAccountingDefault: true,
    targetVersion: CURRENT_APP_VERSION,
    changelogCount: 64,
  },
  checksum: 'sha256-mts-urm-2.9.0-asar-verified',
};

/**
 * Получить текущую установленную версию приложения
 */
export function getInstalledAppVersion(): string {
  try {
    const installed = localStorage.getItem('mts_app_installed_version');
    if (installed) return installed;
  } catch {
    //
  }
  return CURRENT_APP_VERSION;
}

/**
 * Скачивание настоящего бинарного архива update.asar / app.asar (2.1 МБ)
 * ВАЖНО: Не отключает Service Worker платформы AI Studio и никогда не генерирует пустой 128 КБ фоллбэк.
 */
export async function downloadAsarFile(
  targetName: 'update.asar' | 'app.asar' | '2.9.0.asar' = 'update.asar'
): Promise<number> {
  const isLocalFileProtocol =
    typeof window !== 'undefined' && window.location.protocol === 'file:';

  const candidateBases = isLocalFileProtocol
    ? [
        'https://ais-dev-ieqxiwj5sgc5fo7g7ryqkc-727120223819.us-west2.run.app',
        'https://ais-pre-ieqxiwj5sgc5fo7g7ryqkc-727120223819.us-west2.run.app',
      ]
    : [''];

  let validBuffer: ArrayBuffer | null = null;
  let lastErrorText = '';

  for (const baseOrigin of candidateBases) {
    const downloadUrl = `${baseOrigin}/${targetName}?v=${CURRENT_APP_VERSION}&t=${Date.now()}`;
    try {
      const response = await fetch(downloadUrl, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        lastErrorText = `HTTP ${response.status}`;
        continue;
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Проверяем заголовок настоящего бинарного ASAR (04 00 00 00) и размер > 500 КБ
      const isValidAsar =
        bytes.byteLength > 500 * 1024 &&
        bytes[0] === 4 &&
        bytes[1] === 0 &&
        bytes[2] === 0 &&
        bytes[3] === 0;

      if (!isValidAsar) {
        lastErrorText = `Некорректный формат или неполный файл (${Math.round(bytes.byteLength / 1024)} КБ)`;
        continue;
      }

      validBuffer = buffer;
      break;
    } catch (err) {
      lastErrorText = err instanceof Error ? err.message : 'Сетевая ошибка загрузки';
    }
  }

  if (!validBuffer) {
    throw new Error(
      `Не удалось скачать ${targetName}${lastErrorText ? ` (${lastErrorText})` : ''}. Попробуйте скачать через веб-версию в браузере.`
    );
  }

  const blob = new Blob([validBuffer], { type: 'application/octet-stream' });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = targetName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    URL.revokeObjectURL(blobUrl);
  }, 10000);

  return validBuffer.byteLength;
}


