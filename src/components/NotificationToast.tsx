import React, { useState, useEffect } from 'react';
import { Bell, X, ArrowRight, Copy, Check, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { PushNotificationPosition } from '../types';
import { writeMtsTokenToClipboard } from '../utils/cardSharing';

export interface ToastItem {
  id: string;
  kind?: 'call_reminder' | 'share_result_ready' | 'share_receipt_credited' | 'share_imported' | 'share_package_prompt';
  title: string;
  phone: string;
  subtitle?: string;
  badgeText?: string;
  attempt?: number;
  maxAttempts?: number;
  region?: string;
  leadId?: string;
  receiptToken?: string;
  actionLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onAcceptPackage?: () => void;
  autoDismissMs?: number;
  position?: PushNotificationPosition;
  timestamp: number;
}

interface ToastWithAnimation extends ToastItem {
  isEntering: boolean;
  isExiting: boolean;
  copied?: boolean;
  position: PushNotificationPosition;
}

interface NotificationToastContainerProps {
  position?: PushNotificationPosition;
  enabled?: boolean;
}

export const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({
  position = 'top-right',
  enabled = true,
}) => {
  const [toasts, setToasts] = useState<ToastWithAnimation[]>([]);
  const [activePosition, setActivePosition] = useState<PushNotificationPosition>(position);

  // Синхронизация с входящим пропсом position
  useEffect(() => {
    if (position) {
      setActivePosition(position);
    }
  }, [position]);

  // Слушатель событий изменения активной позиции из настроек
  useEffect(() => {
    const handleSetPosition = (e: Event) => {
      const custom = e as CustomEvent<{ position?: PushNotificationPosition }>;
      if (custom.detail?.position) {
        setActivePosition(custom.detail.position);
      }
    };

    window.addEventListener('mts-set-push-position', handleSetPosition);
    return () => window.removeEventListener('mts-set-push-position', handleSetPosition);
  }, []);

  // Плавное закрытие уведомления (уезжает за край экрана)
  const dismissToast = (id: string, callback?: () => void) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      if (callback) callback();
    }, 240);
  };

  // Слушатель появления новых тостов
  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastItem>;
      if (!customEvent.detail) return;
      const detail = customEvent.detail;
      const isCallReminder = !detail.kind || detail.kind === 'call_reminder';

      if (isCallReminder && !enabled) return;

      const targetPos: PushNotificationPosition =
        detail.position || activePosition || position || 'top-right';

      setActivePosition(targetPos);

      const newId = detail.id || String(Date.now() + Math.random());
      const newToast: ToastWithAnimation = {
        ...detail,
        id: newId,
        kind: detail.kind || 'call_reminder',
        phone: detail.phone || '+7 (916) 123-45-67',
        attempt: detail.attempt || 1,
        maxAttempts: detail.maxAttempts || 3,
        region: detail.region || 'г. Москва и Московская область',
        position: targetPos,
        isEntering: true,
        isExiting: false,
        copied: false,
      };

      setToasts((prev) => [newToast, ...prev.slice(0, 2)]);

      // Снимаем класс начальной анимации появления через 30мс для запуска CSS transition
      requestAnimationFrame(() => {
        setTimeout(() => {
          setToasts((prev) =>
            prev.map((t) => (t.id === newId ? { ...t, isEntering: false } : t))
          );
        }, 30);
      });

      // Автоматическое скрытие по таймеру
      const timeoutMs =
        detail.autoDismissMs ??
        (detail.kind === 'share_result_ready' || detail.kind === 'share_package_prompt' || detail.onSecondaryAction
          ? 14000
          : detail.kind === 'share_receipt_credited' || detail.kind === 'share_imported'
          ? 6500
          : 10000);

      setTimeout(() => {
        dismissToast(newId);
      }, timeoutMs);
    };

    window.addEventListener('mts-inapp-toast', handleToast);
    return () => window.removeEventListener('mts-inapp-toast', handleToast);
  }, [enabled, activePosition, position]);

  // Переход к карточке абонента с плавным уездом пуша за край
  const handleGoToCard = (toast: ToastWithAnimation) => {
    dismissToast(toast.id, () => {
      window.dispatchEvent(
        new CustomEvent('mts-focus-lead', {
          detail: { leadId: toast.leadId, phone: toast.phone },
        })
      );
    });
  };

  // Копирование обратной ссылки результата и автоматическое скрытие пуша
  const handleCopyResult = async (toast: ToastWithAnimation) => {
    if (!toast.receiptToken) return;
    await writeMtsTokenToClipboard(toast.receiptToken);
    setToasts((prev) =>
      prev.map((t) => (t.id === toast.id ? { ...t, copied: true } : t))
    );
    setTimeout(() => {
      dismissToast(toast.id);
    }, 650);
  };

  // Принятие пакета карточек из пуша и мгновенное скрытие
  const handleAcceptPackage = (toast: ToastWithAnimation) => {
    if (toast.onAcceptPackage) {
      toast.onAcceptPackage();
    }
    dismissToast(toast.id);
  };

  // Дополнительное действие (Б.1: возврат зависшего номера в свою очередь / Б.3: возврат неотработанного номера коллеге)
  const handleRunSecondaryAction = (toast: ToastWithAnimation) => {
    if (toast.onSecondaryAction) {
      toast.onSecondaryAction();
    }
    dismissToast(toast.id);
  };

  if (toasts.length === 0) return null;

  // Абсолютно точное позиционирование контейнера на экране
  const getContainerStyle = (pos: PushNotificationPosition): React.CSSProperties => {
    switch (pos) {
      case 'top-left':
        return {
          top: '20px',
          left: '20px',
          right: 'auto',
          bottom: 'auto',
          transform: 'none',
          alignItems: 'flex-start',
        };
      case 'top-center':
        return {
          top: '20px',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          transform: 'translateX(-50%)',
          alignItems: 'center',
        };
      case 'bottom-right':
        return {
          bottom: '20px',
          right: '20px',
          top: 'auto',
          left: 'auto',
          transform: 'none',
          alignItems: 'flex-end',
          flexDirection: 'column-reverse',
        };
      case 'center-right':
        return {
          top: '50%',
          right: '20px',
          bottom: 'auto',
          left: 'auto',
          transform: 'translateY(-50%)',
          alignItems: 'flex-end',
        };
      case 'top-right':
      default:
        return {
          top: '20px',
          right: '20px',
          bottom: 'auto',
          left: 'auto',
          transform: 'none',
          alignItems: 'flex-end',
        };
    }
  };

  // Определение стилей анимации появления и уезда в зависимости от расположения
  const getToastStyle = (toast: ToastWithAnimation): React.CSSProperties => {
    const pos = toast.position || activePosition;
    const transition =
      'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1)';

    if (toast.isExiting) {
      if (pos === 'top-left') {
        return {
          transform: 'translateX(-120%) scale(0.95)',
          opacity: 0,
          transition,
          pointerEvents: 'none',
        };
      }
      if (pos === 'top-center') {
        return {
          transform: 'translateY(-120%) scale(0.95)',
          opacity: 0,
          transition,
          pointerEvents: 'none',
        };
      }
      return {
        transform: 'translateX(120%) scale(0.95)',
        opacity: 0,
        transition,
        pointerEvents: 'none',
      };
    }

    if (toast.isEntering) {
      switch (pos) {
        case 'top-left':
          return { transform: 'translateX(-70px) scale(0.96)', opacity: 0, transition };
        case 'top-center':
          return { transform: 'translateY(-60px) scale(0.96)', opacity: 0, transition };
        case 'bottom-right':
          return { transform: 'translateY(60px) scale(0.96)', opacity: 0, transition };
        case 'center-right':
          return { transform: 'translateX(70px) scale(0.96)', opacity: 0, transition };
        case 'top-right':
        default:
          return { transform: 'translateX(70px) scale(0.96)', opacity: 0, transition };
      }
    }

    return { transform: 'translate(0, 0) scale(1)', opacity: 1, transition };
  };

  return (
    <div
      style={getContainerStyle(activePosition)}
      className="fixed z-[9999] flex flex-col gap-2.5 max-w-[390px] w-full pointer-events-none transition-all duration-300"
    >
      {toasts.map((toast) => {
        const isShareToast = toast.kind && toast.kind !== 'call_reminder';

        if (isShareToast) {
          return (
            <div
              key={toast.id}
              style={getToastStyle(toast)}
              className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-[#EBECEF] p-3.5 text-[#1D2023] relative overflow-hidden"
              role="alert"
            >
              {/* 1-я строка: Спокойная серая иконка + Номер/Заголовок + Статус + Крестик */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#F4F5F7] text-[#626C77] flex items-center justify-center shrink-0">
                    {toast.kind === 'share_receipt_credited' ? (
                      <ArrowUpRight className="w-4 h-4 stroke-[2]" />
                    ) : (
                      <ArrowDownLeft className="w-4 h-4 stroke-[2]" />
                    )}
                  </div>
                  <span className="text-[14px] font-bold text-[#1D2023] font-mts-compact tracking-wide truncate">
                    {toast.phone}
                  </span>
                  {toast.badgeText && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4F5F7] text-[#626C77] shrink-0">
                      {toast.badgeText}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="text-[#8C95A0] hover:text-[#1D2023] w-7 h-7 rounded-full hover:bg-[#F4F5F7] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Закрыть уведомление"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 2-я строка: Подпись слева + кнопка действия справа строго в одну строку без прыжков */}
              <div className="mt-2.5 pl-10 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#626C77] truncate">
                  {toast.subtitle || toast.title}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {toast.onSecondaryAction && toast.secondaryActionLabel && (
                    <button
                      type="button"
                      onClick={() => handleRunSecondaryAction(toast)}
                      className="h-8 px-3 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer active:scale-[0.98] shrink-0 whitespace-nowrap"
                    >
                      <span>{toast.secondaryActionLabel}</span>
                    </button>
                  )}

                  {toast.kind === 'share_result_ready' && toast.receiptToken && (
                    <button
                      type="button"
                      onClick={() => handleCopyResult(toast)}
                      className="h-8 px-3.5 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-[0.98] shrink-0 whitespace-nowrap"
                    >
                      {toast.copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#1D2023] shrink-0" />
                          <span>Скопировано</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#626C77] shrink-0" />
                          <span>{toast.actionLabel || 'Скопировать результат'}</span>
                        </>
                      )}
                    </button>
                  )}

                  {toast.kind === 'share_package_prompt' && toast.onAcceptPackage && (
                    <button
                      type="button"
                      onClick={() => handleAcceptPackage(toast)}
                      className="h-8 px-3.5 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-[0.98] shrink-0 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5 text-[#1D2023] shrink-0" />
                      <span>Принять в очередь</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={toast.id}
            style={getToastStyle(toast)}
            className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-[#EBECEF] p-3.5 text-[#1D2023] relative overflow-hidden"
            role="alert"
          >
            {/* 1-я строка: Иконка колокольчика + Номер телефона + Попытка + Закрыть */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#FFF0F2] text-[#FF0023] flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-[#FF0023]" />
                </div>
                <span className="text-[15px] font-bold text-[#1D2023] font-mts-compact tracking-wide whitespace-nowrap">
                  {toast.phone}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF0F2] text-[#FF0023] shrink-0">
                  {toast.badgeText || `Попытка ${toast.attempt || 1}/${toast.maxAttempts || 3}`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-[#8C95A0] hover:text-[#1D2023] w-7 h-7 rounded-full hover:bg-[#F4F5F7] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Закрыть уведомление"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2-я строка: Город слева + кнопки справа (включая Б.3 «Вернуть коллеге» для принятых номеров) */}
            <div className="mt-2.5 pl-10 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#626C77] truncate">
                {toast.subtitle || toast.region || 'г. Москва и Московская область'}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                {toast.onSecondaryAction && toast.secondaryActionLabel && (
                  <button
                    type="button"
                    onClick={() => handleRunSecondaryAction(toast)}
                    className="h-8 px-3 rounded-full bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-[0.98] shrink-0 whitespace-nowrap"
                  >
                    <span>{toast.secondaryActionLabel}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleGoToCard(toast)}
                  className="h-8 px-3.5 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] shrink-0"
                >
                  <span>К карточке</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#00B956] animate-arrow-pingpong shrink-0" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
