/**
 * Утилита корректного русского склонения числительных
 * 1 контакт, 2-4 контакта, 5-20 контактов
 * 1 абонент, 2-4 абонента, 5-20 абонентов
 */

export function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod100 >= 11 && mod100 <= 19) {
    return many;
  }
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }
  return many;
}

export function formatContactsCount(n: number): string {
  return `${pluralize(n, 'контакт', 'контакта', 'контактов')}`;
}

export function formatSubscribersCount(n: number): string {
  return `${pluralize(n, 'абонент', 'абонента', 'абонентов')}`;
}
