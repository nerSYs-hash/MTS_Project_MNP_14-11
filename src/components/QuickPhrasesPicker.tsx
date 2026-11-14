import React, { useState } from 'react';
import { Star, X, Check } from 'lucide-react';
import { loadQuickPhrasesFromStorage, saveQuickPhrasesToStorage } from '../utils/quickPhrases';

interface QuickPhrasesPickerProps {
  onSelectPhrase: (phrase: string) => void;
  compact?: boolean;
  isAdding?: boolean;
  onToggleAdding?: (adding: boolean) => void;
  hideTriggerButton?: boolean;
}

export const QuickPhrasesPicker: React.FC<QuickPhrasesPickerProps> = ({
  onSelectPhrase,
  isAdding: externalIsAdding,
  onToggleAdding,
  hideTriggerButton = false,
}) => {
  const [phrases, setPhrases] = useState<string[]>(() => loadQuickPhrasesFromStorage());
  const [internalIsAdding, setInternalIsAdding] = useState(false);
  const [newPhraseText, setNewPhraseText] = useState('');

  const isAdding = externalIsAdding !== undefined ? externalIsAdding : internalIsAdding;
  const setIsAdding = (val: boolean) => {
    if (onToggleAdding) {
      onToggleAdding(val);
    } else {
      setInternalIsAdding(val);
    }
  };

  const handleAddPhrase = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newPhraseText.trim();
    if (!trimmed) return;
    if (!phrases.includes(trimmed)) {
      const updated = [trimmed, ...phrases];
      setPhrases(updated);
      saveQuickPhrasesToStorage(updated);
    }
    setNewPhraseText('');
    setIsAdding(false);
  };

  const handleDeletePhrase = (e: React.MouseEvent, phraseToDelete: string) => {
    e.stopPropagation();
    const updated = phrases.filter((p) => p !== phraseToDelete);
    setPhrases(updated);
    saveQuickPhrasesToStorage(updated);
  };

  if (hideTriggerButton && !isAdding && phrases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5 pt-1.5">
      {!hideTriggerButton && (
        <div className="flex items-center justify-end gap-2">
          {!isAdding ? (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              title="Добавить фразу"
              className="w-6 h-6 rounded-lg bg-[#F4F5F7] hover:bg-gray-200 text-[#8C95A0] hover:text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer border border-[#E4E7EC]"
            >
              <Star className="w-3.5 h-3.5 text-[#8C95A0]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewPhraseText('');
              }}
              className="h-7 px-3 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[11px] font-bold text-[#1D2023] transition-colors cursor-pointer"
            >
              Отмена
            </button>
          )}
        </div>
      )}

      {/* Быстрое добавление новой фразы в накопленный список (без вложенного form) */}
      {isAdding && (
        <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
          <input
            type="text"
            value={newPhraseText}
            onChange={(e) => setNewPhraseText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleAddPhrase();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsAdding(false);
                setNewPhraseText('');
              }
            }}
            placeholder="Введите быструю фразу для сохранения в шаблон..."
            autoFocus
            className="flex-1 h-8 px-3 rounded-lg bg-white border border-[#D5D8DD] text-xs text-[#1D2023] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/20 focus:outline-none"
          />
          {hideTriggerButton && (
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewPhraseText('');
              }}
              className="h-8 px-3 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-xs font-bold text-[#1D2023] transition-colors cursor-pointer"
            >
              Отмена
            </button>
          )}
          <button
            type="button"
            onClick={() => handleAddPhrase()}
            disabled={!newPhraseText.trim()}
            title="Сохранить фразу"
            className="h-8 px-3.5 rounded-full bg-[#EAECEF] hover:bg-[#DDE1E6] disabled:opacity-50 text-[#1D2023] text-xs font-bold transition-colors cursor-pointer flex items-center justify-center"
          >
            <Check className="w-3.5 h-3.5 text-[#1D2023]" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Список фраз, наполняемый оператором в течение дня */}
      {phrases.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 max-h-32 overflow-y-auto pr-1">
          {phrases.map((phrase) => (
            <div
              key={phrase}
              onClick={() => onSelectPhrase(phrase)}
              className="group inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#F8F9FA] hover:bg-gray-100 border border-[#E9ECEF] text-xs text-[#1D2023] transition-all cursor-pointer shadow-2xs select-none"
              title="Нажмите, чтобы вставить в заметку"
            >
              <span className="truncate max-w-[240px] sm:max-w-[340px]">{phrase}</span>
              <button
                type="button"
                onClick={(e) => handleDeletePhrase(e, phrase)}
                title="Удалить из быстрых фраз"
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-[#FF0032] transition-opacity cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
