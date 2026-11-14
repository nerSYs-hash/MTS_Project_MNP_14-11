import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Filter,
  Download,
  Settings,
  Search,
  X,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  Trash2,
  TrendingUp,
  Table as TableIcon,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  FolderOpen,
  Users,
  RefreshCw,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import { ShiftHistoryRecord, ShiftStats } from '../types';
import { INITIAL_SHIFT_HISTORY } from '../utils/storage';
import {
  UrmSyncConfig,
  UrmEmployeeStatPackage,
  loadUrmSyncConfig,
  saveUrmSyncConfig,
  detectOsUsername,
  pickAndConnectUrmFolder,
  getDirectoryHandleFromIdb,
  pushEmployeeStatsToUrmFolder,
  fetchAllDepartmentStatsFromUrmFolder,
  hasNativeUrmIpcBridge,
} from '../utils/urmStatSync';

interface BookWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  records?: ShiftHistoryRecord[];
  stats?: ShiftStats;
  onDeleteRecord?: (id: string) => void;
  onReturnSharedLeadToQueue?: (record: ShiftHistoryRecord) => void;
}

type FilterQuickPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
type OptionsTab = 'columns' | 'params';
type ColumnId =
  | 'date'
  | 'time'
  | 'operator'
  | 'phone'
  | 'deleted'
  | 'type'
  | 'attempts'
  | 'link'
  | 'city'
  | 'note';
type ChartPeriod = 'day' | 'week' | 'month' | 'year';
type ChartMetricId =
  | 'saved'
  | 'mnp'
  | 'callback'
  | 'auto'
  | 'refused'
  | 'unreachable'
  | 'unreachableCallback'
  | 'unreachableAuto';
type MainWorkspaceView = 'table' | 'chart';
type DataScopeMode = 'own' | 'department';

interface ChartDataPoint {
  label: string;
  subLabel: string;
  saved: number;               // Всего сохранено (MNP + По времени + Авто)
  mnp: number;                 // Внешние MNP, сохраненные сразу без перезвона
  callback: number;            // Сохранено после перезвона «По времени»
  auto: number;                // Сохранено после «Авто» дозвона
  unreachable: number;         // Недозвон 3/3 (всего: По времени + Авто)
  unreachableCallback: number; // Недозвон 3/3 «По времени»
  unreachableAuto: number;     // Недозвон 3/3 «Авто»
  refused: number;             // Реальные отказы в диалоге
  totalCalls: number;          // Всего контактов
  conversion: number;          // % конверсии
}

// Расширяемый реестр показателей для крупных карточек сверху и графиков (цвета 1-в-1 совпадают с точками в таблице и кольце)
const CHART_METRICS: {
  id: ChartMetricId;
  label: string;
  shortLabel: string;
  color: string;
  glowColor: string;
  dotColor: string;
  badgeBg: string;
}[] = [
  {
    id: 'saved',
    label: 'Сохранения (всего)',
    shortLabel: 'Сохранения',
    color: '#10B981',
    glowColor: 'rgba(16, 185, 129, 0.35)',
    dotColor: '#10B981',
    badgeBg: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'mnp',
    label: 'MNP сразу (без перезвона)',
    shortLabel: 'MNP сразу',
    color: '#109E59',
    glowColor: 'rgba(16, 158, 89, 0.35)',
    dotColor: '#109E59',
    badgeBg: 'bg-emerald-50 text-emerald-700',
  },
  {
    id: 'callback',
    label: 'По времени',
    shortLabel: 'По времени',
    color: '#0077FF',
    glowColor: 'rgba(0, 119, 255, 0.35)',
    dotColor: '#0077FF',
    badgeBg: 'bg-blue-50 text-[#0077FF]',
  },
  {
    id: 'auto',
    label: 'Автоответчик',
    shortLabel: 'Авто',
    color: '#8B5CF6',
    glowColor: 'rgba(139, 92, 246, 0.35)',
    dotColor: '#8B5CF6',
    badgeBg: 'bg-purple-50 text-purple-600',
  },
  {
    id: 'refused',
    label: 'Отказы',
    shortLabel: 'Отказы',
    color: '#FF0032',
    glowColor: 'rgba(255, 0, 50, 0.35)',
    dotColor: '#FF0032',
    badgeBg: 'bg-rose-50 text-[#FF0032]',
  },
  {
    id: 'unreachable',
    label: 'Недозвон',
    shortLabel: 'Недозвон',
    color: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    dotColor: '#F59E0B',
    badgeBg: 'bg-amber-50 text-amber-600',
  },
  {
    id: 'unreachableCallback',
    label: 'Недозвон (По времени)',
    shortLabel: 'Недозвон (По времени)',
    color: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.35)',
    dotColor: '#F59E0B',
    badgeBg: 'bg-amber-50 text-amber-600',
  },
  {
    id: 'unreachableAuto',
    label: 'Недозвон (Авто)',
    shortLabel: 'Недозвон (Авто)',
    color: '#D97706',
    glowColor: 'rgba(217, 119, 6, 0.35)',
    dotColor: '#D97706',
    badgeBg: 'bg-amber-50 text-amber-700',
  },
];

const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const TABLE_COLUMNS: {
  id: ColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  hideSort: boolean;
}[] = [
  { id: 'date', label: 'Дата', defaultWidth: 91, minWidth: 36, maxWidth: 180, hideSort: true },
  { id: 'time', label: 'Время', defaultWidth: 96, minWidth: 60, maxWidth: 260, hideSort: false },
  { id: 'operator', label: 'Сотрудник', defaultWidth: 150, minWidth: 90, maxWidth: 260, hideSort: false },
  { id: 'phone', label: 'Номер телефона', defaultWidth: 154, minWidth: 110, maxWidth: 340, hideSort: false },
  { id: 'deleted', label: 'Уд.', defaultWidth: 44, minWidth: 36, maxWidth: 90, hideSort: true },
  { id: 'type', label: 'Тип', defaultWidth: 170, minWidth: 90, maxWidth: 280, hideSort: false },
  { id: 'attempts', label: 'Перезв.', defaultWidth: 68, minWidth: 48, maxWidth: 120, hideSort: false },
  { id: 'link', label: 'Ссылка', defaultWidth: 290, minWidth: 80, maxWidth: 700, hideSort: false },
  { id: 'city', label: 'Город', defaultWidth: 200, minWidth: 70, maxWidth: 360, hideSort: false },
  { id: 'note', label: 'Заметка', defaultWidth: 350, minWidth: 90, maxWidth: 600, hideSort: false },
];

const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, number> = {
  date: 91,
  time: 96,
  operator: 150,
  phone: 154,
  deleted: 44,
  type: 170,
  attempts: 68,
  link: 290,
  city: 200,
  note: 350,
};

const STORAGE_COL_WIDTHS_KEY = 'mts_shift_stats_col_widths_v4';
const MIN_DISPLAY_ROWS = 8;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateRu(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function parseDateRu(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  return new Date(year, month, day);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBetweenDays(target: Date, start: Date, end: Date): boolean {
  const t = startOfDay(target).getTime();
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  return t > Math.min(s, e) && t < Math.max(s, e);
}

function isWithinDateRangeInclusive(target: Date, start: Date, end: Date): boolean {
  const t = startOfDay(target).getTime();
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  return t >= Math.min(s, e) && t <= Math.max(s, e);
}

function getMonthGridDays(year: number, month: number): (Date | null)[] {
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  return cells;
}

export const BookWorkspaceModal: React.FC<BookWorkspaceModalProps> = ({
  isOpen,
  onClose,
  records = INITIAL_SHIFT_HISTORY,
  stats,
  onDeleteRecord,
  onReturnSharedLeadToQueue,
}) => {
  // Поиск в шапке
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Чистое переключение «Таблица / График» на весь экран (без жирной черной полосы)
  const [mainView, setMainView] = useState<MainWorkspaceView>('table');

  // Бесконтактная передача и сбор статистики УРМ (Вариант 1 — общая папка у Рустама / РГ)
  const [urmConfig, setUrmConfig] = useState<UrmSyncConfig>(() => loadUrmSyncConfig());
  const [dataScope, setDataScope] = useState<DataScopeMode>(() =>
    loadUrmSyncConfig().isSupervisorReader ? 'department' : 'own'
  );
  const [departmentPackages, setDepartmentPackages] = useState<UrmEmployeeStatPackage[]>([]);
  const [departmentRecords, setDepartmentRecords] = useState<ShiftHistoryRecord[]>([]);
  const [selectedOperatorFilter, setSelectedOperatorFilter] = useState<string>('all');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [connectedFolderName, setConnectedFolderName] = useState<string>('');
  const [syncStatusMessage, setSyncStatusMessage] = useState<string>('');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string>('');
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null);
  const [copiedPathToast, setCopiedPathToast] = useState<boolean>(false);

  // Автоопределение системного логина Windows (например, kiklimenko) и проверка подключенной папки
  useEffect(() => {
    let active = true;
    detectOsUsername().then((osUser) => {
      if (!active || !osUser) return;
      setUrmConfig((prev) => {
        if (prev.operatorId && prev.operatorName) return prev;
        const next: UrmSyncConfig = {
          ...prev,
          operatorId: prev.operatorId || osUser,
          operatorName: prev.operatorName || osUser,
        };
        saveUrmSyncConfig(next);
        return next;
      });
    });
    getDirectoryHandleFromIdb().then((handle) => {
      if (active && handle?.name) {
        setConnectedFolderName(handle.name);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const refreshDepartmentFolderStats = useCallback(
    async (customCfg?: UrmSyncConfig) => {
      const cfg = customCfg || urmConfig;
      setIsSyncingNow(true);
      setSyncErrorMessage('');
      try {
        const res = await fetchAllDepartmentStatsFromUrmFolder(cfg);
        if (res.ok) {
          setDepartmentPackages(res.packages);
          setDepartmentRecords(res.allRecords);
          setLastSyncTimestamp(res.timestamp);
          setSyncStatusMessage(
            `Обновлено (${res.packages.length} сотр.) в ${new Date(res.timestamp).toLocaleTimeString('ru-RU')}`
          );
        } else if (res.error) {
          setSyncErrorMessage(res.error);
        }
      } finally {
        setIsSyncingNow(false);
      }
    },
    [urmConfig]
  );

  // Автообновление сводки отдела каждые 15 секунд, когда открыто окно у руководителя (Рустам / РГ)
  useEffect(() => {
    if (!isOpen) return;
    if (urmConfig.isSupervisorReader || dataScope === 'department') {
      refreshDepartmentFolderStats();
      const timer = window.setInterval(() => {
        refreshDepartmentFolderStats();
      }, 15000);
      return () => window.clearInterval(timer);
    }
  }, [isOpen, urmConfig.isSupervisorReader, dataScope, refreshDepartmentFolderStats]);

  // Капсульный режим графика: все типы слоями или выбранный показатель отдельно
  const [equalizerStacked, setEqualizerStacked] = useState<boolean>(true);
  const [isChartAnimatedIn, setIsChartAnimatedIn] = useState<boolean>(false);

  // Плавное изначальное появление графиков при открытии вкладки «График»
  useEffect(() => {
    if (!isOpen || mainView !== 'chart') {
      setIsChartAnimatedIn(false);
      return;
    }
    setIsChartAnimatedIn(false);
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setIsChartAnimatedIn(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isOpen, mainView]);

  // Блокируем прокрутку основной страницы под окном «Статистика смен»
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  // Состояния внутри графика (Период, Показатель, Выбранная точка, Наведённый сегмент)
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('day');
  const [activeMetric, setActiveMetric] = useState<ChartMetricId>('saved');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(2);
  const [hoveredBarSegment, setHoveredBarSegment] = useState<{
    slotIdx: number;
    key: string;
    label: string;
    count: number;
    color: string;
  } | null>(null);
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState<{
    key: string;
    label: string;
    count: number;
    color: string;
    angleRad: number;
  } | null>(null);

  // Видимость колонок таблицы
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnId, boolean>>({
    date: true,
    time: true,
    operator: false,
    phone: true,
    deleted: true,
    type: true,
    attempts: true,
    link: true,
    city: true,
    note: true,
  });

  // Ширины всех столбцов с сохранением в localStorage
  const [colWidths, setColWidths] = useState<Record<ColumnId, number>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_COL_WIDTHS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_COLUMN_WIDTHS };
  });

  const [activeDragCol, setActiveDragCol] = useState<ColumnId | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COL_WIDTHS_KEY, JSON.stringify(colWidths));
    } catch {
      // ignore
    }
  }, [colWidths]);

  // Состояние активных окон/поповеров в шапке
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);

  // Состояние фильтра дат (по умолчанию — текущий реальный день «Сегодня»)
  const [activePreset, setActivePreset] = useState<FilterQuickPreset>('today');
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => startOfDay(new Date()));

  // Временный выбор периода внутри календаря
  const [calendarBaseDate, setCalendarBaseDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [tempStartDate, setTempStartDate] = useState<Date>(() => startOfDay(new Date()));
  const [tempEndDate, setTempEndDate] = useState<Date>(() => startOfDay(new Date()));
  const [isSelectingEnd, setIsSelectingEnd] = useState<boolean>(false);

  // При открытии окна синхронизируем «Сегодня» с актуальной датой, чтобы автоматически отсекать прошлый день при наступлении новых суток
  useEffect(() => {
    if (isOpen && activePreset === 'today') {
      const today = startOfDay(new Date());
      setStartDate(today);
      setEndDate(today);
    }
  }, [isOpen, activePreset]);

  // Состояние вкладки в окне «Опции и настройки»
  const [optionsTab, setOptionsTab] = useState<OptionsTab>('params');

  const downloadMenuRef = useRef<HTMLDivElement | null>(null);

  // Базовый источник записей в зависимости от режима: «Моя смена» или «Отдел УРМ»
  const activeSourceRecords = useMemo<ShiftHistoryRecord[]>(() => {
    if (dataScope === 'department') {
      return departmentRecords.filter((r) => {
        if (r.shareDirection === 'received') return false;
        if (selectedOperatorFilter !== 'all' && r.operatorId !== selectedOperatorFilter) {
          return false;
        }
        if (
          selectedGroupFilter !== 'all' &&
          (r.groupLeaderName || '').toLowerCase() !== selectedGroupFilter.toLowerCase()
        ) {
          return false;
        }
        return true;
      });
    }
    return records.filter((r) => r.shareDirection !== 'received');
  }, [dataScope, departmentRecords, records, selectedOperatorFilter, selectedGroupFilter]);

  // Вычисление данных для графика за День / Неделю / Месяц / Год (с учетом живых записей таблицы)
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const liveMnp = activeSourceRecords.filter((r) => r.type === 'MNP').length;
    const liveCallback = activeSourceRecords.filter(
      (r) => r.type === 'По времени' || (r.type as string) === 'По просьбе'
    ).length;
    const liveAuto = activeSourceRecords.filter((r) => r.type === 'АВТО').length;
    const liveUnreachableCallback = activeSourceRecords.filter(
      (r) => r.type === 'Недозвон (По времени)'
    ).length;
    const liveUnreachableAuto = activeSourceRecords.filter(
      (r) => r.type === 'Недозвон (Авто)'
    ).length;
    const liveRefused = activeSourceRecords.filter((r) => r.type === 'Отказ').length;

    const makePoint = (
      label: string,
      subLabel: string,
      mnp: number,
      callback: number,
      auto: number,
      refused: number,
      unreachableCallback: number = 0,
      unreachableAuto: number = 0
    ): ChartDataPoint => {
      const saved = mnp + callback + auto;
      const unreachable = unreachableCallback + unreachableAuto;
      const totalCalls = saved + refused + unreachable;
      const conversion = totalCalls > 0 ? Math.round((saved / totalCalls) * 100) : 0;
      return {
        label,
        subLabel,
        saved,
        mnp,
        callback,
        auto,
        unreachable,
        unreachableCallback,
        unreachableAuto,
        refused,
        totalCalls,
        conversion,
      };
    };

    if (chartPeriod === 'day') {
      return [
        makePoint('10:00', 'Утренний старт смены', 2, 2, 1, 1, 0, 0),
        makePoint('12:00', 'Дневной поток (10:00–12:00)', 1, 2, 1, 1, 0, 1),
        makePoint('14:00', 'Пик дневных сохранений', 5, 3, 2, 2, 1, 0),
        makePoint('16:00', 'Послеобеденный блок', 2, 2, 1, 2, 0, 1),
        makePoint('18:00', 'Вечерние перезвоны', 4, 2, 1, 1, 0, 0),
        makePoint('19:30', 'Вечерняя волна', 2, 2, 1, 1, 1, 0),
        makePoint(
          'Сейчас',
          'Актуальный срез смены',
          Math.max(4, liveMnp + 3),
          Math.max(3, liveCallback + 2),
          Math.max(2, liveAuto + 1),
          Math.max(1, liveRefused),
          liveUnreachableCallback,
          liveUnreachableAuto
        ),
      ];
    }

    if (chartPeriod === 'week') {
      return [
        makePoint('Пн', 'Понедельник', 8, 6, 4, 3, 1, 1),
        makePoint('Вт', 'Вторник', 5, 4, 3, 4, 0, 1),
        makePoint('Ср', 'Среда (пик недели)', 14, 9, 6, 3, 1, 1),
        makePoint('Чт', 'Четверг', 6, 5, 4, 4, 1, 1),
        makePoint('Пт', 'Пятница', 10, 8, 5, 2, 0, 1),
        makePoint('Сб', 'Суббота', 7, 6, 4, 3, 1, 1),
        makePoint(
          'Вс',
          'Текущая смена',
          13 + liveMnp,
          9 + liveCallback,
          6 + liveAuto,
          3 + liveRefused,
          liveUnreachableCallback,
          liveUnreachableAuto
        ),
      ];
    }

    if (chartPeriod === 'month') {
      return [
        makePoint('1–5', '1–5 ноября', 22, 16, 10, 9, 2, 3),
        makePoint('6–10', '6–10 ноября', 16, 14, 8, 10, 1, 3),
        makePoint('11–15', '11–15 ноября (максимум)', 32, 24, 15, 9, 2, 2),
        makePoint('16–20', '16–20 ноября', 19, 15, 10, 9, 1, 3),
        makePoint('21–25', '21–25 ноября', 25, 19, 12, 8, 1, 2),
        makePoint(
          '26–30',
          '26–30 ноября',
          29 + liveMnp,
          22 + liveCallback,
          14 + liveAuto,
          8 + liveRefused,
          1 + liveUnreachableCallback,
          2 + liveUnreachableAuto
        ),
      ];
    }

    // 'year'
    return [
      makePoint('Янв', 'Январь 2026', 68, 52, 34, 32, 4, 8),
      makePoint('Фев', 'Февраль 2026', 54, 44, 28, 30, 3, 7),
      makePoint('Мар', 'Март 2026', 92, 72, 48, 34, 5, 9),
      makePoint('Апр', 'Апрель 2026', 66, 54, 36, 36, 4, 8),
      makePoint('Май', 'Май 2026', 84, 66, 42, 31, 4, 7),
      makePoint('Июн', 'Июнь 2026', 72, 58, 38, 29, 3, 7),
      makePoint(
        'Июл',
        'Июль 2026',
        105 + liveMnp,
        82 + liveCallback,
        52 + liveAuto,
        32 + liveRefused,
        4 + liveUnreachableCallback,
        7 + liveUnreachableAuto
      ),
    ];
  }, [chartPeriod, activeSourceRecords]);

  // Закрытие выпадашки скачивания по клику вне
  useEffect(() => {
    if (!isDownloadDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setIsDownloadDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDownloadDropdownOpen]);

  if (!isOpen) return null;

  const activeColumnsList = TABLE_COLUMNS.filter((c) =>
    c.id === 'operator' ? visibleColumns.operator || dataScope === 'department' : visibleColumns[c.id]
  );

  // 1. Отсечение по выбранной дате / периоду (по умолчанию «Сегодня» — отсекает все прошлые дни)
  const dateFilteredRecords = activeSourceRecords.filter((r) => {
    const parsed = parseDateRu(r.date);
    if (!parsed) return true;
    return isWithinDateRangeInclusive(parsed, startDate, endDate);
  });

  // 2. Фильтрация по строке поиска
  const q = searchQuery.trim().toLowerCase();
  const filteredRecords = q
    ? dateFilteredRecords.filter(
        (r) =>
          r.phone.toLowerCase().includes(q) ||
          r.city.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q) ||
          r.link.toLowerCase().includes(q) ||
          r.time.toLowerCase().includes(q) ||
          r.date.toLowerCase().includes(q) ||
          (r.operatorName || '').toLowerCase().includes(q) ||
          (r.groupLeaderName || '').toLowerCase().includes(q)
      )
    : dateFilteredRecords;

  const totalRowCount = Math.max(MIN_DISPLAY_ROWS, filteredRecords.length);
  const displayRows: (ShiftHistoryRecord | null)[] = Array.from(
    { length: totalRowCount },
    (_, idx) => filteredRecords[idx] || null
  );

  const todayLabel = formatDateRu(startDate);
  const verticalDateLabel = filteredRecords[0]?.date || todayLabel;

  // Уникальные РГ для фильтрации
  const availableGroups = Array.from(
    new Set(
      departmentPackages
        .map((p) => (p.groupLeaderName || '').trim())
        .filter(Boolean)
    )
  );

  // Скачивание таблицы в Excel (.csv с UTF-8 BOM)
  const handleDownloadCsv = () => {
    const headers = [
      'Дата',
      'Время',
      'Сотрудник',
      'РГ / ВС',
      'Номер телефона',
      'Тип',
      'Перезвонов',
      'Город',
      'Ссылка',
      'Заметка',
    ];
    const escapeCsv = (val: string | number | undefined) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };
    const lines = [
      headers.map(escapeCsv).join(';'),
      ...filteredRecords.map((r) =>
        [
          r.date,
          r.time,
          r.operatorName || urmConfig.operatorName || 'Сотрудник',
          r.groupLeaderName || urmConfig.groupLeaderName || '',
          r.phone,
          r.type,
          r.attemptCount ?? 0,
          r.city,
          r.link,
          r.notes,
        ]
          .map(escapeCsv)
          .join(';')
      ),
    ];
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const scopeSuffix = dataScope === 'department' ? 'Отдел_УРМ' : 'Смена';
    a.download = `МТС_MNP_${scopeSuffix}_${formatDateRu(startDate)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsDownloadDropdownOpen(false);
  };

  const handleCopyLink = (row: ShiftHistoryRecord) => {
    const textToCopy = row.link || row.phone;
    navigator.clipboard.writeText(textToCopy);
    setCopiedRowId(row.id);
    setTimeout(() => {
      setCopiedRowId((prev) => (prev === row.id ? null : prev));
    }, 1500);
  };

  const handleCopyPhone = (row: ShiftHistoryRecord) => {
    navigator.clipboard.writeText(row.phone);
    setCopiedPhoneId(row.id);
    setTimeout(() => {
      setCopiedPhoneId((prev) => (prev === row.id ? null : prev));
    }, 1500);
  };

  // Перетаскивание границы столбца мышью прямо в шапке таблицы
  const handleStartColumnResize = (colId: ColumnId, minW: number, maxW: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colId];
    setActiveDragCol(colId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.max(minW, Math.min(maxW, Math.round(startWidth + delta)));
      setColWidths((prev) => ({ ...prev, [colId]: nextWidth }));
    };

    const onPointerUp = () => {
      setActiveDragCol(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleSelectPreset = (preset: FilterQuickPreset) => {
    setActivePreset(preset);
    const base = startOfDay(new Date());
    if (preset === 'today') {
      setStartDate(base);
      setEndDate(base);
    } else if (preset === 'yesterday') {
      const yest = new Date(base);
      yest.setDate(yest.getDate() - 1);
      setStartDate(yest);
      setEndDate(yest);
    } else if (preset === 'week') {
      const weekAgo = new Date(base);
      weekAgo.setDate(weekAgo.getDate() - 6);
      setStartDate(weekAgo);
      setEndDate(base);
    } else if (preset === 'month') {
      const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
      setStartDate(monthStart);
      setEndDate(base);
    }
  };

  const handleOpenCalendar = () => {
    setTempStartDate(startDate);
    setTempEndDate(endDate);
    setCalendarBaseDate(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
    setIsSelectingEnd(false);
    setIsCalendarOpen(true);
  };

  const handleDayClick = (clickedDate: Date) => {
    const day = startOfDay(clickedDate);
    if (!isSelectingEnd) {
      setTempStartDate(day);
      setTempEndDate(day);
      setIsSelectingEnd(true);
    } else {
      if (day.getTime() < tempStartDate.getTime()) {
        setTempStartDate(day);
        setTempEndDate(tempStartDate);
      } else {
        setTempEndDate(day);
      }
      setIsSelectingEnd(false);
    }
  };

  const handleApplyCalendarPeriod = () => {
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
    setActivePreset('custom');
    setIsCalendarOpen(false);
  };

  const handleResetFilters = () => {
    const defaultDay = startOfDay(new Date());
    setActivePreset('today');
    setStartDate(defaultDay);
    setEndDate(defaultDay);
  };

  const shiftCalendarMonths = (deltaMonths: number) => {
    setCalendarBaseDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + deltaMonths, 1)
    );
  };

  const leftMonthYear = calendarBaseDate.getFullYear();
  const leftMonthIndex = calendarBaseDate.getMonth();
  const rightMonthDate = new Date(leftMonthYear, leftMonthIndex + 1, 1);
  const rightMonthYear = rightMonthDate.getFullYear();
  const rightMonthIndex = rightMonthDate.getMonth();

  const leftMonthDays = getMonthGridDays(leftMonthYear, leftMonthIndex);
  const rightMonthDays = getMonthGridDays(rightMonthYear, rightMonthIndex);

  const renderMonthGrid = (days: (Date | null)[], keyPrefix: string) => (
    <div className="w-full font-mts-compact">
      <div className="grid grid-cols-7 gap-x-2 mb-2.5">
        {WEEKDAYS_RU.map((wd) => (
          <div
            key={`${keyPrefix}-wd-${wd}`}
            className="text-center text-[11px] font-semibold text-[#8C95A0] select-none"
          >
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-x-2 gap-y-2 justify-items-center">
        {days.map((dateObj, idx) => {
          if (!dateObj) {
            return <div key={`${keyPrefix}-empty-${idx}`} className="w-7 h-7" />;
          }

          const isStart = isSameDay(dateObj, tempStartDate);
          const isEnd = isSameDay(dateObj, tempEndDate);
          const isSingle = isStart && isEnd;
          const isInRange = !isSingle && isBetweenDays(dateObj, tempStartDate, tempEndDate);

          let btnStyles = 'text-[#1D2023] hover:bg-[#F2F3F7] font-medium';
          if (isSingle || isStart) {
            btnStyles = 'bg-[#1D2023] text-white font-bold';
          } else if (isEnd) {
            btnStyles = 'bg-[#FF0023] text-white font-bold';
          } else if (isInRange) {
            btnStyles = 'bg-[#F2F3F7] text-[#1D2023] font-medium';
          }

          return (
            <button
              key={`${keyPrefix}-day-${dateObj.getDate()}`}
              type="button"
              onClick={() => handleDayClick(dateObj)}
              className={`w-7 h-7 rounded-full text-[12px] leading-none font-mts-compact flex items-center justify-center transition-colors cursor-pointer select-none ${btnStyles}`}
            >
              {dateObj.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-x-0 top-18 bottom-0 z-35 bg-[#F4F5F7] p-2.5 sm:p-4 flex flex-col overscroll-contain animate-in fade-in duration-200"
      role="region"
      aria-label="Статистика смен"
    >
      {/* Основной белый лист страницы во всю рабочую область */}
      <div className="relative flex-1 w-full h-full bg-white rounded-3xl border border-[#EBECEF] shadow-mts-card overflow-hidden overscroll-contain flex flex-col">
        {/* ШАПКА СТРАНИЦЫ: Верхний ряд (Название «Статистика смен» + переключатель Таблица / График + жемчужина закрытия) */}
        <div className="px-6 sm:px-8 pt-5 pb-3.5 flex flex-wrap items-center justify-between gap-4 border-b border-[#EBECEF]">
          <div className="flex items-center flex-wrap gap-3 sm:gap-4">
            <h1 className="text-xl sm:text-[24px] font-black text-[#1D2023] font-mts-extended tracking-tight">
              Статистика смен
            </h1>

            {/* Главный переключатель Таблица / График на весь экран (без жирной черной полосы) */}
            <div className="inline-flex items-center bg-[#F2F3F7] p-1 rounded-full border border-[#E4E7EC]">
              <button
                type="button"
                onClick={() => setMainView('table')}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  mainView === 'table'
                    ? 'bg-[#1D2023] text-white shadow-2xs'
                    : 'text-[#626C77] hover:text-[#1D2023]'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Таблица</span>
              </button>
              <button
                type="button"
                onClick={() => setMainView('chart')}
                className={`h-8 px-4 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  mainView === 'chart'
                    ? 'bg-[#1D2023] text-white shadow-2xs'
                    : 'text-[#626C77] hover:text-[#1D2023]'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>График</span>
              </button>
            </div>

            {/* Одиночная кнопка-переключатель «Отдел УРМ» (только для руководителя: без лишней дублирующей кнопки «Моя смена») */}
            {(urmConfig.isSupervisorReader || departmentPackages.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  const nextScope = dataScope === 'department' ? 'own' : 'department';
                  setDataScope(nextScope);
                  if (nextScope === 'department') {
                    refreshDepartmentFolderStats();
                  }
                }}
                title={
                  dataScope === 'department'
                    ? 'Нажмите, чтобы вернуться к своей личной статистике'
                    : 'Нажмите, чтобы показать сводную статистику всех сотрудников из папки УРМ'
                }
                className={`h-10 px-4 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap border ${
                  dataScope === 'department'
                    ? 'bg-[#E30613] text-white border-[#E30613] shadow-2xs'
                    : 'bg-[#F2F3F7] text-[#626C77] border-[#E4E7EC] hover:text-[#1D2023]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Отдел УРМ ({departmentPackages.length})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {/* Кнопка мгновенного обновления папки отдела в режиме руководителя */}
            {dataScope === 'department' && (
              <button
                type="button"
                onClick={() => refreshDepartmentFolderStats()}
                title="Обновить данные из сетевой папки УРМ"
                className="h-9 px-3.5 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin text-[#E30613]' : ''}`} />
                <span className="hidden sm:inline">Обновить папку</span>
              </button>
            )}

            {/* Поиск показываем в режиме таблицы */}
            {mainView === 'table' && (
              <div className="w-56 sm:w-72 h-9 px-3 rounded-full bg-[#F4F5F7] border border-[#E4E7EC] flex items-center gap-2 focus-within:border-[#B8C0CC] focus-within:bg-white transition-colors">
                <Search className="w-3.5 h-3.5 text-[#8C95A0] shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по номеру, сотруднику, городу..."
                  aria-label="Поиск"
                  className="w-full bg-transparent text-xs font-normal text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none font-mts-compact"
                />
              </div>
            )}

            {/* 1. Кнопка Фильтр */}
            <button
              type="button"
              onClick={() => {
                setIsDownloadDropdownOpen(false);
                setIsFilterModalOpen(true);
              }}
              title="Фильтры"
              aria-label="Фильтры"
              className="w-9 h-9 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Filter className="w-4 h-4 stroke-[1.75]" />
            </button>

            {/* 2. Кнопка Скачать */}
            <div ref={downloadMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsDownloadDropdownOpen((prev) => !prev)}
                title="Скачать"
                aria-label="Скачать"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isDownloadDropdownOpen
                    ? 'bg-[#1D2023] text-white shadow-sm'
                    : 'bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023]'
                }`}
              >
                <Download className="w-4 h-4 stroke-[1.75]" />
              </button>

              {isDownloadDropdownOpen && (
                <div className="absolute right-0 top-11 z-30 w-64 bg-white rounded-2xl border border-[#EBECEF] shadow-xl p-2 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="w-full px-3.5 py-2.5 rounded-xl hover:bg-[#F5F6F8] flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <span className="w-5 h-5 flex items-center justify-center text-[#109E59] shrink-0">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="8" y1="13" x2="10" y2="13" />
                        <line x1="14" y1="13" x2="16" y2="13" />
                        <line x1="8" y1="17" x2="10" y2="17" />
                        <line x1="14" y1="17" x2="16" y2="17" />
                      </svg>
                    </span>
                    <span className="text-[13px] font-semibold text-[#1D2023] font-mts-compact whitespace-nowrap">
                      Скачать Excel (.csv UTF-8)
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Кнопка Опции и настройки */}
            <button
              type="button"
              onClick={() => {
                setIsDownloadDropdownOpen(false);
                setIsOptionsModalOpen(true);
              }}
              title="Опции и настройки (путь к папке УРМ и колонки)"
              aria-label="Опции и настройки"
              className="w-9 h-9 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer relative"
            >
              <Settings className="w-4 h-4 stroke-[1.75]" />
              {urmConfig.enabled && (
                <span
                  title="Бесконтактная передача статистики в УРМ активна"
                  className="w-2 h-2 rounded-full bg-[#109E59] absolute top-1.5 right-1.5 ring-2 ring-white"
                />
              )}
            </button>

            {/* Жемчужина закрытия страницы */}
            <button
              type="button"
              onClick={onClose}
              title="Закрыть"
              aria-label="Закрыть окно"
              className="pearl-droplet-sphere overflow-hidden border-0 outline-none group w-9 h-9 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform ml-1"
            >
              <span className="relative z-10 flex items-center justify-center text-[#56606B] transition-transform duration-500 ease-in-out group-hover:rotate-360">
                <Plus className="w-4 h-4 stroke-[2.2]" />
              </span>
            </button>
          </div>
        </div>

        {/* ПАНЕЛЬ РУКОВОДИТЕЛЯ (Рустам / ВС / РГ): Живые карточки сотрудников из общей папки MSK_Stats */}
        {dataScope === 'department' && (
          <div className="px-6 sm:px-8 py-3 bg-[#F8F9FB] border-b border-[#EBECEF] flex flex-col gap-2.5 font-mts-compact">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#626C77]">
                  Сводка отдела УРМ:
                </span>

                {/* Фильтр: Все сотрудники */}
                <button
                  type="button"
                  onClick={() => setSelectedOperatorFilter('all')}
                  className={`h-7 px-3 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                    selectedOperatorFilter === 'all'
                      ? 'bg-[#1D2023] text-white'
                      : 'bg-white border border-[#E4E7EC] text-[#1D2023] hover:bg-[#F2F3F7]'
                  }`}
                >
                  Все ({departmentPackages.length})
                </button>

                {/* Фильтр по РГ / ВС (если указаны разные РГ) */}
                {availableGroups.length > 0 && (
                  <select
                    value={selectedGroupFilter}
                    onChange={(e) => setSelectedGroupFilter(e.target.value)}
                    className="h-7 px-2.5 rounded-full bg-white border border-[#E4E7EC] text-xs font-bold text-[#1D2023] focus:outline-none cursor-pointer"
                  >
                    <option value="all">Все РГ / ВС</option>
                    {availableGroups.map((g) => (
                      <option key={g} value={g}>
                        РГ: {g}
                      </option>
                    ))}
                  </select>
                )}

                {/* Карточки-переключатели сотрудников */}
                {departmentPackages
                  .filter(
                    (pkg) =>
                      selectedGroupFilter === 'all' ||
                      (pkg.groupLeaderName || '').toLowerCase() ===
                        selectedGroupFilter.toLowerCase()
                  )
                  .map((pkg) => {
                    const isSelected = selectedOperatorFilter === pkg.operatorId;
                    const empRecordsInPeriod = (pkg.records || []).filter((r) => {
                      if (r.shareDirection === 'received') return false;
                      const parsed = parseDateRu(r.date);
                      if (!parsed) return true;
                      return isWithinDateRangeInclusive(parsed, startDate, endDate);
                    });
                    const savedCnt = empRecordsInPeriod.filter(
                      (r) =>
                        r.type === 'MNP' ||
                        r.type === 'По времени' ||
                        (r.type as string) === 'По просьбе' ||
                        r.type === 'АВТО'
                    ).length;
                    const refusedCnt = empRecordsInPeriod.filter((r) => r.type === 'Отказ').length;
                    const unreachCnt = empRecordsInPeriod.filter(
                      (r) =>
                        r.type === 'Недозвон (По времени)' || r.type === 'Недозвон (Авто)'
                    ).length;
                    const minsAgo = Math.max(
                      0,
                      Math.round((Date.now() - (pkg.updatedAt || Date.now())) / 60000)
                    );

                    return (
                      <button
                        key={pkg.operatorId}
                        type="button"
                        onClick={() =>
                          setSelectedOperatorFilter(
                            isSelected ? 'all' : pkg.operatorId
                          )
                        }
                        className={`h-8 px-3 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                          isSelected
                            ? 'bg-[#1D2023] text-white border-[#1D2023] shadow-2xs'
                            : 'bg-white text-[#1D2023] border-[#E4E7EC] hover:border-[#B8C0CC]'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            minsAgo <= 15 ? 'bg-[#109E59]' : 'bg-[#8C95A0]'
                          }`}
                          title={
                            minsAgo === 0
                              ? 'Только что обновлён'
                              : `Обновлено ${minsAgo} мин. назад`
                          }
                        />
                        <span className="truncate max-w-[140px]">{pkg.operatorName}</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                          ✓ {savedCnt}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-[#E30613]">
                          ✕ {refusedCnt}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                          ⏳ {unreachCnt}
                        </span>
                      </button>
                    );
                  })}
              </div>

              <div className="text-[11px] text-[#626C77] flex items-center gap-2">
                {lastSyncTimestamp && (
                  <span>
                    Синхронизация: {new Date(lastSyncTimestamp).toLocaleTimeString('ru-RU')}
                  </span>
                )}
                {departmentPackages.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsTab('params');
                      setIsOptionsModalOpen(true);
                    }}
                    className="text-[#E30613] font-bold hover:underline cursor-pointer"
                  >
                    Настроить путь к сетевой папке →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* РАБОЧАЯ ОБЛАСТЬ НА ВЕСЬ ЭКРАН (ТАБЛИЦА ИЛИ ГРАФИК БЕЗ ЖИРНОЙ ЧЕРНОЙ ПОЛОСЫ) */}
        <div className="flex-1 w-full bg-white overflow-hidden flex flex-col">
          {mainView === 'table' ? (
            /* 100% ПОЛНОЭКРАННАЯ ТАБЛИЦА */
            <div className="flex-1 w-full h-full bg-white overflow-auto overscroll-contain font-mts-compact">
              <table
                className="border-collapse table-fixed text-left font-mts-compact"
                style={{
                  width: `${activeColumnsList.reduce((acc, c) => acc + colWidths[c.id], 0)}px`,
                }}
              >
                <colgroup>
                  {activeColumnsList.map((col) => (
                    <col key={`col-${col.id}`} style={{ width: `${colWidths[col.id]}px` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-[#F8F9FB] border-b border-[#EBECEF]">
                    {activeColumnsList.map((col) => (
                      <th
                        key={col.id}
                        scope="col"
                        style={{ width: `${colWidths[col.id]}px` }}
                        className={`relative group h-10 ${
                          col.hideSort ? 'px-2 text-center' : 'px-3.5'
                        } text-[12px] font-medium text-[#656F7D] border-r border-[#EBECEF] last:border-r-0 select-none`}
                      >
                        <div
                          className={`flex items-center ${
                            col.hideSort ? 'justify-center' : 'justify-between'
                          } gap-1.5`}
                        >
                          {col.id === 'deleted' ? (
                            <span
                              title="Отметка об удалении номера сотрудником"
                              className="inline-flex items-center justify-center text-[#8C95A0]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="truncate">{col.label}</span>
                          )}
                          {!col.hideSort && (
                            <span className="text-[#9AA3AF] shrink-0 flex items-center" aria-hidden="true">
                              <svg
                                viewBox="0 0 14 14"
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M4.5 10.5V3.5M4.5 3.5L2.5 5.5M4.5 3.5L6.5 5.5" />
                                <path d="M9.5 3.5V10.5M9.5 10.5L7.5 8.5M9.5 10.5L11.5 8.5" />
                              </svg>
                            </span>
                          )}
                        </div>

                        <div
                          onPointerDown={(e) =>
                            handleStartColumnResize(col.id, col.minWidth, col.maxWidth, e)
                          }
                          title={`Тяните, чтобы изменить ширину «${col.label}» (${colWidths[col.id]}px)`}
                          className="absolute top-0 -right-1.5 bottom-0 w-3 z-20 cursor-col-resize flex items-center justify-center group/resizer"
                        >
                          <span
                            className={`w-0.5 h-5 rounded-full transition-colors ${
                              activeDragCol === col.id
                                ? 'bg-[#FF0023]'
                                : 'bg-transparent group-hover/resizer:bg-[#9AA3AF]'
                            }`}
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, rowIndex) => (
                    <tr
                      key={row ? row.id : `empty-shift-row-${rowIndex}`}
                      className="h-12 bg-white hover:bg-[#FAFBFD] border-b border-[#EEF0F4] transition-colors"
                    >
                      {activeColumnsList.map((col) => {
                        if (col.id === 'date') {
                          const rowDateLabel = row?.date || verticalDateLabel;
                          const prevDateLabel =
                            rowIndex > 0
                              ? displayRows[rowIndex - 1]?.date || verticalDateLabel
                              : null;
                          if (rowIndex > 0 && rowDateLabel === prevDateLabel) {
                            return null;
                          }
                          let groupSpan = 1;
                          for (let k = rowIndex + 1; k < displayRows.length; k++) {
                            const nextLabel = displayRows[k]?.date || verticalDateLabel;
                            if (nextLabel === rowDateLabel) {
                              groupSpan++;
                            } else {
                              break;
                            }
                          }
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              rowSpan={groupSpan}
                              className="px-2 py-4 text-[14px] font-bold text-[#1D2023] bg-white border-r border-[#EEF0F4] align-middle text-center font-mts-compact"
                            >
                              <div className="inline-flex items-center justify-center [writing-mode:vertical-rl] rotate-180 font-bold tracking-wide select-none font-mts-compact">
                                {rowDateLabel}
                              </div>
                            </td>
                          );
                        }

                        if (col.id === 'time') {
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-3.5 py-2 text-[12px] font-semibold text-[#1D2023] border-r border-[#EEF0F4] align-middle font-mts-compact"
                            >
                              {row ? row.time : ''}
                            </td>
                          );
                        }

                        if (col.id === 'operator') {
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-3.5 py-2 text-[12px] font-semibold text-[#1D2023] border-r border-[#EEF0F4] align-middle truncate font-mts-compact"
                            >
                              {row ? (
                                <div className="flex flex-col min-w-0">
                                  <span className="truncate font-bold text-[#1D2023]">
                                    {row.operatorName || urmConfig.operatorName || 'Вы'}
                                  </span>
                                  {row.groupLeaderName && (
                                    <span className="truncate text-[10px] text-[#626C77]">
                                      РГ: {row.groupLeaderName}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          );
                        }

                        if (col.id === 'phone') {
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-3.5 py-2 text-[12px] font-semibold text-[#1D2023] border-r border-[#EEF0F4] align-middle font-mts-compact"
                            >
                              {row ? (
                                <div className="inline-flex items-center gap-1.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyPhone(row)}
                                    title="Нажмите на номер, чтобы скопировать"
                                    className={`inline-flex items-center gap-1 text-left text-[12px] font-semibold transition-colors cursor-pointer font-mts-compact ${
                                      copiedPhoneId === row.id
                                        ? 'text-[#109E59]'
                                        : 'text-[#1D2023] hover:text-[#0077FF]'
                                    }`}
                                  >
                                    <span>{row.phone}</span>
                                    {copiedPhoneId === row.id && (
                                      <Check className="w-3.5 h-3.5 text-[#109E59] shrink-0" />
                                    )}
                                  </button>
                                  {row.shareDirection === 'sent' && (
                                    <span
                                      title="Контакт был отправлен коллеге"
                                      className="inline-flex items-center justify-center w-4 h-4 rounded-md bg-[#F4F5F7] text-[#626C77] shrink-0"
                                    >
                                      <ArrowUpRight className="w-3 h-3 stroke-[2]" />
                                    </span>
                                  )}
                                  {row.shareDirection === 'received' && (
                                    <span
                                      title={
                                        row.sharedPeerName
                                          ? `Контакт получен от коллеги (${row.sharedPeerName})`
                                          : 'Контакт получен от коллеги'
                                      }
                                      className="inline-flex items-center justify-center w-4 h-4 rounded-md bg-[#F4F5F7] text-[#626C77] shrink-0"
                                    >
                                      <ArrowDownLeft className="w-3 h-3 stroke-[2]" />
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          );
                        }

                        if (col.id === 'deleted') {
                          const isDeletedRow = Boolean(
                            row && (row.deletedByOperator || row.type === 'Удален')
                          );
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-1.5 py-2 text-center border-r border-[#EEF0F4] align-middle font-mts-compact"
                            >
                              {isDeletedRow ? (
                                <span
                                  title="Номер был удален сотрудником из списка номеров"
                                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-50 text-[#FF0023]"
                                >
                                  <Trash2 className="w-3.5 h-3.5 stroke-[2]" />
                                </span>
                              ) : null}
                            </td>
                          );
                        }

                        if (col.id === 'type') {
                          const rowTypeStr = row ? String(row.type) : '';
                          const displayTypeLabel =
                            rowTypeStr === 'По просьбе' ? 'По времени' : rowTypeStr;

                          let pillStyles =
                            'bg-[#F2F3F7] text-[#1D2023] border border-[#DDE1E6]';
                          if (displayTypeLabel === 'MNP') {
                            pillStyles =
                              'bg-emerald-50 text-emerald-700 border border-emerald-200';
                          } else if (displayTypeLabel === 'По времени') {
                            pillStyles =
                              'bg-blue-50 text-[#0077FF] border border-blue-200';
                          } else if (displayTypeLabel === 'АВТО') {
                            pillStyles =
                              'bg-[#F2F3F7] text-[#1D2023] border border-[#DDE1E6]';
                          } else if (
                            displayTypeLabel === 'Недозвон (По времени)' ||
                            displayTypeLabel === 'Недозвон (Авто)'
                          ) {
                            pillStyles =
                              'bg-amber-50 text-amber-700 border border-amber-200';
                          } else if (displayTypeLabel === 'Отказ' || displayTypeLabel === 'Удален') {
                            pillStyles =
                              'bg-[#F2F3F7] text-[#656F7D] border border-[#DDE1E6]';
                          }

                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-3 py-2 text-[12px] text-[#1D2023] border-r border-[#EEF0F4] align-middle font-mts-compact"
                            >
                              {row ? (
                                <div className="inline-flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${pillStyles}`}
                                  >
                                    {displayTypeLabel}
                                  </span>
                                  {row.shareDirection === 'sent' && row.sharePendingColleague && (
                                    <span
                                      title="Ожидает отработки коллегой"
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4F5F7] text-[#626C77] whitespace-nowrap"
                                    >
                                      У коллеги
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </td>
                          );
                        }

                        if (col.id === 'attempts') {
                          const attemptsVal = row
                            ? row.attemptCount !== undefined
                              ? row.attemptCount
                              : row.type === 'Недозвон (По времени)' || row.type === 'Недозвон (Авто)'
                              ? 3
                              : row.type === 'MNP'
                              ? 0
                              : 1
                            : null;
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-2 py-2 text-[12px] font-semibold text-[#1D2023] text-center tabular-nums border-r border-[#EEF0F4] align-middle font-mts-compact"
                            >
                              {attemptsVal !== null ? attemptsVal : ''}
                            </td>
                          );
                        }

                        if (col.id === 'link') {
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-3.5 py-2 text-[12px] font-normal text-[#1D2023] border-r border-[#EEF0F4] align-middle font-mts-compact"
                            >
                              {row && row.link ? (
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(row)}
                                  title={`Нажмите на ссылку, чтобы скопировать: ${row.link}`}
                                  className={`w-full text-left truncate text-[12px] transition-colors cursor-pointer flex items-center gap-1.5 min-w-0 font-mts-compact ${
                                    copiedRowId === row.id
                                      ? 'text-[#109E59] font-semibold'
                                      : 'text-[#656F7D] hover:text-[#0077FF] font-normal'
                                  }`}
                                >
                                  <span className="truncate">{row.link}</span>
                                  {copiedRowId === row.id && (
                                    <Check className="w-3.5 h-3.5 text-[#109E59] shrink-0" />
                                  )}
                                </button>
                              ) : null}
                            </td>
                          );
                        }

                        if (col.id === 'city') {
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-3.5 py-2 text-[12px] font-normal text-[#1D2023] border-r border-[#EEF0F4] align-middle truncate font-mts-compact"
                            >
                              {row ? row.city : ''}
                            </td>
                          );
                        }

                        if (col.id === 'note') {
                          return (
                            <td
                              key={`cell-${rowIndex}-${col.id}`}
                              className="px-3.5 py-2 text-[12px] font-normal text-[#1D2023] border-r border-[#EEF0F4] last:border-r-0 align-middle font-mts-compact"
                            >
                              {row ? (
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <span className="truncate text-[12px] font-normal text-[#1D2023]" title={row.notes}>
                                    {row.notes}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {row.shareDirection === 'sent' &&
                                      row.sharePendingColleague &&
                                      onReturnSharedLeadToQueue && (
                                        <button
                                          type="button"
                                          onClick={() => onReturnSharedLeadToQueue(row)}
                                          title="Вернуть неотработанный коллегой номер обратно в свою очередь"
                                          className="h-6 px-2.5 rounded-lg bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                                        >
                                          <RotateCcw className="w-3 h-3 text-[#626C77] shrink-0" />
                                          <span>Вернуть в очередь</span>
                                        </button>
                                      )}
                                    <button
                                      type="button"
                                      onClick={() => onDeleteRecord?.(row.id)}
                                      title="Удалить запись"
                                      aria-label="Удалить запись"
                                      className="w-6 h-6 rounded-lg text-[#9AA3AF] hover:text-[#E30613] hover:bg-[#F2F3F7] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                                    >
                                      <X className="w-3.5 h-3.5 stroke-[1.75]" />
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={`cell-${rowIndex}-${col.id}`}
                            className="px-3.5 py-2 text-[12px] font-normal text-[#1D2023] border-r border-[#EEF0F4] last:border-r-0 align-middle font-mts-compact"
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* 100% КАПСУЛЬНАЯ АНАЛИТИКА МТС (ЖЕЛОБА ПО ЧАСАМ + КОЛЬЦО СТРУКТУРЫ СМЕНЫ) */
            <div className="flex-1 w-full h-full overflow-y-auto overscroll-contain bg-[#F4F5F7] p-4 sm:p-5 flex flex-col gap-3.5 font-mts-compact">
              {(() => {
                const currentMetricObj =
                  CHART_METRICS.find((m) => m.id === activeMetric) || CHART_METRICS[0];
                const values = chartData.map((d) => d[activeMetric]);
                const rawMax = Math.max(...values, 4);
                const yAxisMax = Math.ceil(rawMax * 1.15);

                const selectedIdx =
                  hoveredPointIdx !== null && hoveredPointIdx < chartData.length
                    ? hoveredPointIdx
                    : Math.min(2, chartData.length - 1);
                const selectedPoint = chartData[selectedIdx] || chartData[0];

                // Итоги за выбранный период
                const periodSaved = chartData.reduce((acc, d) => acc + d.saved, 0);
                const periodMnp = chartData.reduce((acc, d) => acc + d.mnp, 0);
                const periodCallback = chartData.reduce((acc, d) => acc + d.callback, 0);
                const periodAuto = chartData.reduce((acc, d) => acc + d.auto, 0);
                const periodUnreachableCallback = chartData.reduce(
                  (acc, d) => acc + d.unreachableCallback,
                  0
                );
                const periodUnreachableAuto = chartData.reduce(
                  (acc, d) => acc + d.unreachableAuto,
                  0
                );
                const periodRefused = chartData.reduce((acc, d) => acc + d.refused, 0);
                const periodTotalCalls =
                  periodSaved +
                  periodRefused +
                  periodUnreachableCallback +
                  periodUnreachableAuto;

                const conversionPct =
                  periodTotalCalls > 0 ? Math.round((periodSaved / periodTotalCalls) * 100) : 0;

                const periodUnreachableTotal =
                  periodUnreachableCallback + periodUnreachableAuto;
                const totalAll = Math.max(1, periodTotalCalls);
                const rawSegs: {
                  id: string;
                  metricId: ChartMetricId;
                  label: string;
                  count: number;
                  pct: number;
                  color: string;
                }[] = [
                  {
                    id: 'mnp',
                    metricId: 'mnp',
                    label: 'MNP сразу',
                    count: periodMnp,
                    pct: Math.round((periodMnp / totalAll) * 100),
                    color: '#109E59',
                  },
                  {
                    id: 'callback',
                    metricId: 'callback',
                    label: 'По времени',
                    count: periodCallback,
                    pct: Math.round((periodCallback / totalAll) * 100),
                    color: '#0077FF',
                  },
                  {
                    id: 'auto',
                    metricId: 'auto',
                    label: 'Авто',
                    count: periodAuto,
                    pct: Math.round((periodAuto / totalAll) * 100),
                    color: '#8B5CF6',
                  },
                  {
                    id: 'refused',
                    metricId: 'refused',
                    label: 'Отказы',
                    count: periodRefused,
                    pct: Math.round((periodRefused / totalAll) * 100),
                    color: '#FF0032',
                  },
                  {
                    id: 'unreachable',
                    metricId: 'unreachable',
                    label: 'Недозвон',
                    count: periodUnreachableTotal,
                    pct: Math.round((periodUnreachableTotal / totalAll) * 100),
                    color: '#F59E0B',
                  },
                ];

                let runningExactPct = 0;
                const segs = rawSegs.map((s) => {
                  const exactPct = (s.count / totalAll) * 100;
                  const startExactPct = runningExactPct;
                  const midExactPct = startExactPct + exactPct / 2;
                  runningExactPct += exactPct;
                  const midAngleRad = (midExactPct / 100) * 2 * Math.PI - Math.PI / 2;
                  return {
                    ...s,
                    exactPct,
                    startExactPct,
                    midAngleRad,
                  };
                });

                // Увеличенное на 10% кольцо в состоянии по умолчанию (было r=64, inner=55, stroke=18 -> стало r=70.5, inner=60.5, stroke=20)
                const donutR = 70.5;

                const maxSlotCalls = Math.max(...chartData.map((d) => d.totalCalls), 5);
                const scaleMaxCalls = Math.ceil(maxSlotCalls * 1.12);
                const scaleMaxActive = scaleMaxCalls;
                const guideSteps = [1, 0.75, 0.5, 0.25, 0];

                return (
                  <>
                    {/* ОСНОВНОЙ ДАШБОРД ИЗ 2 БЛОКОВ (Вариант 1.А): ДИНАМИКА ЗВОНКОВ СЛЕВА + ИТОГИ ПО КАТЕГОРИЯМ СПРАВА */}
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3.5 min-h-[360px]">
                      {/* ЛЕВАЯ КАРТОЧКА (8 колонок): Динамика звонков */}
                      <div
                        className={`lg:col-span-8 relative ${
                          hoveredBarSegment ? 'z-30' : 'z-20'
                        } bg-white rounded-3xl border border-[#EBECEF] shadow-mts-card p-5 flex flex-col justify-between`}
                      >
                        {/* Шапка карточки: Лаконичный заголовок без лишней подписи + Переключатель режима + Период */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full transition-colors duration-300"
                              style={{
                                backgroundColor: equalizerStacked
                                  ? '#1D2023'
                                  : currentMetricObj.color,
                              }}
                            />
                            <h3 className="text-base font-bold text-[#1D2023]">
                              {equalizerStacked
                                ? 'Динамика звонков'
                                : `Динамика: ${currentMetricObj.shortLabel}`}
                            </h3>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 ml-auto">
                            {/* Переключатель режима: Все слои или Выбранный показатель */}
                            <div className="inline-flex items-center bg-[#F2F3F7] p-1 rounded-full border border-[#E4E7EC]">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!equalizerStacked) {
                                    setEqualizerStacked(true);
                                  }
                                }}
                                className={`h-7 px-3 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                                  equalizerStacked
                                    ? 'bg-white text-[#1D2023] shadow-2xs'
                                    : 'text-[#626C77] hover:text-[#1D2023]'
                                }`}
                              >
                                Все типы слоями
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (equalizerStacked) {
                                    setEqualizerStacked(false);
                                  }
                                }}
                                className={`h-7 px-3 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                                  !equalizerStacked
                                    ? 'bg-white text-[#1D2023] shadow-2xs'
                                    : 'text-[#626C77] hover:text-[#1D2023]'
                                }`}
                              >
                                Только «{currentMetricObj.shortLabel}»
                              </button>
                            </div>

                            {/* Капсула выбора периода: День / Неделя / Месяц / Год */}
                            <div className="inline-flex items-center bg-[#F2F3F7] p-1 rounded-full border border-[#E4E7EC]">
                              {(
                                [
                                  { id: 'day', label: 'День' },
                                  { id: 'week', label: 'Неделя' },
                                  { id: 'month', label: 'Месяц' },
                                  { id: 'year', label: 'Год' },
                                ] as const
                              ).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setChartPeriod(p.id);
                                    setHoveredPointIdx(2);
                                  }}
                                  className={`h-7 px-3 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                                    chartPeriod === p.id
                                      ? 'bg-[#1D2023] text-white shadow-2xs'
                                      : 'text-[#626C77] hover:text-[#1D2023]'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Рабочая область с вертикальными столбцами и шкалой */}
                        <div className="relative flex-1 flex items-stretch pt-5 pb-2 min-h-[225px]">
                          {/* Левая ось значений + фоновые направляющие линии */}
                          <div className="w-8 flex flex-col justify-between pb-7 pt-7 pr-2 text-right select-none shrink-0">
                            {guideSteps.map((st) => (
                              <span
                                key={`axis-val-${st}`}
                                className="text-[11px] font-medium text-[#8C95A0] tabular-nums leading-none"
                              >
                                {Math.round(st * scaleMaxActive)}
                              </span>
                            ))}
                          </div>

                          <div className="relative flex-1 flex flex-col">
                            {/* Тонкие горизонтальные линии сетки позади столбцов */}
                            <div className="absolute inset-x-0 top-7 bottom-7 flex flex-col justify-between pointer-events-none">
                              {guideSteps.map((st) => (
                                <div
                                  key={`guide-line-${st}`}
                                  className={`w-full border-t ${
                                    st === 0
                                      ? 'border-[#D5D8DD]'
                                      : 'border-dashed border-[#EEF0F4]'
                                  }`}
                                />
                              ))}
                            </div>

                            {/* Сетка вертикальных столбцов по слотам времени */}
                            <div
                              className="relative z-10 flex-1 grid gap-2 sm:gap-3.5 items-stretch"
                              style={{
                                gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))`,
                              }}
                            >
                              {chartData.map((d, idx) => {
                                const isSel = idx === selectedIdx;
                                const singleVal = d[activeMetric];

                                // Единая шкала колбы (scaleMaxCalls): плавный подъём при появлении и смене периодов/состояний
                                const totalFillPct =
                                  d.totalCalls > 0
                                    ? Math.max(
                                        18,
                                        Math.min(100, Math.round((d.totalCalls / scaleMaxCalls) * 100))
                                      )
                                    : 0;
                                const singleFillPct =
                                  singleVal > 0
                                    ? Math.max(
                                        18,
                                        Math.min(100, Math.round((singleVal / scaleMaxCalls) * 100))
                                      )
                                    : 0;

                                const targetFillPct = equalizerStacked ? totalFillPct : singleFillPct;
                                const activeFillPct = isChartAnimatedIn ? targetFillPct : 0;

                                // Все 5 сегментов всегда остаются в DOM для плавного перехода между периодами и состояниями без рывков
                                const allBarSegments = [
                                  {
                                    key: 'refused',
                                    label: 'Отказы',
                                    count: d.refused,
                                    color: '#FF0032',
                                  },
                                  {
                                    key: 'unreachable',
                                    label: 'Недозвон',
                                    count: d.unreachableAuto + d.unreachableCallback,
                                    color: '#F59E0B',
                                  },
                                  {
                                    key: 'auto',
                                    label: 'Авто',
                                    count: d.auto,
                                    color: '#8B5CF6',
                                  },
                                  {
                                    key: 'callback',
                                    label: 'По времени',
                                    count: d.callback,
                                    color: '#0077FF',
                                  },
                                  {
                                    key: 'mnp',
                                    label: 'MNP сразу',
                                    count: d.mnp,
                                    color: '#10B981',
                                  },
                                ];

                                const activeSegIndices = allBarSegments
                                  .map((seg, sIdx) => (seg.count > 0 ? sIdx : -1))
                                  .filter((sIdx) => sIdx !== -1);
                                const lastActiveSegIdx =
                                  activeSegIndices.length > 0
                                    ? activeSegIndices[activeSegIndices.length - 1]
                                    : -1;

                                const showTooltipOnLeft = idx >= chartData.length - 2;
                                const isSlotHovered = hoveredBarSegment?.slotIdx === idx;
                                const isSingleHovered =
                                  !equalizerStacked &&
                                  isSlotHovered &&
                                  hoveredBarSegment?.key === activeMetric;

                                return (
                                  <div
                                    key={`eq-slot-${idx}`}
                                    onMouseEnter={() => setHoveredPointIdx(idx)}
                                    onClick={() => setHoveredPointIdx(idx)}
                                    className={`h-full flex flex-col items-center justify-between cursor-pointer group relative ${
                                      isSlotHovered ? 'z-50' : isSel ? 'z-20' : 'z-10'
                                    }`}
                                  >
                                    {/* Верхний бейдж над желобом */}
                                    <div className="h-6 flex items-center justify-center">
                                      {isSel ? (
                                        <span className="px-2.5 py-0.5 rounded-full bg-[#1D2023] text-white text-[11px] font-bold tabular-nums whitespace-nowrap shadow-xs">
                                          {equalizerStacked ? `${d.totalCalls} зв.` : singleVal} ·{' '}
                                          {d.conversion}%
                                        </span>
                                      ) : (
                                        <span className="text-xs font-bold text-[#626C77] group-hover:text-[#1D2023] tabular-nums transition-colors">
                                          {equalizerStacked ? d.totalCalls : singleVal}
                                        </span>
                                      )}
                                    </div>

                                    {/* Вертикальный серый желоб МТС (строго внутри колбы, без вылетов вбок) */}
                                    <div
                                      className={`w-9 sm:w-11 flex-1 my-1 rounded-full p-1 flex flex-col justify-end relative transition-colors duration-200 ${
                                        isSlotHovered ? 'z-50' : 'z-10'
                                      } ${
                                        isSel
                                          ? 'bg-[#E6E8EE]'
                                          : 'bg-[#F2F3F7] group-hover:bg-[#EAECEF]'
                                      }`}
                                    >
                                      {/* Контейнер высоты заполнения капсулы (Вариант А: упругий гидродинамический уровень с перехлёстом 3–4% + 100% полукруглая шапка) */}
                                      <div
                                        style={{
                                          height: `${activeFillPct}%`,
                                          minHeight: activeFillPct > 0 ? '36px' : '0px',
                                          transition: `height 560ms cubic-bezier(0.34, 1.44, 0.64, 1) ${idx * 16}ms, min-height 560ms cubic-bezier(0.34, 1.44, 0.64, 1) ${idx * 16}ms`,
                                        }}
                                        onMouseEnter={() => {
                                          if (!equalizerStacked && singleVal > 0) {
                                            setHoveredBarSegment({
                                              slotIdx: idx,
                                              key: activeMetric,
                                              label: currentMetricObj.shortLabel,
                                              count: singleVal,
                                              color: currentMetricObj.color,
                                            });
                                          }
                                        }}
                                        onMouseLeave={() => {
                                          if (!equalizerStacked) {
                                            setHoveredBarSegment(null);
                                          }
                                        }}
                                        className={`relative w-full rounded-full flex flex-col justify-end ${
                                          isSlotHovered ? 'z-50' : 'z-10'
                                        }`}
                                      >
                                        {/* Маска капсулы: в режиме одного показателя overflow-hidden даёт 100% полукруглую шапку, а в режиме слоёв overflow-visible позволяет выноске стоять строго напротив своей цветной капли */}
                                        <div
                                          className={`relative w-full h-full rounded-full ${
                                            equalizerStacked ? 'overflow-visible' : 'overflow-hidden'
                                          } flex flex-col justify-end`}
                                          style={{
                                            boxShadow: equalizerStacked
                                              ? 'none'
                                              : 'inset 0 2.5px 5px rgba(255, 255, 255, 0.45), inset 0 -3px 6px rgba(0, 0, 0, 0.10)',
                                            transition: 'box-shadow 420ms ease',
                                          }}
                                        >
                                          {/* Вариант А: Внутренний купольный мениск поверхностного натяжения и продольный стеклянный блик колбы (в режиме единого столба воды) */}
                                          <div
                                            aria-hidden="true"
                                            className="pointer-events-none absolute inset-x-1 top-0.5 h-3.5 rounded-t-full z-20 transition-opacity duration-350"
                                            style={{
                                              opacity: !equalizerStacked && activeFillPct > 0 ? 1 : 0,
                                              background:
                                                'radial-gradient(ellipse at 50% 18%, rgba(255, 255, 255, 0.58) 0%, rgba(255, 255, 255, 0.22) 55%, rgba(255, 255, 255, 0) 100%)',
                                            }}
                                          />
                                          <div
                                            aria-hidden="true"
                                            className="pointer-events-none absolute left-1.5 top-2 bottom-2 w-1 rounded-full z-20 transition-opacity duration-350"
                                            style={{
                                              opacity: !equalizerStacked && activeFillPct > 0 ? 0.32 : 0,
                                              background:
                                                'linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.25) 65%, rgba(255, 255, 255, 0) 100%)',
                                            }}
                                          />

                                          {allBarSegments.map((seg, segIdx) => {
                                            const hasCount = seg.count > 0;
                                            const isLastActive = segIdx === lastActiveSegIdx;
                                            const isThisSegHovered =
                                              equalizerStacked &&
                                              isSlotHovered &&
                                              hoveredBarSegment?.key === seg.key;

                                            // Вариант В: Капиллярное слияние и разделение капель с упругим пружинящим импульсом
                                            const segMarginBottom =
                                              !hasCount || isLastActive
                                                ? '0px'
                                                : equalizerStacked
                                                ? '4px'
                                                : '-1px';

                                            return (
                                              <div
                                                key={seg.key}
                                                style={{
                                                  flexGrow: hasCount ? seg.count : 0,
                                                  minHeight:
                                                    hasCount && equalizerStacked && isChartAnimatedIn
                                                      ? '10px'
                                                      : '0px',
                                                  opacity: hasCount ? 1 : 0,
                                                  backgroundColor: equalizerStacked
                                                    ? seg.color
                                                    : currentMetricObj.color,
                                                  borderRadius: equalizerStacked ? '9999px' : '0px',
                                                  marginBottom: segMarginBottom,
                                                  boxShadow:
                                                    equalizerStacked && hasCount
                                                      ? isThisSegHovered
                                                        ? 'inset 0 2.5px 4px rgba(255, 255, 255, 0.55), inset 0 -1.5px 3px rgba(0, 0, 0, 0.12), 0 0 0 1.5px rgba(255, 255, 255, 0.85)'
                                                        : 'inset 0 2px 3.5px rgba(255, 255, 255, 0.38), inset 0 -1.5px 3px rgba(0, 0, 0, 0.08)'
                                                      : 'none',
                                                  pointerEvents: hasCount ? 'auto' : 'none',
                                                  transition:
                                                    'flex-grow 520ms cubic-bezier(0.34, 1.44, 0.64, 1), min-height 480ms cubic-bezier(0.34, 1.48, 0.64, 1), margin-bottom 480ms cubic-bezier(0.34, 1.48, 0.64, 1), background-color 380ms ease, border-radius 460ms cubic-bezier(0.34, 1.48, 0.64, 1), box-shadow 220ms ease, opacity 280ms ease',
                                                }}
                                                onMouseEnter={(e) => {
                                                  if (!equalizerStacked || !hasCount) return;
                                                  e.stopPropagation();
                                                  setHoveredPointIdx(idx);
                                                  setHoveredBarSegment({
                                                    slotIdx: idx,
                                                    key: seg.key,
                                                    label: seg.label,
                                                    count: seg.count,
                                                    color: seg.color,
                                                  });
                                                }}
                                                onMouseLeave={() => {
                                                  if (!equalizerStacked) return;
                                                  setHoveredBarSegment(null);
                                                }}
                                                className={`relative w-full ${
                                                  isThisSegHovered ? 'z-50' : 'z-10'
                                                }`}
                                              >
                                                {/* Выноска строго напротив той цветной капли, на которую наведён курсор, и поверх всех соседних колб (Скрин 1, 2) */}
                                                {isThisSegHovered && (
                                                  <div
                                                    className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-[100] flex items-center ${
                                                      showTooltipOnLeft
                                                        ? 'right-full mr-3.5 flex-row-reverse'
                                                        : 'left-full ml-3.5 flex-row'
                                                    } animate-in fade-in zoom-in-95 duration-150`}
                                                  >
                                                    <span
                                                      className="w-3 h-[2px] rounded-full shrink-0"
                                                      style={{ backgroundColor: seg.color }}
                                                    />
                                                    <div className="bg-white rounded-2xl border border-[#DCE0E8] shadow-xl px-3.5 py-2 flex items-center gap-2 whitespace-nowrap">
                                                      <span
                                                        className="w-3 h-3 rounded-full border-[2.5px] shrink-0"
                                                        style={{ borderColor: seg.color }}
                                                      />
                                                      <span className="text-xs font-semibold text-[#1D2023]">
                                                        {seg.label}
                                                      </span>
                                                      <span className="text-sm font-black text-[#1D2023] tabular-nums ml-0.5">
                                                        {seg.count}
                                                      </span>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {/* Всплывающая белая карточка МТС в режиме одного цвета (всегда поверх соседних колб) */}
                                        {isSingleHovered && (
                                          <div
                                            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 z-[100] flex items-center ${
                                              showTooltipOnLeft
                                                ? 'right-full mr-3.5 flex-row-reverse'
                                                : 'left-full ml-3.5 flex-row'
                                            } animate-in fade-in zoom-in-95 duration-150`}
                                          >
                                            <span
                                              className="w-3 h-[2px] rounded-full shrink-0"
                                              style={{ backgroundColor: currentMetricObj.color }}
                                            />
                                            <div className="bg-white rounded-2xl border border-[#DCE0E8] shadow-xl px-3.5 py-2 flex items-center gap-2 whitespace-nowrap">
                                              <span
                                                className="w-3 h-3 rounded-full border-[2.5px] shrink-0"
                                                style={{ borderColor: currentMetricObj.color }}
                                              />
                                              <span className="text-xs font-semibold text-[#1D2023]">
                                                {currentMetricObj.shortLabel}
                                              </span>
                                              <span className="text-sm font-black text-[#1D2023] tabular-nums ml-0.5">
                                                {singleVal}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Подпись времени под желобом */}
                                    <span
                                      className={`h-5 flex items-center text-xs transition-colors ${
                                        isSel
                                          ? 'font-black text-[#1D2023]'
                                          : 'font-medium text-[#626C77]'
                                      }`}
                                    >
                                      {d.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ПРАВАЯ КАРТОЧКА (4 колонки): Итоги по категориям */}
                      <div
                        className={`lg:col-span-4 relative ${
                          hoveredDonutSegment ? 'z-30' : 'z-10'
                        } bg-white rounded-3xl border border-[#EBECEF] shadow-mts-card p-5 flex flex-col justify-between gap-2`}
                      >
                        <div>
                          <h3 className="text-base font-bold text-[#1D2023]">
                            Итоги по категориям
                          </h3>
                        </div>

                        {/* Кольцевая диаграмма МТС (+10% в размере по умолчанию): без бага стыка текстур на 12 часах и со статичным указателем */}
                        <div className="my-2 flex items-center justify-center">
                          <div className="relative w-[256px] h-[220px] flex items-center justify-center">
                            <svg width={180} height={180} className="-rotate-90 overflow-visible">
                              <defs>
                                <filter id="mts-donut-ring-3d" x="-25%" y="-25%" width="150%" height="150%">
                                  <feDropShadow dx="0" dy="3.5" stdDeviation="4" floodColor="#1D2023" floodOpacity="0.11" />
                                  <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#1D2023" floodOpacity="0.07" />
                                </filter>
                              </defs>

                              {/* Фоновая подложка кольца (+10%) */}
                              <circle
                                cx={90}
                                cy={90}
                                r={donutR}
                                fill="none"
                                stroke="#F2F3F7"
                                strokeWidth={20}
                                filter="url(#mts-donut-ring-3d)"
                              />

                              {/* Сегменты: каждый начинается со своей точки 0° через rotate(), поэтому ни один сегмент не пересекает шов замыкания <circle> на 12 часах */}
                              <g filter="url(#mts-donut-ring-3d)">
                                {segs.map((s) => {
                                  const isSelected = !equalizerStacked && activeMetric === s.metricId;
                                  const isHovered = hoveredDonutSegment?.key === s.id;

                                  // Внутренний радиус строго зафиксирован (60.5px, +10% к прежним 55px) — диск раскрывается ТОЛЬКО наружу
                                  const innerRadiusFixed = donutR - 10; // 60.5px
                                  const segStrokeWidth = isSelected
                                    ? isHovered
                                      ? 33
                                      : 31
                                    : isHovered
                                    ? 26.5
                                    : 20;
                                  const segRadius = innerRadiusFixed + segStrokeWidth / 2;

                                  const dashLen = isChartAnimatedIn ? s.exactPct * 10 : 0;
                                  const startDeg = (s.startExactPct / 100) * 360;

                                  return (
                                    <circle
                                      key={`eq-donut-${s.id}`}
                                      cx={90}
                                      cy={90}
                                      r={segRadius}
                                      pathLength={1000}
                                      fill="none"
                                      stroke={s.color}
                                      strokeWidth={segStrokeWidth}
                                      strokeLinecap="butt"
                                      strokeDasharray={`${dashLen} 2000`}
                                      strokeDashoffset={0}
                                      style={{
                                        transform: `rotate(${startDeg}deg)`,
                                        transformOrigin: '90px 90px',
                                        transition:
                                          'r 180ms cubic-bezier(0.22, 1, 0.36, 1), stroke-width 180ms cubic-bezier(0.22, 1, 0.36, 1), stroke-dasharray 460ms cubic-bezier(0.22, 1, 0.36, 1), transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
                                      }}
                                      className="cursor-pointer"
                                      onMouseEnter={() => {
                                        if (hoveredDonutSegment?.key !== s.id) {
                                          setHoveredDonutSegment({
                                            key: s.id,
                                            label: s.label,
                                            count: s.count,
                                            color: s.color,
                                            angleRad: s.midAngleRad,
                                          });
                                        }
                                      }}
                                      onMouseLeave={() => setHoveredDonutSegment(null)}
                                      onClick={() => {
                                        if (!equalizerStacked && activeMetric === s.metricId) {
                                          setEqualizerStacked(true);
                                        } else {
                                          setActiveMetric(s.metricId);
                                          setEqualizerStacked(false);
                                        }
                                      }}
                                    />
                                  );
                                })}
                              </g>
                            </svg>

                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                              <span className="text-[26px] font-black text-[#1D2023] tabular-nums font-mts-extended leading-none">
                                {conversionPct}%
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C95A0] mt-1">
                                конверсия
                              </span>
                              <span className="text-[11px] font-medium text-[#626C77] tabular-nums">
                                {periodSaved} из {periodTotalCalls}
                              </span>
                            </div>

                            {/* Статичная выносная линия и всплывающая карточка МТС строго по центру наведённого отрезка (не бегает за мышкой) */}
                            {hoveredDonutSegment &&
                              (() => {
                                const activeSeg =
                                  segs.find((sg) => sg.id === hoveredDonutSegment.key) || null;
                                const staticAngleRad = activeSeg
                                  ? activeSeg.midAngleRad
                                  : hoveredDonutSegment.angleRad;
                                const displayCount = activeSeg
                                  ? activeSeg.count
                                  : hoveredDonutSegment.count;
                                const displayLabel = activeSeg
                                  ? activeSeg.label
                                  : hoveredDonutSegment.label;
                                const displayColor = activeSeg
                                  ? activeSeg.color
                                  : hoveredDonutSegment.color;

                                const cosA = Math.cos(staticAngleRad);
                                const sinA = Math.sin(staticAngleRad);
                                const cx = 128;
                                const cy = 110;
                                const isHoveredSelected =
                                  !equalizerStacked &&
                                  activeSeg !== null &&
                                  activeSeg.metricId === activeMetric;
                                const edgeRadius = isHoveredSelected ? 92 : 87;
                                const tipRadius = isHoveredSelected ? 109 : 104;
                                const edgeX = cx + edgeRadius * cosA;
                                const edgeY = cy + edgeRadius * sinA;
                                const tipX = cx + tipRadius * cosA;
                                const tipY = cy + tipRadius * sinA;

                                const txPct =
                                  cosA > 0.35 ? -14 : cosA < -0.35 ? -86 : -50;
                                const tyPct =
                                  sinA < -0.25 ? -104 : sinA > 0.25 ? 6 : -50;

                                return (
                                  <>
                                    <svg
                                      width={256}
                                      height={220}
                                      className="pointer-events-none absolute inset-0 z-30 overflow-visible"
                                    >
                                      <line
                                        x1={edgeX}
                                        y1={edgeY}
                                        x2={tipX}
                                        y2={tipY}
                                        stroke={displayColor}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                      />
                                      <circle
                                        cx={edgeX}
                                        cy={edgeY}
                                        r={3.5}
                                        fill={displayColor}
                                        stroke="#FFFFFF"
                                        strokeWidth={1.5}
                                      />
                                    </svg>
                                    <div
                                      style={{
                                        left: `${tipX}px`,
                                        top: `${tipY}px`,
                                        transform: `translate(${txPct}%, ${tyPct}%)`,
                                      }}
                                      className="pointer-events-none absolute z-40 bg-white rounded-2xl border border-[#DCE0E8] shadow-xl px-3.5 py-2 flex items-center gap-2 whitespace-nowrap animate-in fade-in duration-150"
                                    >
                                      <span
                                        className="w-3 h-3 rounded-full border-[2.5px] shrink-0"
                                        style={{ borderColor: displayColor }}
                                      />
                                      <span className="text-xs font-semibold text-[#1D2023]">
                                        {displayLabel}
                                      </span>
                                      <span className="text-sm font-black text-[#1D2023] tabular-nums ml-0.5">
                                        {displayCount}
                                      </span>
                                    </div>
                                  </>
                                );
                              })()}
                          </div>
                        </div>

                        {/* Интерактивная легенда: 5 чистых строк с объединённым показателем Недозвон */}
                        <div className="space-y-1.5 pt-2 border-t border-[#F1F3F6]">
                          {segs.map((s) => {
                            const isRowActive =
                              !equalizerStacked && s.metricId === activeMetric;
                            const barWidthPct =
                              isChartAnimatedIn && s.count > 0 ? Math.max(8, s.pct) : 0;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onMouseEnter={() =>
                                  setHoveredDonutSegment({
                                    key: s.id,
                                    label: s.label,
                                    count: s.count,
                                    color: s.color,
                                    angleRad: s.midAngleRad,
                                  })
                                }
                                onMouseLeave={() => setHoveredDonutSegment(null)}
                                onClick={() => {
                                  if (isRowActive) {
                                    setEqualizerStacked(true);
                                  } else {
                                    setActiveMetric(s.metricId);
                                    setEqualizerStacked(false);
                                  }
                                }}
                                className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                  isRowActive
                                    ? 'bg-[#F2F3F7] font-bold'
                                    : 'hover:bg-[#F8F9FB]'
                                }`}
                              >
                                <span className="flex items-center gap-2 font-medium text-[#1D2023]">
                                  <span
                                    className="w-3 h-3 rounded-full border-[3px] shrink-0"
                                    style={{ borderColor: s.color }}
                                  />
                                  <span>{s.label}</span>
                                </span>
                                <div className="flex items-center gap-2.5">
                                  <div className="w-16 h-1.5 rounded-full bg-[#F2F3F7] overflow-hidden hidden sm:block">
                                    <div
                                      style={{
                                        width: `${barWidthPct}%`,
                                        backgroundColor: s.color,
                                        transition: 'width 460ms cubic-bezier(0.22, 1, 0.36, 1)',
                                      }}
                                      className="h-full rounded-full"
                                    />
                                  </div>
                                  <span className="font-bold text-[#1D2023] tabular-nums min-w-[58px] text-right">
                                    {s.count}{' '}
                                    <span className="text-[#8C95A0] font-normal">({s.pct}%)</span>
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* МОДАЛЬНОЕ ОКНО 1: «Фильтры» */}
        {isFilterModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150 font-mts-compact">
            <div className="relative w-full max-w-[480px] bg-white rounded-[28px] border border-[#EBECEF] shadow-2xl flex flex-col overflow-hidden">
              {/* Шапка окна «Фильтры» */}
              <div className="px-6 pt-5 pb-4 border-b border-[#F2F3F7] flex items-center justify-between">
                <h2 className="text-xl font-black text-[#1D2023] font-mts-extended">
                  Фильтры
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsCalendarOpen(false);
                    setIsFilterModalOpen(false);
                  }}
                  aria-label="Закрыть фильтры"
                  className="w-9 h-9 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4 stroke-[1.75]" />
                </button>
              </div>

              {/* Тело окна «Фильтры»: только полоса переключений и выбор периода с календарем */}
              <div className="p-6 space-y-5">
                {/* Полоса переключений: Сегодня / Вчера / Неделя / Месяц */}
                <div className="bg-[#F2F3F7] p-1.5 rounded-2xl grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: 'today', label: 'Сегодня' },
                      { id: 'yesterday', label: 'Вчера' },
                      { id: 'week', label: 'Неделя' },
                      { id: 'month', label: 'Месяц' },
                    ] as const
                  ).map((tab) => {
                    const isActive = activePreset === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleSelectPreset(tab.id)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-white text-[#1D2023] shadow-2xs'
                            : 'text-[#626C77] hover:text-[#1D2023]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Кнопка вызова календаря периода */}
                <div>
                  <div className="text-xs font-semibold text-[#626C77] mb-2">
                    Или укажите период вручную
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCalendar}
                    className="w-full h-12 px-4 rounded-2xl bg-[#F2F3F7] hover:bg-[#EAECEF] transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span className="text-[13px] font-bold text-[#1D2023] font-mts-compact">
                      {formatDateRu(startDate)}-{formatDateRu(endDate)}
                    </span>
                    <CalendarIcon className="w-[18px] h-[18px] text-[#1D2023] stroke-[1.75]" />
                  </button>
                </div>
              </div>

              {/* Нижние кнопки: ОЧИСТИТЬ и ПРИМЕНИТЬ */}
              <div className="px-6 py-4 border-t border-[#F2F3F7] flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
                >
                  ОЧИСТИТЬ
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
                >
                  ПРИМЕНИТЬ
                </button>
              </div>

              {/* ВСПЛЫВАЮЩИЙ КАЛЕНДАРЬ ПОВЕРХ ОКНА ФИЛЬТРОВ */}
              {isCalendarOpen && (
                <div className="fixed inset-0 z-60 bg-black/25 backdrop-blur-[3px] flex items-center justify-center p-4 animate-in fade-in duration-150 font-mts-compact">
                  <div className="w-full max-w-[560px] bg-white rounded-[28px] border border-[#EBECEF] shadow-2xl p-6">
                    {/* Верхняя навигация календаря */}
                    <div className="flex items-center justify-between mb-5 px-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => shiftCalendarMonths(-12)}
                          className="w-7 h-7 rounded-lg hover:bg-[#F2F3F7] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                          title="Предыдущий год"
                        >
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => shiftCalendarMonths(-1)}
                          className="w-7 h-7 rounded-lg hover:bg-[#F2F3F7] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                          title="Предыдущий месяц"
                        >
                          <ChevronLeft className="w-4 h-4 stroke-[1.75]" />
                        </button>
                      </div>

                      <div className="flex items-center gap-4 text-[14px] font-bold text-[#1D2023] font-mts-compact">
                        <span>
                          {MONTH_NAMES_RU[leftMonthIndex]} {leftMonthYear}
                        </span>
                        <span className="text-[#626C77] font-bold">-</span>
                        <span>
                          {MONTH_NAMES_RU[rightMonthIndex]} {rightMonthYear}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => shiftCalendarMonths(1)}
                          className="w-7 h-7 rounded-lg hover:bg-[#F2F3F7] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                          title="Следующий месяц"
                        >
                          <ChevronRight className="w-4 h-4 stroke-[1.75]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => shiftCalendarMonths(12)}
                          className="w-7 h-7 rounded-lg hover:bg-[#F2F3F7] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                          title="Следующий год"
                        >
                          <ChevronsRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Две сетки месяцев с вертикальным разделителем */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative">
                      <div className="sm:pr-4 sm:border-r sm:border-[#F1F3F5]">
                        {renderMonthGrid(leftMonthDays, 'left')}
                      </div>
                      <div className="sm:pl-4">
                        {renderMonthGrid(rightMonthDays, 'right')}
                      </div>
                    </div>

                    {/* Нижний блок календаря: НАЧАЛО / КОНЕЦ + кнопки Отмена / Выбрать этот период */}
                    <div className="mt-5 pt-4 border-t border-[#F1F3F5]">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide font-mts-compact">
                        <span className="text-[#1D2023]">
                          НАЧАЛО {formatDateRu(tempStartDate)}
                        </span>
                        <span className="text-[#8C95A0]">·</span>
                        <span className="text-[#FF0023]">
                          КОНЕЦ {formatDateRu(tempEndDate)}
                        </span>
                      </div>

                      <div className="mt-3.5 flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setIsCalendarOpen(false)}
                          className="px-4 py-2.5 rounded-xl bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyCalendarPeriod}
                          className="px-5 py-2.5 rounded-xl bg-[#1D2023] hover:bg-[#2F343A] text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          Выбрать этот период
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* МОДАЛЬНОЕ ОКНО 3: «Опции и настройки» */}
        {isOptionsModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150 font-mts-compact">
            <div className="relative w-full max-w-[540px] bg-white rounded-[28px] border border-[#EBECEF] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
              {/* Шапка окна «Опции и настройки» */}
              <div className="px-6 pt-5 pb-4 border-b border-[#F2F3F7] flex flex-col gap-3.5 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-[#1D2023] font-mts-extended">
                      Опции и настройки
                    </h2>
                    <p className="text-xs text-[#626C77] mt-0.5">
                      Бесконтактная передача статистики в УРМ и настройка таблицы
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOptionsModalOpen(false)}
                    aria-label="Закрыть опции и настройки"
                    className="w-9 h-9 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4 stroke-[1.75]" />
                  </button>
                </div>

                {/* Кнопки переключения вверху: Параметры (УРМ) / Колонки */}
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C95A0]">
                    {optionsTab === 'params'
                      ? 'Синхронизация с папкой УРМ (ВС / РГ)'
                      : 'Отображение столбцов таблицы'}
                  </span>
                  <div className="bg-[#F2F3F7] p-1 rounded-xl inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setOptionsTab('params')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        optionsTab === 'params'
                          ? 'bg-white text-[#1D2023] shadow-2xs'
                          : 'text-[#626C77] hover:text-[#1D2023]'
                      }`}
                    >
                      Параметры УРМ
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionsTab('columns')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        optionsTab === 'columns'
                          ? 'bg-white text-[#1D2023] shadow-2xs'
                          : 'text-[#626C77] hover:text-[#1D2023]'
                      }`}
                    >
                      Колонки
                    </button>
                  </div>
                </div>
              </div>

              {/* Тело модального окна */}
              <div className="p-6 overflow-y-auto space-y-4 bg-white">
                {optionsTab === 'params' ? (
                  <>
                    {/* 1. Включение бесконтактной передачи */}
                    <div className="p-4 rounded-2xl bg-[#F8F9FB] border border-[#EBECEF] flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold text-[#1D2023]">
                          Бесконтактная передача статистики
                        </div>
                        <div className="text-xs text-[#626C77] mt-0.5">
                          Автоматически обновляет ваш зашифрованный файл в общей папке УРМ при каждом сохранении, отказе или недозвоне
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...urmConfig, enabled: !urmConfig.enabled };
                          setUrmConfig(next);
                          saveUrmSyncConfig(next);
                        }}
                        className={`w-12 h-7 rounded-full transition-colors p-1 cursor-pointer shrink-0 ${
                          urmConfig.enabled ? 'bg-[#E30613]' : 'bg-[#D5D8DD]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                            urmConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* 2. Имя/логин сотрудника и имя РГ/ВС */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#1D2023] mb-1.5">
                          Ваше имя или логин УРМ
                        </label>
                        <input
                          type="text"
                          value={urmConfig.operatorName}
                          onChange={(e) => {
                            const val = e.target.value;
                            const next: UrmSyncConfig = {
                              ...urmConfig,
                              operatorName: val,
                              operatorId: val.trim() || urmConfig.operatorId,
                            };
                            setUrmConfig(next);
                            saveUrmSyncConfig(next);
                          }}
                          placeholder="Например: Иван Иванов"
                          className="w-full h-10 px-3.5 rounded-xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#B8C0CC] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#1D2023] mb-1.5">
                          Ваш ВС / РГ (необязательно)
                        </label>
                        <input
                          type="text"
                          value={urmConfig.groupLeaderName}
                          onChange={(e) => {
                            const next: UrmSyncConfig = {
                              ...urmConfig,
                              groupLeaderName: e.target.value,
                            };
                            setUrmConfig(next);
                            saveUrmSyncConfig(next);
                          }}
                          placeholder="Например: Андрей Андреевич"
                          className="w-full h-10 px-3.5 rounded-xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#B8C0CC] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* 3. Сетевой путь к общей папке в УРМ (вводится вручную пользователем!) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-[#1D2023]">
                          Путь к общей папке статистики в УРМ
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (urmConfig.networkFolderPath) {
                              navigator.clipboard?.writeText(urmConfig.networkFolderPath.trim());
                              setCopiedPathToast(true);
                              setTimeout(() => setCopiedPathToast(false), 1800);
                            }
                          }}
                          className="text-[11px] font-bold text-[#0077FF] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedPathToast ? 'Скопировано!' : 'Скопировать путь'}</span>
                        </button>
                      </div>

                      <input
                        type="text"
                        value={urmConfig.networkFolderPath}
                        onChange={(e) => {
                          const next: UrmSyncConfig = {
                            ...urmConfig,
                            networkFolderPath: e.target.value,
                          };
                          setUrmConfig(next);
                          saveUrmSyncConfig(next);
                        }}
                        placeholder="\\msk.mts.ru\MSK\User\Folders\Homes\...\MSK_Stats"
                        className="w-full h-10 px-3.5 rounded-xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#B8C0CC] text-xs font-mono font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none"
                      />

                      <div className="text-[11px] text-[#626C77] leading-relaxed">
                        Впишите сюда сетевой путь к общей папке (например, вашей или ВС / РГ).{' '}
                        {!hasNativeUrmIpcBridge() && (
                          <span>
                            Нажмите <strong>«Подключить папку в Проводнике»</strong> ниже — путь автоматически скопируется в буфер обмена, вставьте его (<strong>Ctrl+V</strong>) в открывшемся окне Windows и выберите папку 1 раз.
                          </span>
                        )}
                      </div>

                      {/* Кнопки подключения папки и тестовой отправки */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            setSyncErrorMessage('');
                            setSyncStatusMessage('');
                            const res = await pickAndConnectUrmFolder(urmConfig.networkFolderPath);
                            if (res.ok) {
                              setConnectedFolderName(res.folderName || 'MSK_Stats');
                              const nextCfg: UrmSyncConfig = { ...urmConfig, enabled: true };
                              setUrmConfig(nextCfg);
                              saveUrmSyncConfig(nextCfg);
                              setSyncStatusMessage(
                                `Папка «${res.folderName}» подключена! Теперь статистика передается автоматически.`
                              );
                            } else if (res.error) {
                              setSyncErrorMessage(res.error);
                            }
                          }}
                          className="h-9 px-3.5 rounded-xl bg-[#1D2023] hover:bg-[#2F343A] text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>
                            {connectedFolderName
                              ? `Папка подключена: ${connectedFolderName} (сменить)`
                              : 'Подключить папку в Проводнике'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            setIsSyncingNow(true);
                            setSyncErrorMessage('');
                            setSyncStatusMessage('');
                            const nextCfg: UrmSyncConfig = { ...urmConfig, enabled: true };
                            setUrmConfig(nextCfg);
                            saveUrmSyncConfig(nextCfg);
                            const fallbackStats: ShiftStats = stats || {
                              savedCount: records.filter(
                                (r) =>
                                  r.type === 'MNP' ||
                                  r.type === 'По времени' ||
                                  r.type === 'АВТО'
                              ).length,
                              totalCallsCount: records.length,
                              conversionRate: 0,
                              unreachableCount: records.filter(
                                (r) =>
                                  r.type === 'Недозвон (По времени)' ||
                                  r.type === 'Недозвон (Авто)'
                              ).length,
                              refusedCount: records.filter((r) => r.type === 'Отказ').length,
                              shiftStartTime: Date.now(),
                            };
                            const res = await pushEmployeeStatsToUrmFolder(
                              records,
                              fallbackStats,
                              nextCfg
                            );
                            setIsSyncingNow(false);
                            if (res.ok) {
                              setSyncStatusMessage(
                                `✓ Ваш файл статистики успешно записан в папку (${new Date().toLocaleTimeString('ru-RU')})`
                              );
                              if (nextCfg.isSupervisorReader) {
                                refreshDepartmentFolderStats(nextCfg);
                              }
                            } else {
                              setSyncErrorMessage(res.error || 'Ошибка отправки в папку');
                            }
                          }}
                          className="h-9 px-3.5 rounded-xl bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                          <span>Проверить отправку сейчас</span>
                        </button>
                      </div>

                      {syncStatusMessage && (
                        <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                          {syncStatusMessage}
                        </div>
                      )}
                      {syncErrorMessage && (
                        <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-[#E30613]">
                          {syncErrorMessage}
                        </div>
                      )}
                    </div>

                    {/* 4. Режим руководителя (ВС / РГ) */}
                    <div className="p-4 rounded-2xl bg-[#F8F9FB] border border-[#EBECEF] flex items-center justify-between gap-4">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-red-50 text-[#E30613] flex items-center justify-center shrink-0 mt-0.5">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-[#1D2023]">
                            Режим руководителя (ВС / РГ)
                          </div>
                          <div className="text-xs text-[#626C77] mt-0.5">
                            Для ВС и РГ: включает в шапке кнопку <strong>«Отдел УРМ»</strong> и собирает статистику всех сотрудников из этой папки в единую таблицу и график
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !urmConfig.isSupervisorReader;
                          const next: UrmSyncConfig = {
                            ...urmConfig,
                            isSupervisorReader: nextVal,
                          };
                          setUrmConfig(next);
                          saveUrmSyncConfig(next);
                          if (nextVal) {
                            setDataScope('department');
                            refreshDepartmentFolderStats(next);
                          } else {
                            setDataScope('own');
                          }
                        }}
                        className={`w-12 h-7 rounded-full transition-colors p-1 cursor-pointer shrink-0 ${
                          urmConfig.isSupervisorReader ? 'bg-[#E30613]' : 'bg-[#D5D8DD]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                            urmConfig.isSupervisorReader ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </>
                ) : (
                  /* Вкладка «Колонки» */
                  <div className="space-y-2.5">
                    {TABLE_COLUMNS.map((col) => {
                      const isChecked = visibleColumns[col.id];
                      return (
                        <label
                          key={col.id}
                          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F8F9FB] hover:bg-[#F2F3F7] cursor-pointer transition-colors"
                        >
                          <span className="text-xs font-bold text-[#1D2023]">{col.label}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setVisibleColumns((prev) => ({
                                ...prev,
                                [col.id]: !prev[col.id],
                              }))
                            }
                            className="w-4 h-4 accent-[#E30613] rounded cursor-pointer"
                          />
                        </label>
                      );
                    })}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setColWidths({ ...DEFAULT_COLUMN_WIDTHS })}
                        className="w-full h-9 rounded-xl bg-[#F2F3F7] hover:bg-[#E5E7EB] text-xs font-bold text-[#1D2023] transition-colors cursor-pointer"
                      >
                        Сбросить ширину всех столбцов по умолчанию
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Нижние кнопки: ОТМЕНА и СОХРАНИТЬ */}
              <div className="px-6 py-4 border-t border-[#F2F3F7] flex items-center gap-3.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsOptionsModalOpen(false)}
                  className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
                >
                  ЗАКРЫТЬ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveUrmSyncConfig(urmConfig);
                    if (urmConfig.isSupervisorReader) {
                      refreshDepartmentFolderStats(urmConfig);
                    }
                    setIsOptionsModalOpen(false);
                  }}
                  className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
                >
                  СОХРАНИТЬ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
