// Pasek serii dni (jak w Duolingo): liczba dni z rzędu i ostatni tydzień.
import { todayISO } from '../dates.js';
import { isActive, weekActivity } from '../store.js';
import { h, icon, plural } from '../ui.js';

const DOW = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const dowOf = (iso) => DOW[new Date(`${iso}T12:00:00`).getDay()];

export function streakWidget(s) {
  const today = todayISO();
  const week = weekActivity(today);
  const activeToday = isActive(today);
  let status;
  if (s === 0) status = 'Zacznij serię: zrób rozgrzewkę albo przeczytaj wydanie do końca.';
  else if (activeToday) status = 'Dzisiejszy dzień zaliczony. Wróć jutro, żeby seria rosła.';
  else status = 'Dziś jeszcze przed Tobą. Wystarczy rozgrzewka, żeby nie stracić serii.';

  return h(
    'div',
    { class: `streak${activeToday ? ' is-today' : ''}` },
    h(
      'div',
      { class: 'streak-main' },
      h('span', { class: 'streak-flame', 'aria-hidden': 'true' }, icon('flame')),
      h('strong', { class: 'streak-num' }, s),
      h('span', { class: 'streak-label' }, `${plural(s, 'dzień', 'dni', 'dni')} z rzędu`),
    ),
    h(
      'ol',
      { class: 'streak-week', 'aria-label': 'Ostatnie 7 dni' },
      week.map((d) =>
        h(
          'li',
          { class: [d.active ? 'on' : '', d.isToday ? 'today' : ''].filter(Boolean).join(' ') },
          h('span', { class: 'dow' }, d.isToday ? 'Dziś' : dowOf(d.date)),
          h('span', { class: 'dot', 'aria-label': d.active ? 'zaliczony' : 'brak' }, d.active ? icon('check') : null),
        ),
      ),
    ),
    h('p', { class: 'streak-status' }, status),
  );
}
