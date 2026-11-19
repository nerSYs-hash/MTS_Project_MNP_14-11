import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Minus, Trash2, ChevronDown, Check, ExternalLink } from 'lucide-react';
import { KalkaZoneItem, KalkaTargetAction, KalkaDisplayMode } from '../types';
import { downloadAsarFile } from '../utils/updateManager';

interface KalkaModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: KalkaZoneItem[];
  onChangeZones: (nextZones: KalkaZoneItem[]) => void;
  displayMode: KalkaDisplayMode;
  onChangeDisplayMode: (mode: KalkaDisplayMode) => void;
  onTriggerAction: (target: KalkaTargetAction, zoneId: string) => void;
}

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window?: Window | null;
}

const KALKA_TARGET_OPTIONS: { value: KalkaTargetAction; label: string }[] = [
  { value: 'calls', label: 'Звонки' },
  { value: 'saved', label: 'Сохранение' },
  { value: 'timer', label: 'Таймер' },
];

const KalkaTargetSelect: React.FC<{
  value: KalkaTargetAction;
  onChange: (next: KalkaTargetAction) => void;
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const activeOpt =
    KALKA_TARGET_OPTIONS.find((o) => o.value === value) || KALKA_TARGET_OPTIONS[0];

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[135px] font-mts-compact">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full h-8 px-3 rounded-xl bg-white hover:bg-[#F2F3F7] border text-xs font-semibold text-[#1D2023] flex items-center justify-between gap-2 transition-all cursor-pointer focus:outline-none ${
          isOpen
            ? 'border-[#0077FF] ring-1 ring-[#0077FF]/30 bg-white'
            : 'border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30'
        }`}
      >
        <span className="truncate">{activeOpt.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#626C77] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#1D2023]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full bg-white rounded-2xl border border-[#EBECEF] shadow-xl p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
          {KALKA_TARGET_OPTIONS.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-[#F2F3F7] text-[#1D2023] font-bold'
                    : 'text-[#1D2023] font-medium hover:bg-[#F8F9FB]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#1D2023] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export function createDefaultKalkaZone(index: number, target?: KalkaTargetAction): KalkaZoneItem {
  const defaultTargets: KalkaTargetAction[] = ['timer', 'calls', 'saved'];
  const offset = (index % 5) * 26;
  return {
    id: `kalka_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
    target: target || defaultTargets[index % defaultTargets.length],
    x: Math.max(24, 140 + offset),
    y: Math.max(84, 140 + offset),
    width: 112,
    height: 56,
  };
}

export const KalkaModal: React.FC<KalkaModalProps> = ({
  isOpen,
  onClose,
  zones,
  onChangeZones,
  displayMode,
  onChangeDisplayMode,
  onTriggerAction,
}) => {
  const [windowPos, setWindowPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 380) : 480,
    y: 96,
  }));
  const [stampedZoneId, setStampedZoneId] = useState<string | null>(null);
  const [pipWin, setPipWin] = useState<Window | null>(null);

  const dragWindowRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const controlCardRef = useRef<HTMLDivElement | null>(null);

  const isElectronShell =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron);

  // В настольной версии Electron с поддержкой выносных окон (hasExternalOverlays)
  // и само окно «Калька», и прозрачные квадраты создаются как отдельные окна Windows за пределами приложения
  const hasNativeElectronOverlay =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { electronAPI?: { hasExternalOverlays?: boolean } }).electronAPI?.hasExternalOverlays);

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

  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const triggerRef = useRef(onTriggerAction);
  triggerRef.current = onTriggerAction;

  // Сквозной клик в режиме «Прозрачный» внутри приложения/браузера:
  // сам квадрат имеет pointer-events-none, поэтому кнопка под ним нажимается 100% нативно,
  // а capture-слушатель отпечатывает сигнал в Кальку при совпадении координат
  useEffect(() => {
    if (hasNativeElectronOverlay || displayMode !== 'transparent') return;
    const handleGlobalPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      // Не срабатываем, если клик пришелся по самому окну управления Калькой
      if (controlCardRef.current && controlCardRef.current.contains(ev.target as Node)) {
        return;
      }
      const x = ev.clientX;
      const y = ev.clientY;
      for (const z of zonesRef.current) {
        if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
          const hitTarget = z.target;
          const hitId = z.id;
          window.setTimeout(() => {
            setStampedZoneId(hitId);
            window.setTimeout(() => {
              setStampedZoneId((curr) => (curr === hitId ? null : curr));
            }, 220);
            triggerRef.current(hitTarget, hitId);
          }, 15);
        }
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
    return () => window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
  }, [hasNativeElectronOverlay, displayMode]);

  if (hasNativeElectronOverlay) return null;

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
      const extWin = await api.requestWindow({
        width: 356,
        height: 410,
      });

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
          // ignore
        }
      });

      extWin.document.title = 'Калька';
      extWin.document.body.style.margin = '0';
      extWin.document.body.style.padding = '6px';
      extWin.document.body.style.background = '#F4F5F7';

      extWin.addEventListener('pagehide', () => {
        setPipWin(null);
      });

      setPipWin(extWin);
    } catch {
      // ignore
    }
  };

  const handleWindowDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pipWin) return;
    if ((e.target as HTMLElement).closest('button, input')) return;
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

  const handleSetCount = (nextCountRaw: number) => {
    const nextCount = Math.max(0, Math.min(12, Math.floor(nextCountRaw)));
    if (nextCount === zones.length) return;
    if (nextCount < zones.length) {
      onChangeZones(zones.slice(0, nextCount));
    } else {
      const added: KalkaZoneItem[] = [];
      for (let i = zones.length; i < nextCount; i++) {
        added.push(createDefaultKalkaZone(i));
      }
      onChangeZones([...zones, ...added]);
    }
  };

  const handleAddZone = () => {
    if (zones.length >= 12) return;
    onChangeZones([...zones, createDefaultKalkaZone(zones.length)]);
  };

  const handleRemoveZone = (id: string) => {
    onChangeZones(zones.filter((z) => z.id !== id));
  };

  const handleChangeZoneTarget = (id: string, target: KalkaTargetAction) => {
    onChangeZones(zones.map((z) => (z.id === id ? { ...z, target } : z)));
  };

  const handleStartZoneMove = (zone: KalkaZoneItem, e: React.PointerEvent<HTMLDivElement>) => {
    if (displayMode !== 'setup') return;
    if ((e.target as HTMLElement).closest('[data-kalka-resize="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = zone.x;
    const origY = zone.y;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      onChangeZones(
        zones.map((z) =>
          z.id === zone.id ? { ...z, x: Math.round(origX + dx), y: Math.round(origY + dy) } : z
        )
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleStartZoneResize = (zone: KalkaZoneItem, e: React.PointerEvent<HTMLSpanElement>) => {
    if (displayMode !== 'setup') return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = zone.width;
    const origH = zone.height;

    const onMove = (ev: PointerEvent) => {
      const dw = ev.clientX - startX;
      const dh = ev.clientY - startY;
      const nextW = Math.max(44, Math.min(460, origW + dw));
      const nextH = Math.max(28, Math.min(320, origH + dh));
      onChangeZones(
        zones.map((z) =>
          z.id === zone.id ? { ...z, width: Math.round(nextW), height: Math.round(nextH) } : z
        )
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleKalkaClick = (zone: KalkaZoneItem) => {
    setStampedZoneId(zone.id);
    setTimeout(() => {
      setStampedZoneId((curr) => (curr === zone.id ? null : curr));
    }, 220);
    onTriggerAction(zone.target, zone.id);
  };

  const controlWindowNode = isOpen ? (
    <div
      ref={controlCardRef}
      style={pipWin ? undefined : { left: `${windowPos.x}px`, top: `${windowPos.y}px` }}
      className={`${
        pipWin ? 'w-full' : 'fixed z-50 w-[336px]'
      } bg-white rounded-3xl border border-[#EBECEF] shadow-2xl overflow-visible font-mts-compact animate-in fade-in zoom-in-95 duration-150`}
      role="dialog"
      aria-label="Калька"
    >
      {/* Шапка окна (строго без декоративных иконок) */}
      <div
        onPointerDown={handleWindowDragStart}
        className={`px-4 py-3 border-b border-[#EBECEF] flex items-center justify-between ${
          pipWin ? '' : 'cursor-move'
        } select-none`}
      >
        <h3 className="text-base font-bold text-[#1D2023] font-mts-extended tracking-tight">
          Калька
        </h3>
        <div className="flex items-center gap-1.5">
          {canUseDocumentPip && !pipWin && (
            <button
              type="button"
              onClick={handleOpenExternalPip}
              title="Вынести окно за пределы программы"
              aria-label="Вынести за окно"
              className="h-8 px-2.5 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 stroke-[2]" />
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
            className="w-8 h-8 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        {/* Переключатель режима кальки */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#626C77]">Режим</span>
          <div className="inline-flex items-center bg-[#F2F3F7] p-0.5 rounded-xl border border-[#E4E7EC]">
            {(
              [
                { id: 'setup', label: 'Настройка' },
                { id: 'transparent', label: 'Прозрачный' },
                { id: 'off', label: 'Выкл' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeDisplayMode(m.id)}
                className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  displayMode === m.id
                    ? 'bg-[#1D2023] text-white shadow-2xs'
                    : 'text-[#626C77] hover:text-[#1D2023]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Количество кальки */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#626C77]">Количество</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleSetCount(zones.length - 1)}
              className="w-8 h-8 rounded-xl bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Уменьшить"
            >
              <Minus className="w-3.5 h-3.5 stroke-[2.2]" />
            </button>
            <input
              type="number"
              min={0}
              max={12}
              value={zones.length}
              onChange={(e) => handleSetCount(Number(e.target.value) || 0)}
              className="w-12 h-8 px-2 rounded-xl bg-white border border-[#D5D8DD] text-center text-xs font-bold text-[#1D2023] tabular-nums focus:outline-none focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 transition-all"
            />
            <button
              type="button"
              onClick={() => handleSetCount(zones.length + 1)}
              className="w-8 h-8 rounded-xl bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Увеличить"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            </button>
          </div>
        </div>

        {/* Список областей кальки и их назначение */}
        <div className="space-y-2 max-h-60 overflow-y-visible">
          {zones.map((zone, index) => (
            <div
              key={zone.id}
              className="flex items-center justify-between gap-2 bg-[#F8F9FB] px-2.5 py-1.5 rounded-2xl border border-[#EBECEF]"
            >
              <span className="text-xs font-bold text-[#1D2023] w-16 shrink-0 tabular-nums">
                Калька {index + 1}
              </span>

              <KalkaTargetSelect
                value={zone.target}
                onChange={(nextTarget) => handleChangeZoneTarget(zone.id, nextTarget)}
              />

              <button
                type="button"
                onClick={() => handleRemoveZone(zone.id)}
                aria-label="Удалить"
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-[#FF0032] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-4 h-4 stroke-[1.75]" />
              </button>
            </div>
          ))}
        </div>

        {/* Кнопка добавления кальки по стандарту МТС (чистый синий текст без рамок) */}
        <div className="pt-0.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleAddZone}
            className="text-xs font-bold text-[#0077FF] hover:text-[#0055CC] transition-colors cursor-pointer"
          >
            + Добавить кальку
          </button>

          {isElectronShell && (
            <button
              type="button"
              onClick={() => {
                downloadAsarFile('app.asar').catch(() => {});
              }}
              title="Для выноса за пределы окна замените app.asar в папке resources и перезапустите .exe"
              className="text-[11px] font-bold text-[#626C77] hover:text-[#1D2023] transition-colors cursor-pointer"
            >
              Обновить app.asar
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Экранные квадраты кальки (в браузерном превью; в Electron с app.asar открываются как отдельные окна Windows за пределами программы) */}
      {displayMode !== 'off' &&
        zones.map((zone, idx) => {
          const targetLabel =
            KALKA_TARGET_OPTIONS.find((o) => o.value === zone.target)?.label || 'Таймер';
          const isSetup = displayMode === 'setup';
          const isStamped = stampedZoneId === zone.id;

          return (
            <div
              key={zone.id}
              onPointerDown={(e) => {
                if (isSetup) {
                  handleStartZoneMove(zone, e);
                }
              }}
              style={{
                left: `${zone.x}px`,
                top: `${zone.y}px`,
                width: `${zone.width}px`,
                height: `${zone.height}px`,
              }}
              className={`fixed z-45 select-none transition-shadow ${
                isSetup
                  ? 'rounded-xl bg-white/75 backdrop-blur-[1px] border-2 border-dashed border-[#0077FF] shadow-md cursor-move flex flex-col items-center justify-center p-1.5'
                  : `pointer-events-none rounded-lg ${
                      isStamped
                        ? 'bg-[#0077FF]/15 ring-1 ring-[#0077FF]/40'
                        : 'bg-white/[0.02] border border-slate-400/20'
                    }`
              }`}
            >
              {isSetup && (
                <>
                  <div className="flex items-center gap-1.5 pointer-events-none">
                    <span className="text-[11px] font-bold text-[#1D2023] font-mts-compact">
                      {idx + 1} • {targetLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleKalkaClick(zone);
                    }}
                    className="mt-1 px-2 py-0.5 rounded-md bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[10px] font-bold text-[#1D2023] transition-colors cursor-pointer"
                  >
                    Тест
                  </button>
                  <span
                    data-kalka-resize="true"
                    onPointerDown={(e) => handleStartZoneResize(zone, e)}
                    className="absolute right-0.5 bottom-0.5 w-3.5 h-3.5 rounded-sm bg-[#0077FF]/20 hover:bg-[#0077FF]/40 cursor-nwse-resize"
                  />
                </>
              )}
            </div>
          );
        })}

      {pipWin && !pipWin.closed && controlWindowNode
        ? createPortal(controlWindowNode, pipWin.document.body)
        : controlWindowNode}
    </>
  );
};
