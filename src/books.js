// Książka tygodnia liczona z kalendarza: od startDate co 7 dni kolejna książka z kolejki.
// Dzięki temu oboje macie tę samą książkę i ten sam dzień bez żadnej synchronizacji.
import { diffDays } from './dates.js';

export const BOOK_DAYS = 7;

export function bookForDate(books, date) {
  if (!books?.startDate || !books.queue?.length) return null;
  const since = diffDays(books.startDate, date);
  if (since < 0) return null;
  const week = Math.floor(since / BOOK_DAYS);
  const book = books.queue[week % books.queue.length];
  const day = (since % BOOK_DAYS) + 1;
  return {
    book,
    day,
    days: BOOK_DAYS,
    planned: book.plan?.[day - 1] || null,
  };
}

// Co mówi dany dzień tygodnia książki, gdy nie ma gotowego planu.
export function dayRole(day) {
  if (day <= 5) return 'jedna nowa kluczowa idea książki';
  if (day === 6) return 'najważniejszy morał całej książki i plan jego zastosowania';
  return 'podsumowanie całego tygodnia z tą książką';
}
