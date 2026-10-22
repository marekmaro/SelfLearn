// Podsumowanie tygodnia: jak minęło 7 dni do niedzieli i quiz z pytań z całego tygodnia.
// Dodatek do zwykłych wydań: korzysta z tego, co już jest na telefonie i w repozytorium.
import { loadIndex, loadEdition, editionHref } from '../data.js';
import { todayISO, formatShort, formatWeekday } from '../dates.js';
import { getState, update, markActive } from '../store.js';
import { grade } from '../srs.js';
import { findRef } from '../chapters.js';
import { weekEnd, weekDates, weekSummary, weekQuiz } from '../week.js';
import { h, mount, icon, toast, plural } from '../ui.js';

export async function renderWeek(root, { onChange }) {
  const today = todayISO();
  const end = weekEnd(today);
  let index = { editions: [] };
  try {
    index = await loadIndex();
  } catch {
    // Bez indeksu pokażemy tylko to, co da się policzyć z postępów.
  }
  const dates = new Set(weekDates(end));
  const headlines = Object.fromEntries(index.editions.filter((e) => dates.has(e.date)).map((e) => [e.date, e.headline]));
  const editions = (await Promise.all(Object.keys(headlines).map((d) => loadEdition(d).catch(() => null)))).filter(Boolean);
  // Pytania ustalone przy pierwszym otwarciu, żeby odpowiedzi nie zmieniały zestawu w trakcie.
  const saved = getState().weeks?.[end];
  const questions = saved?.questions
    ? saved.questions.map((id) => editions.flatMap((e) => (e.quiz || []).map((q) => ({ ...q, date: e.date }))).find((q) => q.id === id)).filter(Boolean)
    : weekQuiz(editions, getState().progress);
  if (!saved?.questions && questions.length) {
    update((s) => {
      s.weeks ||= {};
      s.weeks[end] = { ...(s.weeks[end] || {}), questions: questions.map((q) => q.id), quiz: s.weeks[end]?.quiz || {} };
    });
  }
  const byDate = new Map(editions.map((e) => [e.date, e]));

  function render() {
    const summary = weekSummary(end, editions, getState(), headlines);
    mount(root, masthead(summary), daysSection(summary), quizSection());
  }

  function masthead(summary) {
    return h(
      'header',
      { class: 'masthead' },
      h('p', { class: 'eyebrow' }, 'Podsumowanie tygodnia'),
      h('h1', null, weekTitle(summary.start, summary.end)),
      h(
        'div',
        { class: 'stats' },
        h('div', { class: 'stat' }, h('strong', null, `${summary.activeDays}/7`), h('span', null, 'dni nauki')),
        h('div', { class: 'stat' }, h('strong', null, summary.quizTotal ? `${summary.quizRight}/${summary.quizTotal}` : '–'), h('span', null, 'dobrych odpowiedzi w quizach')),
        h('div', { class: 'stat' }, h('strong', null, summary.saved), h('span', null, plural(summary.saved, 'ulubiony wpis', 'ulubione wpisy', 'ulubionych wpisów'))),
      ),
    );
  }

  function daysSection(summary) {
    const latest = index.editions[0]?.date;
    return h(
      'section',
      { class: 'section' },
      h('h2', null, 'Dzień po dniu'),
      h(
        'ol',
        { class: 'week-days' },
        summary.days.map((d) =>
          h(
            'li',
            { class: d.active ? 'on' : '' },
            h('span', { class: 'dot', 'aria-label': d.active ? 'dzień zaliczony' : 'dzień bez nauki' }, d.active ? icon('check') : null),
            h(
              'div',
              null,
              h('p', { class: 'eyebrow' }, `${formatWeekday(d.date)}, ${formatShort(d.date)}`),
              d.hasEdition
                ? h('a', { href: editionHref(d.date, latest) }, d.headline || 'Wydanie dnia')
                : h('p', { class: 'muted', style: 'margin:0' }, 'Brak wydania'),
              d.quizAnswered ? h('p', { class: 'small muted', style: 'margin:0' }, `Quiz: ${d.quizRight} z ${d.quizTotal}`) : null,
            ),
          ),
        ),
      ),
    );
  }

  function quizSection() {
    if (!questions.length) {
      return h('section', { class: 'section' }, h('h2', null, 'Quiz tygodnia'), h('p', { class: 'muted' }, 'W tym tygodniu nie było jeszcze quizów. Wróć tu po pierwszym wydaniu.'));
    }
    const answers = getState().weeks?.[end]?.quiz || {};
    const answered = questions.filter((q) => answers[q.id] !== undefined).length;
    const right = questions.filter((q) => answers[q.id] === q.answer).length;
    const done = answered === questions.length;
    return h(
      'section',
      { class: 'section' },
      h('h2', null, 'Quiz tygodnia'),
      h(
        'p',
        { class: 'muted' },
        done
          ? `Wynik: ${right} z ${questions.length}. ${right === questions.length ? 'Cały tydzień w pamięci!' : 'Błędne odpowiedzi wrócą jutro w powtórkach.'}`
          : `${questions.length} ${plural(questions.length, 'pytanie', 'pytania', 'pytań')} z całego tygodnia, najpierw te, które poszły gorzej. Quiz zalicza dzień serii.`,
      ),
      questions.map((q, i) => questionCard(q, i, answers[q.id])),
    );
  }

  function questionCard(q, i, chosen) {
    const done = chosen !== undefined;
    const ref = byDate.get(q.date) ? findRef(byDate.get(q.date), q.ref) : null;
    return h(
      'article',
      { class: 'card q' },
      h('p', { class: 'from' }, `Pytanie ${i + 1} · z wydania ${formatShort(q.date)}${ref?.title ? ` · ${ref.title}` : ''}`),
      h('p', { class: 'q-text' }, q.question),
      h(
        'div',
        { class: 'options' },
        q.options.map((opt, oi) => {
          let cls = 'option';
          if (done && oi === q.answer) cls += ' is-right';
          else if (done && oi === chosen) cls += ' is-wrong';
          return h('button', { type: 'button', class: cls, disabled: done, onclick: () => answer(q, oi, ref) }, opt);
        }),
      ),
      done ? h('p', { class: `verdict ${chosen === q.answer ? 'ok' : 'bad'}` }, chosen === q.answer ? 'Dobrze!' : 'Tym razem nie.') : null,
      done && q.explanation ? h('p', { class: 'read' }, q.explanation) : null,
    );
  }

  function answer(q, chosen, ref) {
    const correct = chosen === q.answer;
    let allDone = false;
    update((s) => {
      s.weeks ||= {};
      const week = (s.weeks[end] ||= { questions: questions.map((x) => x.id), quiz: {} });
      week.quiz[q.id] = chosen;
      allDone = questions.every((x) => week.quiz[x.id] !== undefined);
      if (allDone) week.doneOn = today;
      // Dobra odpowiedź nie przesuwa powtórek (to nie jest ich termin), a błędna wraca na jutro.
      if (!correct) grade(s.deck, q, false, today, { from: { date: q.date, title: ref?.title || null } });
    });
    if (allDone) {
      const milestone = markActive('tydzien');
      toast(milestone ? `Seria: ${milestone} dni z rzędu!` : 'Quiz tygodnia zaliczony');
    }
    render();
    onChange?.();
  }

  render();
}

// „19–25 października” w jednym miesiącu, „27 października – 2 listopada” na przełomie.
function weekTitle(start, end) {
  return start.slice(0, 7) === end.slice(0, 7) ? `${Number(start.slice(8))}–${formatShort(end)}` : `${formatShort(start)} – ${formatShort(end)}`;
}

// Wejście na ekranie wydania (w niedzielę i poniedziałek).
export function weekBanner() {
  return h(
    'div',
    { class: 'banner week-banner' },
    h('p', { style: 'margin:0' }, 'Tydzień za Tobą. Zobacz, jak minął, i sprawdź się w quizie z całego tygodnia.'),
    h('a', { class: 'btn secondary', href: '#tydzien' }, 'Podsumowanie tygodnia', icon('arrow')),
  );
}
