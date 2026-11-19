import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, ExternalLink } from 'lucide-react';
import { formatSecondsToHms } from '../utils/urmStatSync';
import { downloadAsarFile } from '../utils/updateManager';

export interface ReadyTimerProps {
  isOpen: boolean;
  onClose: () => void;
  remainingSeconds: number;
  targetSeconds: number;
  isRunning: boolean;
  favorites: number[];
  scale?: number;
  onChangeScale?: (nextScale: number) => void;
  onApplyDuration: (totalSeconds: number) => void;
  onToggleRun: () => void;
  onReset: () => void;
  onAddFavorite: (totalSeconds: number) => void;
  onRemoveFavorite: (totalSeconds: number) => void;
}

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window?: Window | null;
}

export const ReadyTimerModal: React.FC<ReadyTimerProps> = ({
  isOpen,
  onClose,
  remainingSeconds,
  targetSeconds,
  isRunning,
  favorites,
  scale = 1,
  onChangeScale,
  onApplyDuration,
  onToggleRun,
  onReset,
  onAddFavorite,
  onRemoveFavorite,
}) => {
  const [windowPos, setWindowPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 360) : 520,
    y: 120,
  }));

  const [localScale, setLocalScale] = useState<number>(scale || 1);
  const activeScale = onChangeScale ? scale : localScale;
  const updateScale = (next: number) => {
    const clamped = Math.max(0.85, Math.min(2.25, Number(next.toFixed(2))));
    setLocalScale(clamped);
    onChangeScale?.(clamped);
  };

  const [pipWin, setPipWin] = useState<Window | null>(null);
  const timerWrapRef = useRef<HTMLDivElement | null>(null);

  const initH = Math.floor(targetSeconds / 3600);
  const initM = Math.floor((targetSeconds % 3600) / 60);
  const initS = targetSeconds % 60;

  const [hoursInput, setHoursInput] = useState<string>(String(initH));
  const [minutesInput, setMinutesInput] = useState<string>(String(initM));
  const [secondsInput, setSecondsInput] = useState<string>(String(initS));

  useEffect(() => {
    setHoursInput(String(Math.floor(targetSeconds / 3600)));
    setMinutesInput(String(Math.floor((targetSeconds % 3600) / 60)));
    setSecondsInput(String(targetSeconds % 60));
  }, [targetSeconds]);

  // Закрытие внешнего PiP-окна при закрытии таймера
  useEffect(() => {
    if (!isOpen && pipWin) {
      try {
        pipWin.close();
      } catch {
        // ignore
      }
      setPipWin(null);
    }
  }, [isOpen, pipWin]);

  const isPausedMidway = !isRunning && remainingSeconds > 0 && remainingSeconds < targetSeconds;
  const isWorkCompactMode = isRunning || isPausedMidway;

  // Автоматическая подгонка размера выносного OS-окна (Document PiP) при запуске/паузе или растягивании за язычок
  useEffect(() => {
    if (!pipWin || pipWin.closed) return;
    const raf = requestAnimationFrame(() => {
      try {
        const s = activeScale;
        const targetW = isWorkCompactMode
          ? Math.round(305 * s + 28)
          : Math.round(315 * s + 28);
        const targetH = isWorkCompactMode
          ? Math.round(64 * s + 42)
          : Math.round(255 * s + 45);
        pipWin.resizeTo(targetW, targetH);
      } catch {
        // ignore
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [pipWin, isWorkCompactMode, activeScale, favorites.length]);

  const dragWindowRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const isElectronShell =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron);

  // Если работает нативное выносное окно Electron за пределами приложения — не дублируем внутри DOM
  const hasNativeElectronOverlay =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { electronAPI?: { hasExternalOverlays?: boolean } }).electronAPI?.hasExternalOverlays);

  if (!isOpen || hasNativeElectronOverlay) return null;

  const canUseDocumentPip =
    !isElectronShell &&
    typeof window !== 'undefined' &&
    'documentPictureInPicture' in window;

  const handleOpenExternalPip = async () => {
    if (!canUseDocumentPip) return;
    if (pipWin && !pipWin.closed) {
      pipWin.focus();
      return;
    }
    try {
      const api = (window as unknown as { documentPictureInPicture: DocumentPictureInPictureApi })
        .documentPictureInPicture;
      const s = activeScale;
      const extWin = await api.requestWindow({
        width: isWorkCompactMode ? Math.round(305 * s + 24) : Math.round(315 * s + 24),
        height: isWorkCompactMode ? Math.round(64 * s + 16) : Math.round(245 * s + 16),
      });

      // Копируем таблицы стилей в выносное окно поверх всех программ
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          if (sheet.href) {
            const link = extWin.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            extWin.document.head.appendChild(link);
          } else if (sheet.cssRules) {
            const style = extWin.document.createElement('style');
            Array.from(sheet.cssRules).forEach((rule) => {
              style.appendChild(extWin.document.createTextNode(rule.cssText));
            });
            extWin.document.head.appendChild(style);
          }
        } catch {
          // ignore cross-origin stylesheet
        }
      });

      extWin.document.title = 'Таймер Ready';
      extWin.document.body.style.margin = '0';
      extWin.document.body.style.padding = '4px';
      extWin.document.body.style.background = '#F4F5F7';
      extWin.document.body.style.display = 'flex';
      extWin.document.body.style.alignItems = 'center';
      extWin.document.body.style.justifyContent = 'center';
      extWin.document.body.style.overflow = 'hidden';

      extWin.addEventListener('pagehide', () => {
        setPipWin(null);
      });

      setPipWin(extWin);
    } catch {
      // Если браузер или iframe заблокировал PiP — остаёмся в плавающем режиме
    }
  };

  const handleWindowDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pipWin) return;
    if ((e.target as HTMLElement).closest('button, input, [data-pull-tab="true"]')) return;
    e.preventDefault();
    dragWindowRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: windowPos.x,
      origY: windowPos.y,
    };

    const onMove = (ev: PointerEvent) => {
      if (!dragWindowRef.current.active) return;
      const dx = ev.clientX - dragWindowRef.current.startX;
      const dy = ev.clientY - dragWindowRef.current.startY;
      setWindowPos({
        x: dragWindowRef.current.origX + dx,
        y: dragWindowRef.current.origY + dy,
      });
    };

    const onUp = () => {
      dragWindowRef.current.active = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Полукруглый полупрозрачный язычок справа от таймера для растягивания (увеличения цифр и кнопок)
  const handlePullTabStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const tabEl = e.currentTarget;
    try {
      tabEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const startScreenX = e.screenX;
    const startScale = activeScale;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.screenX - startScreenX;
      const next = startScale + dx / 170;
      updateScale(next);
    };

    const onUp = (ev: PointerEvent) => {
      try {
        tabEl.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      tabEl.removeEventListener('pointermove', onMove);
      tabEl.removeEventListener('pointerup', onUp);
      tabEl.removeEventListener('pointercancel', onUp);
    };

    tabEl.addEventListener('pointermove', onMove);
    tabEl.addEventListener('pointerup', onUp);
    tabEl.addEventListener('pointercancel', onUp);
  };

  const computeTotalSecondsFromInputs = (): number => {
    const h = Math.max(0, Math.floor(Number(hoursInput) || 0));
    const m = Math.max(0, Math.floor(Number(minutesInput) || 0));
    const s = Math.max(0, Math.floor(Number(secondsInput) || 0));
    return h * 3600 + m * 60 + s;
  };

  const normalizeInputsToHms = (totalSec: number) => {
    const safe = Math.max(0, Math.floor(totalSec));
    const normH = Math.floor(safe / 3600);
    const normM = Math.floor((safe % 3600) / 60);
    const normS = safe % 60;
    setHoursInput(String(normH));
    setMinutesInput(String(normM));
    setSecondsInput(String(normS));
  };

  const handleSetTime = () => {
    const total = computeTotalSecondsFromInputs();
    if (total <= 0) return;
    normalizeInputsToHms(total);
    onApplyDuration(total);
  };

  const handleSaveToFavorites = () => {
    const total = computeTotalSecondsFromInputs() || targetSeconds;
    if (total <= 0) return;
    normalizeInputsToHms(total);
    onApplyDuration(total);
    onAddFavorite(total);
  };

  const handleSelectFavorite = (favSeconds: number) => {
    normalizeInputsToHms(favSeconds);
    onApplyDuration(favSeconds);
  };

  // Пропорциональные размеры для четкого масштабирования цифр и кнопок при вытягивании за полукруглый язычок
  const s = activeScale;
  const boxHeightPx = Math.round(36 * s);
  const timeFontPx = Math.round(18 * s);
  const btnFontPx = Math.round(12 * s);
  const timePadXPx = Math.round(12 * s);
  const btnPadXPx = Math.round(14 * s);
  const cardPadXPx = Math.round(13 * s);
  const cardPadYPx = Math.round(10 * s);
  const gapPx = Math.round(9 * s);
  const innerRadiusPx = Math.round(12 * Math.min(1.45, s));
  const outerRadiusPx = Math.round(16 * Math.min(1.45, s));
  const pullTabHeightPx = Math.max(32, Math.round(36 * s));
  const pullTabWidthPx = Math.max(15, Math.round(16 * Math.min(1.35, s)));

  const timerContent = (
    <div
      ref={timerWrapRef}
      style={
        pipWin
          ? undefined
          : {
              left: `${windowPos.x}px`,
              top: `${windowPos.y}px`,
            }
      }
      className={`${
        pipWin ? 'inline-flex items-center' : 'fixed z-50 inline-flex items-center'
      } font-mts-compact select-none`}
      role="dialog"
      aria-label="Таймер Ready"
    >
      {/* Основной прямоугольный корпус таймера */}
      <div
        onPointerDown={isWorkCompactMode ? handleWindowDragStart : undefined}
        style={{
          borderRadius: `${outerRadiusPx}px`,
          padding: isWorkCompactMode ? `${cardPadYPx}px ${cardPadXPx}px` : undefined,
          width: isWorkCompactMode ? 'auto' : `${Math.max(300, Math.round(300 * s))}px`,
        }}
        className={`bg-white border border-[#EBECEF] shadow-2xl overflow-hidden transition-shadow ${
          isWorkCompactMode && !pipWin ? 'cursor-move' : ''
        }`}
      >
        {isWorkCompactMode ? (
          /* СВЕРНУТЫЙ РАБОЧИЙ РЕЖИМ: строго 3 элемента — время ЧЧ:ММ:СС и две кнопки */
          <div style={{ gap: `${gapPx}px` }} className="flex items-center">
            <div
              style={{
                height: `${boxHeightPx}px`,
                padding: `0 ${timePadXPx}px`,
                borderRadius: `${innerRadiusPx}px`,
              }}
              className={`border flex items-center justify-center ${
                isRunning
                  ? 'bg-[#F8F9FB] border-[#0077FF]'
                  : 'bg-[#F8F9FB] border-[#E4E7EC]'
              }`}
            >
              <span
                style={{ fontSize: `${timeFontPx}px` }}
                className="font-black text-[#1D2023] font-mts-extended tabular-nums tracking-tight leading-none"
              >
                {formatSecondsToHms(remainingSeconds)}
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleRun}
              style={{
                height: `${boxHeightPx}px`,
                padding: `0 ${btnPadXPx}px`,
                borderRadius: `${innerRadiusPx}px`,
                fontSize: `${btnFontPx}px`,
              }}
              className={`font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap ${
                isRunning
                  ? 'bg-[#1D2023] hover:bg-[#2F343A] text-white'
                  : 'bg-[#FF0023] hover:bg-[#E30613] text-white'
              }`}
            >
              {isRunning ? 'Пауза' : 'Старт'}
            </button>

            <button
              type="button"
              onClick={onReset}
              style={{
                height: `${boxHeightPx}px`,
                padding: `0 ${Math.round(12 * s)}px`,
                borderRadius: `${innerRadiusPx}px`,
                fontSize: `${btnFontPx}px`,
              }}
              className="bg-[#F2F3F7] hover:bg-[#E5E7EB] font-bold text-[#1D2023] transition-colors cursor-pointer flex items-center justify-center whitespace-nowrap"
            >
              Сброс
            </button>
          </div>
        ) : (
          /* РЕЖИМ НАСТРОЙКИ ДО ЗАПУСКА */
          <>
            <div
              onPointerDown={handleWindowDragStart}
              className={`px-3.5 py-2.5 border-b border-[#EBECEF] flex items-center justify-between ${
                pipWin ? '' : 'cursor-move'
              } select-none`}
            >
              <h3 className="text-sm font-bold text-[#1D2023] font-mts-extended tracking-tight">
                Таймер Ready
              </h3>
              <div className="flex items-center gap-1.5">
                {canUseDocumentPip && !pipWin && (
                  <button
                    type="button"
                    onClick={handleOpenExternalPip}
                    title="Вынести таймер за пределы окна поверх всех программ"
                    aria-label="Вынести за окно"
                    className="h-7 px-2 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3 stroke-[2.2]" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (pipWin && !pipWin.closed) {
                      pipWin.close();
                    }
                    onClose();
                  }}
                  aria-label="Закрыть"
                  className="w-7 h-7 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 stroke-[2]" />
                </button>
              </div>
            </div>

            <div className="p-3.5 space-y-3">
              {/* Компактная строка: Время ЧЧ:ММ:СС + 2 кнопки */}
              <div style={{ gap: `${gapPx}px` }} className="flex items-center">
                <div
                  style={{
                    height: `${boxHeightPx}px`,
                    padding: `0 ${timePadXPx}px`,
                    borderRadius: `${innerRadiusPx}px`,
                  }}
                  className="flex-1 bg-[#F8F9FB] border border-[#E4E7EC] flex items-center justify-center"
                >
                  <span
                    style={{ fontSize: `${timeFontPx}px` }}
                    className="font-black text-[#1D2023] font-mts-extended tabular-nums tracking-tight leading-none"
                  >
                    {formatSecondsToHms(remainingSeconds)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const total = computeTotalSecondsFromInputs();
                    if (total > 0 && total !== targetSeconds) {
                      normalizeInputsToHms(total);
                      onApplyDuration(total);
                    }
                    onToggleRun();
                  }}
                  style={{
                    height: `${boxHeightPx}px`,
                    padding: `0 ${btnPadXPx}px`,
                    borderRadius: `${innerRadiusPx}px`,
                    fontSize: `${btnFontPx}px`,
                  }}
                  className="bg-[#FF0023] hover:bg-[#E30613] text-white font-bold transition-all cursor-pointer flex items-center justify-center whitespace-nowrap"
                >
                  Старт
                </button>

                <button
                  type="button"
                  onClick={onReset}
                  style={{
                    height: `${boxHeightPx}px`,
                    padding: `0 ${Math.round(12 * s)}px`,
                    borderRadius: `${innerRadiusPx}px`,
                    fontSize: `${btnFontPx}px`,
                  }}
                  className="bg-[#F2F3F7] hover:bg-[#E5E7EB] font-bold text-[#1D2023] transition-colors cursor-pointer flex items-center justify-center whitespace-nowrap"
                >
                  Сброс
                </button>
              </div>

              {/* Настройка времени (Ч / М / С) */}
              <div className="space-y-1.5 pt-2 border-t border-[#EBECEF]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#626C77]">Время</span>
                  <button
                    type="button"
                    onClick={handleSaveToFavorites}
                    className="text-xs font-bold text-[#0077FF] hover:text-[#0055CC] transition-colors cursor-pointer"
                  >
                    + В избранное
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="flex-1 flex items-center justify-between bg-white px-2 h-8 rounded-xl border border-[#D5D8DD] focus-within:border-[#0077FF] focus-within:ring-1 focus-within:ring-[#0077FF]/30 transition-all">
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetTime();
                      }}
                      className="w-full text-xs font-bold text-[#1D2023] tabular-nums focus:outline-none"
                      aria-label="Часы"
                    />
                    <span className="text-[11px] font-medium text-[#8C95A0] ml-1">ч</span>
                  </label>

                  <label className="flex-1 flex items-center justify-between bg-white px-2 h-8 rounded-xl border border-[#D5D8DD] focus-within:border-[#0077FF] focus-within:ring-1 focus-within:ring-[#0077FF]/30 transition-all">
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={minutesInput}
                      onChange={(e) => setMinutesInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetTime();
                      }}
                      className="w-full text-xs font-bold text-[#1D2023] tabular-nums focus:outline-none"
                      aria-label="Минуты"
                    />
                    <span className="text-[11px] font-medium text-[#8C95A0] ml-1">м</span>
                  </label>

                  <label className="flex-1 flex items-center justify-between bg-white px-2 h-8 rounded-xl border border-[#D5D8DD] focus-within:border-[#0077FF] focus-within:ring-1 focus-within:ring-[#0077FF]/30 transition-all">
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      value={secondsInput}
                      onChange={(e) => setSecondsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetTime();
                      }}
                      className="w-full text-xs font-bold text-[#1D2023] tabular-nums focus:outline-none"
                      aria-label="Секунды"
                    />
                    <span className="text-[11px] font-medium text-[#8C95A0] ml-1">с</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleSetTime}
                    className="h-8 px-2.5 rounded-xl bg-[#F2F3F7] hover:bg-[#E5E7EB] text-xs font-bold text-[#1D2023] transition-colors cursor-pointer shrink-0"
                  >
                    ОК
                  </button>
                </div>
              </div>

              {/* Избранное время */}
              {favorites.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-[#EBECEF]">
                  <span className="text-xs font-semibold text-[#626C77] block">Избранное</span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {favorites.map((favSec) => {
                      const isSelected = favSec === targetSeconds;
                      return (
                        <div
                          key={`fav-${favSec}`}
                          className={`inline-flex items-center gap-1 pl-2.5 pr-1 h-7 rounded-xl border transition-colors ${
                            isSelected
                              ? 'bg-[#F2F3F7] border-[#0077FF]'
                              : 'bg-[#F8F9FB] border-[#EBECEF] hover:bg-[#F2F3F7]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectFavorite(favSec)}
                            className="text-xs font-bold text-[#1D2023] tabular-nums cursor-pointer"
                          >
                            {formatSecondsToHms(favSec)}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveFavorite(favSec)}
                            aria-label="Удалить"
                            className="w-5 h-5 rounded-md text-slate-400 hover:text-[#FF0032] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3 h-3 stroke-[1.75]" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isElectronShell && (
                <div className="pt-1.5 border-t border-[#EBECEF] flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      downloadAsarFile('app.asar').catch(() => {});
                    }}
                    title="Для выноса за пределы окна замените app.asar в папке resources и перезапустите .exe"
                    className="text-[11px] font-bold text-[#0077FF] hover:text-[#0055CC] transition-colors cursor-pointer"
                  >
                    Обновить app.asar для выноса за окно
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ПОЛУКРУГЛЫЙ ПОЛУПРОЗРАЧНЫЙ ЯЗЫЧОК СПРАВА ОТ ТАЙМЕРА: потяните, чтобы расширить/увеличить цифры и кнопки */}
      <div
        data-pull-tab="true"
        onPointerDown={handlePullTabStart}
        onDoubleClick={() => updateScale(1)}
        title="Потяните, чтобы увеличить или уменьшить таймер"
        style={{
          width: `${pullTabWidthPx}px`,
          height: `${pullTabHeightPx}px`,
        }}
        className="rounded-r-full bg-white/65 hover:bg-white/90 backdrop-blur-xs border border-l-0 border-[#D5D8DD]/90 shadow-md cursor-ew-resize flex items-center justify-center gap-0.5 shrink-0 transition-colors"
      >
        <span className="w-[1.5px] h-3.5 rounded-full bg-[#626C77]/60" />
        <span className="w-[1.5px] h-3.5 rounded-full bg-[#626C77]/60" />
      </div>
    </div>
  );

  if (pipWin && !pipWin.closed) {
    return createPortal(timerContent, pipWin.document.body);
  }

  return timerContent;
};
