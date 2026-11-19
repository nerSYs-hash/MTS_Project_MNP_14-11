import React, { useState } from 'react';
import { Plus, Minus, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { ShiftStats } from '../types';
import { formatContactsCount, formatSubscribersCount } from '../utils/pluralize';

interface KpiDashboardProps {
  stats: ShiftStats;
  activeTimersCount: number;
  dueTimersCount: number;
  autoCallbacksCount?: number;
  clientAgreedCallbacksCount?: number;
  onAdjustCalls: (delta: number) => void;
  onAdjustSaved: (delta: number) => void;
  onAdjustSavedWithoutTpChange?: (delta: number) => void;
  onAdjustSavedWithEi?: (delta: number) => void;
  onManualSzDeductWithoutTp?: () => void;
  onManualSzDeductEi?: () => void;
  onManualSzAddWithoutTp?: () => void;
  onManualSzAddEi?: () => void;
  onFocusDueQueue?: () => void;
  kpiFontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  isCallsPulsing?: boolean;
  isSavedPulsing?: boolean;
  includeWithoutTpInSaved?: boolean;
  includeEiInSaved?: boolean;
}

export const KpiDashboard: React.FC<KpiDashboardProps> = ({
  stats,
  activeTimersCount,
  dueTimersCount,
  autoCallbacksCount = 0,
  clientAgreedCallbacksCount = 0,
  onAdjustCalls,
  onAdjustSaved,
  onAdjustSavedWithoutTpChange,
  onAdjustSavedWithEi,
  onFocusDueQueue,
  kpiFontWeight = 'normal',
  isCallsPulsing = false,
  isSavedPulsing = false,
}) => {
  const [showSyncTooltip, setShowSyncTooltip] = useState(false);
  const [isSavedTabOpen, setIsSavedTabOpen] = useState(false);

  const weightClass =
    kpiFontWeight === 'bold'
      ? 'font-bold'
      : kpiFontWeight === 'semibold'
      ? 'font-semibold'
      : kpiFontWeight === 'medium'
      ? 'font-medium'
      : 'font-normal';

  // Вычисляем процент конверсии
  const conversionDisplay = stats.totalCallsCount > 0 ? stats.conversionRate.toFixed(1) : '0.0';

  const hasQueue = activeTimersCount > 0 || dueTimersCount > 0;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
      {/* 1. ВСЕГО ИСХОДЯЩИХ ЗВОНКОВ ЗА СМЕНУ */}
      <div className="rounded-3xl p-5 shadow-mts-card hover:shadow-mts-hover hover:-translate-y-1 flex flex-col justify-between h-[148px] relative transition-all duration-300 ease-out bg-white border border-[#F1F3F5]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[#626C77] uppercase tracking-wider">
            Звонки
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl sm:text-4xl ${weightClass} text-[#1D2023] tracking-tight font-mts-compact transition-transform ${
                isCallsPulsing ? 'animate-value-pop' : ''
              }`}
            >
              {stats.totalCallsCount}
            </span>
            <span className="text-xs text-[#626C77] font-normal">
              {formatContactsCount(stats.totalCallsCount)}
            </span>
          </div>

          {/* Быстрые кнопки ручного - / + одинакового аккуратного размера */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAdjustCalls(-1)}
              title="Отнять 1 звонок (если ошиблись)"
              className="w-8 h-8 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAdjustCalls(1)}
              title="Добавить звонок (+)"
              className="w-8 h-8 rounded-full bg-[#F5F6F8] hover:bg-blue-50 text-[#1D2023] hover:text-[#0077FF] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Нижняя строчка в едином ритме с остальными KPI-карточками */}
        <div className="pt-2 border-t border-[#F1F3F5] flex items-center justify-between text-xs text-[#8C95A0]">
          <span>Исходящие за смену</span>
        </div>
      </div>

      {/* 2. СОХРАНЕНИЕ С ШТОРКОЙ ДЕТАЛИЗАЦИИ (открывается кликом по нижней строке Без ТП • ЕИ) */}
      <div
        onMouseLeave={() => setIsSavedTabOpen(false)}
        className="rounded-3xl p-5 shadow-mts-card hover:shadow-mts-hover hover:-translate-y-1 flex flex-col justify-between h-[148px] relative transition-all duration-300 ease-out bg-white border border-[#F1F3F5] overflow-hidden"
      >
        {/* Лицевая часть карточки */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[#626C77] uppercase tracking-wider">
            Сохранение
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl sm:text-4xl ${weightClass} text-[#1D2023] tracking-tight font-mts-compact transition-transform ${
                isSavedPulsing ? 'animate-value-pop' : ''
              }`}
            >
              {stats.savedCount}
            </span>
            <span className="text-xs text-[#626C77] font-normal">
              {formatSubscribersCount(stats.savedCount)}
            </span>
          </div>

          {/* Быстрые кнопки ручного - / + одинакового аккуратного размера */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAdjustSaved(-1)}
              title="Отнять 1 сохранение"
              className="w-8 h-8 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAdjustSaved(1)}
              title="Добавить сохранение (+)"
              className="w-8 h-8 rounded-full bg-[#F5F6F8] hover:bg-[#E8F8EF] text-[#1D2023] hover:text-[#00B956] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Интерактивная нижняя строчка: клик открывает детализацию Без ТП и ЕИ (без лишнего козырька сверху) */}
        <button
          type="button"
          onClick={() => setIsSavedTabOpen(true)}
          title="Нажмите для настройки «Без смены ТП» и «Единичный инцидент»"
          className="pt-2 border-t border-[#F1F3F5] flex items-center justify-between w-full text-xs text-[#626C77] hover:text-[#1D2023] transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8C95A0] inline-block" />
            <span>
              Без ТП: <strong className="text-[#1D2023]">{stats.savedWithoutTpChange || 0}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8C95A0] inline-block" />
            <span>
              ЕИ: <strong className="text-[#1D2023]">{stats.savedWithEi || 0}</strong>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#8C95A0] group-hover:text-[#1D2023] transition-colors ml-0.5" />
          </div>
        </button>

        {/* ШТОРКА ДЕТАЛИЗАЦИИ (чистая, без нумерации 1) и 2) и без лишней нижней ручки) */}
        <div
          className={`absolute inset-0 z-20 bg-white rounded-3xl p-3.5 flex flex-col justify-between border border-[#EBECEF] shadow-xl transition-all duration-300 ease-out ${
            isSavedTabOpen
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : '-translate-y-full opacity-0 pointer-events-none'
          }`}
        >
          {/* Верх шторки в одну чистую строку */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#626C77]">
              Детализация
            </span>
            <button
              type="button"
              onClick={() => setIsSavedTabOpen(false)}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-[10px] font-bold transition-colors cursor-pointer"
              title="Свернуть шторку"
            >
              <span>Свернуть</span>
              <ChevronUp className="w-3 h-3" />
            </button>
          </div>

          {/* Тело шторки: счетчики Без смены ТП и Единичный инцидент */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#F8F9FA] border border-[#E9ECEF]">
              <span className="text-[11px] font-semibold text-[#1D2023] leading-tight">
                Без смены ТП
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#1D2023] w-5 text-center tabular-nums font-mts-compact">
                  {stats.savedWithoutTpChange || 0}
                </span>
                <button
                  type="button"
                  onClick={() => onAdjustSavedWithoutTpChange?.(-1)}
                  className="w-6 h-6 rounded-full bg-white hover:bg-[#EAECEF] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer border border-[#E4E7EC]"
                  title="Отнять"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onAdjustSavedWithoutTpChange?.(1)}
                  className="w-6 h-6 rounded-full bg-white hover:bg-[#EAECEF] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer border border-[#E4E7EC]"
                  title="Добавить (+)"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#F8F9FA] border border-[#E9ECEF]">
              <span className="text-[11px] font-semibold text-[#1D2023] leading-tight">
                Единичный инцидент
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#1D2023] w-5 text-center tabular-nums font-mts-compact">
                  {stats.savedWithEi || 0}
                </span>
                <button
                  type="button"
                  onClick={() => onAdjustSavedWithEi?.(-1)}
                  className="w-6 h-6 rounded-full bg-white hover:bg-[#EAECEF] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer border border-[#E4E7EC]"
                  title="Отнять"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onAdjustSavedWithEi?.(1)}
                  className="w-6 h-6 rounded-full bg-white hover:bg-[#EAECEF] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer border border-[#E4E7EC]"
                  title="Добавить (+)"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. КОНВЕРСИЯ */}
      <div className="bg-white rounded-3xl p-5 border border-[#F1F3F5] shadow-mts-card hover:shadow-mts-hover hover:-translate-y-1 transition-all duration-300 ease-out flex flex-col justify-between h-[148px] relative">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-[#626C77] uppercase tracking-wider">
            Конверсия
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className={`text-3xl sm:text-4xl ${weightClass} text-[#1D2023] tracking-tight font-mts-compact`}>
            {conversionDisplay}%
          </span>
        </div>

        {/* Индикатор прогресса в нижней линии */}
        <div className="pt-2 border-t border-[#F1F3F5] flex flex-col justify-center">
          <div className="w-full bg-[#F4F5F7] h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF0023] transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(stats.conversionRate, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. ОЖИДАНИЕ */}
      <div
        onClick={onFocusDueQueue}
        className={`bg-white rounded-3xl p-5 border border-[#F1F3F5] flex flex-col justify-between h-[148px] cursor-pointer hover:shadow-mts-hover hover:-translate-y-1 transition-all duration-300 ease-out ${
          hasQueue ? 'animate-cast-shadow' : 'shadow-mts-card'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-[#626C77] uppercase tracking-wider">
              Ожидание
            </span>
            <div className="relative inline-block">
              <button
                type="button"
                onMouseEnter={() => setShowSyncTooltip(true)}
                onMouseLeave={() => setShowSyncTooltip(false)}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSyncTooltip(!showSyncTooltip);
                }}
                className="text-[#8C95A0] transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>

              {showSyncTooltip && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2.5 rounded-xl bg-[#1D2023] text-white text-[11px] font-normal leading-tight shadow-xl z-50 pointer-events-none">
                  Таймеры синхронизированы с часами компьютера оператора
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className={`text-3xl sm:text-4xl ${weightClass} text-[#1D2023] tracking-tight font-mts-compact`}>
            {activeTimersCount}
          </span>
          <span className="text-xs text-[#626C77] font-medium">в очереди</span>
        </div>

        {/* Детализация: Авто-перезвоны vs По времени */}
        <div className="pt-2 border-t border-[#F1F3F5] flex items-center justify-between text-xs">
          <div
            className="flex items-center gap-1.5 text-[#626C77]"
            title="Автоматические перезвоны по правилам дозвона (0/3 .. 3/3)"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            <span>Авто:</span>
            <span className="font-extrabold text-[#1D2023]">{autoCallbacksCount}</span>
          </div>
          <div
            className="flex items-center gap-1.5 text-[#626C77]"
            title="Перезвоны по согласованному времени с клиентом"
          >
            <span className="w-2 h-2 rounded-full bg-[#0077FF] inline-block" />
            <span>По времени:</span>
            <span className="font-extrabold text-[#0077FF]">{clientAgreedCallbacksCount}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
