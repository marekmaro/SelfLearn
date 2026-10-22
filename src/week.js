// Podsumowanie tygodnia: 7 dni kończących się w niedzielę i quiz z pytań z całego tygodnia.
// Bez DOM, więc da się to sprawdzić w scripts/selftest.mjs.
import { addDays } from './dates.js';

const WEEK_QUIZ_SIZE = 7;

const dayOfWeek = (iso) => new Date(`${iso}T12:00:00`).getDay();

// Niedziela kończąca tydzień: w niedzielę to dziś, w pozostałe dni poprzednia niedziela.
export function weekEnd(today) {
  return addDays(today, -dayOfWeek(today));
}

export function weekDates(end) {
  return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
}

// Przypomnienie na ekranie wydania: w niedzielę i poniedziałek, dopóki quiz tygodnia nie jest zrobiony.
export function weekBannerDue(today, weeks = {}) {
  return [0, 1].includes(dayOfWeek(today)) && !weeks[weekEnd(today)]?.doneOn;
}

// state: stan aplikacji (progress, activity, saved); editions: wydania z tego tygodnia; headlines: data → nagłówek z indeksu.
export function weekSummary(end, editions, state, headlines = {}) {
  const byDate = new Map(editions.map((e) => [e.date, e]));
  const days = weekDates(end).map((date) => {
    const edition = byDate.get(date);
    const answers = state.progress?.[date]?.quiz || {};
    const quiz = edition?.quiz || [];
    return {
      date,
      hasEdition: Boolean(edition),
      headline: headlines[date] || edition?.news?.[0]?.title || null,
      active: Boolean(state.activity?.[date] || state.progress?.[date]?.completedOn === date),
      quizTotal: quiz.length,
      quizAnswered: quiz.filter((q) => answers[q.id] !== undefined).length,
      quizRight: quiz.filter((q) => answers[q.id] === q.answer).length,
    };
  });
  const sum = (key) => days.reduce((n, d) => n + d[key], 0);
  return {
    start: days[0].date,
    end,
    days,
    activeDays: days.filter((d) => d.active).length,
    editions: days.filter((d) => d.hasEdition).length,
    quizTotal: sum('quizTotal'),
    quizAnswered: sum('quizAnswered'),
    quizRight: sum('quizRight'),
    saved: Object.keys(state.saved || {}).filter((k) => days.some((d) => k.startsWith(`${d.date}:`))).length,
  };
}

// Pytania na quiz tygodnia: najpierw te z błędną odpowiedzią, potem bez odpowiedzi, na końcu dobrze rozwiązane.
// Kolejność w każdej grupie zależy od id pytania, więc po odświeżeniu quiz jest taki sam.
export function weekQuiz(editions, progress = {}, size = WEEK_QUIZ_SIZE) {
  const score = (q, date) => {
    const chosen = progress[date]?.quiz?.[q.id];
    if (chosen === undefined) return 1;
    return chosen === q.answer ? 2 : 0;
  };
  return editions
    .flatMap((e) => (e.quiz || []).map((q) => ({ ...q, date: e.date, rank: score(q, e.date) })))
    .sort((a, b) => a.rank - b.rank || hash(a.id) - hash(b.id))
    .slice(0, size)
    .map(({ rank, ...q }) => q);
}

function hash(text) {
  let x = 0;
  for (const ch of String(text)) x = (x * 31 + ch.codePointAt(0)) >>> 0;
  return x;
}
