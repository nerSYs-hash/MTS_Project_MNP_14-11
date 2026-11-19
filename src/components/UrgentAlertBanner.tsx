import React from 'react';
import { Copy, ExternalLink, Check, ChevronDown } from 'lucide-react';
import { ClientLead } from '../types';

interface UrgentAlertBannerProps {
  expiredLeads: ClientLead[];
  onCopyPhone: (phone: string) => void;
  copiedId: string | null;
  onSelectLead?: (leadId: string) => void;
}

export const UrgentAlertBanner: React.FC<UrgentAlertBannerProps> = ({
  expiredLeads,
  onCopyPhone,
  copiedId,
  onSelectLead,
}) => {
  if (expiredLeads.length === 0) return null;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-3xl p-4 sm:p-5 shadow-mts-card transition-all animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#F1F3F5]">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm sm:text-base font-extrabold text-[#1D2023] leading-tight font-mts-extended">
            Требуется исходящий вызов
          </h3>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {expiredLeads.map((lead, idx) => (
          <div
            key={lead.id}
            onClick={() => onSelectLead?.(lead.id)}
            className="bg-[#F8F9FA] hover:bg-[#F1F3F5] rounded-2xl p-3 border border-[#EBECEF] flex items-center justify-between gap-3 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Пульсирующая точка активна только на самой первой (срочной) карточке */}
              {idx === 0 ? (
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF0023] animate-ping shrink-0" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                {/* Верхняя строка: Номер телефона + компактные иконки Копировать / CRM + Попытка */}
                <div
                  className="flex items-center gap-1.5 flex-wrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    onClick={() => onCopyPhone(lead.phone)}
                    className="text-sm sm:text-base font-bold text-[#1D2023] tracking-normal hover:text-[#0077FF] transition-colors whitespace-nowrap cursor-pointer"
                    title="Нажмите, чтобы скопировать номер"
                  >
                    {lead.phone}
                  </span>

                  {/* Компактная иконка копирования номера (как в карточке очереди) */}
                  <button
                    type="button"
                    onClick={() => onCopyPhone(lead.phone)}
                    className="w-7 h-7 rounded-lg bg-white hover:bg-gray-200 text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-2xs"
                    title="Скопировать номер"
                  >
                    {copiedId === lead.phone ? (
                      <Check className="w-3.5 h-3.5 text-[#00B956]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Компактная иконка CRM (как в карточке очереди) */}
                  {lead.uniqueLink && (
                    <a
                      href={lead.uniqueLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#0077FF] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      title="Открыть предложение клиенту в CRM"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-[#FF0023] whitespace-nowrap ml-0.5">
                    Попытка {lead.attemptCount}/{lead.maxAttempts}
                  </span>
                </div>

                {/* Нижняя строка: Город и полный комментарий на всю свободную ширину */}
                <div className="text-xs text-[#626C77] flex items-center gap-1.5 mt-1 min-w-0">
                  <span className="font-medium shrink-0">{lead.city}</span>
                  {lead.notes && (
                    <>
                      <span className="text-gray-300 shrink-0">•</span>
                      <span className="truncate flex-1 min-w-0 text-[#1D2023]/80">
                        {lead.notes}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Справа ТОЛЬКО ОДНА кнопка перехода к карточке в очереди */}
            {onSelectLead && (
              <div
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onSelectLead(lead.id)}
                  title="Перейти к карточке в очереди"
                  className="h-8 px-4 rounded-full bg-white hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-[#626C77]" />
                  <span>В очереди</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
