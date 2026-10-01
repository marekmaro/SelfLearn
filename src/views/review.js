// Powtórki: pytania z wcześniejszych quizów wracają po 1, 3, 7, 16 i 35 dniach.
import { getState, update } from '../store.js';
import { grade, dueCards, boxCounts } from '../srs.js';
import { todayISO, formatShort, addDays } from '../dates.js';
import { LEITNER_DAYS } from '../config.js';
import { h, mount, icon, plural } from '../ui.js';

export function renderReview(root, { onChange }) {
  const today = todayISO();
  const queue = dueCards(getState().deck, today).map((c) => c.q.id);
  let pos = 0;
  let chosen = null;
  let right = 0;

  function render() {
    const deck = getState().deck;
    if (!queue.length) {
      mount(root, header(), nothingDue(deck));
      return;
    }
    if (pos >= queue.length) {
      mount(root, header(), summary(deck));
      return;
    }
    const card = deck[queue[pos]];
    mount(root, header(), questionCard(card));
  }

  function header() {
    return h(
      'header',
      { class: 'masthead' },
      h('p', { class: 'eyebrow' }, 'Powtórki'),
      h('h1', null, queue.length ? `${Math.min(pos + 1, queue.length)} z ${queue.length}` : 'Na dziś czysto'),
      queue.length
        ? h(
            'div',
            { class: 'progress', role: 'progressbar', 'aria-label': 'Postęp powtórek', 'aria-valuemin': 0, 'aria-valuemax': queue.length, 'aria-valuenow': pos },
            h('span', { style: `width:${(pos / queue.length) * 100}%` }),
          )
        : null,
    );
  }

  function questionCard(card) {
    const q = card.q;
    const done = chosen !== null;
    const el = h(
      'article',
      { class: 'card q' },
      card.from?.title ? h('p', { class: 'from' }, `Z wydania ${formatShort(card.from.date)} · ${card.from.title}`) : null,
      h('p', { class: 'q-text' }, q.question),
      h(
        'div',
        { class: 'options' },
        q.options.map((opt, i) => {
          let cls = 'option';
          if (done && i === q.answer) cls += ' is-right';
          else if (done && i === chosen) cls += ' is-wrong';
          return h('button', { type: 'button', class: cls, disabled: done, onclick: () => answer(card, i) }, opt);
        }),
      ),
    );
    if (done) {
      const ok = chosen === q.answer;
      const updated = getState().deck[q.id];
      el.append(
        h('p', { class: `verdict ${ok ? 'ok' : 'bad'}` }, ok ? 'Dobrze!' : 'Tym razem nie.'),
        q.explanation ? h('p', { class: 'read' }, q.explanation) : null,
        h('p', { class: 'from' }, `Następna powtórka: ${formatShort(updated.due)}.`),
        h(
          'button',
          {
            type: 'button',
            class: 'btn block',
            onclick: () => {
              pos += 1;
              chosen = null;
              render();
              window.scrollTo(0, 0);
            },
          },
          pos + 1 < queue.length ? 'Następne pytanie' : 'Zakończ',
          icon('arrow'),
        ),
      );
    }
    return el;
  }

  function answer(card, i) {
    chosen = i;
    const ok = i === card.q.answer;
    if (ok) right += 1;
    update((s) => {
      grade(s.deck, card.q, ok, today, { from: card.from });
    });
    render();
    onChange?.();
  }

  function summary(deck) {
    return h(
      'div',
      { class: 'done-card' },
      h('p', { class: 'eyebrow' }, 'Gotowe'),
      h('h2', null, `${right} z ${queue.length} dobrze`),
      h('p', { class: 'read' }, 'Pytania z błędną odpowiedzią wrócą jutro, pozostałe później. Tak działa pamięć: im później, tym trwalej.'),
      deckStats(deck),
      h('a', { class: 'btn secondary', href: '#dzis' }, 'Wróć do wydania'),
    );
  }

  function nothingDue(deck) {
    const total = Object.keys(deck).length;
    const upcoming = Object.values(deck)
      .map((c) => c.due)
      .sort()[0];
    return h(
      'div',
      { class: 'section' },
      total
        ? h(
            'p',
            { class: 'read' },
            `Masz ${total} ${plural(total, 'pytanie', 'pytania', 'pytań')} w powtórkach. `,
            upcoming ? `Najbliższe wracają ${upcoming === addDays(today, 1) ? 'jutro' : formatShort(upcoming)}.` : '',
          )
        : h(
            'div',
            { class: 'empty' },
            h('p', null, 'Powtórki tworzą się same z quizu w każdym wydaniu. Rozwiąż dzisiejszy quiz, a pytania wrócą tu w odpowiednim momencie.'),
            h('a', { class: 'btn secondary', href: '#dzis' }, 'Do wydania'),
          ),
      total ? deckStats(deck) : null,
    );
  }

  render();
}

function deckStats(deck) {
  const counts = boxCounts(deck);
  const max = Math.max(1, ...counts);
  return h(
    'div',
    { class: 'card' },
    h('p', { class: 'eyebrow' }, 'Twoja pamięć'),
    h(
      'div',
      { class: 'boxes', role: 'img', 'aria-label': counts.map((n, i) => `pudełko ${i + 1}: ${n}`).join(', ') },
      counts.map((n, i) =>
        h(
          'div',
          null,
          h('small', null, n),
          h('i', { style: `height:${Math.round((n / max) * 44) + 4}px;opacity:${0.45 + i * 0.13}` }),
          h('small', null, i === 0 ? 'jutro' : `${LEITNER_DAYS[i + 1]} dni`),
        ),
      ),
    ),
    h('p', { class: 'small muted', style: 'margin:0' }, 'Kolumny to pudełka: im dalej w prawo, tym lepiej pytanie zapamiętane i tym rzadziej wraca.'),
  );
}
