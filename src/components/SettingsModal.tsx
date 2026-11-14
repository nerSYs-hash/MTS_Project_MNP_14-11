import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  RotateCcw,
  Download,
  Copy,
  Check,
  HelpCircle,
  RotateCw,
  RefreshCw,
  Upload,
  ShieldCheck,
  FileCheck,
  Sliders,
  Database,
  Sparkles,
} from 'lucide-react';
import { TimerSettings, ShiftStats, ClientLead, PushNotificationPosition, PearlAnimationMode } from '../types';
import { playChimeSound, requestNotificationPermission, sendDesktopNotification } from '../utils/audioAlert';
import { generateShiftReportText } from '../utils/storage';
import {
  downloadAsarFile,
  getInstalledAppVersion,
} from '../utils/updateManager';
import {
  loadSenderNameFromStorage,
  saveSenderNameToStorage,
} from '../utils/cardSharing';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TimerSettings;
  onSaveSettings: (settings: TimerSettings) => void;
  stats: ShiftStats;
  leads: ClientLead[];
  onResetShift: () => void;
  onRestoreBackup?: () => boolean;
  onImportLeadsText?: (text: string) => number;
  onOpenGuide?: () => void;
  onOpenReleaseBanner?: () => void;
  isDevMode?: boolean;
}

type SettingsTab = 'interface' | 'animations' | 'notifications' | 'shift' | 'updates';

// Переключатель-тумблер в спокойном графитовом тоне (чтобы не спорить с главной красной кнопкой СОХРАНИТЬ)
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out cursor-pointer focus:outline-none ${
      disabled ? 'opacity-40 cursor-not-allowed' : ''
    } ${checked ? 'bg-[#1D2023]' : 'bg-[#D5D8DD]'}`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-5.5' : 'translate-x-0.5'
      }`}
    />
  </button>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  stats,
  leads,
  onResetShift,
  onRestoreBackup,
  onImportLeadsText,
  onOpenReleaseBanner,
  isDevMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('interface');

  const [collapseDelay, setCollapseDelay] = useState(
    settings.collapseDelayMinutes !== undefined ? settings.collapseDelayMinutes : 3
  );
  const [headerCollapseAnimationEnabled, setHeaderCollapseAnimationEnabled] = useState(
    settings.headerCollapseAnimationEnabled !== false
  );
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled);
  const [volume, setVolume] = useState(settings.volume);
  const [includeWithoutTpInSaved, setIncludeWithoutTpInSaved] = useState(
    settings.includeWithoutTpInSaved !== false
  );
  const [includeEiInSaved, setIncludeEiInSaved] = useState(
    settings.includeEiInSaved !== false
  );
  const [enableNumbersAccounting, setEnableNumbersAccounting] = useState(
    settings.enableNumbersAccounting !== false
  );
  const [kpiFontWeight, setKpiFontWeight] = useState<'normal' | 'medium' | 'semibold' | 'bold'>(
    settings.kpiFontWeight || 'normal'
  );
  const [enablePushNotifications, setEnablePushNotifications] = useState(
    settings.enablePushNotifications !== false
  );
  const [pushPosition, setPushPosition] = useState<PushNotificationPosition>(
    settings.pushPosition || 'top-right'
  );
  const [autoClearShiftAtMidnight, setAutoClearShiftAtMidnight] = useState(
    settings.autoClearShiftAtMidnight !== false
  );
  const [pearlAnimationMode, setPearlAnimationMode] = useState<PearlAnimationMode>(
    settings.pearlAnimationMode || 'auto'
  );
  const [notificationsGranted, setNotificationsGranted] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  });

  const [reportCopied, setReportCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false);
  const [showKpiFontTooltip, setShowKpiFontTooltip] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);
  const [showImportBox, setShowImportBox] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResultMsg, setImportResultMsg] = useState<string | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  const [isDownloadingAsar, setIsDownloadingAsar] = useState(false);
  const [isDownloadingAppAsar, setIsDownloadingAppAsar] = useState(false);
  const [senderName, setSenderName] = useState<string>(() => loadSenderNameFromStorage());

  // Синхронизация полей настроек при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      setCollapseDelay(
        settings.collapseDelayMinutes !== undefined ? settings.collapseDelayMinutes : 3
      );
      setHeaderCollapseAnimationEnabled(settings.headerCollapseAnimationEnabled !== false);
      setSoundEnabled(settings.soundEnabled);
      setVolume(settings.volume);
      setIncludeWithoutTpInSaved(settings.includeWithoutTpInSaved !== false);
      setIncludeEiInSaved(settings.includeEiInSaved !== false);
      setEnableNumbersAccounting(settings.enableNumbersAccounting !== false);
      setKpiFontWeight(settings.kpiFontWeight || 'normal');
      setEnablePushNotifications(settings.enablePushNotifications !== false);
      setPushPosition(settings.pushPosition || 'top-right');
      setAutoClearShiftAtMidnight(settings.autoClearShiftAtMidnight !== false);
      setPearlAnimationMode(settings.pearlAnimationMode || 'auto');
      setSenderName(loadSenderNameFromStorage());
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationsGranted(Notification.permission === 'granted');
      }
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveSenderNameToStorage(senderName.trim());
    onSaveSettings({
      ...settings,
      collapseDelayMinutes: collapseDelay,
      headerCollapseAnimationEnabled,
      soundEnabled,
      volume,
      includeWithoutTpInSaved,
      includeEiInSaved,
      enableNumbersAccounting,
      kpiFontWeight,
      enablePushNotifications,
      pushPosition,
      autoClearShiftAtMidnight,
      pearlAnimationMode,
    });
    onClose();
  };

  const handleTestSound = () => {
    playChimeSound(volume);
  };

  const handleToggleNotifications = async (enable: boolean) => {
    if (enable) {
      const granted = await requestNotificationPermission();
      setNotificationsGranted(granted);
    } else {
      setNotificationsGranted(false);
    }
  };

  const handleCopyReport = () => {
    const reportText = generateShiftReportText(stats, leads);
    navigator.clipboard.writeText(reportText);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2000);
  };

  const handleDownloadReport = () => {
    const reportText = generateShiftReportText(stats, leads);
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MTS_MNP_Report_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const triggerTestPush = (targetPos: PushNotificationPosition) => {
    window.dispatchEvent(
      new CustomEvent('mts-set-push-position', {
        detail: { position: targetPos },
      })
    );
    window.dispatchEvent(
      new CustomEvent('mts-inapp-toast', {
        detail: {
          id: 'pos-test-' + Date.now(),
          title: 'Требуется исходящий вызов',
          phone: '+7 (921) 987-65-43',
          attempt: 1,
          maxAttempts: 3,
          region: 'г. Санкт-Петербург и Ленинградская область',
          position: targetPos,
          timestamp: Date.now(),
        },
      })
    );
  };

  const installedVersion = getInstalledAppVersion();

  const weightLabel =
    kpiFontWeight === 'bold'
      ? 'Жирный'
      : kpiFontWeight === 'semibold'
      ? 'П-жирный'
      : kpiFontWeight === 'medium'
      ? 'Средний'
      : 'Обычный';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-[#F4F5F7] rounded-3xl max-w-3xl w-full border border-[#EBECEF] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Шапка модального окна */}
        <div className="px-6 py-4 border-b border-[#EBECEF] bg-white shrink-0 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#1D2023] font-mts-extended">
              Настройки рабочего места
            </h3>
            <p className="text-xs text-[#626C77] mt-0.5">
              Выберите нужный раздел на карточках ниже для настройки параметров
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-[#F4F5F7] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Основная область настроек */}
        <div className="overflow-y-auto p-5 flex-1 space-y-4">
          {/* КОМПАКТНЫЕ КАРТОЧКИ-ВКЛАДКИ */}
          <div className={`grid grid-cols-2 ${isDevMode ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-2.5`}>
            {/* Карточка темы 1: ИНТЕРФЕЙС */}
            <button
              type="button"
              onClick={() => setActiveTab('interface')}
              className={`text-left rounded-2xl p-3 bg-white border transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[76px] shadow-mts-card hover:shadow-mts-hover ${
                activeTab === 'interface'
                  ? 'border-[#1D2023] ring-1 ring-[#1D2023]/10'
                  : 'border-[#F1F3F5]'
              }`}
            >
              <div className="flex items-center justify-between w-full gap-1">
                <span className="text-[11px] font-bold text-[#1D2023] uppercase tracking-wider truncate">
                  Интерфейс
                </span>
                <div className="w-6.5 h-6.5 rounded-full bg-blue-50 text-[#0077FF] flex items-center justify-center shrink-0">
                  <Sliders className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="text-[11px] text-[#626C77] mt-1.5 truncate">
                Ожидание: <strong className="text-[#1D2023]">{collapseDelay > 0 ? `${collapseDelay} мин` : 'Выкл'}</strong>
              </div>
            </button>

            {/* Карточка темы 2 (только в Dev-режиме): АНИМАЦИИ ЖЕМЧУЖИНЫ */}
            {isDevMode && (
              <button
                type="button"
                onClick={() => setActiveTab('animations')}
                className={`text-left rounded-2xl p-3 bg-white border transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[76px] shadow-mts-card hover:shadow-mts-hover ${
                  activeTab === 'animations'
                    ? 'border-[#1D2023] ring-1 ring-[#1D2023]/10'
                    : 'border-[#F1F3F5]'
                }`}
              >
                <div className="flex items-center justify-between w-full gap-1">
                  <span className="text-[11px] font-bold text-[#1D2023] uppercase tracking-wider truncate">
                    Анимации
                  </span>
                  <div className="w-6.5 h-6.5 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="text-[11px] text-[#626C77] mt-1.5 truncate">
                  Режим:{' '}
                  <strong className="text-[#1D2023]">
                    {pearlAnimationMode === 'loop_horiz_spin'
                      ? '3D-вращение'
                      : pearlAnimationMode === 'loop_multi_orbits'
                      ? 'Орбиты'
                      : pearlAnimationMode === 'loop_flight'
                      ? 'Облёт'
                      : 'Авто'}
                  </strong>
                </div>
              </button>
            )}

            {/* Карточка темы 2: ЗВУК И PUSH */}
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`text-left rounded-2xl p-3.5 bg-white border transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[78px] shadow-mts-card hover:shadow-mts-hover ${
                activeTab === 'notifications'
                  ? 'border-[#1D2023] ring-1 ring-[#1D2023]/10'
                  : 'border-[#F1F3F5]'
              }`}
            >
              <div className="flex items-center justify-between w-full gap-1">
                <span className="text-[11px] font-bold text-[#1D2023] uppercase tracking-wider truncate">
                  Звук и Push
                </span>
                <div className="w-7 h-7 rounded-full bg-emerald-50 text-[#00B956] flex items-center justify-center shrink-0">
                  <Bell className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="text-[11px] text-[#626C77] mt-1.5 truncate">
                Push: <strong className="text-[#1D2023]">{enablePushNotifications ? 'Вкл' : 'Выкл'}</strong> • Звук: <strong className="text-[#1D2023]">{soundEnabled ? `${Math.round(volume * 100)}%` : 'Выкл'}</strong>
              </div>
            </button>

            {/* Карточка темы 3: ДАННЫЕ */}
            <button
              type="button"
              onClick={() => setActiveTab('shift')}
              className={`text-left rounded-2xl p-3.5 bg-white border transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[78px] shadow-mts-card hover:shadow-mts-hover ${
                activeTab === 'shift'
                  ? 'border-[#1D2023] ring-1 ring-[#1D2023]/10'
                  : 'border-[#F1F3F5]'
              }`}
            >
              <div className="flex items-center justify-between w-full gap-1">
                <span className="text-[11px] font-bold text-[#1D2023] uppercase tracking-wider truncate">
                  Данные
                </span>
                <div className="w-7 h-7 rounded-full bg-[#FFF0F2] text-[#FF0023] flex items-center justify-center shrink-0">
                  <Database className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="text-[11px] text-[#626C77] mt-1.5 truncate">
                Автоочистка 00:00: <strong className="text-[#1D2023]">{autoClearShiftAtMidnight ? 'Вкл' : 'Выкл'}</strong>
              </div>
            </button>

            {/* Карточка темы 4: ОБНОВЛЕНИЯ */}
            <button
              type="button"
              onClick={() => setActiveTab('updates')}
              className={`text-left rounded-2xl p-3.5 bg-white border transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[78px] shadow-mts-card hover:shadow-mts-hover ${
                activeTab === 'updates'
                  ? 'border-[#1D2023] ring-1 ring-[#1D2023]/10'
                  : 'border-[#F1F3F5]'
              }`}
            >
              <div className="flex items-center justify-between w-full gap-1">
                <span className="text-[11px] font-bold text-[#1D2023] uppercase tracking-wider truncate">
                  Обновления
                </span>
                <div className="w-7 h-7 rounded-full bg-gray-100 text-[#1D2023] flex items-center justify-center shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="text-[11px] text-[#626C77] mt-1.5 truncate">
                Версия <strong className="text-[#1D2023]">v{installedVersion}</strong> <span className="text-[#00B956] font-semibold">• активна</span>
              </div>
            </button>
          </div>

          {/* СОДЕРЖИМОЕ РАЗДЕЛОВ (секции статичны, без анимации движения и без круглых иконок) */}
          {/* РАЗДЕЛ 1: ИНТЕРФЕЙС И KPI */}
          {activeTab === 'interface' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Карточка 1: Режим ожидания */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider">
                      Режим ожидания
                    </span>
                    <div
                      className="relative flex items-center"
                      onMouseEnter={() => setShowCollapseTooltip(true)}
                      onMouseLeave={() => setShowCollapseTooltip(false)}
                    >
                      <button
                        type="button"
                        onClick={() => setShowCollapseTooltip((v) => !v)}
                        className="text-[#8C95A0] hover:text-[#1D2023] cursor-pointer transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>

                      {showCollapseTooltip && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 p-2.5 rounded-xl bg-[#1D2023] text-white text-[11px] font-normal leading-tight shadow-xl z-50 pointer-events-none">
                          При неактивности очередь плавно сворачивается в центр, а при наступлении звонка 00:00 мгновенно разворачивается обратно.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] space-y-2.5">
                  {/* Тумблер и текст строго на одном уровне по сетке */}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#626C77] font-medium">
                      Автосворачивание в центр при простое
                    </span>
                    <ToggleSwitch
                      checked={collapseDelay > 0}
                      onChange={(enabled) => setCollapseDelay(enabled ? 3 : 0)}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#626C77] font-medium">Таймер:</span>
                    {collapseDelay > 0 ? (
                      <div className="flex items-center gap-1 p-0.5 bg-[#F4F5F7] rounded-xl border border-[#EBECEF]">
                        {[1, 2, 3, 5, 10].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setCollapseDelay(mins)}
                            className={`h-6 px-2.5 rounded-lg text-[11px] transition-colors cursor-pointer ${
                              collapseDelay === mins
                                ? 'bg-white text-[#1D2023] font-bold shadow-2xs'
                                : 'text-[#626C77] hover:text-[#1D2023] font-semibold'
                            }`}
                          >
                            {mins}м
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] font-medium text-[#8C95A0]">Отключено</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Карточка 2: Типографика KPI (с живым предпросмотром цифр, чтобы убрать пустую дыру) */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider">
                      Типографика KPI
                    </span>
                    <div
                      className="relative flex items-center"
                      onMouseEnter={() => setShowKpiFontTooltip(true)}
                      onMouseLeave={() => setShowKpiFontTooltip(false)}
                    >
                      <button
                        type="button"
                        onClick={() => setShowKpiFontTooltip((v) => !v)}
                        className="text-[#8C95A0] hover:text-[#1D2023] cursor-pointer transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>

                      {showKpiFontTooltip && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 p-2.5 rounded-xl bg-[#1D2023] text-white text-[11px] font-normal leading-tight shadow-xl z-50 pointer-events-none">
                          Толщина цифр на карточках главного экрана (Звонки, Сохранение, Конверсия, Ожидание).
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#626C77] font-medium">
                      Начертание цифр:
                    </span>
                    <span
                      className={`text-sm text-[#1D2023] font-mts-compact tabular-nums ${
                        kpiFontWeight === 'bold'
                          ? 'font-bold'
                          : kpiFontWeight === 'semibold'
                          ? 'font-semibold'
                          : kpiFontWeight === 'medium'
                          ? 'font-medium'
                          : 'font-normal'
                      }`}
                    >
                      {stats.totalCallsCount} зв. • {stats.conversionRate.toFixed(0)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-4 p-0.5 bg-[#F4F5F7] rounded-xl gap-1 border border-[#EBECEF]">
                    {[
                      { key: 'normal', label: 'Обычный' },
                      { key: 'medium', label: 'Средний' },
                      { key: 'semibold', label: 'П-жирный' },
                      { key: 'bold', label: 'Жирный' },
                    ].map((w) => (
                      <button
                        key={w.key}
                        type="button"
                        onClick={() => setKpiFontWeight(w.key as any)}
                        className={`h-6 px-1.5 rounded-lg text-[11px] transition-colors cursor-pointer truncate ${
                          kpiFontWeight === w.key
                            ? 'bg-white text-[#1D2023] shadow-2xs font-bold'
                            : 'text-[#626C77] hover:text-[#1D2023] font-semibold'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Карточка 3: Формула сохранений (без лишнего подзаголовка) */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                    Формула сохранений
                  </span>
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#626C77] font-medium">
                      Учитывать «Без смены ТП»
                    </span>
                    <ToggleSwitch
                      checked={includeWithoutTpInSaved}
                      onChange={setIncludeWithoutTpInSaved}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#626C77] font-medium">
                      Учитывать «ЕИ» (Единичный инцидент)
                    </span>
                    <ToggleSwitch
                      checked={includeEiInSaved}
                      onChange={setIncludeEiInSaved}
                    />
                  </div>
                </div>
              </div>

              {/* Карточка 4: Элементы экрана (без лишнего подзаголовка) */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                    Элементы экрана
                  </span>
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#626C77] font-medium">
                      Строка и журнал «Учёт номеров»
                    </span>
                    <ToggleSwitch
                      checked={enableNumbersAccounting}
                      onChange={setEnableNumbersAccounting}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#626C77] font-medium">
                      Анимация скрытия иконок шапки
                    </span>
                    <ToggleSwitch
                      checked={headerCollapseAnimationEnabled}
                      onChange={setHeaderCollapseAnimationEnabled}
                    />
                  </div>
                  <div className="pt-2 border-t border-[#F1F3F5] flex items-center justify-between gap-2">
                    <span className="text-xs text-[#626C77] font-medium shrink-0">
                      Имя при передаче:
                    </span>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Имя / смена (необяз.)"
                      maxLength={32}
                      className="h-7 w-40 px-2.5 rounded-lg bg-[#F4F5F7] border border-[#EBECEF] text-xs font-medium text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none focus:bg-white focus:border-[#B8C0CC] transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* РАЗДЕЛ (только в Dev-режиме): АНИМАЦИИ ЖЕМЧУЖИНЫ */}
          {isDevMode && activeTab === 'animations' && (
            <div className="space-y-3.5">
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#F1F3F5] shadow-mts-card space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                      Анимации свободной Жемчужины (Зацикливание)
                    </span>
                    <p className="text-xs text-[#626C77] mt-1 leading-relaxed">
                      Выберите режим вращения капель, когда Жемчужина откреплена от края рабочей области. Капли двигаются асинхронно и непрерывно меняют траекторию в реальном времени. Анимации у края рабочей области работают по своим правилам и здесь не затрагиваются.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    {
                      key: 'auto' as PearlAnimationMode,
                      title: 'Автоматический цикл (По очереди)',
                      subtitle: 'Плавная смена всех трёх свободных анимаций по расписанию или по клику на Жемчужину',
                      badge: 'По умолчанию',
                    },
                    {
                      key: 'loop_horiz_spin' as PearlAnimationMode,
                      title: 'Зациклить: 3D-вращение капель',
                      subtitle: 'Непрерывное объёмное вращение вокруг Жемчужины с асинхронной случайной сменой орбит и наклона',
                      badge: 'Цикл 3D',
                    },
                    {
                      key: 'loop_multi_orbits' as PearlAnimationMode,
                      title: 'Зациклить: Орбитальные кольца',
                      subtitle: 'Капли скользят строго по прорисованным кольцам-орбитам (пропуская линии сквозь себя) с живой сменой скорости',
                      badge: 'Цикл орбит',
                    },
                    {
                      key: 'loop_flight' as PearlAnimationMode,
                      title: 'Зациклить: Поглощение и облёт',
                      subtitle: 'Жемчужина по очереди втягивает капли внутрь себя, совершает плавный вираж со случайной траекторией и выпускает их',
                      badge: 'Цикл полёта',
                    },
                  ].map((option) => {
                    const isSelected = pearlAnimationMode === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setPearlAnimationMode(option.key)}
                        className={`text-left rounded-2xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isSelected
                            ? 'bg-[#F8FAFC] border-[#1D2023] ring-1 ring-[#1D2023]/15 shadow-xs'
                            : 'bg-white border-[#EBECEF] hover:border-[#D0D5DD]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#1D2023]">
                            {option.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                              isSelected
                                ? 'bg-[#1D2023] text-white'
                                : 'bg-[#F4F5F7] text-[#626C77]'
                            }`}
                          >
                            {option.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#626C77] leading-snug">
                          {option.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* РАЗДЕЛ 2: ЗВУК И PUSH */}
          {activeTab === 'notifications' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Карточка 1: Всплывающие Push-уведомления (без бейджа Дублирование 00:00, без кнопки Проверить Push, серый выбор позиций) */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                      Всплывающие Push-уведомления (Toast)
                    </span>
                    <p className="text-xs text-[#626C77] mt-1">
                      Всплывающая карточка поверх рабочего места при наступлении времени звонка
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={enablePushNotifications}
                    onChange={setEnablePushNotifications}
                  />
                </div>

                {enablePushNotifications && (
                  <div className="pt-3 mt-3 border-t border-[#F1F3F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-medium text-[#626C77]">
                      Точка появления на экране:
                    </span>

                    {/* Чистая схема выбора направления (5 позиций без визуального шума стрелок) */}
                    <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F4F5F7] rounded-xl border border-[#EBECEF]">
                      {[
                        { key: 'top-left', label: 'Сверху слева', short: 'Слева сверху' },
                        { key: 'top-center', label: 'По центру сверху', short: 'По центру' },
                        { key: 'top-right', label: 'Сверху справа', short: 'Справа сверху' },
                        { key: 'center-right', label: 'Справа по центру', short: 'Справа' },
                        { key: 'bottom-right', label: 'Снизу справа', short: 'Справа снизу' },
                      ].map((pos) => {
                        const isSelected = pushPosition === pos.key;
                        return (
                          <button
                            key={pos.key}
                            type="button"
                            title={pos.label}
                            onClick={() => {
                              const newPos = pos.key as PushNotificationPosition;
                              setPushPosition(newPos);
                              triggerTestPush(newPos);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-white text-[#1D2023] font-bold shadow-2xs'
                                : 'text-[#626C77] hover:text-[#1D2023] font-semibold'
                            }`}
                          >
                            {pos.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Карточка 2: Звуковой сигнал 00:00 */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                      Звуковой сигнал 00:00
                    </span>
                    <p className="text-xs text-[#626C77] mt-1">
                      Мелодия при наступлении перезвона
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleTestSound}
                      title="Прослушать сигнал"
                      className="h-7 px-3 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Тест
                    </button>
                    <ToggleSwitch checked={soundEnabled} onChange={setSoundEnabled} />
                  </div>
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] flex items-center gap-3">
                  <span className="text-xs text-[#626C77] font-medium shrink-0">Громкость:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="flex-1 accent-[#1D2023] cursor-pointer h-1.5 bg-gray-200 rounded-lg"
                  />
                  <span className="text-xs font-bold text-[#1D2023] w-9 text-right tabular-nums shrink-0">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </div>

              {/* Карточка 3: Системные уведомления ОС / браузера */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                      Уведомления Windows / ОС
                    </span>
                    <p className="text-xs text-[#626C77] mt-1">
                      Нативные баннеры при свёрнутом окне
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={notificationsGranted}
                    onChange={handleToggleNotifications}
                  />
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] flex items-center justify-between">
                  <span className="text-xs text-[#626C77]">
                    {notificationsGranted ? 'Разрешение активно' : 'Требуется разрешение браузера'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      sendDesktopNotification({
                        title: 'Требуется исходящий вызов',
                        phone: '+7 (916) 123-45-67',
                        attempt: 1,
                        maxAttempts: 3,
                        region: 'Москва',
                      })
                    }
                    className="h-7 px-3 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Проверить баннер
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* РАЗДЕЛ 3: СМЕНА И ДАННЫЕ */}
          {activeTab === 'shift' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Карточка 1: Отчёт смены */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                    Отчёт смены
                  </span>
                  <p className="text-xs text-[#626C77] mt-1">
                    Звонков: {stats.totalCallsCount} • Сохранено: {stats.savedCount} ({stats.conversionRate.toFixed(1)}%)
                  </p>
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyReport}
                    className="flex-1 h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {reportCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{reportCopied ? 'Скопировано!' : 'Скопировать отчёт'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadReport}
                    className="h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[#626C77]" />
                    <span>.txt</span>
                  </button>
                </div>
              </div>

              {/* Карточка 2: Завершение, автоочистка после 00:00 и сброс смены */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                      Автоочистка смены (00:00)
                    </span>
                    <p className="text-xs text-[#626C77] mt-1">
                      Ежедневная очистка карточек KPI и очереди после 00:00
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={autoClearShiftAtMidnight}
                    onChange={setAutoClearShiftAtMidnight}
                  />
                </div>

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] flex items-center justify-between">
                  {confirmReset ? (
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="text-xs text-[#E30613] font-bold">Подтвердить сброс?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onResetShift();
                            setConfirmReset(false);
                          }}
                          className="h-8 px-4 bg-[#FF0023] hover:bg-[#E30613] text-white rounded-full text-xs font-bold cursor-pointer transition-colors"
                        >
                          Да, сбросить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmReset(false)}
                          className="h-8 px-4 bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] rounded-full text-xs font-bold cursor-pointer transition-colors"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="w-full h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-rose-50 text-[#1D2023] hover:text-[#FF0023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#626C77]" />
                      <span>Сбросить счётчики смены сейчас</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Карточка 3: Резервные копии и восстановление заявок */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between sm:col-span-2">
                <div>
                  <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                    Резервные копии и импорт очереди
                  </span>
                  <p className="text-xs text-[#626C77] mt-1">
                    Мгновенный возврат карточек из авто-бэкапа или пакетная загрузка номеров
                  </p>
                </div>

                {restoreFeedback && (
                  <div className="mt-2.5 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{restoreFeedback}</span>
                  </div>
                )}

                {importResultMsg && (
                  <div className="mt-2.5 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                    {importResultMsg}
                  </div>
                )}

                {showImportBox && (
                  <div className="mt-3 p-3 bg-[#F4F5F7] rounded-2xl border border-[#D5D8DD] space-y-2">
                    <label className="text-[11px] font-bold text-[#1D2023] block">
                      Вставьте номера абонентов (каждый с новой строки или через запятую):
                    </label>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="+7 (912) 000-00-00&#10;+79270000000&#10;89991234567..."
                      rows={3}
                      className="w-full p-2 rounded-xl bg-white border border-[#D5D8DD] text-xs font-mono text-[#1D2023] focus:border-[#1D2023] focus:outline-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#626C77]">
                        Регионы и таймеры определятся автоматически
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowImportBox(false);
                            setImportText('');
                          }}
                          className="h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-xs font-bold text-[#1D2023] transition-colors cursor-pointer"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (onImportLeadsText && importText.trim()) {
                              const count = onImportLeadsText(importText);
                              setImportResultMsg(`Успешно добавлено ${count} заявок в очередь!`);
                              setImportText('');
                              setShowImportBox(false);
                              setTimeout(() => setImportResultMsg(null), 3000);
                            }
                          }}
                          className="h-8 px-4 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          Импортировать
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2.5 mt-3 border-t border-[#F1F3F5] flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onRestoreBackup) {
                        const ok = onRestoreBackup();
                        setRestoreFeedback(
                          ok
                            ? 'Рабочие заявки успешно восстановлены из резервной копии!'
                            : 'Резервная копия пуста или ещё не была создана.'
                        );
                        setTimeout(() => setRestoreFeedback(null), 3500);
                      }
                    }}
                    className="h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-[#626C77]" />
                    <span>Восстановить из авто-бэкапа</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowImportBox((v) => !v)}
                    className="h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#626C77]" />
                    <span>Импорт номеров списком (Excel / CRM)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* РАЗДЕЛ 4: ОБНОВЛЕНИЯ УРМ (ТОЛЬКО ЧЕРЕЗ UPDATE.ASAR / APP.ASAR) */}
          {activeTab === 'updates' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Карточка 1: Скачивание архива обновления update.asar */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider">
                      Пакеты УРМ (ASAR)
                    </span>
                    <span className="text-[11px] font-semibold text-[#626C77]">
                      v{installedVersion}
                    </span>
                  </div>
                  <p className="text-xs text-[#626C77] mt-1">
                    Скачивание бинарного архива для обновления настольной версии (.exe)
                  </p>
                </div>

                <div className="my-3 space-y-2">
                  <button
                    type="button"
                    disabled={isDownloadingAsar}
                    onClick={async () => {
                      setIsDownloadingAsar(true);
                      try {
                        await downloadAsarFile('update.asar');
                        setDownloadDone(true);
                        setTimeout(() => setDownloadDone(false), 3000);
                      } catch (e) {
                        console.error('Ошибка скачивания update.asar:', e);
                      } finally {
                        setIsDownloadingAsar(false);
                      }
                    }}
                    className={`w-full h-9 px-4 rounded-full text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs ${
                      downloadDone
                        ? 'bg-[#00B956] hover:bg-[#00A34B]'
                        : 'bg-[#1D2023] hover:bg-[#2F3338]'
                    } ${isDownloadingAsar ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    {downloadDone ? (
                      <>
                        <FileCheck className="w-4 h-4 text-white" />
                        <span>Скачано! (update.asar)</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-white" />
                        <span>
                          {isDownloadingAsar ? 'Скачивание...' : 'Скачать update.asar (рядом с .exe)'}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isDownloadingAppAsar}
                    onClick={async () => {
                      setIsDownloadingAppAsar(true);
                      try {
                        await downloadAsarFile('app.asar');
                      } catch (e) {
                        console.error('Ошибка скачивания app.asar:', e);
                      } finally {
                        setIsDownloadingAppAsar(false);
                      }
                    }}
                    className={`w-full h-9 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      isDownloadingAppAsar ? 'opacity-70 cursor-wait' : ''
                    }`}
                  >
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    <span>
                      {isDownloadingAppAsar ? 'Скачивание...' : 'Скачать app.asar (в папку resources)'}
                    </span>
                  </button>
                </div>

                <div className="pt-2 border-t border-[#F1F3F5] flex items-center justify-between text-[11px] text-[#8C95A0]">
                  <span>Автообновление при старте .exe</span>
                  <span className="text-[#00B956] font-semibold">Актуально</span>
                </div>
              </div>

              {/* Карточка 2: Инструкция по установке update.asar */}
              <div className="bg-white rounded-3xl p-4 border border-[#F1F3F5] shadow-mts-card flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1D2023] uppercase tracking-wider block">
                    Как установить обновление
                  </span>
                  <p className="text-xs text-[#626C77] mt-1">
                    Обновление рабочего места через архив ASAR
                  </p>
                </div>

                <div className="my-3 p-3 rounded-2xl bg-[#F8F9FA] border border-[#EBECEF] text-[11px] text-[#626C77] leading-relaxed space-y-1.5">
                  <p>
                    <strong className="text-[#1D2023]">1.</strong> Скачайте файл{' '}
                    <strong className="text-[#1D2023]">update.asar</strong> кнопкой слева.
                  </p>
                  <p>
                    <strong className="text-[#1D2023]">2.</strong> Положите{' '}
                    <strong className="text-[#1D2023]">update.asar</strong> в одну папку рядом с файлом программы{' '}
                    <strong className="text-[#1D2023]">.exe</strong> (либо замените{' '}
                    <strong className="text-[#1D2023]">app.asar</strong> в папке{' '}
                    <strong className="text-[#1D2023]">resources</strong>).
                  </p>
                  <p>
                    <strong className="text-[#1D2023]">3.</strong> Перезапустите программу — новая версия применится автоматически с сохранением всех ваших карточек и настроек.
                  </p>
                </div>

                <div className="pt-2 border-t border-[#F1F3F5] flex items-center justify-between gap-2 text-[11px] text-[#8C95A0]">
                  <span>Накопительный пакет v{installedVersion}</span>
                  {onOpenReleaseBanner && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenReleaseBanner();
                      }}
                      className="text-[#1D2023] hover:text-[#0077FF] font-bold transition-colors cursor-pointer"
                    >
                      Что нового в v{installedVersion} →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Нижняя панель кнопок */}
        <div className="px-6 py-3.5 border-t border-[#EBECEF] flex items-center justify-end gap-2.5 shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-6 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="h-10 px-7 rounded-full bg-[#FF0023] hover:bg-[#E30613] active:scale-[0.98] text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
