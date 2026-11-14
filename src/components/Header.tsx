import React, { useState, useRef, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Settings,
  Maximize2,
  Minimize2,
  Wrench,
  BookOpen,
  User,
  LogIn,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { TimerSettings } from '../types';
import { SupervisorAccount } from './SupervisorAccessModal';

interface HeaderProps {
  localTimeStr: string;
  moscowTimeStr: string;
  currentDateStr: string;
  settings: TimerSettings;
  onToggleSound: () => void;
  onOpenSettings: () => void;
  onOpenReport: () => void;
  onOpenChangelog?: () => void;
  onOpenGuide?: () => void;
  activeTimersCount: number;
  isStandbyMode?: boolean;
  onToggleStandby?: () => void;
  isDevMode?: boolean;
  isPageFlipped?: boolean;
  clockGlowCycle?: number;
  onTogglePageFlip?: () => void;
  activeAccount?: SupervisorAccount | null;
  onOpenAccountModal?: () => void;
  onLogoutAccount?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  localTimeStr,
  moscowTimeStr,
  currentDateStr,
  settings,
  onToggleSound,
  onOpenSettings,
  onOpenChangelog,
  onOpenGuide,
  isStandbyMode = false,
  onToggleStandby,
  isDevMode = false,
  clockGlowCycle = 0,
  onTogglePageFlip,
  activeAccount = null,
  onOpenAccountModal,
  onLogoutAccount,
}) => {
  // Состояние режима MNP ⇄ TM (Телемаркетинг) и фаз анимации логотипа (доступно только в Dev-режиме)
  const [activeBrandMode, setActiveBrandMode] = useState<'mnp' | 'tm'>('mnp');
  const [isRampageActive, setIsRampageActive] = useState(false);
  const [showTmRush, setShowTmRush] = useState(false);
  const [isResurrecting, setIsResurrecting] = useState(false);

  // Выпадающее меню «Аккаунт»
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isDevMode) {
      setActiveBrandMode('mnp');
      setIsRampageActive(false);
      setShowTmRush(false);
      setIsResurrecting(false);
    }
  }, [isDevMode]);

  const handleToggleBrandMode = () => {
    if (!isDevMode || isRampageActive || isResurrecting) return;

    if (activeBrandMode === 'mnp') {
      setIsRampageActive(true);
      setShowTmRush(false);

      setTimeout(() => {
        setActiveBrandMode('tm');
        setShowTmRush(true);
      }, 2650);

      setTimeout(() => {
        setIsRampageActive(false);
      }, 3250);
    } else {
      setIsResurrecting(true);
      setShowTmRush(false);

      setTimeout(() => {
        setActiveBrandMode('mnp');
      }, 300);

      setTimeout(() => {
        setIsResurrecting(false);
      }, 1500);
    }
  };

  return (
    <header className="bg-white border-b border-[#F1F3F5] fixed top-0 inset-x-0 z-40 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4 relative">
        {/* Левая часть: Фирменный квадратный логотип МТС и строгое название MNP */}
        <div className="flex items-center gap-3 shrink-0 z-10">
          <div
            onClick={isDevMode ? handleToggleBrandMode : undefined}
            role={isDevMode ? 'button' : undefined}
            tabIndex={isDevMode ? 0 : undefined}
            className={`w-10 h-10 rounded-none bg-[#E30613] p-1.5 grid grid-cols-2 grid-rows-2 text-white select-none shrink-0 shadow-sm relative z-20 ${
              isDevMode
                ? 'cursor-pointer hover:brightness-105 active:scale-95 transition-transform'
                : ''
            } ${isDevMode && isRampageActive ? 'animate-mts-cube-pixar pointer-events-none' : ''}`}
            title={
              isDevMode
                ? activeBrandMode === 'mnp'
                  ? 'МТС: Нажмите для трансформации в Телемаркетинг (ТМ)'
                  : 'МТС: Нажмите для возврата в MNP'
                : 'МТС'
            }
          >
            <span className="text-[10px] font-normal leading-none self-start justify-self-start font-mts-extended">М</span>
            <span className="text-[10px] font-normal leading-none self-start justify-self-end font-mts-extended">Т</span>
            <span />
            <span className="text-[10px] font-normal leading-none self-end justify-self-end font-mts-extended">С</span>
          </div>

          {/* Текстовая зона логотипа */}
          <div className="relative flex items-center min-w-[70px] h-8 select-none">
            {isDevMode ? (
              <>
                {activeBrandMode === 'mnp' && (
                  <div className="inline-flex items-baseline tracking-wide uppercase font-mts-extended text-xl sm:text-2xl font-black text-[#1D2023]">
                    <span
                      className={`inline-block ${
                        isRampageActive
                          ? 'animate-mts-letter-m-fall'
                          : isResurrecting
                          ? 'animate-mts-angel-descend'
                          : ''
                      }`}
                    >
                      M
                    </span>
                    <span
                      className={`inline-block ${
                        isRampageActive
                          ? 'animate-mts-letter-n-squash'
                          : isResurrecting
                          ? 'animate-mts-angel-descend'
                          : ''
                      }`}
                    >
                      N
                    </span>
                    <span
                      className={`inline-block ${
                        isRampageActive
                          ? 'animate-mts-letter-p-launch'
                          : isResurrecting
                          ? 'animate-mts-angel-descend'
                          : ''
                      }`}
                    >
                      P
                    </span>
                  </div>
                )}

                {activeBrandMode === 'tm' && (
                  <span
                    className={`text-xl sm:text-2xl font-black text-[#E30613] tracking-wide uppercase font-mts-extended inline-block ${
                      showTmRush ? 'animate-mts-tm-rush' : ''
                    }`}
                  >
                    ТМ
                  </span>
                )}
              </>
            ) : (
              <span
                className="text-xl sm:text-2xl font-black text-[#1D2023] tracking-wide uppercase font-mts-extended"
                title="Группа сохранения клиентов МТС (MNP)"
              >
                MNP
              </span>
            )}
          </div>
        </div>

        {/* Центр: Часы ПК и МСК (в обычном режиме статичны, в Dev-режиме — с переворотом на 180°) */}
        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center justify-center pointer-events-none z-10">
          <div className="relative flex items-center justify-center pointer-events-auto">
            {isDevMode && (
              <div
                key={clockGlowCycle}
                className={`absolute -inset-1.5 rounded-3xl pointer-events-none transition-opacity duration-300 ${
                  clockGlowCycle > 0 ? 'mts-clock-ambient-shimmer opacity-100' : 'opacity-0'
                }`}
              />
            )}

            {isDevMode ? (
              <button
                type="button"
                onClick={onTogglePageFlip}
                className="relative z-10 bg-[#F4F5F7] px-4 py-1.5 rounded-2xl flex items-center gap-3 text-xs border border-[#EBECEF] hover:border-[#D5D8DD] hover:bg-[#EEF0F3] active:scale-[0.985] shadow-2xs transition-all cursor-pointer select-none group"
                title="Перевернуть рабочую область на 180°"
              >
                <div className="text-center min-w-[90px]">
                  <div className="font-bold text-[#1D2023] text-sm tabular-nums tracking-wide font-mts-compact">
                    {localTimeStr}
                  </div>
                  <div className="text-[10px] text-[#626C77] font-medium uppercase tracking-tight">
                    ПК ({currentDateStr})
                  </div>
                </div>
                <div className="h-6 w-px bg-[#D5D8DD]/80 group-hover:bg-[#1D2023]/25 transition-colors" />
                <div className="text-center min-w-[90px]">
                  <div className="font-bold text-[#1D2023] text-sm tabular-nums tracking-wide font-mts-compact">
                    {moscowTimeStr}
                  </div>
                  <div className="text-[10px] text-[#626C77] font-medium uppercase tracking-tight">
                    МСК (UTC+3)
                  </div>
                </div>
              </button>
            ) : (
              <div
                className="relative z-10 bg-[#F4F5F7] px-4 py-1.5 rounded-2xl flex items-center gap-3 text-xs border border-[#EBECEF] shadow-2xs select-none"
              >
                <div className="text-center min-w-[90px]">
                  <div className="font-bold text-[#1D2023] text-sm tabular-nums tracking-wide font-mts-compact">
                    {localTimeStr}
                  </div>
                  <div className="text-[10px] text-[#626C77] font-medium uppercase tracking-tight">
                    ПК ({currentDateStr})
                  </div>
                </div>
                <div className="h-6 w-px bg-[#D5D8DD]/80" />
                <div className="text-center min-w-[90px]">
                  <div className="font-bold text-[#1D2023] text-sm tabular-nums tracking-wide font-mts-compact">
                    {moscowTimeStr}
                  </div>
                  <div className="text-[10px] text-[#626C77] font-medium uppercase tracking-tight">
                    МСК (UTC+3)
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Правая часть: Кнопки действий (Свернуть, Руководство, Обновления и Меню Аккаунта) */}
        <div
          className={`flex items-center gap-2 shrink-0 z-10 transition-all duration-300 ease-in-out ${
            isStandbyMode && settings.headerCollapseAnimationEnabled !== false
              ? 'opacity-0 pointer-events-none -translate-y-4'
              : 'opacity-100 translate-y-0'
          }`}
        >
          {/* 1. Кнопка скрыть/развернуть в шапке */}
          {onToggleStandby && (
            <button
              type="button"
              onClick={onToggleStandby}
              title={isStandbyMode ? 'Развернуть рабочее место' : 'Свернуть в режим ожидания'}
              className="w-10 h-10 rounded-2xl bg-[#F4F5F7] hover:bg-gray-200 text-[#1D2023] flex items-center justify-center transition-all cursor-pointer"
            >
              {isStandbyMode ? (
                <Maximize2 className="w-5 h-5 text-[#1D2023]" />
              ) : (
                <Minimize2 className="w-5 h-5 text-[#1D2023]" />
              )}
            </button>
          )}

          {/* 2. Кнопка руководства оператора (гайд) */}
          {onOpenGuide && (
            <button
              type="button"
              onClick={onOpenGuide}
              title="Руководство оператора (Гайд по функциям УРМ)"
              className="w-10 h-10 rounded-2xl bg-[#F4F5F7] hover:bg-red-50 hover:text-[#E30613] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
            >
              <BookOpen className="w-5 h-5" />
            </button>
          )}

          {/* 3. Кнопка журнала обновлений */}
          {onOpenChangelog && (
            <button
              type="button"
              onClick={onOpenChangelog}
              title="Журнал обновлений (патч-ноуты)"
              className="w-10 h-10 rounded-2xl bg-[#F4F5F7] hover:bg-gray-200 text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Wrench className="w-5 h-5 text-[#1D2023]" />
            </button>
          )}

          {/* 4. Кнопка «Аккаунт» (значок человека) с выпадающим меню: Вход/Регистрация, Звук и Настройки */}
          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
              title={
                activeAccount
                  ? `Аккаунт: ${activeAccount.fullName || activeAccount.login}`
                  : 'Меню аккаунта (Вход, Звук, Настройки)'
              }
              aria-label="Аккаунт"
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors cursor-pointer relative ${
                isAccountMenuOpen
                  ? 'bg-[#1D2023] text-white'
                  : 'bg-[#F4F5F7] hover:bg-gray-200 text-[#1D2023]'
              }`}
            >
              <User className="w-5 h-5" />
              {activeAccount && (
                <span className="w-2.5 h-2.5 rounded-full bg-[#109E59] absolute -top-0.5 -right-0.5 ring-2 ring-white" />
              )}
            </button>

            {isAccountMenuOpen && (
              <div className="absolute right-0 top-12 z-50 w-68 bg-white rounded-3xl border border-[#EBECEF] shadow-xl p-2 animate-in fade-in zoom-in-95 duration-150 font-mts-compact">
                {/* 1. Блок Входа / Регистрации или активного профиля */}
                {activeAccount ? (
                  <div className="p-3 mb-1.5 rounded-2xl bg-[#F8F9FB] border border-[#EBECEF]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#1D2023] truncate">
                          {activeAccount.fullName || activeAccount.login}
                        </div>
                        <div className="text-[11px] text-[#626C77] truncate">
                          Логин: {activeAccount.login}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-[#EBECEF] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          onOpenAccountModal?.();
                        }}
                        className="text-[11px] font-bold text-[#1D2023] hover:text-[#E30613] transition-colors cursor-pointer"
                      >
                        Профиль / Сменить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          onLogoutAccount?.();
                        }}
                        className="text-[11px] font-bold text-[#E30613] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <LogOut className="w-3 h-3" />
                        <span>Выйти</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      onOpenAccountModal?.();
                    }}
                    className="w-full px-3.5 py-2.5 mb-1 rounded-2xl bg-[#F8F9FB] hover:bg-[#F2F3F7] border border-[#EBECEF] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-red-50 text-[#E30613] flex items-center justify-center shrink-0">
                        <LogIn className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[13px] font-bold text-[#1D2023]">
                          Вход / Регистрация
                        </div>
                        <div className="text-[11px] text-[#626C77]">
                          Войти в свой профиль УРМ
                        </div>
                      </div>
                    </div>
                  </button>
                )}

                {/* 2. Звук уведомлений */}
                <button
                  type="button"
                  onClick={onToggleSound}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-[#F5F6F8] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        settings.soundEnabled
                          ? 'bg-[#F4F5F7] text-[#1D2023]'
                          : 'bg-red-50 text-[#E30613]'
                      }`}
                    >
                      {settings.soundEnabled ? (
                        <Volume2 className="w-4 h-4" />
                      ) : (
                        <VolumeX className="w-4 h-4" />
                      )}
                    </span>
                    <span className="text-[13px] font-semibold text-[#1D2023]">
                      Звук
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      settings.soundEnabled
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-[#E30613]'
                    }`}
                  >
                    {settings.soundEnabled ? 'Вкл' : 'Выкл'}
                  </span>
                </button>

                {/* 3. Настройки */}
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl hover:bg-[#F5F6F8] flex items-center gap-3 text-left transition-colors cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-xl bg-[#F4F5F7] text-[#1D2023] flex items-center justify-center shrink-0">
                    <Settings className="w-4 h-4" />
                  </span>
                  <span className="text-[13px] font-semibold text-[#1D2023]">
                    Настройки
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
