// Powtórki w odstępach (pudełka Leitnera): 1, 3, 7, 16 i 35 dni.
// Nowe pytanie zaczyna przed pierwszym pudełkiem, więc pierwsza powtórka zawsze wypada następnego dnia
// (dobra odpowiedź tuż po czytaniu to jeszcze nie trwała pamięć). Każda kolejna dobra odpowiedź
// przesuwa pytanie wyżej, a błędna cofa je do pudełka 1, czyli na jutro.
// Dobra odpowiedź oznaczona „Zgaduję” nie przesuwa pytania wyżej: wraca po tym samym odstępie
// (i nigdy później, niż już było zaplanowane), żeby zgadnięta wiedza zdążyła się utrwalić.
import { LEITNER_DAYS, LEITNER_MAX } from './config.js';
import { addDays } from './dates.js';

export function grade(deck, question, correct, today, context = {}) {
  const existing = deck[question.id];
  const card = existing || { box: 0, seen: 0, right: 0, added: today };
  const guessed = Boolean(context.guessed);
  card.q = {
    id: question.id,
    question: question.question,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation || '',
  };
  card.from = context.from || card.from || null;
  card.seen += 1;
  if (correct) card.right += 1;
  if (guessed) card.guesses = (card.guesses || 0) + 1;
  card.lastGuess = guessed;
  card.last = today;
  if (correct && guessed) {
    card.box = Math.max(card.box, 1);
    const due = addDays(today, LEITNER_DAYS[card.box]);
    card.due = existing?.due > today && existing.due < due ? existing.due : due;
  } else {
    card.box = correct ? Math.min(card.box + 1, LEITNER_MAX) : 1;
    card.due = addDays(today, LEITNER_DAYS[card.box]);
  }
  deck[question.id] = card;
  return card;
}

export function dueCards(deck, today) {
  return Object.values(deck)
    .filter((c) => c.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box);
}

export function boxCounts(deck) {
  const counts = new Array(LEITNER_MAX).fill(0);
  for (const c of Object.values(deck)) counts[Math.max(c.box, 1) - 1] += 1;
  return counts;
}
