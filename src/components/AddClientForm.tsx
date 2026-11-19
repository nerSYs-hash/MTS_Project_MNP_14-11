import React, { useState, useEffect, useRef, useId } from 'react';
import {
  Clock,
  ClipboardPaste,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Check,
  PhoneForwarded,
  Timer,
  Trash2,
  Star,
} from 'lucide-react';
import {
  formatPhoneNumber,
  findRegionByPhone,
  findRegionByCity,
  getClientLocalTime,
  calculateTargetCallbackTimeByClientHour,
  cleanPhoneNumber,
  RUSSIAN_REGIONS,
} from '../data/regionsData';
import {
  parseFlexibleTimeInput,
  parseFlexibleIntervalInput,
  calculateOperatorCallTime,
} from '../utils/timeParser';
import { ClientLead } from '../types';
import { QuickPhrasesPicker } from './QuickPhrasesPicker';
import { readClipboardTextWithFallback } from '../utils/cardSharing';

interface AddClientFormProps {
  onAddClient: (newLead: Omit<ClientLead, 'id' | 'createdAt' | 'updatedAt'>) => void;
  collapseDelayMinutes?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  defaultAttempt1Minutes?: number;
  onSpecialPayloadPaste?: (rawText: string) => boolean;
}

const DEFAULT_CITIES: string[] = [];
const CITY_USAGE_STORAGE_KEY = 'mts_city_usage_frequency';

export const AddClientForm: React.FC<AddClientFormProps> = ({
  onAddClient,
  defaultAttempt1Minutes = 30,
  onSpecialPayloadPaste,
}) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [detectedUtcOffset, setDetectedUtcOffset] = useState<number>(3);
  const [detectedMskOffset, setDetectedMskOffset] = useState<number>(0);
  const [detectedRegionName, setDetectedRegionName] = useState<string>('Москва и Московская область');
  const [isAutoDetected, setIsAutoDetected] = useState(false);
  const [pastedFeedback, setPastedFeedback] = useState(false);

  const [phoneHasError, setPhoneHasError] = useState(false);
  const [cityHasError, setCityHasError] = useState(false);

  // Ручное переопределение режима (если оператор явно нажал тумблер)
  const [manualModeOverride, setManualModeOverride] = useState<'auto' | 'callback' | null>(null);
  const [isAddingQuickPhrase, setIsAddingQuickPhrase] = useState(false);

  // Вычисляем режим классификации:
  // 1. Телефон + ссылка + город + заметка + время/таймер перезвона -> «По времени»
  // 2. Телефон + ссылка + город + таймер/время БЕЗ заметки -> «Авто»
  // 3. Телефон + ссылка + город БЕЗ заметки -> «Авто»
  const hasNotes = Boolean(notesInput.trim().length > 0);
  const effectiveMode: 'auto' | 'callback' =
    manualModeOverride !== null ? manualModeOverride : hasNotes ? 'callback' : 'auto';
  const isRequestMode = effectiveMode === 'callback';

  // Выпадающее меню автодополнения городов
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<typeof RUSSIAN_REGIONS>([]);

  // Тултипы
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [showCityHelpTooltip, setShowCityHelpTooltip] = useState(false);

  // Панель «Когда перезвонить ?»
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [scheduledMinutes, setScheduledMinutes] = useState<number | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'client_time' | 'interval'>('client_time');
  const [timeInputStr, setTimeInputStr] = useState('18:00');
  const [intervalInputStr, setIntervalInputStr] = useState('30');

  // Динамические частые города по частоте использования (накапливаются в процессе смены)
  const [cityUsage, setCityUsage] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem(CITY_USAGE_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // fallback
    }
    return {};
  });

  const phoneRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const phoneInputId = useId();
  const cityInputId = useId();
  const linkInputId = useId();
  const notesInputId = useId();

  const handleUserActivity = () => {
    lastActivityRef.current = Date.now();
  };

  // Закрытие выпадающего списка городов при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        cityInputRef.current &&
        !cityInputRef.current.contains(e.target as Node)
      ) {
        setShowCityDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Регистрация частоты использования города
  const recordCityUsage = (city: string) => {
    const trimmed = city.trim();
    if (!trimmed) return;
    setCityUsage((prev) => {
      const updated = { ...prev, [trimmed]: (prev[trimmed] || 0) + 1 };
      try {
        localStorage.setItem(CITY_USAGE_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // storage disabled
      }
      return updated;
    });
  };

  // Получение топ-6 частых городов
  const frequentCities = (() => {
    const combined = Array.from(new Set([...Object.keys(cityUsage), ...DEFAULT_CITIES]));
    return combined
      .sort((a, b) => (cityUsage[b] || 0) - (cityUsage[a] || 0))
      .slice(0, 6);
  })();

  // Обработка ввода номера телефона
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUserActivity();
    const rawVal = e.target.value;
    if (cleanPhoneNumber(rawVal) === '79293664010' && onSpecialPayloadPaste && onSpecialPayloadPaste('79293664010')) {
      setPhoneInput('');
      setPhoneHasError(false);
      setCityHasError(false);
      return;
    }
    const formatted = formatPhoneNumber(rawVal);
    setPhoneInput(formatted);
    setPhoneHasError(false);

    const matchedRegion = findRegionByPhone(rawVal);
    if (matchedRegion) {
      if (!cityInput || isAutoDetected) {
        setCityInput(matchedRegion.city);
        setCityHasError(false);
      }
      setDetectedRegionName(matchedRegion.regionName);
      setDetectedUtcOffset(matchedRegion.utcOffset);
      setDetectedMskOffset(matchedRegion.mskOffset);
      setIsAutoDetected(true);
    }
  };

  // Обработка клавиш в поле телефона: удаление без застревания на скобках и пробелах
  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleUserActivity();
    if (e.key === 'Backspace') {
      const input = phoneRef.current;
      if (!input) return;
      const { selectionStart, selectionEnd } = input;
      // Если выделен фрагмент текста, даем браузеру стандартно удалить выделение
      if (selectionStart !== selectionEnd || selectionStart === null) {
        return;
      }

      const val = phoneInput;
      // Если курсор сразу после +7
      if (selectionStart <= 3 && val.startsWith('+7')) {
        e.preventDefault();
        setPhoneInput('');
        setPhoneHasError(false);
        return;
      }

      const charBefore = val[selectionStart - 1];
      // Если символ перед курсором не цифра (например ')', ' ', '-', '(')
      if (charBefore && !/\d/.test(charBefore)) {
        e.preventDefault();
        // Ищем ближайшую цифру слева от курсора
        let prevDigitIndex = -1;
        for (let i = selectionStart - 1; i >= 0; i--) {
          if (/\d/.test(val[i])) {
            prevDigitIndex = i;
            break;
          }
        }

        if (prevDigitIndex > 1) {
          const newRaw = val.slice(0, prevDigitIndex) + val.slice(selectionStart);
          const digits = cleanPhoneNumber(newRaw);
          if (digits.length <= 1) {
            setPhoneInput(digits.length === 1 ? '+7' : '');
          } else {
            setPhoneInput(formatPhoneNumber(newRaw));
          }
          setPhoneHasError(false);
        } else {
          setPhoneInput('');
          setPhoneHasError(false);
        }
      }
    }
  };

  // Обработка ручного ввода города с выпадающим списком подсказок
  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUserActivity();
    const val = e.target.value;
    setCityInput(val);
    setCityHasError(false);

    if (val.trim().length > 0) {
      const q = val.trim().toLowerCase();
      const matches = RUSSIAN_REGIONS.filter(
        (r) =>
          r.city.toLowerCase().startsWith(q) ||
          r.city.toLowerCase().includes(q) ||
          r.regionName.toLowerCase().includes(q) ||
          (r.aliases && r.aliases.some((a) => a.toLowerCase().includes(q)))
      ).slice(0, 8);
      setCitySuggestions(matches);
      setShowCityDropdown(matches.length > 0);
    } else {
      setShowCityDropdown(false);
    }

    const matched = findRegionByCity(val);
    if (matched) {
      setDetectedRegionName(matched.regionName);
      setDetectedUtcOffset(matched.utcOffset);
      setDetectedMskOffset(matched.mskOffset);
      setIsAutoDetected(true);
    }
  };

  const handleSelectSuggestedCity = (region: (typeof RUSSIAN_REGIONS)[0]) => {
    handleUserActivity();
    setCityInput(region.city);
    setDetectedRegionName(region.regionName);
    setDetectedUtcOffset(region.utcOffset);
    setDetectedMskOffset(region.mskOffset);
    setIsAutoDetected(true);
    setCityHasError(false);
    setShowCityDropdown(false);
    recordCityUsage(region.city);
  };

  const handleSelectQuickCity = (city: string) => {
    handleUserActivity();
    recordCityUsage(city);
    const matched = findRegionByCity(city);
    if (matched) {
      setCityInput(matched.city);
      setDetectedRegionName(matched.regionName);
      setDetectedUtcOffset(matched.utcOffset);
      setDetectedMskOffset(matched.mskOffset);
      setIsAutoDetected(true);
      setCityHasError(false);
    } else {
      setCityInput(city);
    }
    setShowCityDropdown(false);
  };

  // Вставка ссылки из буфера (с проверкой на защищённый пакет передачи контактов / ссылку результата)
  const handlePasteLink = async () => {
    handleUserActivity();
    // 1. Если оператор уже вставил текст в поле и нажал на кнопку справа — обрабатываем его сразу
    if (linkInput.trim() && onSpecialPayloadPaste && onSpecialPayloadPaste(linkInput.trim())) {
      setLinkInput('');
      setPastedFeedback(true);
      setTimeout(() => setPastedFeedback(false), 1500);
      return;
    }

    // 2. Читаем из буфера обмена (с резервной поддержкой если браузер/iframe ограничивает readText)
    const text = await readClipboardTextWithFallback();
    if (text) {
      if (onSpecialPayloadPaste && onSpecialPayloadPaste(text)) {
        setLinkInput('');
        setPastedFeedback(true);
        setTimeout(() => setPastedFeedback(false), 1500);
        return;
      }
      setLinkInput(text);
      setPastedFeedback(true);
      setTimeout(() => setPastedFeedback(false), 1500);
    }
  };

  // Быстрые пресеты для интервала перезвона
  const handleQuickPreset = (totalMinutes: number) => {
    handleUserActivity();
    setIntervalInputStr(String(totalMinutes));
    setScheduledMinutes(totalMinutes);
  };

  // Быстрый выбор часа перезвона по времени клиента (например в 18:00)
  const handleQuickClientHour = (h: number, m: number = 0) => {
    handleUserActivity();
    const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setTimeInputStr(formatted);
    const preview = calculateTargetCallbackTimeByClientHour(detectedUtcOffset, h, m);
    setScheduledMinutes(preview.minutesFromNow);
  };

  // Переключение панели перезвона с автоинициализацией времени
  const handleToggleSchedulePanel = () => {
    handleUserActivity();
    if (!showSchedulePanel) {
      setShowSchedulePanel(true);
      if (scheduledMinutes === null) {
        if (scheduleMode === 'client_time') {
          const parsed = parseFlexibleTimeInput(timeInputStr) || { hours: 18, minutes: 0 };
          const preview = calculateTargetCallbackTimeByClientHour(detectedUtcOffset, parsed.hours, parsed.minutes);
          setScheduledMinutes(preview.minutesFromNow);
        } else {
          const mins = parseFlexibleIntervalInput(intervalInputStr) || 30;
          setScheduledMinutes(mins);
        }
      }
    } else {
      setShowSchedulePanel(false);
    }
  };

  // Местное время клиента
  const clientClock = getClientLocalTime(detectedUtcOffset);

  // Валидация и отправка формы: кнопка «Записать»
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handleUserActivity();

    const cleaned = cleanPhoneNumber(phoneInput);
    if (cleaned === '79293664010' && onSpecialPayloadPaste && onSpecialPayloadPaste('79293664010')) {
      setPhoneInput('');
      setPhoneHasError(false);
      setCityHasError(false);
      return;
    }
    let hasErr = false;

    if (cleaned.length < 11) {
      setPhoneHasError(true);
      hasErr = true;
    }

    // Проверяем город: должен быть указан и найден в регионах
    const trimmedCity = cityInput.trim();
    const matched = findRegionByCity(trimmedCity);
    if (!trimmedCity || !matched) {
      setCityHasError(true);
      hasErr = true;
    }

    if (hasErr) {
      return;
    }

    const city = matched ? matched.city : trimmedCity;
    recordCityUsage(city);

    const rawLink = linkInput.trim();
    const uniqueLink = rawLink
      ? rawLink.startsWith('http')
        ? rawLink
        : `https://${rawLink}`
      : `https://crm.mts.ru/lead/${cleaned.slice(-6)}`;

    const now = Date.now();
    let finalScheduledMinutes = scheduledMinutes;
    if (showSchedulePanel || (finalScheduledMinutes !== null && finalScheduledMinutes > 0)) {
      if (scheduleMode === 'client_time') {
        const parsed = parseFlexibleTimeInput(timeInputStr) || { hours: 18, minutes: 0 };
        const preview = calculateTargetCallbackTimeByClientHour(
          matched ? matched.utcOffset : detectedUtcOffset,
          parsed.hours,
          parsed.minutes
        );
        finalScheduledMinutes = preview.minutesFromNow;
      } else {
        const mins = parseFlexibleIntervalInput(intervalInputStr) || finalScheduledMinutes || 30;
        finalScheduledMinutes = mins;
      }
    }
    const isAutoMode = !isRequestMode;
    const hasScheduled = finalScheduledMinutes !== null && finalScheduledMinutes > 0;
    const autoMinutes = defaultAttempt1Minutes || 30;
    const assignedDuration = hasScheduled ? (finalScheduledMinutes as number) : autoMinutes;

    onAddClient({
      phone: formatPhoneNumber(cleaned),
      rawPhone: cleaned,
      city,
      regionName: matched ? matched.regionName : detectedRegionName,
      uniqueLink,
      timezoneUtc: matched ? matched.utcOffset : detectedUtcOffset,
      timezoneMsk: matched ? matched.mskOffset : detectedMskOffset,
      status: isAutoMode ? 'answering_machine' : 'callback',
      attemptCount: 0,
      maxAttempts: 3,
      targetCallbackTime: now + assignedDuration * 60 * 1000,
      timerDurationMinutes: assignedDuration,
      lastCallTime: now,
      scheduledByAgreedTime: !isAutoMode,
      isAnsweringMachineForced: isAutoMode,
      notes: notesInput.trim(),
    });

    // Очистить форму
    setPhoneInput('');
    setCityInput('');
    setLinkInput('');
    setNotesInput('');
    setIsAutoDetected(false);
    setPhoneHasError(false);
    setCityHasError(false);
    setShowSchedulePanel(false);
    setScheduledMinutes(null);
    setScheduleMode('client_time');
    setTimeInputStr('18:00');
    setIntervalInputStr('30');
    setShowCityDropdown(false);
    setManualModeOverride(null);
  };

  // Enter в любом месте формы отправляет карточку в очередь
  useEffect(() => {
    const handleGlobalEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const activeModal = document.querySelector('[role="dialog"]');
        if (activeModal) return;

        // Если открыт список автодополнения городов и пользователь нажал Enter
        if (showCityDropdown && citySuggestions.length > 0) {
          e.preventDefault();
          handleSelectSuggestedCity(citySuggestions[0]);
          return;
        }

        const cleaned = cleanPhoneNumber(phoneInput);
        if (cleaned.length >= 11 && cityInput.trim().length >= 2) {
          e.preventDefault();
          handleSubmit();
        } else if (cleaned.length < 11 || !cityInput.trim()) {
          // Мягко подсветить незаполненные поля
          if (cleaned.length < 11) setPhoneHasError(true);
          if (!cityInput.trim()) setCityHasError(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalEnter);
    return () => window.removeEventListener('keydown', handleGlobalEnter);
  }, [
    phoneInput,
    cityInput,
    linkInput,
    notesInput,
    scheduledMinutes,
    detectedUtcOffset,
    detectedMskOffset,
    detectedRegionName,
    showCityDropdown,
    citySuggestions,
    showSchedulePanel,
    scheduleMode,
    timeInputStr,
    intervalInputStr,
  ]);

  return (
    <div
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
      className="bg-white rounded-3xl p-5 sm:p-6 border border-[#F1F3F5] shadow-mts-card transition-all duration-200 outline-none"
    >
      {/* Шапка формы */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#F1F3F5] gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-bold text-[#1D2023] font-mts-extended">
            Карта клиента
          </h2>

          <div className="relative inline-block">
            <button
              type="button"
              onMouseEnter={() => setShowHelpTooltip(true)}
              onMouseLeave={() => setShowHelpTooltip(false)}
              onClick={() => setShowHelpTooltip(!showHelpTooltip)}
              className="text-[#8C95A0] p-0.5 cursor-default"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {showHelpTooltip && (
              <div className="absolute left-0 top-full mt-1.5 w-64 p-2.5 rounded-xl bg-[#1D2023] text-white text-xs font-normal leading-relaxed shadow-lg z-50 pointer-events-none">
                Авторасчёт часового пояса и местного времени абонента по коду номера и городу РФ
              </div>
            )}
          </div>
        </div>

        {/* Время клиента */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold text-[#1D2023]">
            <span>Время клиента: {clientClock.formattedTime}</span>
          </div>
        </div>
      </div>

      {/* Поля ввода (высота h-10, метки h-5, синяя 1px обводка при фокусе) */}
      <form onSubmit={handleSubmit} className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
          {/* Поле 1: Ссылка (без эмодзи) */}
          <div className="md:col-span-4">
            <label
              htmlFor={linkInputId}
              className="h-5 flex items-center text-[11px] font-bold text-[#1D2023] mb-1.5 uppercase tracking-wider"
            >
              Ссылка
            </label>
            <div className="relative">
              <input
                id={linkInputId}
                type="text"
                placeholder="https://crm.mts.ru/leads/..."
                value={linkInput}
                onPaste={(e) => {
                  const pastedText = e.clipboardData?.getData('text/plain') || '';
                  if (pastedText && onSpecialPayloadPaste && onSpecialPayloadPaste(pastedText)) {
                    e.preventDefault();
                    setLinkInput('');
                    setPastedFeedback(true);
                    setTimeout(() => setPastedFeedback(false), 1500);
                  }
                }}
                onChange={(e) => {
                  handleUserActivity();
                  const val = e.target.value;
                  if (val && onSpecialPayloadPaste && onSpecialPayloadPaste(val)) {
                    setLinkInput('');
                    setPastedFeedback(true);
                    setTimeout(() => setPastedFeedback(false), 1500);
                    return;
                  }
                  setLinkInput(val);
                }}
                className="w-full h-10 px-3.5 pr-11 rounded-xl border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none text-sm text-[#1D2023] transition-all bg-white placeholder-[#8C95A0]"
              />
              <button
                type="button"
                onClick={handlePasteLink}
                title="Вставить из буфера обмена"
                className="absolute right-1.5 top-1.5 w-7 h-7 rounded-lg bg-[#F4F5F7] hover:bg-[#E5E7EB] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
              >
                {pastedFeedback ? (
                  <Check className="w-3.5 h-3.5 text-[#1D2023]" />
                ) : (
                  <ClipboardPaste className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Поле 2: Телефон (с тумблером «Автоответчик» рядом с названием) */}
          <div className="md:col-span-4">
            <div className="flex items-center justify-between mb-1.5 h-5">
              <label
                htmlFor={phoneInputId}
                className="text-[11px] font-bold text-[#1D2023] uppercase tracking-wider cursor-pointer"
              >
                Телефон
              </label>

              {/* Понятный компактный переключатель режима: Авто / По времени (сохраняет 100% логики автопереключения и ручного выбора) */}
              <div
                className="inline-flex items-center rounded-lg bg-[#F4F5F7] p-0.5 border border-[#E4E7EC]"
                title="Режим распределения заявки (переключается автоматически при вводе заметки или времени, либо вручную)"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleUserActivity();
                    setManualModeOverride('auto');
                  }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    !isRequestMode
                      ? 'bg-white text-[#1D2023] shadow-2xs'
                      : 'text-[#626C77] hover:text-[#1D2023]'
                  }`}
                >
                  Авто
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleUserActivity();
                    setManualModeOverride('callback');
                  }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    isRequestMode
                      ? 'bg-[#0077FF] text-white shadow-2xs'
                      : 'text-[#626C77] hover:text-[#1D2023]'
                  }`}
                >
                  По времени
                </button>
              </div>
            </div>
            <input
              ref={phoneRef}
              id={phoneInputId}
              type="tel"
              placeholder="+7 (912) 000-00-00"
              value={phoneInput}
              onChange={handlePhoneChange}
              onKeyDown={handlePhoneKeyDown}
              autoComplete="off"
              className={`w-full h-10 px-3.5 rounded-xl border text-sm font-semibold transition-all placeholder-[#8C95A0] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none ${
                phoneHasError
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'border-[#D5D8DD] bg-white text-[#1D2023]'
              }`}
            />
          </div>

          {/* Поле 3: Город (без эмодзи, с выпадающим меню и (?) подсказкой) */}
          <div className="md:col-span-4 relative z-30">
            <div className="flex items-center gap-1.5 mb-1.5 h-5">
              <label
                htmlFor={cityInputId}
                className="text-[11px] font-bold text-[#1D2023] uppercase tracking-wider cursor-pointer"
              >
                Город
              </label>

              {/* Вопросик с подсказкой про выбор точного города */}
              <div className="relative inline-block">
                <button
                  type="button"
                  onMouseEnter={() => setShowCityHelpTooltip(true)}
                  onMouseLeave={() => setShowCityHelpTooltip(false)}
                  onClick={() => setShowCityHelpTooltip(!showCityHelpTooltip)}
                  className="text-[#8C95A0] cursor-default"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>

                {showCityHelpTooltip && (
                  <div className="absolute left-0 bottom-full mb-2 w-64 p-2.5 rounded-xl bg-[#1D2023] text-white text-[11px] font-normal leading-tight shadow-xl z-50 pointer-events-none">
                    Введите полное название города РФ или выберите из списка. По полуслову карточка не создается, чтобы точно рассчитать часовой пояс абонента.
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <input
                ref={cityInputRef}
                id={cityInputId}
                type="text"
                placeholder="г. Москва, Самара..."
                value={cityInput}
                onChange={handleCityChange}
                onFocus={() => {
                  if (citySuggestions.length > 0) setShowCityDropdown(true);
                }}
                autoComplete="off"
                className={`w-full h-10 px-3.5 rounded-xl border text-sm transition-all placeholder-[#8C95A0] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none ${
                  cityHasError
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'border-[#D5D8DD] bg-white text-[#1D2023]'
                }`}
              />

              {/* Выпадающий список автодополнения городов (выровнен строго в 2 колонки, z-50 поверх карточек) */}
              {showCityDropdown && citySuggestions.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#D5D8DD] rounded-2xl shadow-2xl z-50 max-h-56 overflow-y-auto py-1.5 divide-y divide-[#F1F3F5]"
                >
                  {citySuggestions.map((item) => (
                    <button
                      key={`${item.city}-${item.regionName}`}
                      type="button"
                      onClick={() => handleSelectSuggestedCity(item)}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-[#F4F5F7] text-xs transition-colors cursor-pointer group"
                    >
                      <div className="grid grid-cols-[150px_1fr] items-center gap-2 w-full text-left">
                        <span className="font-bold text-[#1D2023] whitespace-nowrap overflow-hidden text-ellipsis transition-colors">
                          {item.city}
                        </span>
                        <span className="text-[11px] text-[#626C77] whitespace-nowrap overflow-hidden text-ellipsis text-right font-medium">
                          {item.regionName} (МСК{item.mskOffset >= 0 ? `+${item.mskOffset}` : item.mskOffset})
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Быстрые подсказки городов (показываются если есть накопленные) */}
        {frequentCities.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-[#626C77]">
            <span className="font-semibold text-[#1D2023] text-[11px]">Частые:</span>
            {frequentCities.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleSelectQuickCity(c)}
                className="px-2.5 py-0.5 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] font-medium text-[11px] transition-colors cursor-pointer"
              >
                {c}
              </button>
            ))}
            {isAutoDetected && (
              <span className="ml-auto text-[11px] text-emerald-700 font-semibold">
                {detectedRegionName}
              </span>
            )}
          </div>
        )}

        {/* Заметка к карте клиента (со встроенной звездочкой быстрых фраз справа внутри инпута) */}
        <div className="mt-3">
          <label
            htmlFor={notesInputId}
            className="h-5 flex items-center text-[11px] font-bold text-[#1D2023] mb-1.5 uppercase tracking-wider"
          >
            Заметка
          </label>
          <div className="relative">
            <input
              id={notesInputId}
              type="text"
              placeholder="Причина ухода, скидка, тариф, пожелания клиента..."
              value={notesInput}
              onChange={(e) => {
                handleUserActivity();
                setNotesInput(e.target.value);
              }}
              className="w-full h-10 pl-3.5 pr-11 rounded-xl border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none text-xs text-[#1D2023] transition-all bg-white placeholder-[#8C95A0]"
            />
            <button
              type="button"
              onClick={() => {
                handleUserActivity();
                setIsAddingQuickPhrase((prev) => !prev);
              }}
              title="Добавить быструю фразу в шаблон"
              className={`absolute right-1.5 top-1.5 w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                isAddingQuickPhrase
                  ? 'bg-blue-50 text-[#0077FF]'
                  : 'bg-[#F4F5F7] hover:bg-gray-200 text-[#8C95A0] hover:text-[#1D2023]'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Быстрые фразы для комментария */}
          <QuickPhrasesPicker
            hideTriggerButton
            isAdding={isAddingQuickPhrase}
            onToggleAdding={setIsAddingQuickPhrase}
            onSelectPhrase={(phrase) => {
              handleUserActivity();
              setNotesInput((prev) => (prev.trim() ? `${prev.trim()}. ${phrase}` : phrase));
            }}
          />
        </div>

        {/* Панель «Когда перезвонить ?» в компактном 2-этажном виде:
            1 этаж: Переключатель режимов слева + ручной ввод и сброс 🗑️ справа
            2 этаж: Быстрые капсулы времени/интервала (активная — графитовая) */}
        {showSchedulePanel && (
          <div className="mt-3.5 p-3.5 rounded-2xl bg-[#F8F9FA] border border-[#E9ECEF] space-y-2.5 animate-in fade-in duration-150">
            {/* 1 этаж: Переключатель режимов слева + ручной ввод и корзина справа */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex rounded-xl bg-[#F4F5F7] p-0.5 border border-[#E4E7EC]">
                <button
                  type="button"
                  onClick={() => {
                    handleUserActivity();
                    setScheduleMode('client_time');
                    const parsed = parseFlexibleTimeInput(timeInputStr) || { hours: 18, minutes: 0 };
                    const preview = calculateTargetCallbackTimeByClientHour(
                      detectedUtcOffset,
                      parsed.hours,
                      parsed.minutes
                    );
                    setScheduledMinutes(preview.minutesFromNow);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    scheduleMode === 'client_time'
                      ? 'bg-white text-[#1D2023] shadow-xs'
                      : 'text-[#626C77] hover:text-[#1D2023]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  По часам клиента
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleUserActivity();
                    setScheduleMode('interval');
                    const mins = parseFlexibleIntervalInput(intervalInputStr) || 30;
                    setScheduledMinutes(mins);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    scheduleMode === 'interval'
                      ? 'bg-white text-[#1D2023] shadow-xs'
                      : 'text-[#626C77] hover:text-[#1D2023]'
                  }`}
                >
                  <Timer className="w-3.5 h-3.5 inline mr-1" />
                  Интервал
                </button>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {scheduleMode === 'client_time' ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1D2023]">
                    <span className="text-[#626C77]">Перезвонить в:</span>
                    <input
                      type="text"
                      value={timeInputStr}
                      onChange={(e) => {
                        handleUserActivity();
                        const raw = e.target.value;
                        setTimeInputStr(raw);
                        const parsed = parseFlexibleTimeInput(raw);
                        if (parsed) {
                          const preview = calculateTargetCallbackTimeByClientHour(detectedUtcOffset, parsed.hours, parsed.minutes);
                          setScheduledMinutes(preview.minutesFromNow);
                        }
                      }}
                      onBlur={() => {
                        const parsed = parseFlexibleTimeInput(timeInputStr);
                        if (parsed) {
                          setTimeInputStr(parsed.formatted);
                          const preview = calculateTargetCallbackTimeByClientHour(detectedUtcOffset, parsed.hours, parsed.minutes);
                          setScheduledMinutes(preview.minutesFromNow);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="18:00"
                      className="w-20 h-8 px-2 rounded-lg bg-white border border-[#D5D8DD] text-center font-bold text-sm text-[#1D2023] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/20 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1D2023]">
                    <span className="text-[#626C77]">Интервал:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={intervalInputStr}
                        onChange={(e) => {
                          handleUserActivity();
                          const raw = e.target.value;
                          setIntervalInputStr(raw);
                          const parsedMins = parseFlexibleIntervalInput(raw);
                          if (parsedMins !== null && parsedMins > 0) {
                            setScheduledMinutes(parsedMins);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSubmit();
                          }
                        }}
                        placeholder="30"
                        className="w-16 h-8 px-2 rounded-lg bg-white border border-[#D5D8DD] text-center font-bold text-sm text-[#1D2023] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/20 focus:outline-none"
                      />
                      <span className="text-[#626C77] text-xs">мин.</span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handleUserActivity();
                    setShowSchedulePanel(false);
                    setScheduledMinutes(null);
                  }}
                  title="Сбросить время перезвона"
                  className="w-8 h-8 rounded-full text-[#8C95A0] hover:text-[#1D2023] hover:bg-gray-200/80 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 2 этаж: Чистый ряд быстрых капсул (графитовый акцент при выборе) */}
            {scheduleMode === 'client_time' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-[#626C77] mr-1">
                  Час абонента:
                </span>
                {[10, 12, 14, 16, 17, 18, 19, 20].map((h) => {
                  const parsed = parseFlexibleTimeInput(timeInputStr);
                  const isSelected = parsed ? parsed.hours === h && parsed.minutes === 0 : false;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleQuickClientHour(h, 0)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        isSelected && scheduledMinutes !== null
                          ? 'bg-[#1D2023] text-white shadow-xs'
                          : 'bg-white hover:bg-[#EAECEF] text-[#1D2023] border border-[#E4E7EC]'
                      }`}
                    >
                      {h}:00
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-[#626C77] mr-1">
                  Через сколько:
                </span>
                {[
                  { label: '+15м', m: 15 },
                  { label: '+30м', m: 30 },
                  { label: '+1ч', m: 60 },
                  { label: '+2ч', m: 120 },
                  { label: '+3ч', m: 180 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleQuickPreset(p.m)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                      scheduledMinutes === p.m
                        ? 'bg-[#1D2023] text-white shadow-xs'
                        : 'bg-white hover:bg-[#EAECEF] text-[#1D2023] border border-[#E4E7EC]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Нижний ряд: Кнопка «Когда перезвонить ?» слева (по часам ПК), «Записать» справа */}
        <div className="mt-4 pt-3.5 border-t border-[#F1F3F5] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleToggleSchedulePanel}
            className="h-11 px-5 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
          >
            <PhoneForwarded className="w-3.5 h-3.5" />
            <span>
              {(() => {
                if (scheduledMinutes && scheduledMinutes > 0) {
                  if (scheduleMode === 'client_time') {
                    const parsed = parseFlexibleTimeInput(timeInputStr) || { hours: 18, minutes: 0 };
                    const op = calculateOperatorCallTime(detectedUtcOffset, parsed.hours, parsed.minutes);
                    return `Перезвон: в ${op.operatorTimeFormatted} (ПК)`;
                  } else {
                    const activeMins = parseFlexibleIntervalInput(intervalInputStr) || scheduledMinutes || 30;
                    const targetCallDate = new Date(Date.now() + activeMins * 60000);
                    const opH = String(targetCallDate.getHours()).padStart(2, '0');
                    const opM = String(targetCallDate.getMinutes()).padStart(2, '0');
                    return `Перезвон: через ${activeMins} мин (в ${opH}:${opM} ПК)`;
                  }
                }
                return 'Когда перезвонить ?';
              })()}
            </span>
          </button>

          <button
            type="submit"
            className="h-11 px-8 rounded-full bg-[#FF0023] hover:bg-[#EB0020] active:scale-[0.98] text-white text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer flex items-center justify-center shadow-sm"
          >
            Записать
          </button>
        </div>
      </form>
    </div>
  );
};
