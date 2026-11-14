/**
 * Хук синхронизации с системными часами компьютера оператора
 */
import { useEffect, useState } from 'react';

export interface ClockState {
  nowTimestamp: number;
  localTimeStr: string;
  moscowTimeStr: string;
  currentDateStr: string;
}

export function useSystemClock() {
  const [clock, setClock] = useState<ClockState>(() => getClockSnapshot());

  function getClockSnapshot(): ClockState {
    const now = new Date();
    const nowTimestamp = now.getTime();

    // Локальное время компьютера
    const localTimeStr = now.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Московское время (UTC+3)
    const moscowTimeStr = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);

    const currentDateStr = now.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    return {
      nowTimestamp,
      localTimeStr,
      moscowTimeStr,
      currentDateStr,
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(getClockSnapshot());
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setClock(getClockSnapshot());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  /**
   * Рассчитать оставшееся время до целевой метки перезвона
   */
  const getRemainingTime = (targetTimestamp: number | null) => {
    if (!targetTimestamp) {
      return { totalSeconds: 0, isExpired: false, formatted: '--:--', isOverdue: false };
    }

    const diffMs = targetTimestamp - clock.nowTimestamp;
    const totalSeconds = Math.round(diffMs / 1000);

    if (totalSeconds <= 0) {
      return {
        totalSeconds: 0,
        isExpired: true,
        formatted: '00:00',
        isOverdue: true,
        overdueSeconds: Math.abs(totalSeconds),
      };
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formatted = '';
    if (hours > 0) {
      formatted = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return {
      totalSeconds,
      isExpired: false,
      formatted,
      isOverdue: false,
      overdueSeconds: 0,
    };
  };

  return {
    ...clock,
    getRemainingTime,
  };
}
