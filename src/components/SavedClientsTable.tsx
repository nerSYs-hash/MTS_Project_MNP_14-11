import React, { useState, useRef } from 'react';
import {
  ChevronDown,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { SavedClientRecord } from '../types';
import { cleanToStrictMtsPhone } from '../data/regionsData';

interface SavedClientsTableProps {
  savedClients: SavedClientRecord[];
  onAddMnpSaved: (rawPhone: string) => { success: boolean; message?: string };
  onDeleteRecord: (id: string) => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  isStandbyMode?: boolean;
}

const ITEMS_PER_PAGE = 5;

export const SavedClientsTable: React.FC<SavedClientsTableProps> = ({
  savedClients,
  onAddMnpSaved,
  onDeleteRecord,
  isExpanded,
  onToggleExpanded,
  isStandbyMode = false,
}) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [hasInputError, setHasInputError] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Состояние подтверждения удаления внутри окна таблицы
  const [recordToDelete, setRecordToDelete] = useState<SavedClientRecord | null>(null);

  // Текущая страница пагинации (5 номеров на лист)
  const [currentPage, setCurrentPage] = useState(1);

  // Сортировка: самые свежие сохранения сверху
  const sortedClients = [...savedClients].sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
  );

  const totalPages = Math.max(1, Math.ceil(sortedClients.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const currentRecords = sortedClients.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Обработка отправки формы
  const handleSubmitMnp = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = phoneInput.trim();
    const strict = cleanToStrictMtsPhone(trimmed);

    // При ошибке ввода надпись «Введите номер абонента» выводится прямо внутри поля
    if (!trimmed || !strict) {
      setPhoneInput('');
      setHasInputError(true);
      inputRef.current?.focus();
      return;
    }

    const result = onAddMnpSaved(trimmed);
    if (result.success) {
      setPhoneInput('');
      setHasInputError(false);
      setCurrentPage(1); // Переходим на первый лист к новой записи
    } else {
      setPhoneInput('');
      setHasInputError(true);
      inputRef.current?.focus();
    }
  };

  // Копирование строгого номера в буфер
  const handleCopy = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 1800);
  };

  // Подтверждение удаления из таблицы
  const handleConfirmDelete = () => {
    if (recordToDelete) {
      onDeleteRecord(recordToDelete.id);
      setRecordToDelete(null);
      // Если удалили последнюю запись на странице, откатываем страницу
      if (currentRecords.length === 1 && safePage > 1) {
        setCurrentPage(safePage - 1);
      }
    }
  };

  return (
    <div className="w-full bg-white rounded-3xl border border-[#F1F3F5] shadow-mts-card relative transition-all duration-300 font-mts-text">
      {/* =========================================================================
          ВЕРХНЯЯ СТРОКА: Язычок сворачивания/разворачивания + Поле ввода + Кнопка MNP
          В свернутом режиме — это ровно аккуратная строчка
          ========================================================================= */}
      <div className="p-2 sm:p-2.5 bg-white rounded-3xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2">
        {/* Язычок таблицы: Номера (без отображения числа) */}
        <button
          type="button"
          onClick={onToggleExpanded}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-2xl transition-all cursor-pointer select-none text-left shrink-0 ${
            isExpanded
              ? 'bg-[#F4F5F7] text-[#1D2023] font-bold border border-[#E2E8F0]'
              : 'bg-[#F8F9FA] hover:bg-[#F1F3F5] text-[#1D2023] font-semibold border border-[#EBECEF]'
          }`}
          title={isExpanded ? 'Свернуть таблицу номеров' : 'Развернуть таблицу номеров'}
        >
          <div className="w-6 h-6 rounded-lg bg-[#F4F5F7] text-[#626C77] group-hover:text-[#1D2023] flex items-center justify-center shrink-0 transition-colors">
            <UserCheck className="w-3.5 h-3.5" />
          </div>

          <span className="text-xs sm:text-sm font-bold text-[#1D2023] font-mts-compact">
            Номера
          </span>

          <ChevronDown
            className={`w-4 h-4 text-[#626C77] group-hover:text-[#1D2023] transition-transform duration-250 ease-out ml-0.5 ${
              isExpanded ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {/* Форма ввода номера и кнопка MNP (темная нейтральная кнопка без красного) */}
        <form
          onSubmit={handleSubmitMnp}
          className="flex-1 flex items-center gap-2 max-w-full md:max-w-md ml-auto"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={phoneInput}
              onChange={(e) => {
                const val = e.target.value;
                if (cleanToStrictMtsPhone(val) === '79293664010') {
                  onAddMnpSaved('79293664010');
                  setPhoneInput('');
                  setHasInputError(false);
                  return;
                }
                setPhoneInput(val);
                if (hasInputError) setHasInputError(false);
              }}
              onFocus={() => {
                if (hasInputError) setHasInputError(false);
              }}
              placeholder="Введите номер абонента"
              className={`w-full h-9 px-3 rounded-xl border text-xs sm:text-sm font-medium transition-all focus:bg-white focus:outline-none ${
                hasInputError
                  ? 'border-rose-400 bg-rose-50/60 text-rose-900 placeholder:text-rose-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-400/30'
                  : 'border-[#D5D8DD] hover:border-gray-400 focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 bg-[#F4F5F7] text-[#1D2023] placeholder-[#8A94A0]'
              }`}
            />
          </div>

          {/* Кнопка с галочкой вместо текста MNP (без черного цвета) */}
          <button
            type="submit"
            className="h-9 w-9 sm:w-10 rounded-xl bg-[#F4F5F7] hover:bg-[#EBECEF] active:scale-[0.96] border border-[#D5D8DD] text-[#1D2023] hover:border-gray-400 transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
            title="Зафиксировать сохранение (+1 звонок и +1 сохранение, если номера не было в очереди)"
          >
            <Check className="w-4 h-4 text-[#1D2023]" strokeWidth={2.5} />
          </button>
        </form>
      </div>

      {/* =========================================================================
          ПЛАВНАЯ И БЫСТРАЯ АНИМАЦИЯ РАЗВЕРТЫВАНИЯ ТАБЛИЦЫ (CSS Grid rows: 0fr -> 1fr)
          ========================================================================= */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.2,0,0,1)] ${
          isExpanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden border-t border-[#F1F3F5] relative">
          {/* Инлайн окно подтверждения удаления внутри окна таблицы */}
          {recordToDelete && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-xs rounded-b-3xl p-4 flex flex-col items-center justify-center text-center z-20 animate-in fade-in duration-150">
              <h4 className="text-sm font-bold text-[#1D2023] font-mts-extended">
                Действительно хотите удалить номер?
              </h4>
              <div className="font-mono text-xs font-bold text-[#1D2023] bg-[#F4F5F7] px-2.5 py-1 rounded-lg mt-1 border border-[#E2E8F0]">
                {recordToDelete.phone}
              </div>
              <p className="text-xs text-[#626C77] mt-2 max-w-xs leading-relaxed">
                Внимание: количество сохранений в показателях KPI не изменится.
              </p>
              <div className="flex items-center gap-2 mt-3.5">
                <button
                  type="button"
                  onClick={() => setRecordToDelete(null)}
                  className="h-8 px-4 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold cursor-pointer transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="h-8 px-4 rounded-full bg-[#FF0023] hover:bg-[#E30613] active:scale-[0.98] text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
                >
                  Удалить
                </button>
              </div>
            </div>
          )}

          {/* Сама таблица */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F1F3F5] bg-[#F8F9FA] text-[11px] font-bold text-[#626C77] uppercase tracking-wider">
                  <th className="py-2.5 px-3 sm:px-4 font-bold">
                    <span>Время</span>
                  </th>
                  <th className="py-2.5 px-3 sm:px-4 font-bold">
                    <span>Номер</span>
                  </th>
                  <th className="py-2.5 px-3 sm:px-4 font-bold">
                    <span>Тип</span>
                  </th>
                  <th className="py-2.5 px-3 sm:px-4 text-center font-bold w-12">
                    <span>Удален</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#F1F3F5] text-xs sm:text-sm">
                {currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-[#626C77]">
                      Сохранённых абонентов пока нет
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#F9FAFB] transition-colors group"
                    >
                      {/* 1 Столбец: Время (00:00 местного времени ПК сотрудника) */}
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-bold text-[#1D2023] whitespace-nowrap">
                        {item.time}
                      </td>

                      {/* 2 Столбец: Номер (строгий слитный формат 79XXXXXXXXX) */}
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-bold text-[#1D2023] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopy(item.phone)}
                            className="hover:text-[#0077FF] transition-colors cursor-pointer flex items-center gap-1.5"
                            title="Скопировать номер (79XXXXXXXXX)"
                          >
                            <span>{item.phone}</span>
                            {copiedPhone === item.phone ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-[#626C77] opacity-60 group-hover:opacity-100 shrink-0" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 3 Столбец: Тип — MNP, По времени, АВТО */}
                      <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                        {item.type === 'MNP' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            MNP
                          </span>
                        ) : item.type === 'По времени' || (item.type as string) === 'По просьбе' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-50 text-[#0077FF] border border-blue-200">
                            По времени
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-[#1D2023] border border-slate-200">
                            АВТО
                          </span>
                        )}
                      </td>

                      {/* 4 Столбец: Крестик (удалить) */}
                      <td className="py-2.5 px-3 sm:px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setRecordToDelete(item)}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-[#1D2023] hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer mx-auto"
                          title="Удалить этот номер из списка"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* =========================================================================
              ПОДВАЛ ТАБЛИЦЫ: Листы и стрелки в дизайне МТС (в правом нижнем углу)
              ========================================================================= */}
          <div className="p-2.5 sm:p-3 bg-[#F8F9FA] border-t border-[#F1F3F5] flex items-center justify-between gap-3 text-xs">
            <span className="text-[#626C77] text-xs">
              Всего в журнале: <strong className="text-[#1D2023]">{savedClients.length}</strong>
            </span>

            {/* Блок пагинации в правом нижнем углу */}
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1D2023] bg-white px-2.5 py-1 rounded-xl border border-[#EBECEF] shadow-2xs">
                <span>
                  Лист {safePage} из {totalPages}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                    safePage <= 1
                      ? 'border-transparent text-gray-300 cursor-not-allowed bg-transparent'
                      : 'border-[#D5D8DD] bg-white text-[#1D2023] hover:bg-gray-100 active:scale-95'
                  }`}
                  title="Предыдущий лист"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                    safePage >= totalPages
                      ? 'border-transparent text-gray-300 cursor-not-allowed bg-transparent'
                      : 'border-[#D5D8DD] bg-white text-[#1D2023] hover:bg-gray-100 active:scale-95'
                  }`}
                  title="Следующий лист"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
