// Powtórki w odstępach (pudełka Leitnera).
// Nowe pytanie zaczyna w pudełku 1. Dobra odpowiedź przesuwa je wyżej,
// błędna wraca do pudełka 1, czyli na jutro.
import { LEITNER_DAYS, LEITNER_MAX } from './config.js';
import { addDays } from './dates.js';

export function grade(deck, question, correct, today, context = {}) {
  const card = deck[question.id] || { box: 1, seen: 0, right: 0, added: today };
  card.q = {
    id: question.id,
    question: question.question,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation || '',
  };
  card.from = context.from || card.from || null;
  card.box = correct ? Math.min(card.box + 1, LEITNER_MAX) : 1;
  card.seen += 1;
  if (correct) card.right += 1;
  card.last = today;
  card.due = addDays(today, LEITNER_DAYS[card.box]);
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
  for (const c of Object.values(deck)) counts[c.box - 1] += 1;
  return counts;
}
