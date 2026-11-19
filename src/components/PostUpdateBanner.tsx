import React from 'react';
import { X, Check } from 'lucide-react';
import { CURRENT_APP_VERSION, CURRENT_RELEASE_DATE } from '../utils/updateManager';

interface PostUpdateBannerProps {
  isOpen: boolean;
  onDismiss: () => void;
}

const RELEASE_SUMMARY: string[] = [
  'Интерактивная Жемчужина с каплями быстрого доступа у края рабочего окна',
  'Модуль «Калька» во второй капле: прозрачные функциональные зоны для сигналов «Звонки», «Сохранение» и «Таймер»',
  'Прямоугольный «Таймер Ready» в третьей капле: формат ЧЧ:ММ:СС, избранное время и управление с кальки',
  'Компактный рабочий режим таймера: автоматическое сворачивание до времени и двух кнопок управления',
  'Настройка полного отключения анимации Жемчужины в параметрах приложения',
];

export const PostUpdateBanner: React.FC<PostUpdateBannerProps> = ({
  isOpen,
  onDismiss,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#EBECEF] shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
      >
        {/* Шапка окна */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold mb-1.5">
              <Check className="w-3 h-3 stroke-[2.5]" />
              <span>Обновлено • v{CURRENT_APP_VERSION}</span>
            </div>
            <h2 className="text-lg font-bold text-[#1D2023] font-mts-extended leading-snug">
              Что нового в обновлении
            </h2>
            <p className="text-xs text-[#626C77] mt-0.5">
              Краткая сводка изменений от {CURRENT_RELEASE_DATE}
            </p>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            title="Закрыть"
            className="w-8 h-8 rounded-full bg-[#F4F5F7] hover:bg-[#E4E7EC] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Короткая сводка списком */}
        <ul className="space-y-2.5 py-2 border-y border-[#F1F3F5]">
          {RELEASE_SUMMARY.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-xs text-[#1D2023] leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF0023] mt-1.5 shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        {/* Кнопка Закрыть */}
        <button
          type="button"
          onClick={onDismiss}
          className="w-full h-10 rounded-full bg-[#1D2023] hover:bg-[#2F3338] active:scale-[0.99] text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
};
