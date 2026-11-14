import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Bell,
  Mail,
  Copy,
  Check,
  Phone,
  UserCheck,
  TrendingUp,
  Clock,
  RotateCcw,
  RotateCw,
  Star,
  Info,
  Share2,
  ClipboardPaste,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen,
  Pencil,
  ExternalLink,
  PhoneForwarded,
} from 'lucide-react';
import { GUIDE_BLOCKS, FEEDBACK_CONTACT, GuideStep } from '../data/guideData';

interface OnboardingGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBlockIndex?: number;
  initialStepIndex?: number;
}

export const OnboardingGuideModal: React.FC<OnboardingGuideModalProps> = ({
  isOpen,
  onClose,
  initialBlockIndex = 0,
  initialStepIndex = 0,
}) => {
  // Индекс активного блока в стопке (0 = актуальное обновление v2.8.0, 1 = Начальный гайд)
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(initialBlockIndex);
  // Индекс слайда для каждого блока отдельно
  const [slideIndices, setSlideIndices] = useState<Record<number, number>>({
    0: initialStepIndex,
    1: 0,
  });
  // Индекс блока, который сейчас плавно уезжает влево
  const [leavingBlockIndex, setLeavingBlockIndex] = useState<number | null>(null);

  // Состояние обложки нового блока обновления (true = обложка закрывает блок, при клике или свайпе вверх уходит наверх)
  const [isCoverVisible, setIsCoverVisible] = useState<boolean>(true);
  const [coverDragY, setCoverDragY] = useState<number>(0);
  const [isDraggingCover, setIsDraggingCover] = useState<boolean>(false);
  const dragStartYRef = useRef<number | null>(null);

  // Состояния интерактивных иллюстраций
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeKpiCard, setActiveKpiCard] = useState<number>(0);
  const [sheet2Expanded, setSheet2Expanded] = useState<boolean>(false);
  const [showReminderTooltip, setShowReminderTooltip] = useState<boolean>(false);
  const [shareSendAnimating, setShareSendAnimating] = useState<boolean>(false);
  const [copiedResultDemo, setCopiedResultDemo] = useState<boolean>(false);
  const [returnedPendingDemo, setReturnedPendingDemo] = useState<boolean>(false);

  const currentBlock = GUIDE_BLOCKS[activeBlockIndex] || GUIDE_BLOCKS[0];
  const currentSlideIndex = slideIndices[activeBlockIndex] ?? 0;
  const currentSteps = currentBlock.steps;
  const currentStep = currentSteps[currentSlideIndex] || currentSteps[0];

  // При открытии книги всегда начинаем с актуального блока обновлений и показываем его обложку
  useEffect(() => {
    if (isOpen) {
      setActiveBlockIndex(initialBlockIndex);
      setSlideIndices({ 0: initialStepIndex, 1: 0 });
      setLeavingBlockIndex(null);
      setIsCoverVisible(true);
      setCoverDragY(0);
      setIsDraggingCover(false);
      setActiveKpiCard(0);
      setShowReminderTooltip(false);
      setShareSendAnimating(false);
      setCopiedResultDemo(false);
      setReturnedPendingDemo(false);
    }
  }, [isOpen, initialBlockIndex, initialStepIndex]);

  // Плавное раскрытие таблицы номеров при переходе на 2 лист Начального гайда
  useEffect(() => {
    if (currentStep?.id === 'numbers-registry') {
      setSheet2Expanded(false);
      const timer = setTimeout(() => {
        setSheet2Expanded(true);
      }, 220);
      return () => clearTimeout(timer);
    } else {
      setSheet2Expanded(false);
    }
  }, [currentStep?.id]);

  // ОДИНАРНАЯ (не цикличная!) демонстрация анимации ухода карточек на слайде 1 обновления v2.8.0 (срабатывает после поднятия обложки)
  useEffect(() => {
    if (
      !isOpen ||
      currentStep?.id !== 'share-step-1-select' ||
      (activeBlockIndex === 0 && isCoverVisible)
    ) {
      setShareSendAnimating(false);
      return;
    }
    setShareSendAnimating(false);
    const startTimer = setTimeout(() => {
      setShareSendAnimating(true);
    }, 650);
    const endTimer = setTimeout(() => {
      setShareSendAnimating(false);
    }, 2150);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(endTimer);
    };
  }, [isOpen, currentStep?.id, activeBlockIndex, isCoverVisible]);

  // Обработка перетаскивания обложки вверх за 3 точки (или по всей обложке)
  const handleCoverPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragStartYRef.current = e.clientY;
    setIsDraggingCover(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCoverPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCover || dragStartYRef.current === null) return;
    const deltaY = e.clientY - dragStartYRef.current;
    // Позволяем тянуть обложку только вверх (отрицательный deltaY)
    if (deltaY < 0) {
      setCoverDragY(deltaY);
    } else {
      setCoverDragY(0);
    }
  };

  const handleCoverPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingCover) return;
    setIsDraggingCover(false);
    const deltaY =
      dragStartYRef.current !== null ? e.clientY - dragStartYRef.current : 0;
    dragStartYRef.current = null;

    // Если потянули вверх хотя бы на 35px ИЛИ просто кликнули (смещение < 8px) — поднимаем обложку вверх!
    if (deltaY < -35 || Math.abs(deltaY) < 8) {
      setCoverDragY(0);
      setIsCoverVisible(false);
    } else {
      setCoverDragY(0);
    }
  };

  // Переключение между блоками: текущий блок плавно уходит влево, следующий блок выдвигается справа на его место
  const switchToBlock = (targetBlockIdx: number, targetSlideIdx = 0) => {
    if (targetBlockIdx === activeBlockIndex || leavingBlockIndex !== null) return;
    const prevIdx = activeBlockIndex;
    setLeavingBlockIndex(prevIdx);
    setSlideIndices((prev) => ({ ...prev, [targetBlockIdx]: targetSlideIdx }));
    setActiveBlockIndex(targetBlockIdx);

    setTimeout(() => {
      setLeavingBlockIndex(null);
    }, 520);
  };

  // Навигация с клавиатуры
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeBlockIndex === 0 && isCoverVisible) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
          setIsCoverVisible(false);
          return;
        }
      }
      if (e.key === 'ArrowRight') {
        if (currentSlideIndex < currentSteps.length - 1) {
          setSlideIndices((prev) => ({
            ...prev,
            [activeBlockIndex]: (prev[activeBlockIndex] ?? 0) + 1,
          }));
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentSlideIndex > 0) {
          setSlideIndices((prev) => ({
            ...prev,
            [activeBlockIndex]: (prev[activeBlockIndex] ?? 0) - 1,
          }));
        }
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeBlockIndex, currentSlideIndex, currentSteps.length, isCoverVisible]);

  const handleClose = () => {
    try {
      localStorage.setItem('mts_urm_onboarding_completed', 'true');
    } catch {
      // ignore
    }
    onClose();
  };

  if (!isOpen) return null;

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(FEEDBACK_CONTACT.email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const triggerSingleShareAnimation = () => {
    if (shareSendAnimating) return;
    setShareSendAnimating(true);
    setTimeout(() => {
      setShareSendAnimating(false);
    }, 1450);
  };

  // Отрисовка правой иллюстрации для конкретного шага
  const renderStepVisual = (step: GuideStep) => {
    switch (step.id) {
      // =========================================================================
      // БЛОК v2.8.0 — СЛАЙД 1 из 4: Режим «Поделиться» и отправка (одинарная анимация)
      // =========================================================================
      case 'share-step-1-select': {
        const demoShareCards = [
          {
            phone: '+7 (999) 999-99-97',
            timer: '1:58:28',
            attempt: 'Перезвон (0/3)',
            note: 'Клиент 3',
          },
          {
            phone: '+7 (999) 999-99-98',
            timer: '58:10',
            attempt: 'Перезвон (0/3)',
            note: 'Клиент 2',
          },
          {
            phone: '+7 (999) 999-99-99',
            timer: '27:51',
            attempt: 'Перезвон (0/3)',
            note: 'Клиент 1',
          },
        ];

        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[455px] flex flex-col gap-2.5">
              {/* Реальная панель из ClientQueue.tsx: Снять выделение | Иконка Поделиться | Сформировать ссылку */}
              <div className="bg-white rounded-2xl px-3 py-2 border border-[#F1F3F5] shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-8 px-3 rounded-xl bg-[#F1F3F5] text-[#1D2023] text-[11px] font-bold flex items-center">
                    Снять выделение
                  </span>
                  <span className="w-8 h-8 rounded-xl bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center">
                    <Share2 className="w-3.5 h-3.5" />
                  </span>
                </div>

                <button
                  type="button"
                  onClick={triggerSingleShareAnimation}
                  className="h-8 px-3.5 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#1D2023] text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Нажмите, чтобы повторить анимацию отправки"
                >
                  {shareSendAnimating ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#1D2023] stroke-[2.5]" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#626C77]" />
                      <span>Сформировать ссылку</span>
                    </>
                  )}
                </button>
              </div>

              {/* 3 карточки из реальной очереди с круглыми черными чекбоксами слева и одинарной анимацией */}
              <div className="relative flex flex-col gap-2 min-h-[248px] justify-center">
                {demoShareCards.map((card, idx) => (
                  <div
                    key={card.phone}
                    style={{
                      transitionDelay: shareSendAnimating ? `${idx * 55}ms` : '0ms',
                    }}
                    className={`bg-white rounded-2xl p-2.5 sm:p-3 border border-[#F1F3F5] shadow-xs transition-all duration-500 ease-out ${
                      shareSendAnimating
                        ? 'translate-x-28 opacity-0 blur-[4px] scale-[0.99]'
                        : 'translate-x-0 opacity-100 blur-0 scale-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#1D2023] text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[2.5]" />
                        </span>
                        <span className="w-6 h-6 rounded-xl bg-red-50 text-[#E30613] flex items-center justify-center shrink-0">
                          <Phone className="w-3 h-3" />
                        </span>
                        <span className="text-[13px] font-medium text-[#1D2023] whitespace-nowrap">
                          {card.phone}
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="text-[11px] text-[#626C77] font-medium">
                          Москва
                        </span>
                      </div>

                      <span className="h-7 px-3 rounded-full bg-[#00B956] text-white text-[10.5px] font-bold flex items-center gap-1 shrink-0">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                        <span>Сохранен</span>
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-[#F1F3F5] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-xl bg-[#F4F5F7] border border-[#E2E8F0] text-[#1D2023] text-[10.5px] font-extrabold tabular-nums flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{card.timer}</span>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-[#F5F6F8] text-[#1D2023] text-[10px] font-bold flex items-center gap-1">
                          <RotateCw className="w-2.5 h-2.5 text-[#626C77]" />
                          <span>{card.attempt}</span>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-[#F5F6F8] text-[#1D2023] text-[10px] font-bold">
                          Отказ
                        </span>
                      </div>

                      <span className="text-[10.5px] text-[#626C77] font-medium">
                        {card.note}
                      </span>
                    </div>
                  </div>
                ))}

                {shareSendAnimating && (
                  <div className="absolute inset-0 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-full max-w-[380px] bg-white rounded-2xl shadow-2xl border border-[#EBECEF] p-3.5 text-[#1D2023]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#F4F5F7] text-[#626C77] flex items-center justify-center shrink-0">
                            <ArrowUpRight className="w-4 h-4 stroke-[2]" />
                          </div>
                          <span className="text-[14px] font-bold text-[#1D2023] font-mts-compact">
                            Контактов: 3 шт.
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4F5F7] text-[#626C77]">
                            Скопировано
                          </span>
                        </div>
                        <X className="w-4 h-4 text-[#8C95A0]" />
                      </div>
                      <div className="mt-2 pl-10 text-xs font-medium text-[#626C77]">
                        Ссылка скопирована в буфер • отправьте коллеге в чат
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2.5 text-[11px] font-normal text-slate-500 bg-white/85 backdrop-blur-xs px-3 py-1 rounded-xl shadow-xs border border-slate-200/50">
              Нажмите «Сформировать ссылку», чтобы повторить анимацию отправки
            </div>
          </div>
        );
      }

      // =========================================================================
      // БЛОК v2.8.0 — СЛАЙД 2 из 4: Приём через поле «Ссылка» и вкладка «Переданные»
      // =========================================================================
      case 'share-step-2-receive-link':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[450px] flex flex-col gap-3">
              <div className="bg-white rounded-2xl p-3.5 border border-[#F1F3F5] shadow-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#626C77]">
                    Поле «Ссылка» в Карте клиента (или нажатие Ctrl + V)
                  </span>
                </div>

                <div className="h-9 px-3 rounded-xl bg-[#F4F5F7] border border-[#0077FF]/40 flex items-center justify-between text-xs text-[#1D2023] font-mono">
                  <span className="truncate">
                    MTS-SHARE-V1::8F42B91C::eyJsZWFkcyI6W3sicnBoIjoiNzk5OTk5...
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white text-[#1D2023] font-sans font-bold text-[10.5px] shadow-2xs flex items-center gap-1 shrink-0 ml-2 border border-slate-200/70">
                    <ClipboardPaste className="w-3 h-3 text-[#0077FF]" />
                    <span>Вставить</span>
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg border border-[#EBECEF] p-3.5 text-[#1D2023]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#F4F5F7] text-[#626C77] flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="w-4 h-4 stroke-[2]" />
                    </div>
                    <span className="text-[14px] font-bold text-[#1D2023] font-mts-compact truncate">
                      Контактов: 3 шт.
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4F5F7] text-[#626C77] shrink-0">
                      Принято
                    </span>
                  </div>
                  <X className="w-4 h-4 text-[#8C95A0] shrink-0" />
                </div>
                <div className="mt-2 pl-10 text-xs font-medium text-[#626C77]">
                  Добавлено в очередь • перенесены таймеры и заметки
                </div>
              </div>

              <div className="bg-white rounded-2xl p-2.5 border border-[#F1F3F5] shadow-xs">
                <div className="text-[10px] font-semibold text-[#626C77] mb-1.5 px-1">
                  В панели очереди коллеги появляется вкладка «Переданные»:
                </div>
                <div className="inline-flex p-1 bg-[#F4F5F7] rounded-xl gap-1 border border-[#EBECEF] w-full overflow-hidden">
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#626C77]">
                    Все
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#626C77]">
                    Пора звонить
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#626C77]">
                    По времени
                  </span>
                  <span className="px-3 py-1 rounded-lg text-[11px] font-bold bg-white text-[#1D2023] shadow-xs">
                    Переданные
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      // =========================================================================
      // БЛОК v2.8.0 — СЛАЙД 3 из 4: Карточка у коллеги (значок ↙) и «Скопировать результат»
      // =========================================================================
      case 'share-step-3-colleague-work':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[455px] flex flex-col gap-3">
              <div className="bg-white rounded-3xl p-3.5 border border-[#F1F3F5] shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-8 h-8 rounded-xl bg-red-50 text-[#E30613] flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-[#E30613]" />
                    </div>
                    <span className="text-[15px] font-medium text-[#1D2023]">
                      +7 (999) 999-99-97
                    </span>
                    <span className="w-6 h-6 rounded-lg bg-[#F4F5F7] text-[#626C77] flex items-center justify-center">
                      <Pencil className="w-3 h-3" />
                    </span>
                    <span className="w-6 h-6 rounded-lg bg-[#F4F5F7] text-[#626C77] flex items-center justify-center">
                      <Copy className="w-3 h-3" />
                    </span>
                    <span className="w-6 h-6 rounded-lg bg-blue-50 text-[#0077FF] flex items-center justify-center">
                      <ExternalLink className="w-3 h-3" />
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs text-[#626C77] font-medium">Москва</span>

                    <span
                      className="w-6 h-6 rounded-lg bg-[#F4F5F7] text-[#626C77] inline-flex items-center justify-center shrink-0 ring-2 ring-[#0077FF]/30"
                      title="Контакт принят от коллеги"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  <span className="h-8 px-3.5 rounded-full bg-[#00B956] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Сохранен</span>
                  </span>
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-[#F1F3F5] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-xl text-xs font-extrabold tabular-nums bg-[#F4F5F7] text-[#1D2023] border border-[#E2E8F0] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>1:58:12</span>
                    </span>
                    <span className="w-7 h-7 rounded-lg bg-[#F4F5F7] text-[#626C77] flex items-center justify-center">
                      <PhoneForwarded className="w-3.5 h-3.5" />
                    </span>
                    <span className="h-7 px-3 rounded-full bg-[#F5F6F8] text-[#1D2023] text-[11px] font-bold flex items-center gap-1">
                      <RotateCw className="w-3 h-3 text-[#626C77]" />
                      <span>Перезвон (0/3)</span>
                    </span>
                    <span className="h-7 px-3 rounded-full bg-[#F5F6F8] text-[#1D2023] text-[11px] font-bold flex items-center">
                      Отказ
                    </span>
                  </div>
                  <span className="text-xs text-[#626C77]">Клиент 3</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-[#EBECEF] p-3.5 text-[#1D2023]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#F4F5F7] text-[#626C77] flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="w-4 h-4 stroke-[2]" />
                    </div>
                    <span className="text-[14px] font-bold text-[#1D2023] font-mts-compact truncate">
                      +7 (999) 999-99-97
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4F5F7] text-[#626C77] shrink-0">
                      Сохранен • 2/3
                    </span>
                  </div>
                  <X className="w-4 h-4 text-[#8C95A0] shrink-0" />
                </div>

                <div className="mt-2.5 pl-10 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#626C77] truncate">
                    В работе ещё 1 шт. • можно скопировать сейчас
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setCopiedResultDemo(true);
                      setTimeout(() => setCopiedResultDemo(false), 1800);
                    }}
                    className="h-8 px-3.5 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    {copiedResultDemo ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#1D2023]" />
                        <span>Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#626C77]" />
                        <span>Скопировать результат (2/3)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      // =========================================================================
      // БЛОК v2.8.0 — СЛАЙД 4 из 4: Зачёт ответа у автора (+1 в KPI и «Вернуть в очередь» в пуше)
      // =========================================================================
      case 'share-step-4-kpi-credit':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[455px] flex flex-col gap-3">
              <div className="bg-white rounded-2xl p-3 border border-[#F1F3F5] shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#626C77]">
                    Вставка ответного кода от коллеги (в «Ссылка» или Ctrl + V)
                  </span>
                </div>
                <div className="h-8 px-3 rounded-xl bg-[#F4F5F7] border border-[#D5D8DD] flex items-center justify-between text-[11px] text-[#1D2023] font-mono">
                  <span className="truncate">
                    MTS-SAVED-OK::7A91C04E::eyJpdGVtcyI6W3sicnBoIjoiNzk5OTk5OTk5OTci...
                  </span>
                  <Check className="w-4 h-4 text-[#00B956] shrink-0 ml-2 stroke-[2.5]" />
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-[#EBECEF] p-3.5 text-[#1D2023]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#F4F5F7] text-[#626C77] flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-4 h-4 stroke-[2]" />
                    </div>
                    <span className="text-[14px] font-bold text-[#1D2023] font-mts-compact truncate">
                      Бокс: 2 из 3 шт.
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4F5F7] text-[#626C77] shrink-0">
                      Ещё 1 у коллеги
                    </span>
                  </div>
                  <X className="w-4 h-4 text-[#8C95A0] shrink-0" />
                </div>

                <div className="mt-2.5 pl-10 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#626C77] truncate">
                    {returnedPendingDemo
                      ? 'Остаток (1 шт.) возвращён в вашу активную очередь'
                      : '1 шт. ещё у коллеги — можно вернуть себе в работу'}
                  </span>

                  <button
                    type="button"
                    onClick={() => setReturnedPendingDemo((prev) => !prev)}
                    className="h-8 px-3 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#1D2023] text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <span>
                      {returnedPendingDemo ? 'Возвращено ✓' : 'Вернуть 1 в очередь'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white rounded-2xl p-2.5 border border-[#F1F3F5] shadow-xs">
                  <div className="text-[10px] text-[#626C77]">Сохранение</div>
                  <div className="text-xs font-bold text-[#00B956] mt-0.5">+2 в ваш KPI</div>
                </div>
                <div className="bg-white rounded-2xl p-2.5 border border-[#F1F3F5] shadow-xs">
                  <div className="text-[10px] text-[#626C77]">Список «Номера»</div>
                  <div className="text-xs font-bold text-[#1D2023] mt-0.5">Добавлены автоматически</div>
                </div>
                <div className="bg-white rounded-2xl p-2.5 border border-[#F1F3F5] shadow-xs">
                  <div className="text-[10px] text-[#626C77]">Защита от дублей</div>
                  <div className="text-xs font-bold text-slate-700 mt-0.5">Без задвоений</div>
                </div>
              </div>
            </div>
          </div>
        );

      // =========================================================================
      // БЛОК НАЧАЛЬНОГО ГАЙДА — 1 ЛИСТ: Карточки KPI в 3D
      // =========================================================================
      case 'kpi-3d': {
        const kpiCards = [
          {
            title: 'ЗВОНКИ',
            value: '17',
            unit: 'контактов',
            icon: Phone,
            iconBg: 'bg-blue-50 text-blue-500',
            hasCounter: true,
          },
          {
            title: 'СОХРАНЕНИЕ',
            value: '14',
            unit: 'абонентов',
            icon: UserCheck,
            iconBg: 'bg-emerald-50 text-emerald-600',
            hasCounter: true,
          },
          {
            title: 'КОНВЕРСИЯ',
            value: '82.4%',
            unit: '',
            icon: TrendingUp,
            iconBg: 'bg-red-50 text-[#E30613]',
            hasProgress: true,
          },
          {
            title: 'ОЖИДАНИЕ',
            value: '2',
            unit: 'в очереди',
            icon: Clock,
            iconBg: 'bg-slate-100 text-slate-700',
            subInfo: 'Авто: 1  •  По времени: 1',
          },
        ];

        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div
              className="relative w-full max-w-[440px] h-[255px] flex items-center justify-center pt-5"
              style={{ perspective: '1200px' }}
            >
              {kpiCards.map((card, idx) => {
                const isSelected = activeKpiCard === idx;
                const fanX = idx * 68 - 102;
                const fanY = isSelected ? -32 : idx * 2;
                const rotY = -14 + idx * 4;
                const rotX = 3;
                const transZ = (3 - idx) * 16 + (isSelected ? 45 : 0);

                return (
                  <div
                    key={card.title}
                    onClick={() => setActiveKpiCard(idx)}
                    className={`absolute w-[205px] sm:w-[220px] bg-white rounded-2xl p-3 sm:p-3.5 border cursor-pointer transition-all duration-300 ease-out ${
                      isSelected
                        ? 'border-slate-300 shadow-[0_24px_45px_-8px_rgba(0,0,0,0.22)]'
                        : 'border-slate-100 shadow-[0_12px_24px_-6px_rgba(0,0,0,0.12)] hover:border-slate-200'
                    }`}
                    style={{
                      transform: `translate3d(${fanX}px, ${fanY}px, ${transZ}px) rotateY(${rotY}deg) rotateX(${rotX}deg)`,
                      zIndex: isSelected ? 40 : 10 + (3 - idx),
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10.5px] font-semibold text-slate-700 tracking-wider">
                        {card.title}
                      </span>
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${card.iconBg}`}
                      >
                        <card.icon className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <div className="flex items-baseline gap-1 my-0.5">
                      <span className="text-2xl sm:text-[26px] font-normal text-slate-900 tracking-tight">
                        {card.value}
                      </span>
                      {card.unit && (
                        <span className="text-[10px] font-normal text-slate-500">
                          {card.unit}
                        </span>
                      )}
                    </div>

                    {card.hasCounter && (
                      <div className="flex items-center justify-end gap-1 mt-2 pt-1 border-t border-slate-50">
                        <span className="w-4 h-4 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-[10px]">
                          -
                        </span>
                        <span className="w-4 h-4 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-medium">
                          +
                        </span>
                      </div>
                    )}

                    {card.hasProgress && (
                      <div className="mt-2.5 pt-1">
                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-[82%] h-full bg-[#E30613] rounded-full" />
                        </div>
                      </div>
                    )}

                    {card.subInfo && (
                      <div className="mt-2 pt-1 text-[9.5px] font-normal text-slate-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="truncate">{card.subInfo}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-2 bg-white/90 backdrop-blur-xs px-3.5 py-1.5 rounded-xl shadow-xs text-xs font-normal text-slate-600 border border-slate-200/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Все 4 блока видны сразу и обновляются в реальном времени при каждом действии
              </span>
            </div>
          </div>
        );
      }

      // =========================================================================
      // БЛОК НАЧАЛЬНОГО ГАЙДА — 2 ЛИСТ: Разворот списка номеров
      // =========================================================================
      case 'numbers-registry':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[430px] flex flex-col gap-2">
              <div
                onClick={() => setSheet2Expanded(!sheet2Expanded)}
                className="cursor-pointer transition-transform active:scale-[0.99] select-none"
                title="Нажмите для переключения разворота"
              >
                <div className="bg-white rounded-2xl shadow-md border border-slate-200/60 p-2 sm:p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-medium text-slate-700 transition-colors">
                      <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                      <span>Номера</span>
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-500 ${
                          sheet2Expanded ? 'rotate-90' : 'rotate-0'
                        }`}
                      />
                    </div>
                    <div className="text-xs text-slate-400 font-normal flex items-center gap-1.5 pl-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Введите номер абонента</span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
                    <Check className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div
                className={`transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1) overflow-hidden ${
                  sheet2Expanded
                    ? 'max-h-[225px] opacity-100 translate-y-0 scale-100'
                    : 'max-h-0 opacity-0 -translate-y-3 scale-98 pointer-events-none'
                }`}
              >
                <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-200/70 max-h-[190px] relative bg-white">
                  <img
                    src="assets/aistudio/image_e3a02193.png"
                    alt="Таблица сохраненных номеров"
                    className="w-full h-[190px] object-cover object-top"
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 text-[11px] font-normal text-slate-500 bg-white/85 backdrop-blur-xs px-3 py-1 rounded-xl shadow-xs border border-slate-200/50">
              Сохраненные номера автоматически вносятся в реестр и доступны для копирования в 1 клик
            </div>
          </div>
        );

      // =========================================================================
      // БЛОК НАЧАЛЬНОГО ГАЙДА — 3 ЛИСТ: Карточка клиента
      // =========================================================================
      case 'client-card-3d':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[440px] bg-white rounded-2xl sm:rounded-3xl shadow-[0_16px_36px_-8px_rgba(0,0,0,0.16)] border border-slate-200/70 p-3.5 sm:p-4 text-slate-900">
              <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-[13px] font-semibold text-slate-900">
                    Карта клиента
                  </span>
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="text-[11px] font-normal text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>Время клиента: 17:58</span>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 text-xs">
                <div className="col-span-5">
                  <div className="text-[9.5px] uppercase font-semibold text-slate-500 mb-0.5">
                    Ссылка
                  </div>
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-2 py-1.5 text-[11px] text-slate-400 truncate flex items-center justify-between">
                    <span className="truncate">https://crm.mts.ru/leads/...</span>
                    <Copy className="w-3 h-3 text-blue-500 shrink-0 ml-1" />
                  </div>
                </div>

                <div className="col-span-7">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9.5px] uppercase font-semibold text-slate-500">
                      Телефон
                    </span>
                    <div className="inline-flex items-center rounded-md bg-[#F4F5F7] p-0.5 border border-[#E4E7EC]">
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white text-[#1D2023] shadow-2xs">
                        Авто
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold text-[#626C77]">
                        По времени
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-2 py-1.5 text-[11px] font-mono text-slate-800">
                    +7 (912) 000-00-00
                  </div>
                </div>

                <div className="col-span-12 flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1 text-[11px] text-slate-600">
                    г. Москва, Самара...
                  </div>
                  <span className="text-[10px] text-slate-400">Частые:</span>
                  <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-[10px] font-medium text-slate-700">
                    Омск
                  </span>
                </div>

                <div className="col-span-12">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 relative text-[11px] text-slate-400">
                    <span>Причина ухода, скидка, тариф, пожелания клиента...</span>
                    <Star className="w-3.5 h-3.5 text-slate-400 absolute bottom-1.5 right-2" />
                  </div>
                </div>

                <div className="col-span-12 flex items-center justify-between pt-1">
                  <button
                    type="button"
                    className="px-3.5 py-1.5 rounded-full bg-[#F5F6F8] text-[#1D2023] text-[11px] font-bold flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>Когда перезвонить ?</span>
                  </button>

                  <button
                    type="button"
                    className="px-5 py-1.5 rounded-full bg-[#FF0023] text-white text-[11px] font-bold tracking-wide shadow-xs flex items-center justify-center"
                  >
                    <span>ЗАПИСАТЬ</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="w-full max-w-[440px] mt-2.5 grid grid-cols-3 gap-2">
              <div className="bg-white rounded-xl shadow-xs border border-slate-200/70 p-2 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-medium text-slate-800">Регион & Время</span>
                <span className="text-[10px] font-normal text-slate-500 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Автоматически</span>
                </span>
              </div>

              <div className="bg-white rounded-xl shadow-xs border border-slate-200/70 p-2 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-medium text-slate-800">Быстрые заметки</span>
                <span className="text-[10px] font-normal text-slate-500 flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                  <span>В Избранное</span>
                </span>
              </div>

              <div className="bg-white rounded-xl shadow-xs border border-slate-200/70 p-2 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-medium text-slate-800">Умный перезвон</span>
                <span className="text-[10px] font-normal text-slate-500 flex items-center gap-1 mt-0.5">
                  <RotateCcw className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                  <span>Настрой 1 раз</span>
                </span>
              </div>
            </div>
          </div>
        );

      // =========================================================================
      // БЛОК НАЧАЛЬНОГО ГАЙДА — 4 ЛИСТ: Напоминания
      // =========================================================================
      case 'reminders-control':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[370px] flex flex-col gap-3.5">
              <div className="bg-white rounded-2xl shadow-xl border border-[#EBECEF] p-3.5 text-[#1D2023] relative overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#FFF0F2] text-[#FF0023] flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4 text-[#FF0023]" />
                    </div>
                    <span className="text-[15px] font-bold text-[#1D2023] font-mts-compact tracking-wide whitespace-nowrap">
                      +7 (921) 987-65-43
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF0F2] text-[#FF0023] shrink-0">
                      Попытка 1/3
                    </span>
                  </div>

                  <span className="text-[#8C95A0] w-7 h-7 rounded-full flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" />
                  </span>
                </div>

                <div className="mt-2.5 pl-10 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#626C77] truncate">
                    г. Санкт-Петербург и Ленинградская область
                  </span>

                  <div className="h-8 px-3.5 rounded-full bg-[#F5F6F8] text-[#1D2023] text-xs font-bold flex items-center gap-1.5 shrink-0">
                    <span>К карточке</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#00B956] animate-arrow-pingpong shrink-0" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-[#EBECEF] p-3.5 text-[#1D2023] relative overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#FFF0F2] text-[#FF0023] flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4 text-[#FF0023]" />
                    </div>
                    <span className="text-[15px] font-bold text-[#1D2023] font-mts-compact tracking-wide whitespace-nowrap">
                      +7 (916) 123-45-67
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF0F2] text-[#FF0023] shrink-0">
                      Попытка 2/3
                    </span>
                  </div>

                  <span className="text-[#8C95A0] w-7 h-7 rounded-full flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" />
                  </span>
                </div>

                <div className="mt-2.5 pl-10 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#626C77] truncate">
                    г. Москва и Московская область
                  </span>

                  <div className="h-8 px-3.5 rounded-full bg-[#F5F6F8] text-[#1D2023] text-xs font-bold flex items-center gap-1.5 shrink-0">
                    <span>К карточке</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#00B956] animate-arrow-pingpong shrink-0" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative mt-3">
              <button
                type="button"
                onMouseEnter={() => setShowReminderTooltip(true)}
                onMouseLeave={() => setShowReminderTooltip(false)}
                onClick={() => setShowReminderTooltip((prev) => !prev)}
                className="inline-flex items-center gap-2 bg-white/95 hover:bg-white px-3.5 py-1.5 rounded-xl shadow-xs text-xs font-normal text-slate-700 border border-slate-200/70 hover:border-amber-300 transition-all cursor-pointer select-none"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span>Можно настроить напоминания под себя</span>
              </button>

              {showReminderTooltip && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[320px] sm:w-[350px] bg-slate-900/95 backdrop-blur-md text-white p-3 sm:p-3.5 rounded-2xl shadow-2xl text-[11.5px] leading-relaxed z-30 animate-in fade-in slide-in-from-bottom-2 duration-150 border border-slate-700/60">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Тройной контроль напоминаний</span>
                  </div>
                  <div className="text-slate-200 font-normal space-y-1">
                    <div>
                      • <span className="text-white font-medium">Экранный Push:</span> всплывает поверх всех окон ПК, даже если программа свернута.
                    </div>
                    <div>
                      • <span className="text-white font-medium">Звук:</span> легкий звуковой сигнал привлекает внимание оператора.
                    </div>
                    <div>
                      • <span className="text-white font-medium">Индикатор:</span> мигающая оранжевая точка в очереди звонков.
                    </div>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10.5px] text-slate-400">
                    💡 Все оповещения и интервалы можно настроить или отключить в Настройках ⚙️
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      // =========================================================================
      // БЛОК НАЧАЛЬНОГО ГАЙДА — 5 ЛИСТ: Полная автоматизация
      // =========================================================================
      case 'full-automation':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[440px] flex flex-col items-center gap-3">
              <div className="w-full bg-white rounded-2xl p-3 sm:p-3.5 shadow-md border border-slate-200/70 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-[13px] font-mono font-medium text-slate-900">
                      +7 (921) 987-65-43
                    </div>
                    <div className="text-[10.5px] text-slate-500 font-normal">
                      Санкт-Петербург • Перезвон успешен
                    </div>
                  </div>
                </div>

                <div className="px-4 py-1.5 rounded-full bg-[#00B956] text-white text-xs font-bold shadow-xs flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Сохранен</span>
                </div>
              </div>

              <div className="w-full bg-white rounded-2xl p-3 shadow-md border border-slate-100 flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                    <div className="text-[10px] font-normal text-slate-500">Журнал</div>
                    <div className="text-xs font-semibold text-slate-800 mt-0.5">+1 в таблицу</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                    <div className="text-[10px] font-normal text-slate-500">Звонки</div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5">+1 контакт</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                    <div className="text-[10px] font-normal text-slate-500">Сохранения</div>
                    <div className="text-xs font-semibold text-emerald-700 mt-0.5">+1 абонент</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-center">
              <div className="text-xs sm:text-[12.5px] font-semibold text-slate-800 tracking-wider uppercase">
                ВСЁ СИНХРОНИЗИРОВАНО В РЕАЛЬНОМ ВРЕМЕНИ
              </div>
              <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                Конверсия пересчитывается автоматически — оператор работает только с клиентом
              </div>
            </div>
          </div>
        );

      // =========================================================================
      // БЛОК НАЧАЛЬНОГО ГАЙДА — 6 ЛИСТ: Поддержка и предложения
      // =========================================================================
      case 'support-updates':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-5 select-none relative overflow-hidden">
            <div className="w-full max-w-[430px] bg-white rounded-3xl shadow-xl border border-slate-100 p-5 sm:p-6 flex flex-col gap-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-50 text-[#E30613] flex items-center justify-center">
                    <Mail className="w-4 h-4 text-[#E30613]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Обратная связь и предложения
                    </div>
                    <div className="text-[11px] font-normal text-slate-500">
                      Команда разработки МТС
                    </div>
                  </div>
                </div>
                <span className="text-[10.5px] font-medium text-[#E30613] bg-red-50 px-2.5 py-0.5 rounded-full">
                  МТС
                </span>
              </div>

              <p className="text-xs font-normal text-slate-600 leading-relaxed">
                Мы непрерывно следим за стабильностью работы программы, собираем пожелания операторов и офисных коллег и регулярно выпускаем обновления.
              </p>

              <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-2.5 px-3 border border-slate-200/80">
                <div className="flex items-center gap-2 font-mono text-xs font-medium text-slate-800">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{FEEDBACK_CONTACT.email}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="px-3.5 py-1 rounded-full bg-[#FF0023] hover:bg-[#E30613] active:scale-95 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                    title="Скопировать почту в буфер"
                  >
                    {copiedEmail ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedEmail ? 'Скопировано' : 'Копировать'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50/70 rounded-2xl p-3 border border-slate-100 text-xs font-normal text-slate-600 flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E30613] shrink-0 mt-1.5" />
                <span>
                  Также вы можете передавать любые идеи напрямую{' '}
                  <span className="font-semibold text-slate-800">своему ВС / РГ</span> или руководителю смены.
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Сцена стопки блоков обновлений */}
      <div
        className="relative w-full max-w-[940px] h-[540px] max-h-[84vh] flex items-center justify-center"
        style={{ perspective: '1600px' }}
      >
        {GUIDE_BLOCKS.map((block, bIdx) => {
          const isCurrent = bIdx === activeBlockIndex;
          const isLeavingLeft = bIdx === leavingBlockIndex;
          const blockSlideIdx = slideIndices[bIdx] ?? 0;
          const blockSteps = block.steps;
          const blockStep = blockSteps[blockSlideIdx] || blockSteps[0];
          const isFirst = blockSlideIdx === 0;
          const isLast = blockSlideIdx === blockSteps.length - 1;

          let transformStr = 'translate3d(68px, 14px, -70px) scale(0.95)';
          let zIdx = 10;
          let opacityVal = 0.96;

          if (isCurrent) {
            transformStr = 'translate3d(0px, 0px, 0px) scale(1)';
            zIdx = 30;
            opacityVal = 1;
          } else if (isLeavingLeft) {
            transformStr = 'translate3d(-112%, 10px, -80px) scale(0.93) rotate(-1.5deg)';
            zIdx = 40;
            opacityVal = 0;
          }

          return (
            <div
              key={block.id}
              onClick={() => {
                if (!isCurrent && !isLeavingLeft) {
                  switchToBlock(bIdx, 0);
                }
              }}
              style={{
                transform: transformStr,
                zIndex: zIdx,
                opacity: opacityVal,
                transition:
                  'transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease-out',
              }}
              className={`absolute inset-0 bg-white rounded-[32px] sm:rounded-[36px] shadow-[0_24px_60px_rgba(0,0,0,0.32)] overflow-hidden flex flex-col md:flex-row border border-slate-200/80 ${
                !isCurrent && !isLeavingLeft ? 'cursor-pointer hover:border-slate-300 group' : ''
              } ${isLeavingLeft ? 'pointer-events-none' : ''}`}
              title={!isCurrent ? `Переключить на блок: ${block.title}` : undefined}
            >
              {/* ОБЛОЖКА БЛОКА ОБНОВЛЕНИЯ (при нажатии в любое место или перетаскивании за 3 точки снизу плавно уезжает ВВЕРХ) */}
              {block.isNew && (
                <div
                  onPointerDown={handleCoverPointerDown}
                  onPointerMove={handleCoverPointerMove}
                  onPointerUp={handleCoverPointerUp}
                  onPointerCancel={handleCoverPointerUp}
                  style={{
                    transform: isCoverVisible
                      ? `translate3d(0, ${coverDragY}px, 0)`
                      : 'translate3d(0, -105%, 0)',
                    transition: isDraggingCover
                      ? 'none'
                      : 'transform 560ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  className={`absolute inset-0 z-40 rounded-[32px] sm:rounded-[36px] overflow-hidden select-none cursor-pointer flex flex-col justify-between p-7 sm:p-10 bg-[#E5EAF0] ${
                    !isCoverVisible ? 'pointer-events-none' : ''
                  }`}
                >
                  {/* Верхняя строка обложки: только бейдж NEW (без v2.8.0 наверху) */}
                  <div className="relative z-20 flex items-center justify-between">
                    <div className="inline-flex items-center">
                      <span className="px-3 py-1 rounded-full bg-[#FF0023] text-white text-[11px] font-extrabold tracking-wider uppercase shadow-xs">
                        NEW
                      </span>
                    </div>
                  </div>

                  {/* Основная часть обложки: слева типографика МТС, справа — аккуратно и пропорционально расположенная 3D-иллюстрация без наложения на текст */}
                  <div className="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-between gap-4 my-auto">
                    {/* Левая текстовая колонка (не пересекается с картинкой) */}
                    <div className="w-full md:w-[43%] shrink-0 z-20 pr-2">
                      <div className="font-mts-wide text-sm sm:text-[15px] font-medium text-[#626C77] tracking-wide mb-2 flex items-baseline gap-2">
                        <span>обновление</span>
                        {block.versionTag && (
                          <span className="font-mts-wide font-semibold text-[#626C77]">
                            {block.versionTag}
                          </span>
                        )}
                      </div>
                      <h1 className="font-mts-wide text-2xl sm:text-[34px] font-bold text-[#1D2023] leading-[1.14] tracking-tight">
                        Передача карт клиентов
                      </h1>
                    </div>

                    {/* Правая колонка с 3D-иллюстрацией (аккуратно смещена вправо и масштабирована по пропорциям карточки) */}
                    <div className="w-full md:w-[57%] h-[320px] sm:h-[370px] flex items-center justify-end pointer-events-none select-none">
                      <img
                        src="assets/aistudio/image__60__92681f93.png"
                        alt="Обложка обновления v2.8.0"
                        draggable={false}
                        className="w-full h-full max-w-[490px] object-contain object-right pointer-events-none select-none"
                      />
                    </div>
                  </div>

                  {/* Нижний индикатор: 3 точки посередине, за которые можно потянуть вверх или кликнуть */}
                  <div className="relative z-20 flex flex-col items-center justify-center pt-1">
                    <div
                      className="group/dots px-5 py-2.5 rounded-full bg-white/85 hover:bg-white backdrop-blur-md shadow-md border border-slate-200/80 flex items-center gap-2 transition-all active:scale-95"
                      title="Потяните вверх или нажмите, чтобы открыть блок"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#626C77] group-hover/dots:bg-[#1D2023] transition-colors" />
                      <span className="w-2 h-2 rounded-full bg-[#626C77] group-hover/dots:bg-[#1D2023] transition-colors" />
                      <span className="w-2 h-2 rounded-full bg-[#626C77] group-hover/dots:bg-[#1D2023] transition-colors" />
                    </div>
                  </div>
                </div>
              )}

              {/* Если этот блок сейчас стоит вторым справа в стопке — показываем на его правом видимом крае корешок-превью */}
              {!isCurrent && !isLeavingLeft && (
                <div className="hidden lg:flex absolute right-0 top-0 bottom-0 w-[68px] bg-white/95 group-hover:bg-slate-50/90 border-l border-slate-100 z-40 flex-col items-center justify-between py-7 select-none transition-colors">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shadow-2xs ${
                      block.isNew
                        ? 'bg-[#FFF0F2] text-[#FF0023]'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {block.isNew ? (
                      <Share2 className="w-4 h-4" />
                    ) : (
                      <BookOpen className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    {block.isNew && (
                      <span className="px-1.5 py-0.5 rounded bg-[#FF0023] text-white text-[9px] font-extrabold uppercase tracking-wider">
                        NEW
                      </span>
                    )}
                    <span
                      className="text-[11px] font-semibold tracking-wide whitespace-nowrap text-slate-500 group-hover:text-slate-900"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {block.title}
                    </span>
                  </div>

                  <div className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                    {block.steps.length} л.
                  </div>
                </div>
              )}

              {/* Кнопка закрытия (всегда поверх, в том числе поверх обложки) */}
              {isCurrent && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                  }}
                  className="absolute top-4 right-4 sm:top-5 sm:right-5 w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-md border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:scale-95 transition-all z-50 cursor-pointer"
                  title="Закрыть руководство"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2]" />
                </button>
              )}

              {/* Левая колонка: текст и навигация внутри блока */}
              <div className="w-full md:w-[44%] bg-white p-6 sm:p-8 flex flex-col justify-between shrink-0 h-full overflow-hidden z-10 select-none">
                <div className="overflow-y-auto pr-1">
                  {/* Бейдж NEW + рядом со словом обновление просто цифры и буква без фона */}
                  {blockStep.isNew ? (
                    <div className="inline-flex items-center gap-2.5 mb-2.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#FF0023] text-white text-[10.5px] font-extrabold tracking-wider uppercase shadow-2xs">
                        NEW
                      </span>
                      {blockStep.versionTag && (
                        <span className="text-xs font-medium text-[#626C77]">
                          обновление {blockStep.versionTag}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 mb-2.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                        {block.title}
                      </span>
                    </div>
                  )}

                  {/* Заголовок */}
                  <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 leading-[1.25] tracking-tight mb-2.5">
                    {blockStep.title}
                  </h2>

                  {/* Описание */}
                  <p className="text-[13px] sm:text-[13.5px] text-slate-600 leading-relaxed font-normal mb-3.5">
                    {blockStep.description}
                  </p>

                  {/* Буллиты */}
                  {blockStep.bullets && (
                    <ul className="space-y-1.5 pt-0.5">
                      {blockStep.bullets.map((bullet, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-[12px] sm:text-[12.5px] text-slate-600 font-normal leading-snug"
                        >
                          <div className="w-4 h-4 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="w-2.5 h-2.5 text-slate-700 stroke-[2.5]" />
                          </div>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Нижняя панель навигации внутри текущего блока */}
                <div className="shrink-0 pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isFirst) {
                          setSlideIndices((prev) => ({
                            ...prev,
                            [bIdx]: blockSlideIdx - 1,
                          }));
                        } else if (block.isNew) {
                          // Если на 1-м слайде нажать назад — можно снова опустить обложку
                          setIsCoverVisible(true);
                        }
                      }}
                      disabled={isFirst && !block.isNew}
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-slate-700 transition-all cursor-pointer"
                      title={
                        isFirst && block.isNew
                          ? 'Вернуться к обложке обновления'
                          : 'Предыдущий слайд (стрелка влево)'
                      }
                    >
                      <ChevronLeft className="w-5 h-5 stroke-[2]" />
                    </button>

                    <span className="text-xs sm:text-sm font-medium text-slate-700 px-2 select-none tabular-nums">
                      {blockSlideIdx + 1} из {blockSteps.length}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isLast) {
                          setSlideIndices((prev) => ({
                            ...prev,
                            [bIdx]: blockSlideIdx + 1,
                          }));
                        } else {
                          handleClose();
                        }
                      }}
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-700 transition-all cursor-pointer"
                      title={isLast ? 'Завершить просмотр' : 'Следующий слайд (стрелка вправо)'}
                    >
                      {isLast ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 stroke-[2]" />
                      ) : (
                        <ChevronRight className="w-5 h-5 stroke-[2]" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose();
                    }}
                    className="text-xs font-normal text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    Закрыть
                  </button>
                </div>
              </div>

              {/* Правая колонка с интерактивной демонстрацией */}
              <div className="w-full md:w-[56%] bg-gradient-to-b from-[#F4F6F9] to-[#E9EDF2] relative flex items-center justify-center p-3 sm:p-5 overflow-hidden">
                {renderStepVisual(blockStep)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Нижний индикатор БЛОКОВ: 1 кружок = 1 блок */}
      <div className="mt-4 flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/45 backdrop-blur-xs shadow-lg">
        {GUIDE_BLOCKS.map((block, bIdx) => {
          const isBlockActive = bIdx === activeBlockIndex;
          return (
            <button
              key={block.id}
              type="button"
              onClick={() => switchToBlock(bIdx, 0)}
              title={`${block.title} (${block.steps.length} слайдов)`}
              className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                isBlockActive
                  ? block.isNew
                    ? 'w-7 bg-[#FF0023]'
                    : 'w-7 bg-white'
                  : 'w-2.5 bg-white/45 hover:bg-white/80'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};
