/**
 * Рабочее место оператора группы сохранения клиентов МТС (MNP)
 * Полная интеграция: таймеры перезвона, часы ПК, автоопределение поясов РФ и расчет конверсии
 */
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Maximize2 } from 'lucide-react';
import { Header } from './components/Header';
import { KpiDashboard } from './components/KpiDashboard';
import { AddClientForm } from './components/AddClientForm';
import { UrgentAlertBanner } from './components/UrgentAlertBanner';
import { ClientQueue } from './components/ClientQueue';
import { SavedClientsTable } from './components/SavedClientsTable';
import { SettingsModal } from './components/SettingsModal';
import { ChangelogModal } from './components/ChangelogModal';
import { OnboardingGuideModal } from './components/OnboardingGuideModal';
import { NotificationToastContainer, ToastItem } from './components/NotificationToast';
import { EdgeQuickDock } from './components/EdgeQuickDock';
import { BookWorkspaceModal } from './components/BookWorkspaceModal';
import { KalkaModal, createDefaultKalkaZone } from './components/KalkaModal';
import { ReadyTimerModal } from './components/ReadyTimerModal';
import {
  SupervisorAccessModal,
  SupervisorAccount,
  loadActiveAccountSession,
  saveActiveAccountSession,
  syncAccountToUrmConfig,
  savePersonalSettingsSnapshotForUser,
} from './components/SupervisorAccessModal';
import { PostUpdateBanner } from './components/PostUpdateBanner';
import { CURRENT_APP_VERSION } from './utils/updateManager';
import { loadUrmSyncConfig, pushEmployeeStatsToUrmFolder } from './utils/urmStatSync';
import { useSystemClock } from './hooks/useSystemClock';
import {
  ClientLead,
  CallStatus,
  ShiftStats,
  TimerSettings,
  SavedClientRecord,
  SavedClientType,
  ShiftHistoryRecord,
  ShiftHistoryType,
  KalkaZoneItem,
  KalkaTargetAction,
  KalkaDisplayMode,
} from './types';
import {
  loadLeadsFromStorage,
  saveLeadsToStorage,
  loadBackupLeadsFromStorage,
  loadStatsFromStorage,
  saveStatsToStorage,
  loadSettingsFromStorage,
  saveSettingsToStorage,
  loadSavedClientsFromStorage,
  saveSavedClientsToStorage,
  loadShiftHistoryFromStorage,
  saveShiftHistoryToStorage,
  DEFAULT_SETTINGS,
  INITIAL_STATS,
} from './utils/storage';
import {
  cleanPhoneNumber,
  formatPhoneNumber,
  findRegionByPhone,
  cleanToStrictMtsPhone,
} from './data/regionsData';
import { playChimeSound, sendDesktopNotification } from './utils/audioAlert';
import {
  parseMtsClipboardPayload,
  recordLeadOutcomeInSmartBox,
  registerIncomingShareBatch,
  writeMtsTokenToClipboard,
  SharedPackagePayload,
  SavedReceiptPayload,
  SavedReceiptItem,
} from './utils/cardSharing';

export default function App() {
  const clock = useSystemClock();

  // Состояние клиентов, статистики смены и настроек (с автонормализацией активных таймеров)
  const [leads, setLeads] = useState<ClientLead[]>(() => {
    const loaded = loadLeadsFromStorage();
    const now = Date.now();
    return loaded.map((lead) => {
      const isActive =
        lead.status !== 'saved' &&
        lead.status !== 'refused' &&
        lead.status !== 'unreachable';
      const normalizedAttempt =
        isActive &&
        lead.attemptCount === 1 &&
        (lead.id.startsWith('lead-mts-demo-') ||
          !lead.lastCallTime ||
          Math.abs(lead.lastCallTime - lead.createdAt) < 120000)
          ? 0
          : (lead.attemptCount ?? 0);

      if (isActive && (!lead.targetCallbackTime || lead.targetCallbackTime <= 0)) {
        const duration = lead.timerDurationMinutes || 30;
        return {
          ...lead,
          attemptCount: normalizedAttempt,
          status: lead.scheduledByAgreedTime ? ('callback' as CallStatus) : ('answering_machine' as CallStatus),
          targetCallbackTime: now + duration * 60 * 1000,
          timerDurationMinutes: duration,
          scheduledByAgreedTime: Boolean(lead.scheduledByAgreedTime),
        };
      }
      return {
        ...lead,
        attemptCount: normalizedAttempt,
      };
    });
  });
  const [stats, setStats] = useState<ShiftStats>(() => loadStatsFromStorage());
  const [settings, setSettings] = useState<TimerSettings>(() => loadSettingsFromStorage());

  // Сохраненные клиенты (Журнал сохранений)
  const [savedClients, setSavedClients] = useState<SavedClientRecord[]>(() =>
    loadSavedClientsFromStorage()
  );
  // Мост «Статистика смен»: отпечатываются все сохранения, отказы и удаленные карточки
  const [shiftHistory, setShiftHistory] = useState<ShiftHistoryRecord[]>(() =>
    loadShiftHistoryFromStorage()
  );
  const [isSavedTableExpanded, setIsSavedTableExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mts_saved_table_expanded') === 'true';
    } catch {
      return false;
    }
  });

  // Состояние модалок и уведомлений
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isBookWindowOpen, setIsBookWindowOpen] = useState(false);
  const [isKalkaWindowOpen, setIsKalkaWindowOpen] = useState(false);
  const [isReadyTimerWindowOpen, setIsReadyTimerWindowOpen] = useState(false);
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [supervisorSession, setSupervisorSession] = useState<SupervisorAccount | null>(() =>
    loadActiveAccountSession()
  );

  // Состояние «Кальки» (2-я капелька Жемчужины)
  const [kalkaZones, setKalkaZones] = useState<KalkaZoneItem[]>(() => {
    try {
      const raw = localStorage.getItem('mts_kalka_zones_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [createDefaultKalkaZone(0, 'timer')];
  });
  const [kalkaDisplayMode, setKalkaDisplayMode] = useState<KalkaDisplayMode>(() => {
    try {
      const saved = localStorage.getItem('mts_kalka_display_mode_v1');
      if (saved === 'setup' || saved === 'transparent' || saved === 'off') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'off';
  });

  // Состояние «Таймер Ready» (3-я капелька Жемчужины)
  const [readyTargetSeconds, setReadyTargetSeconds] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('mts_ready_timer_target_sec_v1'));
      if (raw > 0) return raw;
    } catch {
      // ignore
    }
    return 27000; // 07:30:00
  });
  const [readyRemainingSeconds, setReadyRemainingSeconds] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('mts_ready_timer_remaining_sec_v1');
      if (raw !== null) {
        const num = Number(raw);
        if (!Number.isNaN(num) && num >= 0) return num;
      }
    } catch {
      // ignore
    }
    return 27000;
  });
  const [isReadyTimerRunning, setIsReadyTimerRunning] = useState<boolean>(false);
  const [readyFavorites, setReadyFavorites] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem('mts_ready_timer_favorites_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [27000, 28800, 21600];
  });
  const [readyTimerScale, setReadyTimerScale] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('mts_urm_ready_timer_scale_v1'));
      if (!Number.isNaN(saved) && saved >= 0.85 && saved <= 2.25) return saved;
    } catch {
      // ignore
    }
    return 1;
  });
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    try {
      return localStorage.getItem('mts_urm_onboarding_completed') !== 'true';
    } catch {
      return false;
    }
  });
  // Лаконичный баннер «Что нового» при первом запуске после обновления через update.asar
  const [isPostUpdateBannerOpen, setIsPostUpdateBannerOpen] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('updated') === '1') {
          return true;
        }
      }
      const seenVersion = localStorage.getItem('mts_urm_seen_release_banner_version');
      return seenVersion !== CURRENT_APP_VERSION;
    } catch {
      return false;
    }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleDismissPostUpdateBanner = () => {
    setIsPostUpdateBannerOpen(false);
    try {
      localStorage.setItem('mts_urm_seen_release_banner_version', CURRENT_APP_VERSION);
      localStorage.setItem('mts_app_installed_version', CURRENT_APP_VERSION);
    } catch {
      // ignore
    }
  };

  // Режим ожидания АРМ (сворачивает форму и очередь, перемещая 4 KPI блока в центр экрана)
  const [isStandbyMode, setIsStandbyMode] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const [isFormCollapsed, setIsFormCollapsed] = useState(false);
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null);

  // Состояния пульсации цифр KPI при изменении
  const [isCallsPulsing, setIsCallsPulsing] = useState(false);
  const [isSavedPulsing, setIsSavedPulsing] = useState(false);

  // Секретный Dev-режим (Вариант А: включается/выключается вводом номера 79293664010)
  const [isDevBranchMode, setIsDevBranchMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mts_urm_dev_branch_mode') === 'true';
    } catch {
      return false;
    }
  });
  const [isPageFlipped, setIsPageFlipped] = useState(false);
  const [clockGlowCycle, setClockGlowCycle] = useState(0);

  const handleTogglePageFlip = () => {
    if (!isDevBranchMode) return;
    setClockGlowCycle((c) => c + 1);
    setIsPageFlipped((prev) => !prev);
  };

  // Отправка уведомлений передачи карточек и результатов в единый Push-контейнер
  const dispatchSharePushToast = (detail: Omit<ToastItem, 'id' | 'timestamp'>) => {
    window.dispatchEvent(
      new CustomEvent('mts-inapp-toast', {
        detail: {
          ...detail,
          id: `share_push_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
        } as ToastItem,
      })
    );
  };

  const toggleDevBranchMode = () => {
    setIsDevBranchMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mts_urm_dev_branch_mode', String(next));
      } catch {
        // ignore
      }
      if (!next) {
        setIsPageFlipped(false);
        setIsBookWindowOpen(false);
        setIsSupervisorModalOpen(false);
      }
      dispatchSharePushToast({
        phone: next ? 'Режим разработки (Dev)' : 'Режим сотрудника v2.8.0',
        badgeText: next ? 'Dev ВКЛ' : 'Dev ВЫКЛ',
        title: next
          ? 'Включены: Жемчужина, Статистика группы, 3D и анимации'
          : 'Экспериментальные функции скрыты',
        subtitle: 'Переключение по коду 79293664010',
      });
      return next;
    });
  };

  // Множество id лидов, о которых уже проигран звуковой сигнал при истечении таймера
  const notifiedLeadIdsRef = useRef<Set<string>>(new Set());
  const queueSectionRef = useRef<HTMLDivElement>(null);

  // Автоматическое обновление заголовка окна программы: МТС_MNP_<версия>
  useEffect(() => {
    document.title = `МТС_MNP_${CURRENT_APP_VERSION}`;
  }, []);

  // Автосохранение в localStorage при изменениях
  useEffect(() => {
    saveLeadsToStorage(leads);
  }, [leads]);

  useEffect(() => {
    saveStatsToStorage(stats);
  }, [stats]);

  useEffect(() => {
    saveSettingsToStorage(settings);
    if (supervisorSession) {
      savePersonalSettingsSnapshotForUser(supervisorSession.login);
    }
  }, [settings, supervisorSession]);

  useEffect(() => {
    saveSavedClientsToStorage(savedClients);
  }, [savedClients]);

  useEffect(() => {
    saveShiftHistoryToStorage(shiftHistory);
  }, [shiftHistory]);

  // Бесконтактная фоновая передача статистики сотрудника в общую папку при каждом изменении или входе в профиль
  useEffect(() => {
    if (supervisorSession) {
      syncAccountToUrmConfig(supervisorSession);
    }
    const cfg = loadUrmSyncConfig();
    if (!cfg.enabled) return;
    const timer = window.setTimeout(() => {
      pushEmployeeStatsToUrmFolder(shiftHistory, stats, cfg).catch(() => {
        // тихая фоновая синхронизация без прерывания работы оператора
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [shiftHistory, stats, supervisorSession]);

  useEffect(() => {
    try {
      localStorage.setItem('mts_saved_table_expanded', String(isSavedTableExpanded));
      if (supervisorSession) {
        savePersonalSettingsSnapshotForUser(supervisorSession.login);
      }
    } catch {
      // ignore
    }
  }, [isSavedTableExpanded, supervisorSession]);

  useEffect(() => {
    if (supervisorSession) {
      savePersonalSettingsSnapshotForUser(supervisorSession.login);
    }
  }, [isDevBranchMode, supervisorSession]);

  // Сохранение настроек «Кальки» и «Таймера Ready» в localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mts_kalka_zones_v1', JSON.stringify(kalkaZones));
    } catch {
      // ignore
    }
  }, [kalkaZones]);

  useEffect(() => {
    try {
      localStorage.setItem('mts_kalka_display_mode_v1', kalkaDisplayMode);
    } catch {
      // ignore
    }
  }, [kalkaDisplayMode]);

  useEffect(() => {
    try {
      localStorage.setItem('mts_ready_timer_target_sec_v1', String(readyTargetSeconds));
    } catch {
      // ignore
    }
  }, [readyTargetSeconds]);

  useEffect(() => {
    try {
      localStorage.setItem('mts_ready_timer_remaining_sec_v1', String(readyRemainingSeconds));
    } catch {
      // ignore
    }
  }, [readyRemainingSeconds]);

  useEffect(() => {
    try {
      localStorage.setItem('mts_ready_timer_favorites_v1', JSON.stringify(readyFavorites));
    } catch {
      // ignore
    }
  }, [readyFavorites]);

  useEffect(() => {
    try {
      localStorage.setItem('mts_urm_ready_timer_scale_v1', String(readyTimerScale));
    } catch {
      // ignore
    }
  }, [readyTimerScale]);

  // Секундный отсчет Таймера Ready и запись отработанного времени Реди в статистику сотрудника
  useEffect(() => {
    if (!isReadyTimerRunning) return;
    const timer = window.setInterval(() => {
      setReadyRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsReadyTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
      setStats((prev) => ({
        ...prev,
        readyTimeSeconds: (prev.readyTimeSeconds || 0) + 1,
      }));
      setShiftHistory((prev) =>
        prev.map((rec, idx) =>
          idx === 0
            ? {
                ...rec,
                readyTimeSeconds: (rec.readyTimeSeconds ?? (stats.readyTimeSeconds || 0)) + 1,
              }
            : rec
        )
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isReadyTimerRunning, stats.readyTimeSeconds]);

  // Управление Таймером Ready и реакция на сигнал «Кальки»
  const handleToggleReadyTimerRun = () => {
    setIsReadyTimerRunning((prevRunning) => {
      if (prevRunning) {
        // 1-е нажатие: пауза таймера
        return false;
      }
      // 2-е нажатие: повторный запуск / продолжение
      setReadyRemainingSeconds((rem) => (rem <= 0 ? readyTargetSeconds : rem));
      return true;
    });
  };

  const handleApplyReadyDuration = (totalSeconds: number) => {
    const safe = Math.max(1, Math.floor(totalSeconds));
    setIsReadyTimerRunning(false);
    setReadyTargetSeconds(safe);
    setReadyRemainingSeconds(safe);
  };

  const handleResetReadyTimer = () => {
    setIsReadyTimerRunning(false);
    setReadyRemainingSeconds(readyTargetSeconds);
  };

  const handleAddReadyFavorite = (totalSeconds: number) => {
    const safe = Math.max(1, Math.floor(totalSeconds));
    setReadyFavorites((prev) => (prev.includes(safe) ? prev : [safe, ...prev]));
  };

  const handleRemoveReadyFavorite = (totalSeconds: number) => {
    setReadyFavorites((prev) => prev.filter((item) => item !== totalSeconds));
  };

  const handleKalkaTriggerAction = (target: KalkaTargetAction) => {
    if (target === 'calls') {
      handleAdjustCalls(1);
    } else if (target === 'saved') {
      handleAdjustSaved(1);
    } else if (target === 'timer') {
      handleToggleReadyTimerRun();
    }
  };

  const kalkaTriggerHandlerRef = useRef(handleKalkaTriggerAction);
  kalkaTriggerHandlerRef.current = handleKalkaTriggerAction;

  const readyTimerHandlersRef = useRef({
    toggleRun: handleToggleReadyTimerRun,
    reset: handleResetReadyTimer,
    applyDuration: handleApplyReadyDuration,
    addFavorite: handleAddReadyFavorite,
    removeFavorite: handleRemoveReadyFavorite,
  });
  readyTimerHandlersRef.current = {
    toggleRun: handleToggleReadyTimerRun,
    reset: handleResetReadyTimer,
    applyDuration: handleApplyReadyDuration,
    addFavorite: handleAddReadyFavorite,
    removeFavorite: handleRemoveReadyFavorite,
  };

  // Синхронизация внешних окон «Кальки» (за пределами рабочего окна приложения) через Electron IPC
  useEffect(() => {
    const api = (window as unknown as {
      electronAPI?: {
        kalkaSyncWindows?: (payload: {
          isOpen?: boolean;
          zones: KalkaZoneItem[];
          displayMode: KalkaDisplayMode;
        }) => Promise<unknown>;
      };
    }).electronAPI;
    if (api?.kalkaSyncWindows) {
      api.kalkaSyncWindows({
        isOpen: isKalkaWindowOpen,
        zones: kalkaZones,
        displayMode: kalkaDisplayMode,
      }).catch(() => {});
    }
  }, [isKalkaWindowOpen, kalkaZones, kalkaDisplayMode]);

  // Слушатель срабатываний и изменений внешних окон «Кальки» из других программ Windows
  useEffect(() => {
    const api = (window as unknown as {
      electronAPI?: {
        onKalkaTrigger?: (cb: (payload: { id: string; target: KalkaTargetAction }) => void) => () => void;
        onKalkaStateChange?: (cb: (payload: Record<string, unknown>) => void) => () => void;
      };
    }).electronAPI;

    const unsubTrigger = api?.onKalkaTrigger
      ? api.onKalkaTrigger((payload) => {
          if (payload?.target) {
            kalkaTriggerHandlerRef.current(payload.target);
          }
        })
      : undefined;

    const unsubState = api?.onKalkaStateChange
      ? api.onKalkaStateChange((payload) => {
          const action = String(payload?.action || '');
          if (action === 'close-control') {
            setIsKalkaWindowOpen(false);
          } else if (action === 'set-mode') {
            const nextMode = payload?.displayMode;
            if (nextMode === 'setup' || nextMode === 'transparent' || nextMode === 'off') {
              setKalkaDisplayMode(nextMode);
            }
          } else if (action === 'set-count') {
            const rawCount = Number(payload?.count);
            const nextCount = Math.max(0, Math.min(12, Number.isNaN(rawCount) ? 0 : Math.floor(rawCount)));
            setKalkaZones((prev) => {
              if (nextCount === prev.length) return prev;
              if (nextCount < prev.length) return prev.slice(0, nextCount);
              const added = [...prev];
              for (let i = prev.length; i < nextCount; i++) {
                added.push(createDefaultKalkaZone(i, 'timer'));
              }
              return added;
            });
          } else if (action === 'set-zone-target') {
            const id = String(payload?.id || '');
            const target = payload?.target as KalkaTargetAction;
            if (id && (target === 'calls' || target === 'saved' || target === 'timer')) {
              setKalkaZones((prev) =>
                prev.map((z) => (z.id === id ? { ...z, target } : z))
              );
            }
          } else if (action === 'delete-zone') {
            const id = String(payload?.id || '');
            setKalkaZones((prev) => prev.filter((z) => z.id !== id));
          } else if (action === 'zone-bounds') {
            const id = String(payload?.id || '');
            const x = Number(payload?.x);
            const y = Number(payload?.y);
            const width = Number(payload?.width);
            const height = Number(payload?.height);
            if (id && !Number.isNaN(x) && !Number.isNaN(y)) {
              setKalkaZones((prev) =>
                prev.map((z) =>
                  z.id === id
                    ? {
                        ...z,
                        x,
                        y,
                        width: !Number.isNaN(width) && width >= 44 ? width : z.width,
                        height: !Number.isNaN(height) && height >= 28 ? height : z.height,
                      }
                    : z
                )
              );
            }
          }
        })
      : undefined;

    return () => {
      if (unsubTrigger) unsubTrigger();
      if (unsubState) unsubState();
    };
  }, []);

  // Синхронизация внешнего окна «Таймер Ready» (за пределами рабочего окна приложения) через Electron IPC
  useEffect(() => {
    const api = (window as unknown as {
      electronAPI?: {
        readyTimerSyncWindow?: (payload: {
          isOpen: boolean;
          remainingSeconds: number;
          targetSeconds: number;
          isRunning: boolean;
          favorites: number[];
          scale: number;
        }) => Promise<unknown>;
      };
    }).electronAPI;
    if (api?.readyTimerSyncWindow) {
      api.readyTimerSyncWindow({
        isOpen: isReadyTimerWindowOpen,
        remainingSeconds: readyRemainingSeconds,
        targetSeconds: readyTargetSeconds,
        isRunning: isReadyTimerRunning,
        favorites: readyFavorites,
        scale: readyTimerScale,
      }).catch(() => {});
    }
  }, [
    isReadyTimerWindowOpen,
    readyRemainingSeconds,
    readyTargetSeconds,
    isReadyTimerRunning,
    readyFavorites,
    readyTimerScale,
  ]);

  // Слушатель команд от внешнего окна «Таймер Ready»
  useEffect(() => {
    const api = (window as unknown as {
      electronAPI?: {
        onReadyTimerAction?: (cb: (payload: Record<string, unknown>) => void) => () => void;
      };
    }).electronAPI;
    if (!api?.onReadyTimerAction) return;
    const unsubscribe = api.onReadyTimerAction((payload) => {
      const action = String(payload?.action || '');
      if (action === 'toggle-run') {
        readyTimerHandlersRef.current.toggleRun();
      } else if (action === 'reset') {
        readyTimerHandlersRef.current.reset();
      } else if (action === 'apply-duration') {
        const sec = Number(payload?.totalSeconds);
        if (!Number.isNaN(sec) && sec > 0) {
          readyTimerHandlersRef.current.applyDuration(sec);
        }
      } else if (action === 'add-favorite') {
        const sec = Number(payload?.totalSeconds);
        if (!Number.isNaN(sec) && sec > 0) {
          readyTimerHandlersRef.current.addFavorite(sec);
        }
      } else if (action === 'remove-favorite') {
        const sec = Number(payload?.totalSeconds);
        if (!Number.isNaN(sec) && sec > 0) {
          readyTimerHandlersRef.current.removeFavorite(sec);
        }
      } else if (action === 'set-scale') {
        const sc = Number(payload?.scale);
        if (!Number.isNaN(sc)) {
          setReadyTimerScale(Math.max(0.85, Math.min(2.25, sc)));
        }
      } else if (action === 'close') {
        setIsReadyTimerWindowOpen(false);
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Проверка истекших таймеров каждую секунду при изменении системных часов
  useEffect(() => {
    const expiredList = leads.filter((lead) => {
      const isActive =
        lead.status !== 'saved' &&
        lead.status !== 'refused' &&
        lead.status !== 'unreachable';
      if (isActive && lead.targetCallbackTime) {
        return lead.targetCallbackTime <= clock.nowTimestamp;
      }
      return false;
    });

    for (const lead of expiredList) {
      if (!notifiedLeadIdsRef.current.has(lead.id)) {
        notifiedLeadIdsRef.current.add(lead.id);

        if (settings.soundEnabled) {
          playChimeSound(settings.volume);
        }

        const isReceivedFromColleague = Boolean(
          lead.sharedReceivedAt || lead.sharedFromName !== undefined
        );

        sendDesktopNotification({
          title: 'Требуется исходящий вызов',
          phone: lead.phone,
          attempt: lead.attemptCount || 1,
          maxAttempts: lead.maxAttempts || 3,
          region: lead.regionName || lead.city || 'Москва',
          leadId: lead.id,
          secondaryActionLabel: isReceivedFromColleague ? 'Вернуть коллеге' : undefined,
          onSecondaryAction: isReceivedFromColleague
            ? () => handleReturnReceivedLeadToColleague(lead.id)
            : undefined,
        });
      }
    }
  }, [clock.nowTimestamp, leads, settings.soundEnabled, settings.volume]);

  // Слушатель перехода к карточке абонента из Push/Toast уведомления
  useEffect(() => {
    const handleFocusLead = (e: Event) => {
      const customEvent = e as CustomEvent<{ leadId?: string; phone?: string }>;
      const { leadId, phone } = customEvent.detail || {};

      setIsStandbyMode(false);

      let targetId = leadId;
      if (!targetId && phone) {
        const found = leads.find((l) => l.phone === phone || l.rawPhone === phone);
        if (found) targetId = found.id;
      }

      if (targetId) {
        setHighlightedLeadId(targetId);
        setTimeout(() => {
          const el = document.getElementById(`card-${targetId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);

        setTimeout(() => {
          setHighlightedLeadId((prev) => (prev === targetId ? null : prev));
        }, 4500);
      }
    };

    window.addEventListener('mts-focus-lead', handleFocusLead);
    return () => window.removeEventListener('mts-focus-lead', handleFocusLead);
  }, [leads]);

  // Вычисление конверсии в процентах
  const recalculateStats = (partial: Partial<ShiftStats>) => {
    setStats((prev) => {
      const updated = { ...prev, ...partial };
      const calls = Math.max(0, updated.totalCallsCount);
      const saved = Math.max(0, updated.savedCount);
      const rate = calls > 0 ? Number(((saved / calls) * 100).toFixed(1)) : 0;
      return {
        ...updated,
        totalCallsCount: calls,
        savedCount: saved,
        conversionRate: rate,
      };
    });
  };

  // Быстрые кнопки +1 и -1 для звонков
  const handleAdjustCalls = (delta: number) => {
    recalculateStats({
      totalCallsCount: Math.max(0, stats.totalCallsCount + delta),
    });
    if (delta > 0) {
      setIsCallsPulsing(true);
      setTimeout(() => setIsCallsPulsing(false), 450);
    }
  };

  // Быстрые кнопки +1 и -1 для сохранений
  const handleAdjustSaved = (delta: number) => {
    recalculateStats({
      savedCount: Math.max(0, stats.savedCount + delta),
    });
    if (delta > 0) {
      setIsSavedPulsing(true);
      setTimeout(() => setIsSavedPulsing(false), 450);
    }
  };

  // Добавление нового клиента через «Записать»
  const handleAddClient = (
    newLeadData: Omit<ClientLead, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const strictCheck = cleanToStrictMtsPhone(newLeadData.rawPhone || newLeadData.phone || '');
    if (strictCheck === '79293664010') {
      toggleDevBranchMode();
      return;
    }

    const id = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    // Запись контакта: прибавляем 1 звонок
    recalculateStats({
      totalCallsCount: stats.totalCallsCount + 1,
    });
    setIsCallsPulsing(true);
    setTimeout(() => setIsCallsPulsing(false), 450);

    const isAgreed = Boolean(newLeadData.scheduledByAgreedTime);
    const defaultTimer = settings.attempt1Minutes || 30;
    const duration = newLeadData.timerDurationMinutes ?? defaultTimer;
    const targetTime = newLeadData.targetCallbackTime ?? (now + duration * 60 * 1000);

    const createdLead: ClientLead = {
      ...newLeadData,
      id,
      status: newLeadData.status || (isAgreed ? 'callback' : 'answering_machine'),
      attemptCount: newLeadData.attemptCount ?? 0,
      maxAttempts: newLeadData.maxAttempts || 3,
      targetCallbackTime: targetTime,
      timerDurationMinutes: duration,
      lastCallTime: newLeadData.lastCallTime || now,
      scheduledByAgreedTime: isAgreed,
      createdAt: now,
      updatedAt: now,
    };

    // Всегда поднимаем новую заполненную заявку первой в списке!
    setLeads((prev) => [createdLead, ...prev]);
  };

  // Обновление статуса звонка существующего клиента
  const handleUpdateStatus = (
    id: string,
    newStatus: CallStatus,
    options?: {
      customTimerMinutes?: number;
      notes?: string;
      isClientAgreed?: boolean;
      attemptCount?: number;
    }
  ) => {
    const now = Date.now();

    setLeads((prev) =>
      prev.map((lead) => {
        if (lead.id !== id) return lead;

        notifiedLeadIdsRef.current.delete(lead.id);

        let nextTargetTime: number | null = null;
        let nextDuration: number | null = null;
        let nextAgreed = lead.scheduledByAgreedTime;
        let nextAttempt = lead.attemptCount;

        const isReceivedFromColleague = Boolean(
          lead.sharedReceivedAt || lead.sharedFromName !== undefined
        );

        if (newStatus === 'callback') {
          nextAttempt =
            options?.attemptCount !== undefined
              ? options.attemptCount
              : lead.attemptCount;
          nextDuration = options?.customTimerMinutes || lead.timerDurationMinutes || 30;
          nextTargetTime = now + nextDuration * 60 * 1000;
          nextAgreed = options?.isClientAgreed !== undefined ? options.isClientAgreed : true;

          // Если собственная карточка возвращается в работу из завершенных статусов — корректируем счётчики
          if (!isReceivedFromColleague) {
            if (lead.status === 'saved') {
              recalculateStats({ savedCount: Math.max(0, stats.savedCount - 1) });
            } else if (lead.status === 'refused') {
              recalculateStats({ refusedCount: Math.max(0, stats.refusedCount - 1) });
            } else if (lead.status === 'unreachable') {
              recalculateStats({ unreachableCount: Math.max(0, (stats.unreachableCount || 0) - 1) });
            }
          }
        } else if (newStatus === 'answering_machine') {
          // Следующая попытка дозвона (авто) — сохраняет заданный для карточки интервал (по умолчанию 30 минут)
          nextAttempt =
            options?.attemptCount !== undefined
              ? options.attemptCount
              : Math.min(lead.maxAttempts, lead.attemptCount + 1);
          nextDuration = options?.customTimerMinutes || lead.timerDurationMinutes || 30;
          nextTargetTime = now + nextDuration * 60 * 1000;
          nextAgreed = false;

          // Если собственная карточка возвращается в работу из завершенных статусов — корректируем счётчики
          if (!isReceivedFromColleague) {
            if (lead.status === 'saved') {
              recalculateStats({ savedCount: Math.max(0, stats.savedCount - 1) });
            } else if (lead.status === 'refused') {
              recalculateStats({ refusedCount: Math.max(0, stats.refusedCount - 1) });
            } else if (lead.status === 'unreachable') {
              recalculateStats({ unreachableCount: Math.max(0, (stats.unreachableCount || 0) - 1) });
            }
          }
        } else if (newStatus === 'saved') {
          nextTargetTime = null;
          nextDuration = null;
          if (lead.status !== 'saved') {
            const rawDigits = cleanToStrictMtsPhone(lead.rawPhone || lead.phone) || cleanPhoneNumber(lead.rawPhone || lead.phone);
            const strictPhone = rawDigits.length === 11 && rawDigits.startsWith('7') ? rawDigits : (rawDigits.length === 10 ? '7' + rawDigits : rawDigits);
            const nowD = new Date();
            const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
            const hasNotes = Boolean(lead.notes && lead.notes.trim().length > 0);
            const isAgreed = !lead.isAnsweringMachineForced && Boolean(lead.scheduledByAgreedTime || lead.status === 'callback' || hasNotes);
            const savedType: SavedClientType = isAgreed ? 'По времени' : 'АВТО';

            let createdSavedRecordId: string | undefined;

            // Зачёт в собственный KPI и таблицу «Номера» идёт ТОЛЬКО по своим карточкам!
            // Если карточка принята от коллеги (isReceivedFromColleague) — у получателя KPI и таблица «Номера» не меняются,
            // а формируется обратная ссылка для зачёта отправителю.
            if (!isReceivedFromColleague) {
              const statsUpdates: Partial<ShiftStats> = {
                savedCount: stats.savedCount + 1,
              };
              if (lead.status === 'refused') {
                statsUpdates.refusedCount = Math.max(0, stats.refusedCount - 1);
              } else if (lead.status === 'unreachable') {
                statsUpdates.unreachableCount = Math.max(0, (stats.unreachableCount || 0) - 1);
              }
              recalculateStats(statsUpdates);
              setIsSavedPulsing(true);
              setTimeout(() => setIsSavedPulsing(false), 450);

              const newRecord: SavedClientRecord = {
                id: `saved_${now}_${Math.random().toString(36).substring(2, 7)}`,
                phone: strictPhone,
                time: timeStr,
                type: savedType,
                timestamp: now,
              };
              createdSavedRecordId = newRecord.id;
              setSavedClients((prev) => [newRecord, ...prev]);
            }

            // Мост в «Статистика смен»: отпечатываем сохранение со всеми данными карточки
            const dateStr =
              lead.sharedOriginalDate ||
              `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
            const finalAttempts =
              options?.attemptCount !== undefined ? options.attemptCount : (lead.attemptCount ?? 0);
            const shareDir: 'sent' | 'received' | undefined = isReceivedFromColleague
              ? 'received'
              : lead.sharedOutToColleague
              ? 'sent'
              : undefined;
            const origLeadId = lead.sharedOriginalLeadId || lead.id;
            const finalNotes = options?.notes !== undefined ? options.notes : (lead.notes || '');

            if (!isReceivedFromColleague) {
              const histRecord: ShiftHistoryRecord = {
                id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
                leadId: lead.id,
                savedRecordId: createdSavedRecordId,
                date: dateStr,
                time: timeStr,
                phone: strictPhone,
                type: savedType,
                attemptCount: finalAttempts,
                shareDirection: shareDir,
                sharedPeerName: lead.sharedFromName,
                sharedOriginalLeadId: origLeadId,
                link: lead.uniqueLink || '',
                city: lead.city || lead.regionName || '',
                notes: finalNotes,
                timestamp: now,
              };
              setShiftHistory((prev) => {
                const existingIdx = prev.findIndex(
                  (r) =>
                    r.leadId === lead.id ||
                    (origLeadId &&
                      r.sharedOriginalLeadId === origLeadId &&
                      r.shareDirection !== 'received')
                );
                if (existingIdx !== -1) {
                  const existing = prev[existingIdx];
                  const updated: ShiftHistoryRecord = {
                    ...existing,
                    ...histRecord,
                    id: existing.id,
                    date: existing.date || histRecord.date,
                    shareDirection: existing.shareDirection || histRecord.shareDirection,
                    deletedByOperator: false,
                  };
                  const copy = [...prev];
                  copy[existingIdx] = updated;
                  return copy;
                }
                return [histRecord, ...prev];
              });
            }

            // Если этот контакт был ранее принят от коллеги — упаковываем в «Умный бокс» (Вариант Б) и вызываем Push
            if (isReceivedFromColleague) {
              const boxRes = recordLeadOutcomeInSmartBox(lead, {
                finalStatus: 'saved',
                historyType: savedType,
                attemptCount: finalAttempts,
                notes: finalNotes,
              });
              const senderLabel =
                lead.sharedFromName && lead.sharedFromName.trim()
                  ? lead.sharedFromName.trim()
                  : 'коллеги';
              const isAllDone = boxRes.isMultiBatch && boxRes.pendingCount === 0;
              dispatchSharePushToast({
                kind: 'share_result_ready',
                phone: isAllDone
                  ? `Бокс готов (${boxRes.totalCount} из ${boxRes.totalCount})`
                  : lead.phone,
                badgeText: boxRes.isMultiBatch
                  ? `Сохранен • ${boxRes.completedCount}/${boxRes.totalCount}`
                  : 'Сохранен',
                title: `От ${senderLabel}`,
                subtitle: boxRes.isMultiBatch
                  ? isAllDone
                    ? `Все ${boxRes.totalCount} шт. обработаны — отправьте ссылку`
                    : `В работе ещё ${boxRes.pendingCount} шт. • можно скопировать сейчас`
                  : `От ${senderLabel}`,
                receiptToken: boxRes.token,
                actionLabel: boxRes.isMultiBatch
                  ? `Скопировать результат (${boxRes.completedCount}/${boxRes.totalCount})`
                  : 'Скопировать результат',
              });
            }
          }
        } else if (newStatus === 'refused') {
          nextTargetTime = null;
          nextDuration = null;
          if (lead.status !== 'refused') {
            if (!isReceivedFromColleague) {
              const statsUpdates: Partial<ShiftStats> = {
                refusedCount: stats.refusedCount + 1,
              };
              if (lead.status === 'saved') {
                statsUpdates.savedCount = Math.max(0, stats.savedCount - 1);
              } else if (lead.status === 'unreachable') {
                statsUpdates.unreachableCount = Math.max(0, (stats.unreachableCount || 0) - 1);
              }
              recalculateStats(statsUpdates);
            }

            // Мост в «Статистика смен»: отпечатываем отказ со всеми данными карточки
            const rawDigits = cleanToStrictMtsPhone(lead.rawPhone || lead.phone) || cleanPhoneNumber(lead.rawPhone || lead.phone);
            const strictPhone = rawDigits.length === 11 && rawDigits.startsWith('7') ? rawDigits : (rawDigits.length === 10 ? '7' + rawDigits : rawDigits);
            const nowD = new Date();
            const dateStr =
              lead.sharedOriginalDate ||
              `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
            const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
            const finalAttempts =
              options?.attemptCount !== undefined ? options.attemptCount : (lead.attemptCount ?? 0);
            const shareDir: 'sent' | 'received' | undefined = isReceivedFromColleague
              ? 'received'
              : lead.sharedOutToColleague
              ? 'sent'
              : undefined;
            const origLeadId = lead.sharedOriginalLeadId || lead.id;
            const finalNotes = options?.notes !== undefined ? options.notes : (lead.notes || '');

            if (!isReceivedFromColleague) {
              const histRecord: ShiftHistoryRecord = {
                id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
                leadId: lead.id,
                date: dateStr,
                time: timeStr,
                phone: strictPhone,
                type: 'Отказ',
                attemptCount: finalAttempts,
                shareDirection: shareDir,
                sharedPeerName: lead.sharedFromName,
                sharedOriginalLeadId: origLeadId,
                link: lead.uniqueLink || '',
                city: lead.city || lead.regionName || '',
                notes: finalNotes,
                timestamp: now,
              };
              setShiftHistory((prev) => {
                const existingIdx = prev.findIndex(
                  (r) =>
                    r.leadId === lead.id ||
                    (origLeadId &&
                      r.sharedOriginalLeadId === origLeadId &&
                      r.shareDirection !== 'received')
                );
                if (existingIdx !== -1) {
                  const existing = prev[existingIdx];
                  const updated: ShiftHistoryRecord = {
                    ...existing,
                    ...histRecord,
                    id: existing.id,
                    date: existing.date || histRecord.date,
                    shareDirection: existing.shareDirection || histRecord.shareDirection,
                    deletedByOperator: false,
                  };
                  const copy = [...prev];
                  copy[existingIdx] = updated;
                  return copy;
                }
                return [histRecord, ...prev];
              });
            }

            if (isReceivedFromColleague) {
              const boxRes = recordLeadOutcomeInSmartBox(lead, {
                finalStatus: 'refused',
                historyType: 'Отказ',
                attemptCount: finalAttempts,
                notes: finalNotes,
              });
              const senderLabel =
                lead.sharedFromName && lead.sharedFromName.trim()
                  ? lead.sharedFromName.trim()
                  : 'коллеги';
              const isAllDone = boxRes.isMultiBatch && boxRes.pendingCount === 0;
              dispatchSharePushToast({
                kind: 'share_result_ready',
                phone: isAllDone
                  ? `Бокс готов (${boxRes.totalCount} из ${boxRes.totalCount})`
                  : lead.phone,
                badgeText: boxRes.isMultiBatch
                  ? `Отказ • ${boxRes.completedCount}/${boxRes.totalCount}`
                  : 'Отказ',
                title: `От ${senderLabel}`,
                subtitle: boxRes.isMultiBatch
                  ? isAllDone
                    ? `Все ${boxRes.totalCount} шт. обработаны — отправьте ссылку`
                    : `В работе ещё ${boxRes.pendingCount} шт. • можно скопировать сейчас`
                  : `От ${senderLabel}`,
                receiptToken: boxRes.token,
                actionLabel: boxRes.isMultiBatch
                  ? `Скопировать результат (${boxRes.completedCount}/${boxRes.totalCount})`
                  : 'Скопировать результат',
              });
            }
          }
        } else if (newStatus === 'unreachable') {
          nextTargetTime = null;
          nextDuration = null;
          if (lead.status !== 'unreachable') {
            const hasNotes = Boolean(lead.notes && lead.notes.trim().length > 0);
            const isAgreed =
              !lead.isAnsweringMachineForced &&
              Boolean(lead.scheduledByAgreedTime || lead.status === 'callback' || hasNotes);

            if (!isReceivedFromColleague) {
              const statsUpdates: Partial<ShiftStats> = {
                unreachableCount: (stats.unreachableCount || 0) + 1,
                unreachableAutoCount: isAgreed
                  ? stats.unreachableAutoCount || 0
                  : (stats.unreachableAutoCount || 0) + 1,
                unreachableCallbackCount: isAgreed
                  ? (stats.unreachableCallbackCount || 0) + 1
                  : stats.unreachableCallbackCount || 0,
              };
              if (lead.status === 'saved') {
                statsUpdates.savedCount = Math.max(0, stats.savedCount - 1);
              } else if (lead.status === 'refused') {
                statsUpdates.refusedCount = Math.max(0, stats.refusedCount - 1);
              }
              recalculateStats(statsUpdates);
            }

            // Мост в «Статистика смен»: отпечатываем Недозвон (3/3) с разделением на «Авто» и «По времени»
            const rawDigits = cleanToStrictMtsPhone(lead.rawPhone || lead.phone) || cleanPhoneNumber(lead.rawPhone || lead.phone);
            const strictPhone = rawDigits.length === 11 && rawDigits.startsWith('7') ? rawDigits : (rawDigits.length === 10 ? '7' + rawDigits : rawDigits);
            const nowD = new Date();
            const dateStr =
              lead.sharedOriginalDate ||
              `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
            const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
            const unreachableType: ShiftHistoryType = isAgreed
              ? 'Недозвон (По времени)'
              : 'Недозвон (Авто)';
            const finalAttempts =
              options?.attemptCount !== undefined ? options.attemptCount : (lead.maxAttempts || 3);
            const shareDir: 'sent' | 'received' | undefined =
              lead.sharedReceivedAt || lead.sharedFromName !== undefined
                ? 'received'
                : lead.sharedOutToColleague
                ? 'sent'
                : undefined;
            const origLeadId = lead.sharedOriginalLeadId || lead.id;
            const finalNotes =
              options?.notes !== undefined
                ? options.notes
                : lead.notes || `Недозвон после 3 перезвонов (3/3 • ${isAgreed ? 'По времени' : 'Авто'})`;

            if (!isReceivedFromColleague) {
              const histRecord: ShiftHistoryRecord = {
                id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
                leadId: lead.id,
                date: dateStr,
                time: timeStr,
                phone: strictPhone,
                type: unreachableType,
                attemptCount: finalAttempts,
                shareDirection: shareDir,
                sharedPeerName: lead.sharedFromName,
                sharedOriginalLeadId: origLeadId,
                link: lead.uniqueLink || '',
                city: lead.city || lead.regionName || '',
                notes: finalNotes,
                timestamp: now,
              };
              setShiftHistory((prev) => {
                const existingIdx = prev.findIndex(
                  (r) =>
                    r.leadId === lead.id ||
                    (origLeadId &&
                      r.sharedOriginalLeadId === origLeadId &&
                      r.shareDirection !== 'received')
                );
                if (existingIdx !== -1) {
                  const existing = prev[existingIdx];
                  const updated: ShiftHistoryRecord = {
                    ...existing,
                    ...histRecord,
                    id: existing.id,
                    date: existing.date || histRecord.date,
                    shareDirection: existing.shareDirection || histRecord.shareDirection,
                    deletedByOperator: false,
                  };
                  const copy = [...prev];
                  copy[existingIdx] = updated;
                  return copy;
                }
                return [histRecord, ...prev];
              });
            }

            if (isReceivedFromColleague) {
              const boxRes = recordLeadOutcomeInSmartBox(lead, {
                finalStatus: 'unreachable',
                historyType: unreachableType,
                attemptCount: finalAttempts,
                notes: finalNotes,
              });
              const senderLabel =
                lead.sharedFromName && lead.sharedFromName.trim()
                  ? lead.sharedFromName.trim()
                  : 'коллеги';
              const isAllDone = boxRes.isMultiBatch && boxRes.pendingCount === 0;
              dispatchSharePushToast({
                kind: 'share_result_ready',
                phone: isAllDone
                  ? `Бокс готов (${boxRes.totalCount} из ${boxRes.totalCount})`
                  : lead.phone,
                badgeText: boxRes.isMultiBatch
                  ? `Недозвон 3/3 • ${boxRes.completedCount}/${boxRes.totalCount}`
                  : 'Недозвон 3/3',
                title: `От ${senderLabel}`,
                subtitle: boxRes.isMultiBatch
                  ? isAllDone
                    ? `Все ${boxRes.totalCount} шт. обработаны — отправьте ссылку`
                    : `В работе ещё ${boxRes.pendingCount} шт. • можно скопировать сейчас`
                  : `От ${senderLabel}`,
                receiptToken: boxRes.token,
                actionLabel: boxRes.isMultiBatch
                  ? `Скопировать результат (${boxRes.completedCount}/${boxRes.totalCount})`
                  : 'Скопировать результат',
              });
            }
          }
        }

        return {
          ...lead,
          status: newStatus,
          attemptCount: options?.attemptCount !== undefined ? options.attemptCount : nextAttempt,
          targetCallbackTime: nextTargetTime,
          timerDurationMinutes: nextDuration,
          scheduledByAgreedTime: nextAgreed,
          lastCallTime: now,
          notes: options?.notes !== undefined ? options.notes : lead.notes,
          updatedAt: now,
        };
      }).filter((lead) => {
        // Если карточка перешла в финальный статус (Сохранен, Отказ, Недозвон 3/3),
        // она уже записана в фоновую память истории смен (shiftHistory) и автоматически
        // убирается из очереди на главном экране (без пометки удаления).
        if (lead.id === id && (newStatus === 'saved' || newStatus === 'refused' || newStatus === 'unreachable')) {
          notifiedLeadIdsRef.current.delete(id);
          return false;
        }
        return true;
      })
    );
  };

  // Удаление незавершенной карточки (отпечатывается в «Статистика смен» с пометкой корзины и типом По времени / АВТО)
  const handleDeleteLead = (id: string) => {
    const targetLead = leads.find((l) => l.id === id);
    const isAlreadyFinished =
      targetLead &&
      (targetLead.status === 'saved' ||
        targetLead.status === 'refused' ||
        targetLead.status === 'unreachable');

    // Помечаем удаление только если собственная карточка не была доведена до итога (чужие карточки от коллеги в личную статистику не пишутся)
    const isReceivedFromColleague = Boolean(
      targetLead &&
        (targetLead.sharedReceivedAt || targetLead.sharedFromName !== undefined)
    );
    if (targetLead && !isAlreadyFinished && !isReceivedFromColleague) {
      const now = Date.now();
      const nowD = new Date();
      const dateStr =
        targetLead.sharedOriginalDate ||
        `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
      const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
      const rawDigits = cleanToStrictMtsPhone(targetLead.rawPhone || targetLead.phone) || cleanPhoneNumber(targetLead.rawPhone || targetLead.phone);
      const strictPhone = rawDigits.length === 11 && rawDigits.startsWith('7') ? rawDigits : (rawDigits.length === 10 ? '7' + rawDigits : rawDigits);
      const isAgreed =
        !targetLead.isAnsweringMachineForced &&
        Boolean(
          targetLead.scheduledByAgreedTime ||
            targetLead.status === 'callback' ||
            (targetLead.notes && targetLead.notes.trim().length > 0)
        );
      const shareDir: 'sent' | 'received' | undefined =
        targetLead.sharedReceivedAt || targetLead.sharedFromName !== undefined
          ? 'received'
          : targetLead.sharedOutToColleague
          ? 'sent'
          : undefined;
      const origLeadId = targetLead.sharedOriginalLeadId || targetLead.id;

      const histRecord: ShiftHistoryRecord = {
        id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
        leadId: targetLead.id,
        deletedByOperator: true,
        date: dateStr,
        time: timeStr,
        phone: strictPhone,
        type: isAgreed ? 'По времени' : 'АВТО',
        attemptCount: targetLead.attemptCount ?? 0,
        shareDirection: shareDir,
        sharedPeerName: targetLead.sharedFromName,
        sharedOriginalLeadId: origLeadId,
        link: targetLead.uniqueLink || '',
        city: targetLead.city || targetLead.regionName || '',
        notes: targetLead.notes || '',
        timestamp: now,
      };
      setShiftHistory((prev) => {
        const existingIdx = prev.findIndex(
          (r) =>
            r.leadId === targetLead.id ||
            (origLeadId && r.sharedOriginalLeadId === origLeadId)
        );
        if (existingIdx !== -1) {
          const existing = prev[existingIdx];
          const copy = [...prev];
          copy[existingIdx] = {
            ...existing,
            ...histRecord,
            id: existing.id,
            date: existing.date || histRecord.date,
            shareDirection: existing.shareDirection || histRecord.shareDirection,
            deletedByOperator: true,
          };
          return copy;
        }
        return [histRecord, ...prev];
      });

      // Б.3: Если получатель удаляет неотработанный контакт от коллеги — формируем токен возврата в «Умном боксе»
      if (targetLead.sharedReceivedAt || targetLead.sharedFromName !== undefined) {
        const boxRes = recordLeadOutcomeInSmartBox(targetLead, {
          finalStatus: 'returned_to_sender',
          attemptCount: targetLead.attemptCount ?? 0,
          notes: targetLead.notes || '',
        });
        const senderLabel =
          targetLead.sharedFromName && targetLead.sharedFromName.trim()
            ? targetLead.sharedFromName.trim()
            : 'коллеги';
        dispatchSharePushToast({
          kind: 'share_result_ready',
          phone: targetLead.phone,
          badgeText: boxRes.isMultiBatch
            ? `Возврат • ${boxRes.completedCount}/${boxRes.totalCount}`
            : 'Возврат коллеге',
          title: `От ${senderLabel}`,
          subtitle: 'Контакт снят с очереди — отправьте возврат коллеге',
          receiptToken: boxRes.token,
          actionLabel: boxRes.isMultiBatch
            ? `Скопировать результат (${boxRes.completedCount}/${boxRes.totalCount})`
            : 'Скопировать возврат',
        });
      }
    }
    notifiedLeadIdsRef.current.delete(id);
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  // Б.3: Возврат неотработанного контакта коллеге в 1 клик прямо из пуш-уведомления
  const handleReturnReceivedLeadToColleague = (leadId: string) => {
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;

    const boxRes = recordLeadOutcomeInSmartBox(targetLead, {
      finalStatus: 'returned_to_sender',
      attemptCount: targetLead.attemptCount ?? 0,
      notes: targetLead.notes || '',
    });
    void writeMtsTokenToClipboard(boxRes.token);

    notifiedLeadIdsRef.current.delete(leadId);
    setLeads((prev) => prev.filter((l) => l.id !== leadId));

    dispatchSharePushToast({
      kind: 'share_result_ready',
      phone: targetLead.phone,
      badgeText: boxRes.isMultiBatch
        ? `Возврат • ${boxRes.completedCount}/${boxRes.totalCount}`
        : 'Возврат скопирован',
      title: 'Ссылка возврата скопирована',
      subtitle: 'Ссылка возврата в буфере — отправьте коллеге в чат',
      receiptToken: boxRes.token,
      actionLabel: 'Скопировать возврат',
    });
  };

  // Обновление заметок (при добавлении заметки заявка переходит в «По времени»)
  const handleUpdateNotes = (id: string, notes: string) => {
    const trimmed = notes.trim();
    const hasNotes = trimmed.length > 0;
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        return {
          ...l,
          notes,
          status: hasNotes
            ? l.status === 'answering_machine'
              ? 'callback'
              : l.status
            : l.isAnsweringMachineForced
            ? 'answering_machine'
            : l.status,
          scheduledByAgreedTime: hasNotes ? true : l.scheduledByAgreedTime,
          isAnsweringMachineForced: hasNotes ? false : l.isAnsweringMachineForced,
          updatedAt: Date.now(),
        };
      })
    );
    setShiftHistory((prev) =>
      prev.map((r) => (r.leadId === id ? { ...r, notes } : r))
    );
  };

  // Редактирование данных карточки (номер телефона, ссылка CRM, город)
  const handleUpdateLead = (id: string, updates: Partial<ClientLead>) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: Date.now() } : l))
    );
    setShiftHistory((prev) =>
      prev.map((r) =>
        r.leadId === id
          ? {
              ...r,
              phone: updates.rawPhone || r.phone,
              link: updates.uniqueLink !== undefined ? updates.uniqueLink : r.link,
              city: updates.city !== undefined ? updates.city : r.city,
              notes: updates.notes !== undefined ? updates.notes : r.notes,
            }
          : r
      )
    );
  };

  // Быстрое копирование номера (строго чистые 11 цифр: 79XXXXXXXXX)
  const handleCopyPhone = (phone: string) => {
    const cleanDigits = cleanPhoneNumber(phone);
    navigator.clipboard.writeText(cleanDigits);
    setCopiedId(phone);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Глобальный перехват копирования: если оператор выделяет ТОЛЬКО номер телефона в любом месте проекта
  // (мышкой, двойным кликом, из инпута или карточки) и нажимает Ctrl+C / Копировать —
  // в буфер обмена попадает чистый номер без скобок и дефисов: 79XXXXXXXXX (не затрагивая ссылки и токены передачи!)
  useEffect(() => {
    const handleGlobalCopy = (e: ClipboardEvent) => {
      const selected = window.getSelection()?.toString()?.trim();
      if (!selected) return;

      // Если выделены буквы, ссылка или токен передачи — никогда не перезаписываем буфер!
      if (!/^[\d\s+()-]+$/.test(selected)) return;

      const digits = selected.replace(/\D/g, '');
      // Российский номер из 11 цифр (начинается с 7 или 8)
      if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
        const clean = '7' + digits.slice(1);
        if (e.clipboardData) {
          e.clipboardData.setData('text/plain', clean);
          e.preventDefault();
        }
      } else if (digits.length === 10 && digits.startsWith('9')) {
        const clean = '7' + digits;
        if (e.clipboardData) {
          e.clipboardData.setData('text/plain', clean);
          e.preventDefault();
        }
      }
    };

    document.addEventListener('copy', handleGlobalCopy);
    return () => document.removeEventListener('copy', handleGlobalCopy);
  }, []);

  // Пометка карточек как «Отправлен коллеге» при копировании ссылки передачи:
  // записываем в «Статистика смен» со значком ↗ и убираем из активной очереди после анимации сдвига вправо
  const handleMarkLeadsSharedOut = (leadIds: string[]) => {
    const now = Date.now();
    const nowD = new Date(now);
    const todayDateStr = `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
    const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;

    const sharedTargets = leads.filter((l) => leadIds.includes(l.id));
    for (const id of leadIds) {
      notifiedLeadIdsRef.current.delete(id);
    }

    setLeads((prev) => prev.filter((l) => !leadIds.includes(l.id)));

    if (sharedTargets.length > 0) {
      setShiftHistory((prev) => {
        const updatedList = [...prev];
        for (let i = 0; i < sharedTargets.length; i++) {
          const target = sharedTargets[i];
          const createdD = new Date(target.createdAt || now);
          const origDateStr =
            target.sharedOriginalDate ||
            todayDateStr ||
            `${String(createdD.getDate()).padStart(2, '0')}.${String(createdD.getMonth() + 1).padStart(2, '0')}.${createdD.getFullYear()}`;
          const rawDigits =
            cleanToStrictMtsPhone(target.rawPhone || target.phone) ||
            cleanPhoneNumber(target.rawPhone || target.phone);
          const strictPhone =
            rawDigits.length === 11 && rawDigits.startsWith('7')
              ? rawDigits
              : rawDigits.length === 10
              ? '7' + rawDigits
              : rawDigits;
          const isAgreed =
            !target.isAnsweringMachineForced &&
            Boolean(
              target.scheduledByAgreedTime ||
                target.status === 'callback' ||
                (target.notes && target.notes.trim().length > 0)
            );
          const origLeadId = target.sharedOriginalLeadId || target.id;

          const existingIdx = updatedList.findIndex(
            (r) =>
              r.leadId === target.id ||
              (origLeadId && r.sharedOriginalLeadId === origLeadId)
          );

          const snapshot: Partial<ClientLead> = {
            id: target.id,
            uniqueLink: target.uniqueLink,
            phone: target.phone,
            rawPhone: target.rawPhone,
            city: target.city,
            regionName: target.regionName,
            timezoneUtc: target.timezoneUtc,
            timezoneMsk: target.timezoneMsk,
            status: target.status,
            attemptCount: target.attemptCount,
            maxAttempts: target.maxAttempts,
            timerDurationMinutes: target.timerDurationMinutes || 30,
            scheduledByAgreedTime: target.scheduledByAgreedTime,
            isAnsweringMachineForced: target.isAnsweringMachineForced,
            notes: target.notes,
          };

          if (existingIdx !== -1) {
            updatedList[existingIdx] = {
              ...updatedList[existingIdx],
              shareDirection: 'sent',
              sharePendingColleague: true,
              sharedOriginalLeadId: origLeadId,
              sharedLeadSnapshot: snapshot,
              attemptCount: target.attemptCount ?? updatedList[existingIdx].attemptCount ?? 0,
            };
          } else {
            updatedList.unshift({
              id: `hist_sent_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`,
              leadId: target.id,
              sharedOriginalLeadId: origLeadId,
              sharePendingColleague: true,
              sharedLeadSnapshot: snapshot,
              date: origDateStr,
              time: timeStr,
              phone: strictPhone,
              type: isAgreed ? 'По времени' : 'АВТО',
              attemptCount: target.attemptCount ?? 0,
              shareDirection: 'sent',
              link: target.uniqueLink || '',
              city: target.city || target.regionName || '',
              notes: target.notes || '',
              timestamp: now,
            });
          }
        }
        return updatedList;
      });
    }
  };

  // Б.1: Возврат «забытого» коллегой номера обратно в свою активную очередь в 1 клик (из Статистики смен или из Пуша)
  const handleReturnSentLeadToOwnQueue = (record: ShiftHistoryRecord) => {
    const now = Date.now();
    const snap = record.sharedLeadSnapshot;
    const rawDigits =
      cleanToStrictMtsPhone(record.phone) || cleanPhoneNumber(record.phone);
    const strictPhone =
      rawDigits.length === 11 && rawDigits.startsWith('7')
        ? rawDigits
        : rawDigits.length === 10
        ? '7' + rawDigits
        : rawDigits;
    const regionInfo = findRegionByPhone(strictPhone);
    const durationMin = snap?.timerDurationMinutes || settings.attempt1Minutes || 30;
    const isAgreed =
      snap?.scheduledByAgreedTime !== undefined
        ? Boolean(snap.scheduledByAgreedTime)
        : record.type === 'По времени';

    const restoredLead: ClientLead = {
      id: snap?.id || record.leadId || `restored_${now}_${Math.random().toString(36).substring(2, 6)}`,
      uniqueLink: record.link || snap?.uniqueLink || '',
      phone: snap?.phone || formatPhoneNumber(strictPhone),
      rawPhone: strictPhone,
      city: record.city || snap?.city || regionInfo?.city || 'Москва',
      regionName: snap?.regionName || record.city || regionInfo?.regionName || 'г. Москва и Московская область',
      timezoneUtc: snap?.timezoneUtc ?? regionInfo?.utcOffset ?? 3,
      timezoneMsk: snap?.timezoneMsk ?? regionInfo?.mskOffset ?? 0,
      status: isAgreed ? 'callback' : 'answering_machine',
      attemptCount: record.attemptCount ?? snap?.attemptCount ?? 0,
      maxAttempts: snap?.maxAttempts || 3,
      targetCallbackTime: now + durationMin * 60 * 1000,
      timerDurationMinutes: durationMin,
      lastCallTime: now,
      scheduledByAgreedTime: isAgreed,
      isAnsweringMachineForced: Boolean(snap?.isAnsweringMachineForced),
      notes: record.notes || snap?.notes || '',
      createdAt: now,
      updatedAt: now,
    };

    setLeads((prev) => {
      const filtered = prev.filter((l) => l.rawPhone !== strictPhone);
      return [restoredLead, ...filtered];
    });

    setShiftHistory((prev) =>
      prev.map((r) =>
        r.id === record.id
          ? {
              ...r,
              sharePendingColleague: false,
            }
          : r
      )
    );

    setIsStandbyMode(false);
    dispatchSharePushToast({
      kind: 'share_imported',
      phone: restoredLead.phone,
      badgeText: 'Возвращён',
      title: 'Возвращён в вашу очередь',
      subtitle: 'Контакт возвращён в работу • таймер перезвона запущен',
    });
  };

  // Приём пакета переданных карточек в очередь (4.А + регистрация «Умного бокса» Вариант Б)
  const applyIncomingSharePackage = (pkg: SharedPackagePayload) => {
    const now = Date.now();
    const nowD = new Date(now);
    const todayDateStr = `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
    const registeredBatchId = registerIncomingShareBatch(pkg);

    setLeads((prev) => {
      const unpackedLeads: ClientLead[] = [];
      const elapsedMs = pkg.sentAt ? Math.max(0, now - pkg.sentAt) : 0;
      for (let i = 0; i < pkg.leads.length; i++) {
        const item = pkg.leads[i];
        const rawRemMs = (item.remSec !== undefined ? item.remSec : (item.durMin || 30) * 60) * 1000;
        const liveTargetTime = item.tgtMs
          ? item.tgtMs
          : now + Math.max(0, rawRemMs - elapsedMs);
        const effectiveStatus: CallStatus = item.st || (item.agr ? 'callback' : 'answering_machine');

        const newLead: ClientLead = {
          id: `shared_${now}_${i}_${Math.random().toString(36).substring(2, 7)}`,
          uniqueLink: item.lnk || '',
          phone: item.ph || formatPhoneNumber(item.rph),
          rawPhone: item.rph,
          city: item.ct || '',
          regionName: item.rg || item.ct || '',
          timezoneUtc: item.utc ?? 3,
          timezoneMsk: item.msk ?? 0,
          status: effectiveStatus,
          attemptCount: item.att ?? 0,
          maxAttempts: item.max || 3,
          targetCallbackTime: liveTargetTime,
          timerDurationMinutes: item.durMin || 30,
          lastCallTime: pkg.sentAt || now,
          scheduledByAgreedTime: Boolean(item.agr),
          isAnsweringMachineForced: Boolean(item.autoF),
          notes: item.nt || '',
          sharedFromName: pkg.sender || '',
          sharedReceivedAt: now,
          sharedOriginalLeadId: item.oid,
          sharedOriginalDate: item.odt || todayDateStr,
          sharedBatchId: registeredBatchId,
          sharedBatchTotal: pkg.leads.length,
          createdAt: now + (pkg.leads.length - i),
          updatedAt: now,
        };
        unpackedLeads.push(newLead);
      }

      const incomingRawPhones = new Set(unpackedLeads.map((u) => u.rawPhone));
      const remainingPrev = prev.filter((p) => !incomingRawPhones.has(p.rawPhone));
      return [...unpackedLeads, ...remainingPrev];
    });

    // Важно: принятый от коллеги контакт НЕ увеличивает счётчик собственных звонков получателя (он уже учтён у отправителя).
    setIsStandbyMode(false);
    const fromText = pkg.sender && pkg.sender.trim() ? `От ${pkg.sender.trim()}` : 'Добавлено в очередь';
    dispatchSharePushToast({
      kind: 'share_imported',
      phone: pkg.leads.length === 1 ? pkg.leads[0].ph : `Контактов: ${pkg.leads.length} шт.`,
      badgeText: 'Принято',
      title: fromText,
      subtitle: `${fromText} • перенесены таймеры и заметки`,
    });
  };

  // Зачёт результата по обратной ссылке от получателя (Вариант Б «Умный бокс» + Б.1 + Б.3)
  // Поддерживает как одиночный контакт, так и промежуточный/финальный бокс из нескольких контактов без дублирования KPI!
  const applyIncomingSavedReceipt = (receipt: SavedReceiptPayload) => {
    const now = Date.now();
    const nowD = new Date(now);
    const todayDateStr = `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
    const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;

    const itemsToProcess: SavedReceiptItem[] =
      receipt.items && receipt.items.length > 0
        ? receipt.items
        : [
            {
              originalLeadId: receipt.originalLeadId,
              originalDate: receipt.originalDate,
              rawPhone: receipt.rawPhone,
              formattedPhone: receipt.formattedPhone,
              city: receipt.city,
              link: receipt.link,
              notes: receipt.notes,
              finalStatus: receipt.finalStatus || 'saved',
              historyType: receipt.historyType,
              attemptCount: receipt.attemptCount,
              remSec: receipt.remSec,
            },
          ];

    let deltaSaved = 0;
    let deltaRefused = 0;
    let deltaUnreach = 0;
    let deltaUnreachCallback = 0;
    let deltaUnreachAuto = 0;
    let returnedToQueueCount = 0;
    let newlyCreditedCount = 0;

    const nextHistory = [...shiftHistory];
    const leadsToRemoveIds = new Set<string>();
    const leadsToRestore: ClientLead[] = [];
    const newSavedRecordsForSender: SavedClientRecord[] = [];

    for (let idx = 0; idx < itemsToProcess.length; idx++) {
      const item = itemsToProcess[idx];
      const rawDigits =
        cleanToStrictMtsPhone(item.rawPhone) || cleanPhoneNumber(item.rawPhone);
      const strictPhone =
        rawDigits.length === 11 && rawDigits.startsWith('7')
          ? rawDigits
          : rawDigits.length === 10
          ? '7' + rawDigits
          : rawDigits;
      const targetDateStr = item.originalDate || receipt.originalDate || todayDateStr;

      const matchedActiveLead = leads.find(
        (l) =>
          l.id === item.originalLeadId ||
          l.sharedOriginalLeadId === item.originalLeadId ||
          l.rawPhone === strictPhone ||
          cleanPhoneNumber(l.phone) === strictPhone
      );

      // Ищем запись отправителя в shiftHistory (предпочитаем записи, которые не являются 'received' у получателя)
      let existingIdx = nextHistory.findIndex(
        (r) =>
          r.shareDirection !== 'received' &&
          ((item.originalLeadId &&
            (r.leadId === item.originalLeadId ||
              r.sharedOriginalLeadId === item.originalLeadId)) ||
            (r.phone === strictPhone && r.date === targetDateStr))
      );
      if (existingIdx === -1) {
        existingIdx = nextHistory.findIndex(
          (r) =>
            r.shareDirection !== 'received' && r.phone === strictPhone
        );
      }
      const existingHist = existingIdx !== -1 ? nextHistory[existingIdx] : undefined;

      // Если коллега вернул неотработанный номер (Б.3: finalStatus === 'returned_to_sender') — возвращаем его в очередь отправителя!
      if (item.finalStatus === 'returned_to_sender') {
        returnedToQueueCount++;
        const snap = existingHist?.sharedLeadSnapshot;
        const regionInfo = findRegionByPhone(strictPhone);
        const durationMin = snap?.timerDurationMinutes || settings.attempt1Minutes || 30;
        const remMs =
          item.remSec && item.remSec > 0
            ? item.remSec * 1000
            : durationMin * 60 * 1000;
        const isAgreed =
          snap?.scheduledByAgreedTime !== undefined
            ? Boolean(snap.scheduledByAgreedTime)
            : existingHist?.type === 'По времени';

        leadsToRestore.push({
          id:
            snap?.id ||
            item.originalLeadId ||
            `returned_${now}_${Math.random().toString(36).substring(2, 6)}`,
          uniqueLink: item.link || existingHist?.link || snap?.uniqueLink || '',
          phone: item.formattedPhone || snap?.phone || formatPhoneNumber(strictPhone),
          rawPhone: strictPhone,
          city: item.city || existingHist?.city || snap?.city || regionInfo?.city || 'Москва',
          regionName:
            snap?.regionName ||
            item.city ||
            existingHist?.city ||
            regionInfo?.regionName ||
            'г. Москва и Московская область',
          timezoneUtc: snap?.timezoneUtc ?? regionInfo?.utcOffset ?? 3,
          timezoneMsk: snap?.timezoneMsk ?? regionInfo?.mskOffset ?? 0,
          status: isAgreed ? 'callback' : 'answering_machine',
          attemptCount: item.attemptCount ?? existingHist?.attemptCount ?? snap?.attemptCount ?? 0,
          maxAttempts: snap?.maxAttempts || 3,
          targetCallbackTime: now + remMs,
          timerDurationMinutes: durationMin,
          lastCallTime: now,
          scheduledByAgreedTime: isAgreed,
          isAnsweringMachineForced: Boolean(snap?.isAnsweringMachineForced),
          notes: item.notes || existingHist?.notes || snap?.notes || '',
          createdAt: now,
          updatedAt: now,
        });

        if (existingIdx !== -1) {
          nextHistory[existingIdx] = {
            ...nextHistory[existingIdx],
            sharePendingColleague: false,
          };
        }
        continue;
      }

      if (matchedActiveLead) {
        notifiedLeadIdsRef.current.delete(matchedActiveLead.id);
        leadsToRemoveIds.add(matchedActiveLead.id);
      }

      // Строгая защита от дублей (Б.1): если этот номер уже был зачтён из предыдущего промежуточного бокса (2 из 3),
      // то при вставке финального бокса (3 из 3) повторно счётчики KPI НЕ увеличиваем!
      const alreadyCredited = Boolean(existingHist?.creditedByColleagueReceipt);
      let createdSavedRecId = existingHist?.savedRecordId;

      if (!alreadyCredited) {
        newlyCreditedCount++;
        if (item.finalStatus === 'saved') {
          deltaSaved++;
          const savedType: SavedClientType =
            item.historyType === 'АВТО' ? 'АВТО' : 'По времени';
          const newSavedRec: SavedClientRecord = {
            id: `saved_rcpt_${now}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
            phone: strictPhone,
            time: timeStr,
            type: savedType,
            timestamp: now,
          };
          createdSavedRecId = newSavedRec.id;
          newSavedRecordsForSender.push(newSavedRec);
        } else if (item.finalStatus === 'refused') {
          deltaRefused++;
        } else if (item.finalStatus === 'unreachable') {
          deltaUnreach++;
          if (item.historyType === 'Недозвон (По времени)') {
            deltaUnreachCallback++;
          } else {
            deltaUnreachAuto++;
          }
        }
      }

      if (existingIdx !== -1) {
        nextHistory[existingIdx] = {
          ...nextHistory[existingIdx],
          savedRecordId: createdSavedRecId || nextHistory[existingIdx].savedRecordId,
          type: item.historyType || 'По времени',
          attemptCount: item.attemptCount ?? 0,
          date: nextHistory[existingIdx].date || targetDateStr,
          shareDirection: 'sent', // значок ↗ у отправителя никогда не меняется
          sharePendingColleague: false,
          creditedByColleagueReceipt: true,
          deletedByOperator: false,
          link: nextHistory[existingIdx].link || item.link || '',
          city: nextHistory[existingIdx].city || item.city || '',
          notes: item.notes || nextHistory[existingIdx].notes,
        };
      } else {
        nextHistory.unshift({
          id: `hist_rcpt_${now}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          leadId: item.originalLeadId,
          savedRecordId: createdSavedRecId,
          sharedOriginalLeadId: item.originalLeadId,
          sharePendingColleague: false,
          creditedByColleagueReceipt: true,
          date: targetDateStr,
          time: timeStr,
          phone: strictPhone,
          type: item.historyType || 'По времени',
          attemptCount: item.attemptCount ?? 0,
          shareDirection: 'sent',
          link: item.link || matchedActiveLead?.uniqueLink || '',
          city: item.city || matchedActiveLead?.city || '',
          notes: item.notes || '',
          timestamp: now,
        });
      }
    }

    if (newSavedRecordsForSender.length > 0) {
      setSavedClients((prev) => {
        const existingPhones = new Set(prev.map((r) => r.phone));
        const uniqueNew = newSavedRecordsForSender.filter(
          (r) => !existingPhones.has(r.phone)
        );
        return uniqueNew.length > 0 ? [...uniqueNew, ...prev] : prev;
      });
    }

    if (leadsToRemoveIds.size > 0 || leadsToRestore.length > 0) {
      setLeads((prev) => {
        const restorePhones = new Set(leadsToRestore.map((r) => r.rawPhone));
        const filtered = prev.filter(
          (l) => !leadsToRemoveIds.has(l.id) && !restorePhones.has(l.rawPhone)
        );
        return [...leadsToRestore, ...filtered];
      });
    }

    if (deltaSaved > 0 || deltaRefused > 0 || deltaUnreach > 0) {
      recalculateStats({
        savedCount: stats.savedCount + deltaSaved,
        refusedCount: stats.refusedCount + deltaRefused,
        unreachableCount: (stats.unreachableCount || 0) + deltaUnreach,
        unreachableCallbackCount:
          (stats.unreachableCallbackCount || 0) + deltaUnreachCallback,
        unreachableAutoCount:
          (stats.unreachableAutoCount || 0) + deltaUnreachAuto,
      });
      if (deltaSaved > 0) {
        setIsSavedPulsing(true);
        setTimeout(() => setIsSavedPulsing(false), 450);
      }
    }

    setShiftHistory(nextHistory);

    // Проверяем, остались ли в этом боксе неотработанные коллегой номера (Б.1)
    const pendingFromReceipt = receipt.pendingLeads || [];
    const pendingHistRecords = nextHistory.filter(
      (r) =>
        r.shareDirection === 'sent' &&
        r.sharePendingColleague &&
        pendingFromReceipt.some(
          (p) =>
            p.oid === r.leadId ||
            p.oid === r.sharedOriginalLeadId ||
            cleanPhoneNumber(p.rph) === r.phone
        )
    );
    const pendingCount = Math.max(pendingFromReceipt.length, pendingHistRecords.length);
    const totalInBox = receipt.batchTotal || itemsToProcess.length + pendingCount;

    if (itemsToProcess.length === 1 && totalInBox <= 1) {
      const single = itemsToProcess[0];
      const strictPh =
        cleanToStrictMtsPhone(single.rawPhone) || cleanPhoneNumber(single.rawPhone);
      const outcomeBadge =
        single.finalStatus === 'returned_to_sender'
          ? 'Возвращён в очередь'
          : single.finalStatus === 'saved'
          ? 'Сохранен'
          : single.finalStatus === 'refused'
          ? 'Отказ'
          : 'Недозвон 3/3';
      dispatchSharePushToast({
        kind: 'share_receipt_credited',
        phone: single.formattedPhone || strictPh,
        badgeText: outcomeBadge,
        title: single.finalStatus === 'returned_to_sender' ? 'Возвращён' : 'Зачтено',
        subtitle:
          single.finalStatus === 'returned_to_sender'
            ? 'Контакт от коллеги возвращён в вашу активную очередь'
            : `Зачтено за ${single.originalDate || todayDateStr} • перезвонов: ${single.attemptCount ?? 0}`,
      });
    } else {
      // Мульти-бокс (например, 2 из 3 или 3 из 3)
      dispatchSharePushToast({
        kind: 'share_receipt_credited',
        phone:
          pendingCount > 0
            ? `Бокс: ${itemsToProcess.length} из ${totalInBox} шт.`
            : `Бокс зачтён: ${itemsToProcess.length} шт.`,
        badgeText:
          pendingCount > 0
            ? `Ещё ${pendingCount} у коллеги`
            : returnedToQueueCount > 0
            ? `Возврат: ${returnedToQueueCount}`
            : `Зачтено: ${newlyCreditedCount || itemsToProcess.length}`,
        title: 'Умный бокс обработан',
        subtitle:
          pendingCount > 0
            ? `${pendingCount} шт. ещё у коллеги — можно вернуть себе в работу`
            : `Все ${itemsToProcess.length} шт. синхронизированы со Статистикой смен`,
        secondaryActionLabel:
          pendingCount > 0
            ? pendingCount === 1
              ? 'Вернуть 1 в очередь'
              : `Вернуть (${pendingCount}) в очередь`
            : undefined,
        onSecondaryAction:
          pendingCount > 0
            ? () => {
                for (const rec of pendingHistRecords) {
                  handleReturnSentLeadToOwnQueue(rec);
                }
              }
            : undefined,
      });
    }
  };

  // Обработчик вставки кода в поле «Ссылка» или ввода секретного номера в Карте клиента
  const handleSpecialPayloadPasteInForm = (rawText: string): boolean => {
    const strictPhone = cleanToStrictMtsPhone(rawText);
    if (strictPhone === '79293664010') {
      toggleDevBranchMode();
      return true;
    }

    const parsed = parseMtsClipboardPayload(rawText);
    if (!parsed) return false;

    if (parsed.type === 'share_package') {
      applyIncomingSharePackage(parsed.payload);
      return true;
    }
    if (parsed.type === 'saved_receipt') {
      applyIncomingSavedReceipt(parsed.payload);
      return true;
    }
    return false;
  };

  // Глобальный перехват Ctrl+V на странице (2.2 — срабатывает ТОЛЬКО на валидный токен MTS-SHARE-V1:: или MTS-SAVED-OK::)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const text = e.clipboardData?.getData('text/plain') || '';
      if (!text) return;

      const parsed = parseMtsClipboardPayload(text);
      if (!parsed) {
        // Обычный текст, телефон или ссылка CRM — вообще не трогаем!
        return;
      }

      e.preventDefault();
      if (parsed.type === 'share_package') {
        setIsStandbyMode(false);
        const pkg = parsed.payload;
        const fromLabel =
          pkg.sender && pkg.sender.trim() ? `От ${pkg.sender.trim()}` : 'От коллеги';
        dispatchSharePushToast({
          kind: 'share_package_prompt',
          phone: pkg.leads.length === 1 ? pkg.leads[0].ph : `Пакет: ${pkg.leads.length} шт.`,
          badgeText: `${pkg.leads.length} шт.`,
          title: fromLabel,
          subtitle: fromLabel,
          onAcceptPackage: () => applyIncomingSharePackage(pkg),
        });
      } else if (parsed.type === 'saved_receipt') {
        setIsStandbyMode(false);
        applyIncomingSavedReceipt(parsed.payload);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  });

  // Переход к очереди перезвонов при клике на KPI карточку «Ожидание / В очереди»
  const handleFocusDueQueue = () => {
    setIsStandbyMode(false);
    const targetLead = expiredLeads[0] || activeLeads[0];
    if (targetLead) {
      setHighlightedLeadId(targetLead.id);
      const el = document.getElementById(`card-${targetLead.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        queueSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      setTimeout(() => {
        setHighlightedLeadId((curr) => (curr === targetLead.id ? null : curr));
      }, 5000);
    } else {
      queueSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Клик по карточке в срочном баннере мгновенно переходит к ней в очереди и подсвечивает
  const handleSelectLeadFromBanner = (id: string) => {
    setIsStandbyMode(false);
    setHighlightedLeadId(id);
    const el = document.getElementById(`card-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      queueSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    setTimeout(() => {
      setHighlightedLeadId((curr) => (curr === id ? null : curr));
    }, 5000);
  };

  // Сброс смены (обнуление счетчиков KPI и очистка очереди для начала новой смены)
  const handleResetShift = () => {
    const now = Date.now();
    const nowD = new Date();
    const dateStr = `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
    const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;

    const unfinishedLeads = leads.filter(
      (l) =>
        l.status !== 'saved' &&
        l.status !== 'refused' &&
        l.status !== 'unreachable' &&
        !l.id.startsWith('lead-mts-demo-')
    );

    if (unfinishedLeads.length > 0) {
      const archivedUnfinished: ShiftHistoryRecord[] = unfinishedLeads.map((targetLead, idx) => {
        const rawDigits =
          cleanToStrictMtsPhone(targetLead.rawPhone || targetLead.phone) ||
          cleanPhoneNumber(targetLead.rawPhone || targetLead.phone);
        const strictPhone =
          rawDigits.length === 11 && rawDigits.startsWith('7')
            ? rawDigits
            : rawDigits.length === 10
            ? '7' + rawDigits
            : rawDigits;
        const isAgreed =
          !targetLead.isAnsweringMachineForced &&
          Boolean(
            targetLead.scheduledByAgreedTime ||
              targetLead.status === 'callback' ||
              (targetLead.notes && targetLead.notes.trim().length > 0)
          );
        const shareDir: 'sent' | 'received' | undefined =
          targetLead.sharedReceivedAt || targetLead.sharedFromName !== undefined
            ? 'received'
            : targetLead.sharedOutToColleague
            ? 'sent'
            : undefined;
        return {
          id: `hist_${now}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          leadId: targetLead.id,
          sharedOriginalLeadId: targetLead.sharedOriginalLeadId || targetLead.id,
          deletedByOperator: true,
          date: targetLead.sharedOriginalDate || dateStr,
          time: timeStr,
          phone: strictPhone,
          type: isAgreed ? 'По времени' : 'АВТО',
          attemptCount: targetLead.attemptCount ?? 0,
          shareDirection: shareDir,
          sharedPeerName: targetLead.sharedFromName,
          link: targetLead.uniqueLink || '',
          city: targetLead.city || targetLead.regionName || '',
          notes: targetLead.notes || 'Не завершена до конца смены',
          timestamp: now,
        };
      });
      setShiftHistory((prev) => [...archivedUnfinished, ...prev]);
    }

    setLeads([]);
    setSavedClients([]);
    setStats({
      savedCount: 0,
      totalCallsCount: 0,
      conversionRate: 0,
      unreachableCount: 0,
      unreachableAutoCount: 0,
      unreachableCallbackCount: 0,
      refusedCount: 0,
      savedWithoutTpChange: 0,
      savedWithEi: 0,
      shiftStartTime: now,
    });
    notifiedLeadIdsRef.current.clear();
  };

  // Ежедневная автоочистка карточек KPI и незавершенной очереди после 00:00 (если включена в настройках)
  useEffect(() => {
    if (settings.autoClearShiftAtMidnight === false) return;
    const LAST_SHIFT_DATE_KEY = 'mts_retention_last_shift_date_v1';
    const currentDayKey = clock.currentDateStr; // ДД.ММ.ГГГГ по часам ПК
    if (!currentDayKey) return;

    try {
      const storedDayKey = localStorage.getItem(LAST_SHIFT_DATE_KEY);
      if (!storedDayKey) {
        localStorage.setItem(LAST_SHIFT_DATE_KEY, currentDayKey);
        return;
      }
      if (storedDayKey !== currentDayKey) {
        localStorage.setItem(LAST_SHIFT_DATE_KEY, currentDayKey);
        handleResetShift();
      }
    } catch {
      // ignore storage errors
    }
  }, [clock.currentDateStr, settings.autoClearShiftAtMidnight]);

  // Изменение счетчика «Без смены ТП»
  const handleAdjustSavedWithoutTpChange = (delta: number) => {
    const currentSub = stats.savedWithoutTpChange || 0;
    const nextSub = Math.max(0, currentSub + delta);
    const diff = nextSub - currentSub;
    const shouldInclude = settings.includeWithoutTpInSaved !== false;
    recalculateStats({
      savedWithoutTpChange: nextSub,
      savedCount: shouldInclude ? Math.max(0, stats.savedCount + diff) : stats.savedCount,
    });
  };

  // Изменение счетчика «ЕИ» (Единый Инструмент)
  const handleAdjustSavedWithEi = (delta: number) => {
    const currentSub = stats.savedWithEi || 0;
    const nextSub = Math.max(0, currentSub + delta);
    const diff = nextSub - currentSub;
    const shouldInclude = settings.includeEiInSaved !== false;
    recalculateStats({
      savedWithEi: nextSub,
      savedCount: shouldInclude ? Math.max(0, stats.savedCount + diff) : stats.savedCount,
    });
  };

  // Ручная отмена по СЗ для «Без смены ТП» (мгновенно отнимает 1 из Сохранений даже при выключенном тумблере)
  const handleManualSzDeductWithoutTp = () => {
    const currentSub = stats.savedWithoutTpChange || 0;
    const nextSub = Math.max(0, currentSub - 1);
    recalculateStats({
      savedWithoutTpChange: nextSub,
      savedCount: Math.max(0, stats.savedCount - 1),
    });
  };

  // Ручной учет по СЗ для «Без смены ТП» (мгновенно прибавляет 1 в Сохранения даже при выключенном тумблере)
  const handleManualSzAddWithoutTp = () => {
    const currentSub = stats.savedWithoutTpChange || 0;
    recalculateStats({
      savedWithoutTpChange: currentSub + 1,
      savedCount: stats.savedCount + 1,
    });
  };

  // Ручная отмена по СЗ для «ЕИ»
  const handleManualSzDeductEi = () => {
    const currentSub = stats.savedWithEi || 0;
    const nextSub = Math.max(0, currentSub - 1);
    recalculateStats({
      savedWithEi: nextSub,
      savedCount: Math.max(0, stats.savedCount - 1),
    });
  };

  // Ручной учет по СЗ для «ЕИ»
  const handleManualSzAddEi = () => {
    const currentSub = stats.savedWithEi || 0;
    recalculateStats({
      savedWithEi: currentSub + 1,
      savedCount: stats.savedCount + 1,
    });
  };

  // Сохранение настроек с мгновенной синхронизацией сохраненных позиций при переключении тумблеров
  const handleSaveSettings = (newSettings: TimerSettings) => {
    let deltaSaved = 0;
    const wasWithoutTp = settings.includeWithoutTpInSaved !== false;
    const nowWithoutTp = newSettings.includeWithoutTpInSaved !== false;
    if (wasWithoutTp && !nowWithoutTp) {
      deltaSaved -= (stats.savedWithoutTpChange || 0);
    } else if (!wasWithoutTp && nowWithoutTp) {
      deltaSaved += (stats.savedWithoutTpChange || 0);
    }

    const wasEi = settings.includeEiInSaved !== false;
    const nowEi = newSettings.includeEiInSaved !== false;
    if (wasEi && !nowEi) {
      deltaSaved -= (stats.savedWithEi || 0);
    } else if (!wasEi && nowEi) {
      deltaSaved += (stats.savedWithEi || 0);
    }

    if (deltaSaved !== 0) {
      recalculateStats({
        savedCount: Math.max(0, stats.savedCount + deltaSaved),
      });
    }

    setSettings(newSettings);
  };

  // Восстановление заявок из автоматической резервной копии
  const handleRestoreBackup = (): boolean => {
    const backup = loadBackupLeadsFromStorage();
    if (backup && backup.length > 0) {
      setLeads(backup);
      return true;
    }
    return false;
  };

  // Быстрый текстовый импорт номеров для восстановления списка (из Excel, CRM, Блокнота)
  const handleImportLeadsText = (text: string): number => {
    if (!text || !text.trim()) return 0;

    // Извлечение последовательностей цифр или номеров
    const rawMatches = text.match(/(?:(?:\+?7|8)[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{2}[-.\s]?[0-9]{2}/g) || [];
    const extractedNumbers: string[] = [];

    // Также пробуем построчно
    const lines = text.split(/[\r\n;,]+/);
    for (const line of lines) {
      const cleaned = cleanPhoneNumber(line);
      if (cleaned.length >= 10) {
        const normalized = cleaned.length === 10 ? '7' + cleaned : (cleaned.startsWith('8') ? '7' + cleaned.slice(1) : cleaned);
        if (normalized.length === 11 && !extractedNumbers.includes(normalized)) {
          extractedNumbers.push(normalized);
        }
      }
    }

    for (const m of rawMatches) {
      const cleaned = cleanPhoneNumber(m);
      const normalized = cleaned.length === 10 ? '7' + cleaned : (cleaned.startsWith('8') ? '7' + cleaned.slice(1) : cleaned);
      if (normalized.length === 11 && !extractedNumbers.includes(normalized)) {
        extractedNumbers.push(normalized);
      }
    }

    if (extractedNumbers.length === 0) return 0;

    const now = Date.now();
    const newLeads: ClientLead[] = extractedNumbers.map((raw, idx) => {
      const reg = findRegionByPhone(raw);
      return {
        id: `restored_${now}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        phone: formatPhoneNumber(raw),
        rawPhone: raw,
        city: reg?.city || '',
        regionName: reg?.regionName || '',
        uniqueLink: '',
        timezoneUtc: reg?.utcOffset ?? 3,
        timezoneMsk: reg?.mskOffset ?? 0,
        status: 'callback' as CallStatus,
        attemptCount: 0,
        maxAttempts: 3,
        targetCallbackTime: now + 30 * 60 * 1000,
        timerDurationMinutes: 30,
        lastCallTime: null,
        scheduledByAgreedTime: false,
        notes: 'Восстановлен из списка',
        createdAt: now - idx * 1000,
        updatedAt: now,
      };
    });

    setLeads((prev) => [...newLeads, ...prev]);
    return newLeads.length;
  };

  // Добавление сохранения через быстрое поле ввода номера и кнопку MNP
  const handleAddMnpSaved = (rawInput: string): { success: boolean; message?: string } => {
    const strict = cleanToStrictMtsPhone(rawInput);
    if (!strict) {
      return { success: false, message: 'Неверный формат номера (нужно 10-11 цифр)' };
    }

    // Вариант А: Ввод секретного номера 79293664010 переключает Dev-режим (раскрывает/скрывает Жемчужину, Статистику смен, 3D-поворот и анимации)
    if (strict === '79293664010') {
      toggleDevBranchMode();
      return { success: true };
    }

    const now = Date.now();
    const nowD = new Date();
    const timeStr = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;

    // Проверяем: был ли номер в АВТО или ПО просьбе (в очереди активных клиентов)
    const existingActiveLead = leads.find(
      (l) =>
        (l.rawPhone === strict || cleanToStrictMtsPhone(l.phone) === strict) &&
        l.status !== 'saved' &&
        l.status !== 'refused' &&
        l.status !== 'unreachable'
    );

    if (existingActiveLead) {
      // Номер БЫЛ в очереди: переводим в статус saved (звонок уже был учтен при создании)
      handleUpdateStatus(existingActiveLead.id, 'saved');
    } else {
      // Номера НЕ БЫЛО в очереди: прямой звонок клиенту, который сразу согласился на сохранение!
      // Идет +1 в Звонки и +1 в Сохранения:
      recalculateStats({
        totalCallsCount: stats.totalCallsCount + 1,
        savedCount: stats.savedCount + 1,
      });
      setIsCallsPulsing(true);
      setIsSavedPulsing(true);
      setTimeout(() => {
        setIsCallsPulsing(false);
        setIsSavedPulsing(false);
      }, 450);

      // Заносим запись в таблицу сохраненных клиентов с типом MNP
      const newRecord: SavedClientRecord = {
        id: `saved_${now}_${Math.random().toString(36).substring(2, 7)}`,
        phone: strict,
        time: timeStr,
        type: 'MNP',
        timestamp: now,
      };

      setSavedClients((prev) => [newRecord, ...prev]);

      // Мост в «Статистика смен» для прямого сохранения MNP
      const reg = findRegionByPhone(strict);
      const dateStr = `${String(nowD.getDate()).padStart(2, '0')}.${String(nowD.getMonth() + 1).padStart(2, '0')}.${nowD.getFullYear()}`;
      const histRecord: ShiftHistoryRecord = {
        id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
        savedRecordId: newRecord.id,
        date: dateStr,
        time: timeStr,
        phone: strict,
        type: 'MNP',
        attemptCount: 0,
        link: '',
        city: reg?.city || '',
        notes: '',
        timestamp: now,
      };
      setShiftHistory((prev) => [histRecord, ...prev]);
    }

    return { success: true };
  };

  // Удаление записи из таблицы сохраненных (в Статистике смен запись остаётся, но помечается как удалённая сотрудником!)
  const handleDeleteSavedRecord = (id: string) => {
    const targetSaved = savedClients.find((r) => r.id === id);
    setSavedClients((prev) => prev.filter((r) => r.id !== id));
    setShiftHistory((prev) => {
      let matched = false;
      return prev.map((hist) => {
        if (hist.savedRecordId === id) {
          matched = true;
          return { ...hist, deletedByOperator: true };
        }
        if (
          !matched &&
          targetSaved &&
          hist.phone === targetSaved.phone &&
          !hist.deletedByOperator
        ) {
          matched = true;
          return { ...hist, deletedByOperator: true };
        }
        return hist;
      });
    });
  };

  // Удаление строки из «Статистика смен» (крестик в конце столбика заметок)
  const handleDeleteShiftHistoryRecord = (id: string) => {
    setShiftHistory((prev) => prev.filter((r) => r.id !== id));
  };

  // Активные клиенты в очереди (все, кто ожидает звонка)
  const activeLeads = leads.filter(
    (l) => l.status !== 'saved' && l.status !== 'refused' && l.status !== 'unreachable'
  );
  const activeTimersCount = activeLeads.length;
  const isAutoLeadFn = (l: ClientLead) => {
    if (l.isAnsweringMachineForced || l.status === 'answering_machine') return true;
    const hasNotes = Boolean(l.notes && l.notes.trim().length > 0);
    if (!hasNotes) return true;
    return !l.scheduledByAgreedTime && l.status !== 'callback';
  };
  const autoCallbacksCount = activeLeads.filter(isAutoLeadFn).length;
  const clientAgreedCallbacksCount = activeLeads.filter((l) => !isAutoLeadFn(l)).length;

  // Истекшие таймеры (кому подошло время звонить прямо сейчас)
  const expiredLeads = activeLeads.filter((lead) => {
    if (lead.targetCallbackTime) {
      return clock.getRemainingTime(lead.targetCallbackTime).isExpired;
    }
    return false;
  });


  // Отслеживание активности оператора на странице (движение мыши, клики, ввод текста, скролл)
  useEffect(() => {
    const recordUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', recordUserActivity, { passive: true });
    window.addEventListener('mousedown', recordUserActivity, { passive: true });
    window.addEventListener('keydown', recordUserActivity, { passive: true });
    window.addEventListener('input', recordUserActivity, { passive: true });
    window.addEventListener('wheel', recordUserActivity, { passive: true });
    window.addEventListener('touchstart', recordUserActivity, { passive: true });
    window.addEventListener('scroll', recordUserActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', recordUserActivity);
      window.removeEventListener('mousedown', recordUserActivity);
      window.removeEventListener('keydown', recordUserActivity);
      window.removeEventListener('input', recordUserActivity);
      window.removeEventListener('wheel', recordUserActivity);
      window.removeEventListener('touchstart', recordUserActivity);
      window.removeEventListener('scroll', recordUserActivity);
    };
  }, []);

  // Переключение режима ожидания вручную
  const handleToggleStandby = () => {
    lastActivityRef.current = Date.now();
    setIsStandbyMode((prev) => !prev);
  };

  const handleExpandWorkspace = () => {
    lastActivityRef.current = Date.now();
    setIsStandbyMode(false);
  };

  // Автосворачивание рабочего места в центр экрана при неактивности оператора
  useEffect(() => {
    const delayMinutes = settings.collapseDelayMinutes;
    // Если 0 или не задано — автосворачивание полностью выключено
    if (!delayMinutes || delayMinutes <= 0) return;

    const interval = setInterval(() => {
      // Если уже свернуто, открыто модальное окно настроек или есть горящие звонки — не сворачиваем
      if (isStandbyMode || isSettingsOpen || isSupervisorModalOpen || expiredLeads.length > 0) {
        return;
      }

      // Если оператор прямо сейчас печатает в поле ввода (телефон, город, ссылка, заметки) — не сворачиваем
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        lastActivityRef.current = Date.now();
        return;
      }

      const elapsed = Date.now() - lastActivityRef.current;
      const thresholdMs = delayMinutes * 60 * 1000;
      if (elapsed >= thresholdMs) {
        setIsStandbyMode(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [settings.collapseDelayMinutes, isStandbyMode, isSettingsOpen, isSupervisorModalOpen, expiredLeads.length]);

  // КОГДА ПРИШЛО ВРЕМЯ ПЕРЕЗВОНА — мгновенно автоматически разворачиваем всё рабочее место!
  useEffect(() => {
    if (expiredLeads.length > 0 && isStandbyMode) {
      lastActivityRef.current = Date.now();
      setIsStandbyMode(false);
    }
  }, [expiredLeads.length, isStandbyMode]);

  // Блокировка прокрутки основной страницы только пока открыта «Статистика смен»
  useEffect(() => {
    if (isBookWindowOpen && isDevBranchMode) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isBookWindowOpen, isDevBranchMode]);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1D2023] flex flex-col font-mts-text overflow-x-clip">
      {/* Шапка МТС (закреплена наверху при любой прокрутке страницы и неподвижна при перелистывании рабочей области) */}
      <Header
        localTimeStr={clock.localTimeStr}
        moscowTimeStr={clock.moscowTimeStr}
        currentDateStr={clock.currentDateStr}
        settings={settings}
        onToggleSound={() =>
          setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReport={() => setIsSettingsOpen(true)}
        /* onOpenChangelog временно отключен в данном цикле обновлений */
        onOpenGuide={() => setIsOnboardingOpen(true)}
        activeTimersCount={activeTimersCount}
        isStandbyMode={isStandbyMode}
        onToggleStandby={handleToggleStandby}
        isDevMode={isDevBranchMode}
        isPageFlipped={isDevBranchMode ? isPageFlipped : false}
        clockGlowCycle={isDevBranchMode ? clockGlowCycle : 0}
        onTogglePageFlip={isDevBranchMode ? handleTogglePageFlip : undefined}
        activeAccount={supervisorSession}
        onOpenAccountModal={() => setIsSupervisorModalOpen(true)}
        onLogoutAccount={() => {
          if (supervisorSession) {
            savePersonalSettingsSnapshotForUser(supervisorSession.login);
          }
          saveActiveAccountSession(null);
          setSupervisorSession(null);
        }}
      />

      {/* Компенсатор высоты закрепленной верхней панели (h-18) */}
      <div className="h-18 shrink-0" aria-hidden="true" />

      {/* Основная рабочая область оператора (в Dev-режиме поддерживает 3D-разворот на 180°) */}
      <div className={`flex-1 flex flex-col relative ${isDevBranchMode ? 'mts-3d-stage overflow-x-clip' : 'bg-[#F4F5F7]'}`}>
        <div
          className={`flex-1 flex flex-col ${
            isDevBranchMode
              ? `mts-3d-rotator ${isPageFlipped ? 'mts-3d-rotator-back' : 'mts-3d-rotator-front'}`
              : ''
          }`}
        >
          <div
            aria-hidden={isDevBranchMode && (isPageFlipped || isBookWindowOpen)}
            className={`flex-1 flex flex-col bg-[#F4F5F7] ${
              isDevBranchMode ? 'mts-3d-face-front' : ''
            } ${
              isDevBranchMode && (isPageFlipped || isBookWindowOpen)
                ? 'pointer-events-none select-none overflow-hidden'
                : ''
            }`}
          >
            <main
              className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-500 ease-in-out flex flex-col ${
                isStandbyMode ? 'justify-center my-auto py-12 sm:py-16' : 'justify-start py-6'
              }`}
            >
              {/* 4 ключевых блока KPI (в режиме ожидания комфортно расположены чуть ниже центра экрана) */}
              <div
                className={`w-full transition-all duration-500 ease-in-out ${
                  isStandbyMode ? 'pt-12 sm:pt-16 max-w-5xl mx-auto' : 'pt-0'
                }`}
              >
                <KpiDashboard
                  stats={stats}
                  activeTimersCount={activeTimersCount}
                  dueTimersCount={expiredLeads.length}
                  autoCallbacksCount={autoCallbacksCount}
                  clientAgreedCallbacksCount={clientAgreedCallbacksCount}
                  onAdjustCalls={handleAdjustCalls}
                  onAdjustSaved={handleAdjustSaved}
                  onAdjustSavedWithoutTpChange={handleAdjustSavedWithoutTpChange}
                  onAdjustSavedWithEi={handleAdjustSavedWithEi}
                  onFocusDueQueue={handleFocusDueQueue}
                  kpiFontWeight={settings.kpiFontWeight || 'normal'}
                  isCallsPulsing={isCallsPulsing}
                  isSavedPulsing={isSavedPulsing}
                />

                {/* В свернутом режиме (ожидание): поле ввода номера и таблица номеров ровно между KPI и кнопкой развернуть */}
                {isStandbyMode && settings.enableNumbersAccounting !== false && (
                  <div className="mt-6 max-w-2xl mx-auto w-full animate-in fade-in duration-300">
                    <SavedClientsTable
                      savedClients={savedClients}
                      onAddMnpSaved={handleAddMnpSaved}
                      onDeleteRecord={handleDeleteSavedRecord}
                      isExpanded={isSavedTableExpanded}
                      onToggleExpanded={() => setIsSavedTableExpanded((prev) => !prev)}
                      isStandbyMode={true}
                    />
                  </div>
                )}

                {/* Плашка режима ожидания по центру экрана */}
                <div
                  className={`transition-all duration-500 ease-in-out overflow-hidden flex flex-col items-center justify-center text-center ${
                    isStandbyMode
                      ? 'max-h-40 opacity-100 translate-y-0 mt-6 pointer-events-auto'
                      : 'max-h-0 opacity-0 -translate-y-4 pointer-events-none mt-0'
                  }`}
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-[#E4E7EC] shadow-xs text-xs font-semibold text-[#626C77]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>
                      Режим ожидания • Карточки свернуты • При перезвоне экран откроется автоматически
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleExpandWorkspace}
                    className="mt-3.5 inline-flex items-center gap-2 h-11 px-7 rounded-full bg-[#FF0023] hover:bg-[#E30613] active:scale-[0.98] text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                    title="Развернуть рабочее место"
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span>Развернуть</span>
                  </button>
                </div>
              </div>

              {/* Рабочая область: абсолютно плавное сворачивание/разворачивание через grid-template-rows без рывков */}
              <div
                className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                  isStandbyMode
                    ? 'grid-rows-[0fr] opacity-0 pointer-events-none mt-0'
                    : 'grid-rows-[1fr] opacity-100 pointer-events-auto mt-5'
                }`}
              >
                <div className={`${isStandbyMode ? 'overflow-hidden' : 'overflow-visible'} space-y-5`}>
                  {/* Блок таблицы номеров и исходящих вызовов */}
                  {!isStandbyMode && (
                    settings.enableNumbersAccounting !== false ? (
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start">
                          {/* Таблица номеров: ширина как 2 блока KPI (col-span-2) */}
                          <div className="lg:col-span-2">
                            <SavedClientsTable
                              savedClients={savedClients}
                              onAddMnpSaved={handleAddMnpSaved}
                              onDeleteRecord={handleDeleteSavedRecord}
                              isExpanded={isSavedTableExpanded}
                              onToggleExpanded={() => setIsSavedTableExpanded((prev) => !prev)}
                              isStandbyMode={false}
                            />
                          </div>

                          {/* Правая часть (под двумя другими блоками KPI): плавно появляется/сворачивается при развертывании таблицы */}
                          <div
                            className={`lg:col-span-2 grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.2,0,0,1)] ${
                              isSavedTableExpanded
                                ? 'grid-rows-[1fr] opacity-100 pointer-events-auto'
                                : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                            }`}
                          >
                            <div className="overflow-hidden space-y-4">
                              {expiredLeads.length > 0 ? (
                                <UrgentAlertBanner
                                  expiredLeads={expiredLeads}
                                  onCopyPhone={handleCopyPhone}
                                  copiedId={copiedId}
                                  onSelectLead={handleSelectLeadFromBanner}
                                />
                              ) : (
                                <div className="bg-white border border-[#E2E8F0] rounded-3xl p-4 sm:p-5 shadow-mts-card flex items-center justify-between">
                                  <div>
                                    <h4 className="text-sm font-bold text-[#1D2023] font-mts-extended">
                                      Все вызовы в графике
                                    </h4>
                                    <p className="text-xs text-[#626C77] mt-0.5">
                                      Срочных исходящих звонков прямо сейчас нет
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={handleFocusDueQueue}
                                    className="h-9 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-xs font-bold text-[#1D2023] transition-colors cursor-pointer"
                                  >
                                    К очереди
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Когда таблица свернута И есть срочные вызовы — показываем их на всю ширину под строкой */}
                        <div
                          className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.2,0,0,1)] ${
                            !isSavedTableExpanded && expiredLeads.length > 0
                              ? 'grid-rows-[1fr] opacity-100 pointer-events-auto'
                              : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <UrgentAlertBanner
                              expiredLeads={expiredLeads}
                              onCopyPhone={handleCopyPhone}
                              copiedId={copiedId}
                              onSelectLead={handleSelectLeadFromBanner}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Когда учёт номеров выключен — обычный баннер срочных вызовов */
                      <UrgentAlertBanner
                        expiredLeads={expiredLeads}
                        onCopyPhone={handleCopyPhone}
                        copiedId={copiedId}
                        onSelectLead={handleSelectLeadFromBanner}
                      />
                    )
                  )}

                  {/* Карточка Клиента */}
                  <AddClientForm
                    onAddClient={handleAddClient}
                    defaultAttempt1Minutes={settings.attempt1Minutes || 30}
                    onSpecialPayloadPaste={handleSpecialPayloadPasteInForm}
                  />

                  {/* Очередь звонков (поиск, фильтры и все карточки абонентов) */}
                  <div ref={queueSectionRef}>
                    <ClientQueue
                      leads={leads}
                      onUpdateStatus={handleUpdateStatus}
                      onDeleteLead={handleDeleteLead}
                      onUpdateNotes={handleUpdateNotes}
                      onUpdateLead={handleUpdateLead}
                      onMarkLeadsSharedOut={handleMarkLeadsSharedOut}
                      getRemainingTime={clock.getRemainingTime}
                      highlightedLeadId={highlightedLeadId}
                    />
                  </div>
                </div>
              </div>
            </main>
          </div>

          {isDevBranchMode && (
            <div
              aria-hidden={!isPageFlipped}
              className="absolute inset-0 bg-[#F4F5F7] mts-3d-face-back pointer-events-none select-none"
            />
          )}
        </div>
      </div>

      {/* Модальное окно настроек и отчета смены */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        stats={stats}
        leads={leads}
        onResetShift={handleResetShift}
        onRestoreBackup={handleRestoreBackup}
        onImportLeadsText={handleImportLeadsText}
        onOpenGuide={() => setIsOnboardingOpen(true)}
        onOpenReleaseBanner={() => setIsPostUpdateBannerOpen(true)}
        isDevMode={isDevBranchMode}
      />

      {/* Модальное окно журнала обновлений */}
      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />

      {/* Интерактивное руководство оператора (Гайд при первом запуске) */}
      <OnboardingGuideModal
        isOpen={(!isDevBranchMode || Boolean(supervisorSession)) && isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />

      {/* Компактное окно со сводкой обновления поверх рабочего пространства */}
      <PostUpdateBanner
        isOpen={(!isDevBranchMode || Boolean(supervisorSession)) && isPostUpdateBannerOpen}
        onDismiss={handleDismissPostUpdateBanner}
      />

      {/* Модальное окно Кальки (2-я капля Жемчужины) */}
      <KalkaModal
        isOpen={isKalkaWindowOpen}
        onClose={() => setIsKalkaWindowOpen(false)}
        zones={kalkaZones}
        onChangeZones={setKalkaZones}
        displayMode={kalkaDisplayMode}
        onChangeDisplayMode={setKalkaDisplayMode}
        onTriggerAction={handleKalkaTriggerAction}
      />

      {/* Модальное окно Таймера Ready (3-я капля Жемчужины) */}
      <ReadyTimerModal
        isOpen={isReadyTimerWindowOpen}
        onClose={() => setIsReadyTimerWindowOpen(false)}
        remainingSeconds={readyRemainingSeconds}
        targetSeconds={readyTargetSeconds}
        isRunning={isReadyTimerRunning}
        favorites={readyFavorites}
        scale={readyTimerScale}
        onChangeScale={setReadyTimerScale}
        onApplyDuration={handleApplyReadyDuration}
        onToggleRun={handleToggleReadyTimerRun}
        onReset={handleResetReadyTimer}
        onAddFavorite={handleAddReadyFavorite}
        onRemoveFavorite={handleRemoveReadyFavorite}
      />

      {/* Жемчужина с каплями (1-я капля со статистикой скрыта в обычной версии, активна только в Dev-ветке) */}
      <div className={`fixed inset-0 z-40 pointer-events-none ${isDevBranchMode ? 'mts-3d-stage' : ''}`}>
        <div
          className={`w-full h-full ${
            isDevBranchMode
              ? `mts-3d-rotator mts-3d-face-front ${
                  isPageFlipped
                    ? 'mts-3d-rotator-back pointer-events-none'
                    : 'mts-3d-rotator-front'
                }`
              : ''
          }`}
        >
          <EdgeQuickDock
            showBookIcon={isDevBranchMode}
            onOpenBook={isDevBranchMode ? () => setIsBookWindowOpen((prev) => !prev) : undefined}
            onOpenKalka={() => setIsKalkaWindowOpen((prev) => !prev)}
            onOpenReadyTimer={() => setIsReadyTimerWindowOpen((prev) => !prev)}
            animationMode={settings.pearlAnimationMode || 'auto'}
          />
        </div>
      </div>

      {/* Экспериментальные модули Dev-ветки (Регистрация/Вход и Статистика смен — раскрываются только по секретному коду 79293664010) */}
      {isDevBranchMode && (
        <>
          <SupervisorAccessModal
            isOpen={!supervisorSession || isSupervisorModalOpen}
            requireAuth={!supervisorSession}
            onClose={() => setIsSupervisorModalOpen(false)}
            activeSession={supervisorSession}
            onSecretDevCode={toggleDevBranchMode}
            onLoginSuccess={(acc) => {
              setSupervisorSession(acc);
              setSettings(loadSettingsFromStorage());
              try {
                setIsSavedTableExpanded(localStorage.getItem('mts_saved_table_expanded') === 'true');
                setIsDevBranchMode(localStorage.getItem('mts_urm_dev_branch_mode') === 'true');
              } catch {
                // ignore
              }
            }}
            onLogout={() => {
              if (supervisorSession) {
                savePersonalSettingsSnapshotForUser(supervisorSession.login);
              }
              saveActiveAccountSession(null);
              setSupervisorSession(null);
            }}
          />

          <BookWorkspaceModal
            isOpen={isBookWindowOpen}
            onClose={() => setIsBookWindowOpen(false)}
            records={shiftHistory}
            stats={stats}
            onDeleteRecord={handleDeleteShiftHistoryRecord}
            onReturnSharedLeadToQueue={handleReturnSentLeadToOwnQueue}
          />
        </>
      )}

      {/* Всплывающие Push-уведомления поверх экрана */}
      <NotificationToastContainer
        position={settings.pushPosition}
        enabled={settings.enablePushNotifications !== false}
      />
    </div>
  );
}
