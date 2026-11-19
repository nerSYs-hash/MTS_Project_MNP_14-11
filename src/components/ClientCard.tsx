import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  ExternalLink,
  Clock,
  Trash2,
  PhoneForwarded,
  RotateCw,
  CalendarClock,
  Pencil,
  X,
  MessageSquare,
  Timer,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { ClientLead, CallStatus } from '../types';
import {
  getClientLocalTime,
  calculateTargetCallbackTimeByClientHour,
  cleanPhoneNumber,
  formatPhoneNumber,
  findRegionByCity,
  findRegionByPhone,
  RUSSIAN_REGIONS,
} from '../data/regionsData';
import {
  parseFlexibleTimeInput,
  parseFlexibleIntervalInput,
} from '../utils/timeParser';
import { QuickPhrasesPicker } from './QuickPhrasesPicker';

interface ClientCardProps {
  lead: ClientLead;
  onUpdateStatus: (
    id: string,
    newStatus: CallStatus,
    options?: {
      customTimerMinutes?: number;
      notes?: string;
      isClientAgreed?: boolean;
      attemptCount?: number;
    }
  ) => void;
  onDeleteLead: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onUpdateLead?: (id: string, updates: Partial<ClientLead>) => void;
  remainingTime: {
    totalSeconds: number;
    isExpired: boolean;
    formatted: string;
    isOverdue: boolean;
  };
  isMostUrgent?: boolean;
  isHighlighted?: boolean;
  isShareSelectionMode?: boolean;
  isSelectedForShare?: boolean;
  shareExitStage?: 'idle' | 'blurring' | 'swiping';
  onToggleSelectForShare?: (leadId: string) => void;
}

export const ClientCard: React.FC<ClientCardProps> = ({
  lead,
  onUpdateStatus,
  onDeleteLead,
  onUpdateNotes,
  onUpdateLead,
  remainingTime,
  isMostUrgent = false,
  isHighlighted = false,
  isShareSelectionMode = false,
  isSelectedForShare = false,
  shareExitStage = 'idle',
  onToggleSelectForShare,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(lead.notes);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const QUICK_CITIES = ['Москва', 'СПб', 'Самара', 'Екатеринбург', 'Новосибирск', 'Краснодар'];

  // Состояние редактирования данных карточки (номер телефона, ссылка, город)
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editPhone, setEditPhone] = useState(lead.phone);
  const [editLink, setEditLink] = useState(lead.uniqueLink || '');
  const [editCity, setEditCity] = useState(lead.city || '');
  const [editIsAutoAnswering, setEditIsAutoAnswering] = useState<boolean>(
    Boolean(lead.isAnsweringMachineForced || lead.status === 'answering_machine')
  );
  const [copiedLink, setCopiedLink] = useState(false);
  const [showEditCityDropdown, setShowEditCityDropdown] = useState(false);
  const [editCitySuggestions, setEditCitySuggestions] = useState<typeof RUSSIAN_REGIONS>([]);

  // Синхронизация полей при смене лида
  useEffect(() => {
    if (!isEditingInfo) {
      setEditPhone(lead.phone);
      setEditLink(lead.uniqueLink || '');
      setEditCity(lead.city || '');
      setEditIsAutoAnswering(Boolean(lead.isAnsweringMachineForced || lead.status === 'answering_machine'));
    }
  }, [lead.phone, lead.uniqueLink, lead.city, lead.isAnsweringMachineForced, lead.status, isEditingInfo]);

  // Копирование ссылки CRM
  const handleCopyLink = () => {
    if (!editLink) return;
    navigator.clipboard.writeText(editLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1600);
  };

  // Ручной ввод города с поиском по буквам и выпадающим списком
  const handleEditCityChange = (val: string) => {
    setEditCity(val);
    if (val.trim().length > 0) {
      const q = val.trim().toLowerCase();
      const matches = RUSSIAN_REGIONS.filter(
        (r) =>
          r.city.toLowerCase().startsWith(q) ||
          r.city.toLowerCase().includes(q) ||
          r.regionName.toLowerCase().includes(q) ||
          (r.aliases && r.aliases.some((a) => a.toLowerCase().includes(q)))
      ).slice(0, 8);
      setEditCitySuggestions(matches);
      setShowEditCityDropdown(matches.length > 0);
    } else {
      setShowEditCityDropdown(false);
    }
  };

  const handleSelectSuggestedEditCity = (region: (typeof RUSSIAN_REGIONS)[0]) => {
    setEditCity(region.city);
    setShowEditCityDropdown(false);
  };

  // Автоопределение города и региона при изменении номера в режиме редактирования
  const handleEditPhoneChange = (val: string) => {
    const formatted = formatPhoneNumber(val);
    setEditPhone(formatted);
    const matched = findRegionByPhone(val);
    if (matched) {
      setEditCity(matched.city);
    }
  };

  // Быстрый выбор региона
  const handleSelectQuickCity = (city: string) => {
    setEditCity(city);
    setShowEditCityDropdown(false);
  };

  // Сохранить отредактированные данные карточки
  const handleSaveInfo = () => {
    const cleaned = cleanPhoneNumber(editPhone);
    const formattedPhone = cleaned.length >= 11 ? formatPhoneNumber(cleaned) : editPhone.trim();
    const cityTrimmed = editCity.trim() || lead.city;
    const region = findRegionByCity(cityTrimmed);

    const hasNotes = Boolean((lead.notes || '').trim().length > 0);
    // Логика v2.7.5: без заметки карточка строго относится к «Авто»
    const isAuto = editIsAutoAnswering || !hasNotes;

    const updates: Partial<ClientLead> = {
      phone: formattedPhone,
      rawPhone: cleaned || lead.rawPhone,
      uniqueLink: editLink.trim(),
      city: cityTrimmed,
      regionName: region ? region.regionName : lead.regionName,
      timezoneUtc: region ? region.utcOffset : lead.timezoneUtc,
      timezoneMsk: region ? region.mskOffset : lead.timezoneMsk,
      isAnsweringMachineForced: isAuto,
      status: isAuto ? 'answering_machine' : 'callback',
      scheduledByAgreedTime: !isAuto,
    };

    onUpdateLead?.(lead.id, updates);
    setIsEditingInfo(false);
  };

  // Режим планирования перезвона: по времени клиента или через интервал
  const [scheduleMode, setScheduleMode] = useState<'client_time' | 'interval'>('interval');
  const [timeInputStr, setTimeInputStr] = useState<string>('18:00');
  const [intervalInputStr, setIntervalInputStr] = useState<string>(() =>
    String(lead.timerDurationMinutes || 30)
  );

  // Синхронизируем поле интервала с установленным интервалом карточки
  useEffect(() => {
    if (lead.timerDurationMinutes && lead.timerDurationMinutes > 0) {
      setIntervalInputStr(String(lead.timerDurationMinutes));
    }
  }, [lead.timerDurationMinutes]);

  // Местное время клиента
  const clientClock = getClientLocalTime(lead.timezoneUtc);

  // Копирование номера строго в чистом формате (79XXXXXXXXX без +, скобок и дефисов)
  const handleCopy = () => {
    const cleanDigits = cleanPhoneNumber(lead.phone) || cleanPhoneNumber(lead.rawPhone);
    navigator.clipboard.writeText(cleanDigits);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Удаление карточки с плавной быстрой анимацией свайпа вправо (300мс)
  const handleDeleteWithSwipe = () => {
    setIsDeleting(true);
    setTimeout(() => {
      onDeleteLead(lead.id);
    }, 280);
  };

  // Сохранить заметку
  const handleSaveNotes = () => {
    onUpdateNotes(lead.id, notesText);
    setIsEditingNotes(false);
  };

  // Определение режима карточки (Авто или По времени) с сохранением исходного выбора
  const isCallbackCardMode = () => {
    const hasNotes = Boolean((lead.notes || '').trim().length > 0);
    return (
      !lead.isAnsweringMachineForced &&
      (lead.status === 'callback' || Boolean(lead.scheduledByAgreedTime) || hasNotes)
    );
  };

  // Установка перезвона через интервал (в минутах)
  const handleApplyCallbackTime = () => {
    const mins = parseFlexibleIntervalInput(intervalInputStr) || lead.timerDurationMinutes || 30;
    const isCallbackCard = isCallbackCardMode();
    if (mins > 0) {
      setIntervalInputStr(String(mins));
      onUpdateStatus(lead.id, isCallbackCard ? 'callback' : 'answering_machine', {
        attemptCount: lead.attemptCount,
        customTimerMinutes: mins,
        isClientAgreed: isCallbackCard,
      });
    }
    setShowSchedulePanel(false);
  };

  // Установка перезвона ко времени клиента (например в 18:00 по его часам)
  const handleApplyClientTargetTime = (targetH?: number, targetM?: number) => {
    let h = targetH;
    let m = targetM;
    if (h === undefined || m === undefined) {
      const parsed = parseFlexibleTimeInput(timeInputStr) || { hours: 18, minutes: 0 };
      h = parsed.hours;
      m = parsed.minutes;
    }
    const preview = calculateTargetCallbackTimeByClientHour(lead.timezoneUtc, h, m);
    const isCallbackCard = isCallbackCardMode();
    if (preview.minutesFromNow > 0) {
      setIntervalInputStr(String(preview.minutesFromNow));
      onUpdateStatus(lead.id, isCallbackCard ? 'callback' : 'answering_machine', {
        attemptCount: lead.attemptCount,
        customTimerMinutes: preview.minutesFromNow,
        isClientAgreed: isCallbackCard,
      });
    }
    setShowSchedulePanel(false);
  };

  // Быстрый выбор часа клиента (например кнопка 18:00)
  const handleQuickClientHour = (h: number, m: number = 0) => {
    const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setTimeInputStr(formatted);
    handleApplyClientTargetTime(h, m);
  };

  // Быстрые пресеты интервала
  const handleQuickPreset = (totalMinutes: number) => {
    const isCallbackCard = isCallbackCardMode();
    setIntervalInputStr(String(totalMinutes));
    onUpdateStatus(lead.id, isCallbackCard ? 'callback' : 'answering_machine', {
      attemptCount: lead.attemptCount,
      customTimerMinutes: totalMinutes,
      isClientAgreed: isCallbackCard,
    });
    setShowSchedulePanel(false);
  };

  // Отрисовка панели «Когда перезвонить ?» с двумя логичными режимами:
  // 1) По часам клиента (например в 18:00 по его часам)
  // 2) Интервал (+30м, +1ч и т.д.)
  const renderSchedulePanel = () => {
    const parsedTime = parseFlexibleTimeInput(timeInputStr) || { hours: 18, minutes: 0, formatted: '18:00' };
    const clientSchedulePreview = calculateTargetCallbackTimeByClientHour(
      lead.timezoneUtc,
      parsedTime.hours,
      parsedTime.minutes
    );

    return (
      <div className="p-3.5 rounded-2xl bg-[#F8F9FA] border border-[#E9ECEF] space-y-3 animate-in fade-in duration-150">
        {/* Переключатель режимов: «По часам клиента» vs «Интервал» */}
        <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-[#E9ECEF]">
          <div className="inline-flex rounded-xl bg-[#F4F5F7] p-0.5 border border-[#E4E7EC]">
            <button
              type="button"
              onClick={() => setScheduleMode('client_time')}
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
              onClick={() => setScheduleMode('interval')}
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

          <div className="text-[11px] font-bold text-[#626C77]">
            У клиента сейчас: <span className="text-[#1D2023] font-extrabold">{clientClock.formattedTime}</span>
          </div>
        </div>

        {scheduleMode === 'client_time' ? (
          /* РЕЖИМ 1: По времени клиента */
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-[#1D2023] mr-1">
                Быстрый час абонента:
              </span>
              {[10, 12, 14, 16, 17, 18, 19, 20].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleQuickClientHour(h, 0)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    parsedTime.hours === h && parsedTime.minutes === 0
                      ? 'bg-[#DDE1E6] text-[#1D2023] shadow-2xs'
                      : 'bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023]'
                  }`}
                >
                  {h}:00
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#E9ECEF] flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1D2023]">
                <span>Перезвонить в:</span>
                <input
                  type="text"
                  value={timeInputStr}
                  onChange={(e) => setTimeInputStr(e.target.value)}
                  onBlur={() => {
                    const parsed = parseFlexibleTimeInput(timeInputStr);
                    if (parsed) setTimeInputStr(parsed.formatted);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyClientTargetTime();
                    }
                  }}
                  placeholder="18:00"
                  className="w-20 h-8 px-2 rounded-lg bg-white border border-[#D5D8DD] text-center font-bold text-sm focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/20 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyClientTargetTime()}
                  title={`Установить на ${clientSchedulePreview.formattedTargetTime}`}
                  className="h-8 px-4 rounded-full bg-[#EAECEF] hover:bg-[#DDE1E6] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
                >
                  <Check className="w-4 h-4 text-[#1D2023]" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowSchedulePanel(false)}
                  title="Отмена"
                  className="w-8 h-8 rounded-lg text-[#8C95A0] hover:text-[#1D2023] hover:bg-gray-200 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* РЕЖИМ 2: Через интервал */
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-[#1D2023] mr-1">
                Через сколько:
              </span>
              {[
                { label: '+15м', m: 15 },
                { label: '+30м', m: 30 },
                { label: '+1ч', m: 60 },
                { label: '+2ч', m: 120 },
                { label: '+3ч', m: 180 },
              ].map((p) => {
                const currentIntervalMins =
                  parseFlexibleIntervalInput(intervalInputStr) || lead.timerDurationMinutes || 30;
                const isSelected = currentIntervalMins === p.m;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleQuickPreset(p.m)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#1D2023] text-white shadow-xs'
                        : 'bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#E9ECEF] flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1D2023]">
                <span>Интервал:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={intervalInputStr}
                    onChange={(e) => setIntervalInputStr(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyCallbackTime();
                      }
                    }}
                    placeholder="30"
                    className="w-16 h-8 px-2 rounded-lg bg-white border border-[#D5D8DD] text-center font-bold text-sm focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/20 focus:outline-none"
                  />
                  <span className="text-[#626C77] text-xs">мин.</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyCallbackTime}
                  title="Установить"
                  className="h-8 px-4 rounded-full bg-[#EAECEF] hover:bg-[#DDE1E6] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
                >
                  <Check className="w-4 h-4 text-[#1D2023]" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowSchedulePanel(false)}
                  title="Отмена"
                  className="w-8 h-8 rounded-lg text-[#8C95A0] hover:text-[#1D2023] hover:bg-gray-200 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const isSaved = lead.status === 'saved';
  const isRefused = lead.status === 'refused';
  const isCompleted = isSaved || isRefused;

  // =========================================================================
  // Панель редактирования данных абонента (соответствует карте клиента:
  // 1. Телефон с автоопределением региона
  // 2. Город
  // 3. Ссылка на предложение с удобным копированием
  // + Быстрый выбор частых городов РФ)
  // =========================================================================
  const renderEditInfoPanel = () => (
    <div className="mt-2.5 p-3 bg-[#F8F9FA] rounded-2xl border border-[#E9ECEF]">
      <div className="flex flex-col md:flex-row md:items-end gap-2.5">
        {/* 1. Ссылка (с удобным копированием) */}
        <div className="flex-1 min-w-0">
          <label className="text-[10px] font-bold text-[#626C77] uppercase block mb-1">
            Ссылка
          </label>
          <div className="relative">
            <input
              type="text"
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              placeholder="https://crm.mts.ru/..."
              className="w-full h-8 px-2.5 pr-8 rounded-lg bg-white border border-[#D5D8DD] text-xs text-[#1D2023] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none"
            />
            {editLink && (
              <button
                type="button"
                onClick={handleCopyLink}
                title="Скопировать ссылку CRM"
                className="absolute right-1 top-1 w-6 h-6 rounded-md bg-[#F4F5F7] hover:bg-gray-200 text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
              >
                {copiedLink ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* 2. Телефон (с автоопределением города) */}
        <div className="w-full md:w-48 shrink-0">
          <label className="text-[10px] font-bold text-[#626C77] uppercase block mb-1">
            Телефон
          </label>
          <input
            type="text"
            value={editPhone}
            onChange={(e) => handleEditPhoneChange(e.target.value)}
            placeholder="+7 (999) 000-00-00"
            className="w-full h-8 px-2.5 rounded-lg bg-white border border-[#D5D8DD] text-xs font-medium text-[#1D2023] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none"
          />
        </div>

        {/* 3. Город (с выпадающим списком подсказок в 2 колонки) */}
        <div className="relative w-full md:w-52 shrink-0">
          <label className="text-[10px] font-bold text-[#626C77] uppercase block mb-1">
            Город
          </label>
          <input
            type="text"
            value={editCity}
            onChange={(e) => handleEditCityChange(e.target.value)}
            onFocus={() => {
              if (editCitySuggestions.length > 0) setShowEditCityDropdown(true);
            }}
            placeholder="Москва"
            className="w-full h-8 px-2.5 rounded-lg bg-white border border-[#D5D8DD] text-xs text-[#1D2023] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none"
          />

          {/* Выпадающий список городов (выровнен в 2 строгие колонки) */}
          {showEditCityDropdown && editCitySuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#D5D8DD] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto py-1 divide-y divide-[#F1F3F5]">
              {editCitySuggestions.map((item) => (
                <button
                  key={`${item.city}-${item.regionName}`}
                  type="button"
                  onClick={() => handleSelectSuggestedEditCity(item)}
                  className="w-full px-3 py-2 text-left hover:bg-[#F4F5F7] text-xs transition-colors cursor-pointer group"
                >
                  <div className="grid grid-cols-[140px_1fr] items-center gap-2 w-full text-left">
                    <span className="font-bold text-[#1D2023] whitespace-nowrap overflow-hidden text-ellipsis transition-colors">
                      {item.city}
                    </span>
                    <span className="text-[10px] text-[#626C77] whitespace-nowrap overflow-hidden text-ellipsis text-right font-medium">
                      {item.regionName} (МСК{item.mskOffset >= 0 ? `+${item.mskOffset}` : item.mskOffset})
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 4. Кнопки действий в той же строчке справа */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setIsEditingInfo(false)}
            className="h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-xs font-bold text-[#1D2023] transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSaveInfo}
            title="Сохранить изменения"
            className="h-8 px-4 rounded-full bg-[#EAECEF] hover:bg-[#DDE1E6] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
          >
            <Check className="w-4 h-4 text-[#1D2023]" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );

  const isShareBlurring = isSelectedForShare && shareExitStage === 'blurring';
  const isShareSwiping = isSelectedForShare && shareExitStage === 'swiping';
  const isShareLocked = shareExitStage !== 'idle';

  // =========================================================================
  // Завершённый абонент (Сохранен / Отказ)
  // =========================================================================
  if (isCompleted) {
    return (
      <div
        id={`card-${lead.id}`}
        className={`bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 border shadow-mts-card transition-all duration-300 ease-out relative ${
          isDeleting || isShareSwiping
            ? 'translate-x-[110%] opacity-0 blur-[4px] pointer-events-none select-none'
            : isShareBlurring
            ? 'blur-[4px] opacity-80 scale-[0.99] pointer-events-none select-none'
            : 'translate-x-0 opacity-100'
        } ${
          isHighlighted
            ? 'border-transparent shadow-lg shadow-[#FF0023]/10'
            : 'border-[#F1F3F5]'
        }`}
      >
        {/* Бесшовный круговой красный шлейф по контуру выбранной карточки (dash + gap = 1000 для непрерывного перехода через углы) */}
        {isHighlighted && (
          <svg
            className="pointer-events-none absolute inset-0 w-full h-full z-30 -scale-x-100 overflow-visible"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="calc(100% - 2px)"
              height="calc(100% - 2px)"
              rx="23"
              fill="none"
              stroke="rgba(255, 0, 35, 0.12)"
              strokeWidth="1.5"
            />
            {[
              { len: 320, opacity: 0.08, width: 2 },
              { len: 260, opacity: 0.14, width: 2 },
              { len: 205, opacity: 0.22, width: 2 },
              { len: 155, opacity: 0.34, width: 2.1 },
              { len: 110, opacity: 0.5, width: 2.2 },
              { len: 70, opacity: 0.7, width: 2.3 },
              { len: 38, opacity: 0.9, width: 2.5 },
              { len: 16, opacity: 1, width: 2.6 },
            ].map((seg) => (
              <rect
                key={seg.len}
                x="1"
                y="1"
                width="calc(100% - 2px)"
                height="calc(100% - 2px)"
                rx="23"
                fill="none"
                pathLength={1000}
                stroke={`rgba(255, 0, 35, ${seg.opacity})`}
                strokeWidth={seg.width}
                strokeLinecap="round"
                strokeDasharray={`${seg.len} ${1000 - seg.len}`}
                className="animate-mts-perimeter-trail"
              />
            ))}
          </svg>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                onClick={handleCopy}
                className="text-base sm:text-lg font-medium text-[#1D2023] tracking-normal cursor-pointer hover:text-[#0077FF] transition-colors"
                title="Нажмите, чтобы скопировать 79XXXXXXXXX"
              >
                {lead.phone}
              </span>

              {/* Кнопка 1: Редактирование (Карандаш) */}
              <button
                type="button"
                onClick={() => setIsEditingInfo(!isEditingInfo)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  isEditingInfo ? 'bg-blue-100 text-[#0077FF]' : 'bg-[#F4F5F7] hover:bg-blue-50 text-[#626C77] hover:text-[#0077FF]'
                }`}
                title="Редактировать номер, город или ссылку"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              {/* Кнопка 2: Копирование номера */}
              <button
                type="button"
                onClick={handleCopy}
                className="w-7 h-7 rounded-lg bg-[#F4F5F7] hover:bg-gray-200 text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                title="Скопировать номер (без скобок)"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Кнопка 3: Ссылка на предложение */}
              {lead.uniqueLink && (
                <a
                  href={lead.uniqueLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#0077FF] flex items-center justify-center transition-colors cursor-pointer"
                  title="Открыть предложение клиенту в CRM"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <span className="text-gray-300">•</span>
              <span className="text-xs text-[#626C77]">{lead.city}</span>
              {lead.notes && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs text-slate-600 max-w-[260px] truncate">{lead.notes}</span>
                </>
              )}
            </div>
          </div>

          {/* Статус и кнопка удаления со свайпом */}
          <div className="flex items-center gap-2 ml-auto">
            {isSaved ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Сохранен
              </span>
            ) : lead.status === 'unreachable' ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                {!lead.isAnsweringMachineForced &&
                (lead.scheduledByAgreedTime || Boolean(lead.notes && lead.notes.trim().length > 0))
                  ? 'Недозвон 3/3 • По времени'
                  : 'Недозвон 3/3 • Авто'}
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#F2F3F7] text-[#56606B] border border-[#DDE1E6]">
                Отказ
              </span>
            )}
          </div>
        </div>

        {/* Инлайн-панель редактирования */}
        {isEditingInfo && renderEditInfoPanel()}
      </div>
    );
  }

  // =========================================================================
  // Лаконичная карточка в очереди:
  // - Строка 1: Абонент, Карандаш, Копировать, Ссылка CRM, Город | Отказ, Сохранен, Удалить
  //   (Без лишних мелких бейджей «Перезвон» и без часов клиента)
  // - Строка 2: Таймер, «Когда перезвонить ?» (кнопка без текста), «Звонков» (стиль МТС) | Заметка
  // =========================================================================
  const hasActiveTimer =
    lead.status !== 'saved' &&
    lead.status !== 'refused' &&
    lead.status !== 'unreachable' &&
    lead.targetCallbackTime !== null;

  return (
    <div
      id={`card-${lead.id}`}
      onClick={() => {
        if (isShareSelectionMode && !isShareLocked && onToggleSelectForShare) {
          onToggleSelectForShare(lead.id);
        }
      }}
      className={`bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 border shadow-mts-card transition-all duration-300 ease-out relative ${
        isDeleting || isShareSwiping
          ? 'translate-x-[110%] opacity-0 blur-[4px] pointer-events-none select-none'
          : isShareBlurring
          ? 'blur-[4px] opacity-80 scale-[0.99] pointer-events-none select-none'
          : 'translate-x-0 opacity-100'
      } ${
        isShareSelectionMode
          ? isShareLocked
            ? 'border-[#F1F3F5] pointer-events-none'
            : 'border-[#F1F3F5] cursor-pointer'
          : isHighlighted
          ? 'border-transparent shadow-lg shadow-[#FF0023]/10'
          : 'border-[#F1F3F5]'
      }`}
    >
      {/* Бесшовный круговой красный шлейф по контуру найденной карточки (dash + gap = 1000 для непрерывного перехода через углы) */}
      {isHighlighted && (
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full z-30 -scale-x-100 overflow-visible"
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="23"
            fill="none"
            stroke="rgba(255, 0, 35, 0.12)"
            strokeWidth="1.5"
          />
          {[
            { len: 320, opacity: 0.08, width: 2 },
            { len: 260, opacity: 0.14, width: 2 },
            { len: 205, opacity: 0.22, width: 2 },
            { len: 155, opacity: 0.34, width: 2.1 },
            { len: 110, opacity: 0.5, width: 2.2 },
            { len: 70, opacity: 0.7, width: 2.3 },
            { len: 38, opacity: 0.9, width: 2.5 },
            { len: 16, opacity: 1, width: 2.6 },
          ].map((seg) => (
            <rect
              key={seg.len}
              x="1"
              y="1"
              width="calc(100% - 2px)"
              height="calc(100% - 2px)"
              rx="23"
              fill="none"
              pathLength={1000}
              stroke={`rgba(255, 0, 35, ${seg.opacity})`}
              strokeWidth={seg.width}
              strokeLinecap="round"
              strokeDasharray={`${seg.len} ${1000 - seg.len}`}
              className="animate-mts-perimeter-trail"
            />
          ))}
        </svg>
      )}
      {/* СТРОКА 1: Данные клиента + Быстрые действия завершения */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Левая группа: Точка выделения (только в режиме передачи), Телефон, кнопки, город */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {isShareSelectionMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelectForShare?.(lead.id);
              }}
              aria-label="Выбрать контакт для передачи"
              className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                isSelectedForShare
                  ? 'bg-[#1D2023] border-[#1D2023] text-white'
                  : 'bg-[#F4F5F7] border-[#D5D8DD] hover:border-[#8C95A0]'
              }`}
            >
              {isSelectedForShare && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
            </button>
          )}

          <span
            onClick={handleCopy}
            className="text-base sm:text-lg font-medium text-[#1D2023] tracking-normal cursor-pointer hover:text-[#0077FF] transition-colors"
            title="Нажмите, чтобы скопировать 79XXXXXXXXX"
          >
            {lead.phone}
          </span>

          {/* Кнопка 1: Редактирование (Карандаш) */}
          <button
            type="button"
            onClick={() => setIsEditingInfo(!isEditingInfo)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isEditingInfo
                ? 'bg-blue-100 text-[#0077FF]'
                : 'bg-[#F4F5F7] hover:bg-blue-50 text-[#626C77] hover:text-[#0077FF]'
            }`}
            title="Редактировать номер, город или ссылку"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          {/* Кнопка 2: Копирование номера */}
          <button
            type="button"
            onClick={handleCopy}
            className="w-7 h-7 rounded-lg bg-[#F4F5F7] hover:bg-gray-200 text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
            title="Скопировать номер (без скобок)"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Кнопка 3: Ссылка CRM */}
          {lead.uniqueLink && (
            <a
              href={lead.uniqueLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#0077FF] flex items-center justify-center transition-colors cursor-pointer"
              title="Открыть предложение клиенту в CRM"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <span className="text-gray-300 hidden sm:inline">•</span>

          <span className="text-xs text-[#626C77] font-medium">{lead.city}</span>

          {/* Значок передачи (1.А — спокойная серая иконка без текста) */}
          {lead.sharedOutToColleague && (
            <span
              className="w-6 h-6 rounded-lg bg-[#F4F5F7] text-[#626C77] inline-flex items-center justify-center shrink-0"
              title="Контакт отправлен коллеге"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          )}
          {(lead.sharedReceivedAt || lead.sharedFromName !== undefined) && (
            <span
              className="w-6 h-6 rounded-lg bg-[#F4F5F7] text-[#626C77] inline-flex items-center justify-center shrink-0"
              title={
                lead.sharedFromName && lead.sharedFromName.trim()
                  ? `Контакт принят от: ${lead.sharedFromName.trim()}`
                  : 'Контакт принят от коллеги'
              }
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        {/* Правая группа наверху: ТОЛЬКО главная кнопка «Сохранен» */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => onUpdateStatus(lead.id, 'saved')}
            className="h-8 px-4 rounded-full bg-[#00B956] hover:bg-[#00A34B] active:scale-[0.98] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Сохранен</span>
          </button>
        </div>
      </div>

      {/* Инлайн-панель редактирования (внутри неё спрятана корзина удаления) */}
      {isEditingInfo && renderEditInfoPanel()}

      {/* СТРОКА 2: Слева — Таймер, «📞→», «Звонков (1/3)» и «Отказ» | Справа свободно — Комментарий */}
      <div className="mt-2.5 pt-2.5 border-t border-[#F1F3F5] flex flex-wrap items-center justify-between gap-3">
        {/* Левая группа: Таймер + перезвон + Звонков + Отказ */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {hasActiveTimer && !remainingTime.isExpired && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-extrabold tabular-nums bg-[#F4F5F7] text-[#1D2023] border border-[#E2E8F0]">
              <Clock className="w-3.5 h-3.5" />
              <span>{remainingTime.formatted}</span>
            </div>
          )}

          {/* Кнопка настройки времени перезвона (БЕЗ ТЕКСТА) */}
          <button
            type="button"
            onClick={() => setShowSchedulePanel(!showSchedulePanel)}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              showSchedulePanel
                ? 'bg-blue-100 text-[#0077FF]'
                : 'bg-[#F4F5F7] hover:bg-blue-50 text-[#626C77] hover:text-[#0077FF]'
            }`}
            title="Когда перезвонить ? (настроить точное время)"
          >
            <PhoneForwarded className="w-3.5 h-3.5" />
          </button>

          {/* Кнопка счётчика перезвонов (от 0/3 до 3/3 -> Недозвон) в строгом стиле МТС */}
          <button
            type="button"
            onClick={() => {
              const currentAttempts = lead.attemptCount ?? 0;
              const nextAttempt = currentAttempts + 1;
              if (nextAttempt >= lead.maxAttempts) {
                setShowSchedulePanel(false);
                onUpdateStatus(lead.id, 'unreachable', {
                  attemptCount: lead.maxAttempts,
                });
              } else {
                const isCallbackCard = isCallbackCardMode();
                let targetIntervalMinutes = lead.timerDurationMinutes || 30;
                if (showSchedulePanel && scheduleMode === 'client_time') {
                  const parsed = parseFlexibleTimeInput(timeInputStr) || { hours: 18, minutes: 0 };
                  const preview = calculateTargetCallbackTimeByClientHour(
                    lead.timezoneUtc,
                    parsed.hours,
                    parsed.minutes
                  );
                  if (preview.minutesFromNow > 0) {
                    targetIntervalMinutes = preview.minutesFromNow;
                  }
                } else {
                  const parsedInputMins = parseFlexibleIntervalInput(intervalInputStr);
                  if (parsedInputMins && parsedInputMins > 0) {
                    targetIntervalMinutes = parsedInputMins;
                  }
                }
                setIntervalInputStr(String(targetIntervalMinutes));
                setShowSchedulePanel(false);
                onUpdateStatus(lead.id, isCallbackCard ? 'callback' : 'answering_machine', {
                  attemptCount: nextAttempt,
                  isClientAgreed: isCallbackCard,
                  customTimerMinutes: targetIntervalMinutes,
                });
              }
            }}
            className="h-7 sm:h-8 px-3.5 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            title={`Зафиксировать выполненный перезвон (шаг: ${
              parseFlexibleIntervalInput(intervalInputStr) || lead.timerDurationMinutes || 30
            } мин, при 3/3 переходит в Недозвон)`}
          >
            <RotateCw className="w-3.5 h-3.5 text-[#626C77]" />
            <span>
              {`Перезвон (${lead.attemptCount ?? 0}/${lead.maxAttempts})`}
            </span>
          </button>

          {/* Кнопка «Отказ» рядом со Звонков */}
          <button
            type="button"
            onClick={() => onUpdateStatus(lead.id, 'refused')}
            className="h-7 sm:h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-all cursor-pointer"
          >
            Отказ
          </button>
        </div>

        {/* Правая часть: Свободная заметка без лишних соседей */}
        <div className="flex items-center gap-1.5 text-xs text-[#626C77] flex-1 justify-end min-w-[200px]">
          {lead.notes ? (
            <button
              type="button"
              onClick={() => setIsEditingNotes(true)}
              className="inline-flex items-center gap-1.5 max-w-full sm:max-w-[520px] lg:max-w-[680px] truncate text-left hover:text-[#0077FF] transition-colors cursor-pointer font-medium"
              title="Нажмите, чтобы изменить заметку"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-[#0077FF]" />
              <span className="truncate">{lead.notes}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingNotes(true)}
              className="text-xs text-[#626C77] hover:text-[#0077FF] font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3" />
              <span>+ Заметка</span>
            </button>
          )}
        </div>
      </div>

      {/* Инлайн-панель настройки перезвона (раскрывается по кнопке с телефонной трубкой) */}
      {showSchedulePanel && (
        <div className="mt-2.5">
          {renderSchedulePanel()}
        </div>
      )}

      {/* Инлайн-редактор заметки */}
      {isEditingNotes && (
        <div className="mt-2.5 p-2.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Добавьте причину ухода, скидку, предложенный тариф..."
            rows={2}
            className="w-full p-2 rounded-lg border border-[#D5D8DD] text-xs text-[#1D2023] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none bg-white"
          />

          {/* Накапливаемые быстрые фразы */}
          <QuickPhrasesPicker
            onSelectPhrase={(phrase) => {
              setNotesText((prev) => (prev.trim() ? `${prev.trim()}. ${phrase}` : phrase));
            }}
          />

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-200/60">
            <button
              type="button"
              onClick={() => {
                setNotesText(lead.notes);
                setIsEditingNotes(false);
              }}
              className="h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-xs font-bold text-[#1D2023] transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSaveNotes}
              title="Сохранить заметку"
              className="h-8 px-4 rounded-full bg-[#EAECEF] hover:bg-[#DDE1E6] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
            >
              <Check className="w-4 h-4 text-[#1D2023]" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
