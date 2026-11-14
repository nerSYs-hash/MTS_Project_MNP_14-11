import React, { useState } from 'react';
import { Search, PhoneCall, Share2, Check, Copy, X } from 'lucide-react';
import { ClientLead, CallStatus } from '../types';
import { ClientCard } from './ClientCard';
import {
  createSharePackageLink,
  loadSenderNameFromStorage,
  writeMtsTokenToClipboard,
} from '../utils/cardSharing';

interface ClientQueueProps {
  leads: ClientLead[];
  onUpdateStatus: (
    id: string,
    newStatus: CallStatus,
    options?: {
      customTimerMinutes?: number;
      notes?: string;
      isClientAgreed?: boolean;
      attemptCount?: number;
    }
  ) => void;
  onDeleteLead: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onUpdateLead?: (id: string, updates: Partial<ClientLead>) => void;
  onMarkLeadsSharedOut?: (leadIds: string[], senderName: string) => void;
  getRemainingTime: (targetTimestamp: number | null) => {
    totalSeconds: number;
    isExpired: boolean;
    formatted: string;
    isOverdue: boolean;
  };
  highlightedLeadId?: string | null;
}

type TabType = 'all' | 'due' | 'auto' | 'callback' | 'shared' | 'saved' | 'refused';

export const ClientQueue: React.FC<ClientQueueProps> = ({
  leads,
  onUpdateStatus,
  onDeleteLead,
  onUpdateNotes,
  onUpdateLead,
  onMarkLeadsSharedOut,
  getRemainingTime,
  highlightedLeadId,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Режим выделения карточек для передачи коллеге (3.А — точки выбора видны только при активации)
  const [isShareSelectionMode, setIsShareSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [shareExitStage, setShareExitStage] = useState<'idle' | 'blurring' | 'swiping'>('idle');

  // Сортировка очереди:
  // - Завершенные (сохранен/отказ) уходят в конец общего списка
  // - В табе «Пора звонить» первыми идут самые срочные
  // - Новая заполненная заявка (авто или перезвон) ВСЕГДА ПОДНИМАЕТСЯ ПЕРВОЙ НАВЕРХ!
  const sortedLeads = [...leads].sort((a, b) => {
    const isDoneA = a.status === 'saved' || a.status === 'refused' || a.status === 'unreachable';
    const isDoneB = b.status === 'saved' || b.status === 'refused' || b.status === 'unreachable';
    if (isDoneA && !isDoneB) return 1;
    if (!isDoneA && isDoneB) return -1;

    if (activeTab === 'due') {
      const timeA = a.targetCallbackTime || Number.MAX_SAFE_INTEGER;
      const timeB = b.targetCallbackTime || Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    }

    // Новые заявки всегда первой в списке (по дате добавления)
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  // Логика распределения v2.7.5:
  // 1. «По просьбе»: есть заметка (notes) И (статус callback или согласованное время)
  // 2. «Авто»: без заметки (с таймером или без) ИЛИ принудительный автоответчик
  const isAutoLead = (l: ClientLead) => {
    if (l.isAnsweringMachineForced || l.status === 'answering_machine') return true;
    const hasNotes = Boolean(l.notes && l.notes.trim().length > 0);
    if (!hasNotes) return true;
    return !l.scheduledByAgreedTime && l.status !== 'callback';
  };

  const sharedLeadsCount = leads.filter(
    (l) => Boolean(l.sharedOutToColleague || l.sharedReceivedAt || l.sharedFromName !== undefined)
  ).length;

  // Фильтрация
  const filteredLeads = sortedLeads.filter((lead) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPhone = lead.phone.toLowerCase().includes(q) || lead.rawPhone.includes(q);
      const matchCity = lead.city.toLowerCase().includes(q);
      const matchNotes = lead.notes.toLowerCase().includes(q);
      if (!matchPhone && !matchCity && !matchNotes) return false;
    }

    if (activeTab === 'all') return true;
    if (activeTab === 'due') {
      if (lead.targetCallbackTime) {
        return getRemainingTime(lead.targetCallbackTime).isExpired;
      }
      return false;
    }
    if (activeTab === 'auto') {
      return (
        lead.status !== 'saved' &&
        lead.status !== 'refused' &&
        lead.status !== 'unreachable' &&
        isAutoLead(lead)
      );
    }
    if (activeTab === 'callback') {
      return (
        lead.status !== 'saved' &&
        lead.status !== 'refused' &&
        lead.status !== 'unreachable' &&
        !isAutoLead(lead)
      );
    }
    if (activeTab === 'shared') {
      return Boolean(
        lead.sharedOutToColleague || lead.sharedReceivedAt || lead.sharedFromName !== undefined
      );
    }
    if (activeTab === 'saved') return lead.status === 'saved';
    if (activeTab === 'refused') return lead.status === 'refused';

    return true;
  });

  const handleToggleSelectLead = (leadId: string) => {
    if (shareExitStage !== 'idle') return;
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const filteredIds = filteredLeads.map((l) => l.id);
  const areAllFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedLeadIds.includes(id));

  const handleToggleSelectAllFiltered = () => {
    if (shareExitStage !== 'idle') return;
    if (areAllFilteredSelected) {
      setSelectedLeadIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleCopyShareLink = async () => {
    if (shareExitStage !== 'idle') return;
    const chosenLeads = leads.filter((l) => selectedLeadIds.includes(l.id));
    if (chosenLeads.length === 0) return;

    const chosenIds = chosenLeads.map((l) => l.id);
    const currentSenderName = loadSenderNameFromStorage();
    const linkToken = createSharePackageLink(chosenLeads, currentSenderName);
    await writeMtsTokenToClipboard(linkToken);

    window.dispatchEvent(
      new CustomEvent('mts-inapp-toast', {
        detail: {
          id: `share_copied_${Date.now()}`,
          kind: 'share_receipt_credited',
          phone:
            chosenLeads.length === 1
              ? chosenLeads[0].phone
              : `Контактов: ${chosenLeads.length} шт.`,
          badgeText: 'Скопировано',
          title: 'Ссылка сформирована',
          subtitle: 'Ссылка скопирована в буфер • отправьте коллеге в чат',
          autoDismissMs: 4000,
          timestamp: Date.now(),
        },
      })
    );

    // Этап 1: вся карточка контакта блюрится, выделение заблокировано
    setShareExitStage('blurring');

    // Этап 2: через 320 мс — анимация удаления (сдвиг в правую сторону)
    setTimeout(() => {
      setShareExitStage('swiping');
    }, 320);

    // Этап 3: завершение анимации сдвига вправо и удаление из очереди
    setTimeout(() => {
      onMarkLeadsSharedOut?.(chosenIds, currentSenderName);
      setShareExitStage('idle');
      setSelectedLeadIds([]);
      setIsShareSelectionMode(false);
    }, 620);
  };

  return (
    <section className="space-y-4">
      {/* Панель табов, кнопки «Поделиться» и поиска */}
      <div className="flex flex-col gap-3 bg-white p-3 sm:p-4 rounded-3xl border border-[#F1F3F5] shadow-mts-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Переключатели фильтров */}
          <div className="inline-flex p-1 bg-[#F4F5F7] rounded-2xl gap-1 border border-[#EBECEF] overflow-x-auto scrollbar-none max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'all'
                  ? 'bg-white text-[#1D2023] shadow-xs'
                  : 'text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              Все
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('due')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'due'
                  ? 'bg-white text-[#E30613] shadow-xs font-bold'
                  : 'text-[#626C77] hover:text-[#E30613]'
              }`}
            >
              Пора звонить
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('auto')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'auto'
                  ? 'bg-white text-[#1D2023] shadow-xs'
                  : 'text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              Автоответчик
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('callback')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'callback'
                  ? 'bg-white text-[#1D2023] shadow-xs'
                  : 'text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              По времени
            </button>

            {sharedLeadsCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('shared')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                  activeTab === 'shared'
                    ? 'bg-white text-[#1D2023] shadow-xs'
                    : 'text-[#626C77] hover:text-[#1D2023]'
                }`}
              >
                Переданные
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'saved'
                  ? 'bg-white text-[#1D2023] shadow-xs'
                  : 'text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              Сохранение
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('refused')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                activeTab === 'refused'
                  ? 'bg-white text-[#1D2023] shadow-xs'
                  : 'text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              Отказы
            </button>
          </div>

          {/* Правая группа: Кнопка-иконка «Поделиться» (серая без текста и без рамки) + Быстрый поиск */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={shareExitStage !== 'idle'}
              onClick={() => {
                if (shareExitStage !== 'idle') return;
                setIsShareSelectionMode((prev) => {
                  if (prev) setSelectedLeadIds([]);
                  return !prev;
                });
              }}
              title={
                isShareSelectionMode
                  ? 'Закрыть режим передачи контактов'
                  : 'Поделиться карточками клиентов'
              }
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 border-0 ${
                isShareSelectionMode
                  ? 'bg-[#E5E7EB] text-[#1D2023]'
                  : 'bg-[#F1F3F5] hover:bg-[#E5E7EB] text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              <Share2 className="w-4 h-4" />
            </button>

            <div className="relative min-w-[210px] flex-1">
              <Search className="w-4 h-4 text-[#8C95A0] absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Поиск по номеру, городу..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 focus:outline-none text-xs text-[#1D2023] bg-white placeholder-[#8C95A0]"
              />
            </div>
          </div>
        </div>

        {/* Лаконичная серая панель передачи контактов (2.Б — только две серые кнопки без обводки) */}
        {isShareSelectionMode && (
          <div className="pt-3 border-t border-[#F1F3F5] flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in duration-200">
            <button
              type="button"
              onClick={handleToggleSelectAllFiltered}
              disabled={filteredLeads.length === 0 || shareExitStage !== 'idle'}
              className="h-9 px-3.5 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-[#1D2023] border-0 transition-colors cursor-pointer"
            >
              {areAllFilteredSelected ? 'Снять выделение' : 'Выбрать все'}
            </button>

            <button
              type="button"
              disabled={selectedLeadIds.length === 0 || shareExitStage !== 'idle'}
              onClick={handleCopyShareLink}
              className="h-9 px-4 rounded-xl bg-[#F1F3F5] hover:bg-[#E5E7EB] disabled:opacity-45 text-[#1D2023] text-xs font-bold border-0 flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed ml-auto"
            >
              <Copy className="w-3.5 h-3.5 text-[#626C77]" />
              <span>Сформировать ссылку</span>
            </button>
          </div>
        )}
      </div>

      {/* Список карточек клиентов */}
      {filteredLeads.length > 0 ? (
        <div className="space-y-3 pt-2 px-1">
          {filteredLeads.map((lead, index) => {
            const timeInfo = getRemainingTime(lead.targetCallbackTime);
            const isMostUrgent = index === 0 && timeInfo.isExpired;
            const isHighlighted = highlightedLeadId === lead.id;

            return (
              <ClientCard
                key={lead.id}
                lead={lead}
                onUpdateStatus={onUpdateStatus}
                onDeleteLead={onDeleteLead}
                onUpdateNotes={onUpdateNotes}
                onUpdateLead={onUpdateLead}
                remainingTime={timeInfo}
                isMostUrgent={isMostUrgent}
                isHighlighted={isHighlighted}
                isShareSelectionMode={isShareSelectionMode}
                isSelectedForShare={selectedLeadIds.includes(lead.id)}
                shareExitStage={shareExitStage}
                onToggleSelectForShare={handleToggleSelectLead}
              />
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-10 border border-[#F1F3F5] shadow-mts-card text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F4F5F7] text-[#626C77] flex items-center justify-center mx-auto mb-3">
            <PhoneCall className="w-6 h-6 text-[#8C95A0]" />
          </div>
          <h3 className="text-base font-bold text-[#1D2023]">В этой вкладке пока нет заявок</h3>
          <p className="text-xs text-[#626C77] font-normal mt-1 max-w-md mx-auto">
            {searchQuery
              ? 'По запросу ничего не найдено.'
              : 'Внесите номер абонента в Карточку Клиента выше, чтобы записать звонок.'}
          </p>
        </div>
      )}
    </section>
  );
};

