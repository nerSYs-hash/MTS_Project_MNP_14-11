/**
 * Звуковые оповещения через Web Audio API и системные уведомления браузера
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Проиграть мягкий фирменный двойной гонг-оповещение «МТС Таймер»
 */
export function playChimeSound(volume: number = 0.8): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.01, Math.min(volume, 1)), now);
    masterGain.connect(ctx.destination);

    // Нота 1 (Мягкий сигнал E5 ~ 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.4, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.36);

    // Нота 2 (Уверенный мажорный сигнал A5 ~ 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.16);
    gain2.gain.setValueAtTime(0, now + 0.16);
    gain2.gain.linearRampToValueAtTime(0.5, now + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.72);

    // Нота 3 (Финальный звонкий акцент C#6 ~ 1108.7 Hz)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(1108.73, now + 0.32);
    gain3.gain.setValueAtTime(0, now + 0.32);
    gain3.gain.linearRampToValueAtTime(0.35, now + 0.36);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

    osc3.connect(gain3);
    gain3.connect(masterGain);
    osc3.start(now + 0.32);
    osc3.stop(now + 0.96);
  } catch (e) {
    console.warn('Не удалось воспроизвести звуковой сигнал:', e);
  }
}

/**
 * Запрос прав на уведомления браузера
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  
  // В Electron нативные уведомления доступны всегда
  if ((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron) {
    return true;
  }

  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

export interface MtsNotificationPayload {
  title?: string;
  phone: string;
  attempt?: number;
  maxAttempts?: number;
  region?: string;
  leadId?: string;
  body?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

/**
 * Показать всплывающее системное уведомление и запустить экранный тост
 */
export function sendDesktopNotification(
  titleOrPayload: string | MtsNotificationPayload,
  body?: string,
  phone?: string,
  leadId?: string,
  attempt?: number,
  region?: string
): void {
  if (typeof window === 'undefined') return;

  let title = '🔔 Требуется исходящий вызов';
  let phoneVal = phone || '';
  let attemptVal = attempt || 1;
  let maxAttemptsVal = 3;
  let regionVal = region || '';
  let leadIdVal = leadId || '';
  let secondaryActionLabel: string | undefined;
  let onSecondaryAction: (() => void) | undefined;

  if (typeof titleOrPayload === 'object' && titleOrPayload !== null) {
    title = titleOrPayload.title || title;
    phoneVal = titleOrPayload.phone || phoneVal;
    attemptVal = titleOrPayload.attempt ?? attemptVal;
    maxAttemptsVal = titleOrPayload.maxAttempts ?? maxAttemptsVal;
    regionVal = titleOrPayload.region || regionVal;
    leadIdVal = titleOrPayload.leadId || leadIdVal;
    secondaryActionLabel = titleOrPayload.secondaryActionLabel;
    onSecondaryAction = titleOrPayload.onSecondaryAction;
  } else if (typeof titleOrPayload === 'string') {
    title = titleOrPayload;
    if (body) {
      // Попытка извлечь регион из формата "+7 (...) (Город)"
      const match = body.match(/\(([^)]+)\)/);
      if (match && !regionVal) {
        regionVal = match[1];
      }
    }
  }

  // 1. Всегда отправляем внутреннее всплывающее экранное уведомление (Toast)
  try {
    window.dispatchEvent(
      new CustomEvent('mts-inapp-toast', {
        detail: {
          id: String(Date.now() + Math.random()),
          title,
          phone: phoneVal,
          attempt: attemptVal,
          maxAttempts: maxAttemptsVal,
          region: regionVal,
          leadId: leadIdVal,
          secondaryActionLabel,
          onSecondaryAction,
          timestamp: Date.now(),
        },
      })
    );
  } catch (e) {
    console.warn('Toast dispatch error:', e);
  }

  // 2. Если запущено в среде Electron (десктопная версия УРМ)
  const electronAPI = (window as unknown as { electronAPI?: { showNotification?: (t: string, b: string) => void } }).electronAPI;
  const descriptiveBody = `Номер: ${phoneVal || '—'}\nПопытка: ${attemptVal}/${maxAttemptsVal}\nРегион: ${regionVal || 'РФ'}`;
  if (electronAPI && typeof electronAPI.showNotification === 'function') {
    try {
      electronAPI.showNotification(title, descriptiveBody);
      return;
    } catch (e) {
      console.warn('Electron notification error:', e);
    }
  }

  // 3. Стандартные системные уведомления браузера / PWA
  if ('Notification' in window) {
    const fireNotification = () => {
      try {
        const notif = new Notification(title, {
          body: descriptiveBody,
          icon: '/favicon.ico',
          tag: `mts-retention-call-${leadIdVal || phoneVal}`,
        });
        notif.onclick = () => {
          try {
            window.focus();
            if (leadIdVal) {
              window.dispatchEvent(
                new CustomEvent('mts-focus-lead', { detail: { leadId: leadIdVal, phone: phoneVal } })
              );
            }
          } catch {
            // ignore
          }
        };
      } catch (e) {
        console.warn('Ошибка отправки уведомления:', e);
      }
    };

    if (Notification.permission === 'granted') {
      fireNotification();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          fireNotification();
        }
      });
    }
  }
}
