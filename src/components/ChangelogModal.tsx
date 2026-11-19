import React, { useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { CHANGELOG_ITEMS, ChangelogCategory, ChangelogItem } from '../data/changelogData';
import { MtsThreeCardScene } from './MtsThreeCardScene';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CategoryConfig {
  id: ChangelogCategory;
  title: string;
  description: string;
  bgGradient: string;
  isWide?: boolean;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: 'new',
    title: 'Новое',
    description:
      'Универсальный ввод номеров, журнал с пагинацией, единое поле ввода времени перезвона и мгновенный учёт MNP.',
    bgGradient: 'bg-gradient-to-br from-[#F5F8FC] via-[#EEF4FB] to-[#E3EDFA] border border-blue-100/60',
    isWide: true,
  },
  {
    id: 'update',
    title: 'Обновление',
    description:
      'Пакет UPDATE_URM, время ПК на кнопках перезвона, динамический сбор фраз и тонкие шрифты KPI.',
    bgGradient: 'bg-gradient-to-br from-[#F7F6FD] via-[#F2EEFB] to-[#E8E2F8] border border-purple-100/60',
  },
  {
    id: 'fix',
    title: 'Исправление',
    description:
      'Сохранение статуса перезвона 1/3, точность таймеров, ювелирная геометрия окон и выравнивание городов.',
    bgGradient: 'bg-gradient-to-br from-[#FDF6F6] via-[#FAF0F0] to-[#F8E7E7] border border-red-100/60',
  },
  {
    id: 'remove',
    title: 'Удалено',
    description:
      'Очистка от шаблонов по умолчанию, удаление синего градиента, скрытие лишних плашек и надписей.',
    bgGradient: 'bg-gradient-to-br from-[#F4F9FB] via-[#EEF5F8] to-[#E3EFF4] border border-slate-200/60',
  },
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<ChangelogCategory | 'all' | null>(null);

  if (!isOpen) return null;

  // Подсчёт количества записей по категориям
  const counts = {
    new: CHANGELOG_ITEMS.filter((i) => i.category === 'new').length,
    update: CHANGELOG_ITEMS.filter((i) => i.category === 'update').length,
    fix: CHANGELOG_ITEMS.filter((i) => i.category === 'fix').length,
    remove: CHANGELOG_ITEMS.filter((i) => i.category === 'remove').length,
    all: CHANGELOG_ITEMS.length,
  };

  const filteredItems: ChangelogItem[] =
    selectedCategory === null || selectedCategory === 'all'
      ? CHANGELOG_ITEMS
      : CHANGELOG_ITEMS.filter((item) => item.category === selectedCategory);

  const activeCategoryConfig = CATEGORIES.find((c) => c.id === selectedCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/55 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-[32px] sm:rounded-[36px] max-w-4xl w-full p-5 sm:p-7 border border-slate-200/60 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto overflow-x-hidden relative flex flex-col justify-between">
        {/* Шапка модального окна */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Журнал обновлений
            </h2>
            <p className="text-xs sm:text-[13px] text-slate-500 font-normal mt-0.5">
              Патч-ноут улучшений, исправлений и новых функций АРМ
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
            title="Закрыть журнал"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* ОСНОВНОЙ ВИД: 4 карточки направлений в фирменном стиле МТС */}
        {selectedCategory === null ? (
          <div className="space-y-4">
            {/* 1. Карточка «Новое» — большой прямоугольник сверху */}
            {(() => {
              const newCat = CATEGORIES[0];
              return (
                <div
                  key={newCat.id}
                  onClick={() => setSelectedCategory(newCat.id)}
                  className={`${newCat.bgGradient} rounded-[28px] sm:rounded-[32px] p-6 sm:p-7 shadow-xs relative overflow-hidden transition-all duration-200 group cursor-pointer min-h-[200px] sm:min-h-[220px] flex flex-col justify-between`}
                >
                  <div className="max-w-[65%] sm:max-w-[60%] z-10">
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                      {newCat.title}
                    </h3>
                    <p className="text-xs sm:text-[13px] text-slate-600 font-normal leading-relaxed mt-2">
                      {newCat.description}
                    </p>
                  </div>

                  <div className="pt-5 z-10 flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCategory(newCat.id);
                      }}
                      className="px-6 py-2.5 rounded-full bg-white group-hover:bg-slate-50 text-slate-950 font-bold text-xs tracking-wider uppercase shadow-xs border border-slate-200/80 transition-all flex items-center cursor-pointer active:scale-95"
                    >
                      <span>ПОСМОТРЕТЬ</span>
                    </button>
                  </div>

                  {/* Живая 3D сцена Three.js без вырезок и границ, крупная и четкая */}
                  <div className="absolute top-0 right-0 w-[55%] sm:w-[50%] h-full pointer-events-none overflow-hidden">
                    <MtsThreeCardScene type="new" />
                  </div>
                </div>
              );
            })()}

            {/* 2, 3, 4: Квадратные карточки направлений «Обновление», «Исправление», «Удалено» */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {CATEGORIES.slice(1).map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`${cat.bgGradient} rounded-[28px] p-6 shadow-xs relative overflow-hidden transition-all duration-200 group cursor-pointer flex flex-col justify-between min-h-[245px]`}
                >
                  <div className="z-10 pr-2">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
                      {cat.title}
                    </h3>
                    <p className="text-xs sm:text-[12.5px] text-slate-600 font-normal leading-relaxed mt-2 line-clamp-3">
                      {cat.description}
                    </p>
                  </div>

                  <div className="pt-4 z-10 flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCategory(cat.id);
                      }}
                      className="px-5 py-2.5 rounded-full bg-white group-hover:bg-slate-50 text-slate-950 font-bold text-xs tracking-wider uppercase shadow-xs border border-slate-200/80 transition-all flex items-center cursor-pointer active:scale-95"
                    >
                      <span>ПОСМОТРЕТЬ</span>
                    </button>
                  </div>

                  {/* Живая 3D сцена Three.js в правом нижнем углу без каких-либо швов */}
                  <div className="absolute bottom-0 right-0 w-[60%] h-[65%] pointer-events-none overflow-hidden">
                    <MtsThreeCardScene type={cat.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ДЕТАЛЬНЫЙ ВИД: Список изменений выбранной категории */
          <div className="space-y-4">
            {/* Верхняя навигация внутри категории */}
            <div className="flex items-center justify-between gap-3 bg-[#F6F8FB] p-3.5 sm:p-4 rounded-2xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-xs border border-slate-200/80 transition-all cursor-pointer active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Назад ко всем направлениям</span>
              </button>

              {/* Табы быстрого переключения между направлениями */}
              <div className="flex items-center gap-1">
                {CATEGORIES.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                      }`}
                    >
                      {cat.title}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Карточка-заголовок активной категории с 3D объектом */}
            {activeCategoryConfig && (
              <div className={`${activeCategoryConfig.bgGradient} rounded-2xl p-4 sm:p-5 relative overflow-hidden flex items-center justify-between`}>
                <div className="max-w-[70%] z-10">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                    {activeCategoryConfig.title}
                  </h3>
                  <p className="text-xs text-slate-600 font-normal mt-1">
                    {activeCategoryConfig.description}
                  </p>
                </div>
                <div className="w-24 h-20 shrink-0 pointer-events-none">
                  <MtsThreeCardScene type={activeCategoryConfig.id} />
                </div>
              </div>
            )}

            {/* Список изменений в выбранном направлении */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/70 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13px] font-bold text-slate-900 leading-snug">
                      {item.title}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10.5px] font-semibold text-slate-400 font-mono">
                        v{item.version}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.date}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 font-normal leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Нижняя часть модального окна */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11.5px] font-normal text-slate-500">
            {selectedCategory === null ? (
              <span>Всего изменений в программе: <strong className="text-slate-800">{counts.all}</strong></span>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Все 4 направления</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
