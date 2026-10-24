// Oś czasu: wszystkie wydania od dziś wstecz, żeby wrócić do dowolnego dnia i przypomnieć sobie, co było.
// Przewijanie w dół to cofanie się w czasie: nurt wypełnia linię, karp płynie razem z czytającym,
// a dzień na środku ekranu jest podświetlony. Skrót dnia doczytuje się, gdy karta pojawia się na ekranie.
import { loadIndex, loadEdition, pickDate, editionHref } from '../data.js';
import { todayISO, formatShort, formatMonth, formatWeekday, diffDays } from '../dates.js';
import { editionProgress, savedCountFor } from '../store.js';
import { h, mount, icon, koiMark, plural } from '../ui.js';
import { cachedEditionDates } from '../offline.js';

let cleanup = null;

export async function renderTimeline(root) {
  cleanup?.();
  let index;
  try {
    index = await loadIndex();
  } catch {
    mount(root, h('div', { class: 'empty' }, h('p', { style: 'margin:0' }, 'Nie udało się wczytać listy wydań. Sprawdź internet i spróbuj ponownie.')));
    return;
  }
  const today = todayISO();
  const latest = pickDate(index, null);
  const dates = (index.editions || [])
    .map((e) => e.date)
    .filter((d) => d <= today)
    .sort()
    .reverse();
  const headlines = Object.fromEntries((index.editions || []).map((e) => [e.date, e.headline]));
  // Bez internetu otworzą się tylko wydania zapisane na telefonie (i przygotowane na nim).
  const local = new Set((index.editions || []).filter((e) => e.local).map((e) => e.date));
  const cached = await cachedEditionDates().catch(() => new Set());
  const offline = navigator.onLine === false;
  const available = (d) => local.has(d) || cached.has(d);

  if (!dates.length) {
    mount(root, header(0, 0, 0), h('div', { class: 'empty' }, h('p', { style: 'margin:0' }, 'Tu pojawią się Wasze wydania, dzień po dniu.')));
    return;
  }

  const read = dates.filter((d) => editionProgress(d).completedOn).length;
  const onPhone = cached.size ? dates.filter(available).length : 0;

  // Miesiące, a w nich dni (od najnowszych). Między dniami bez wydań – znacznik przerwy.
  const months = [];
  dates.forEach((date, i) => {
    const key = date.slice(0, 7);
    let month = months[months.length - 1];
    if (!month || month.key !== key) {
      month = { key, date, items: [] };
      months.push(month);
    }
    const older = dates[i + 1];
    month.items.push({ kind: 'day', date });
    const gap = older ? diffDays(older, date) - 1 : 0;
    if (gap > 0) month.items.push({ kind: 'gap', days: gap });
  });

  const timeline = h(
    'div',
    { class: 'timeline' },
    h('div', { class: 'tl-river', 'aria-hidden': 'true' }, h('span', { class: 'tl-fill' })),
    h('div', { class: 'tl-swimmer', 'aria-hidden': 'true' }, koiMark('tl-koi')),
    months.map((m) =>
      h(
        'section',
        { class: 'tl-month', 'aria-label': formatMonth(m.date) },
        h('h2', { class: 'tl-month-label' }, formatMonth(m.date)),
        h('ol', { class: 'tl-list' }, m.items.map((it) => (it.kind === 'gap' ? gapItem(it.days) : dayItem(it.date)))),
      ),
    ),
    h(
      'div',
      { class: 'tl-origin' },
      h('span', { class: 'tl-node', 'aria-hidden': 'true' }),
      h('p', { class: 'muted small', style: 'margin:0' }, `Tu wszystko się zaczęło: pierwsze wydanie z ${formatShort(dates[dates.length - 1])}.`),
    ),
  );

  function dayItem(date) {
    const p = editionProgress(date);
    const ago = diffDays(date, today);
    const when = ago === 0 ? 'Dziś' : ago === 1 ? 'Wczoraj' : `${ago} ${plural(ago, 'dzień', 'dni', 'dni')} temu`;
    const saved = savedCountFor(date);
    const status = p.completedOn
      ? h('span', { class: 'pill nurt' }, icon('check'), 'Przeczytane')
      : p.done?.length
        ? h('span', { class: 'pill' }, 'Zaczęte')
        : h('span', { class: 'pill koi' }, date === latest ? 'Do przeczytania' : 'Nieprzeczytane');

    return h(
      'li',
      { class: `tl-day${date === latest ? ' is-latest' : ''}${p.completedOn ? ' is-read' : ''}${offline && !available(date) ? ' is-unavailable' : ''}`, dataset: { date } },
      h('span', { class: 'tl-node', 'aria-hidden': 'true' }),
      h(
        'article',
        { class: 'card tl-card' },
        h('p', { class: 'eyebrow' }, `${formatWeekday(date)} · ${when}`),
        h('h3', { class: 'tl-date' }, formatShort(date)),
        headlines[date] ? h('p', { class: 'tl-headline' }, headlines[date]) : null,
        h('ul', { class: 'tl-recap', 'aria-label': 'Skrót dnia' }),
        h(
          'div',
          { class: 'tl-meta' },
          status,
          saved ? h('span', { class: 'pill', title: 'W ulubionych', 'aria-label': `${saved} w ulubionych` }, icon('heart'), saved) : null,
          offline && !available(date) ? h('span', { class: 'pill', title: 'To wydanie nie jest zapisane na telefonie' }, 'Wymaga internetu') : null,
          h('span', { class: 'tl-quiz' }),
        ),
        h('a', { class: 'btn secondary', href: editionHref(date, latest) }, date === latest ? 'Otwórz wydanie' : 'Wróć do tego dnia', icon('arrow')),
      ),
    );
  }

  function gapItem(days) {
    return h(
      'li',
      { class: 'tl-gap' },
      h('span', { class: 'tl-node', 'aria-hidden': 'true' }),
      h('p', { class: 'small muted', style: 'margin:0' }, `${days} ${plural(days, 'dzień', 'dni', 'dni')} bez wydania`),
    );
  }

  mount(root, header(dates.length, read, onPhone), timeline);
  cleanup = animate(timeline, today);
}

function header(total, read, onPhone) {
  return h(
    'header',
    { class: 'masthead' },
    h('p', { class: 'eyebrow' }, 'Oś czasu'),
    h('h1', null, 'Poprzednie dni'),
    h('p', { class: 'muted', style: 'margin:0' }, 'Przewijaj w dół, żeby cofać się w czasie. Przy każdym dniu jest krótki skrót, żeby szybko przypomnieć sobie, co było.'),
    total
      ? h(
          'div',
          { class: 'meta-row' },
          h('span', { class: 'pill' }, icon('calendar'), `${total} ${plural(total, 'wydanie', 'wydania', 'wydań')}`),
          h('span', { class: 'pill nurt' }, icon('check'), `${read} ${plural(read, 'przeczytane', 'przeczytane', 'przeczytanych')}`),
          onPhone ? h('a', { class: 'pill pill-link', href: '#offline', title: 'Zapisane do czytania bez internetu' }, icon('download'), `${onPhone} offline`) : null,
          h('a', { class: 'pill pill-link', href: '#watki' }, icon('timeline'), 'Wątki'),
        )
      : null,
  );
}

// Skrót dnia do przypomnienia: najważniejsza wiadomość ze świata, pojęcie dnia i idea z książki.
function fillRecap(li, edition) {
  const recap = li.querySelector('.tl-recap');
  if (!recap || recap.childElementCount) return;
  const top = (section) => (edition.news || []).filter((n) => n.section === section).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
  const world = top('swiat');
  const rows = [
    world ? ['Świat', world.title] : null,
    edition.concept ? ['Pojęcie dnia', `${edition.concept.term}: ${edition.concept.definition}`] : null,
    edition.book ? ['Książka', edition.book.ideaTitle] : null,
  ].filter(Boolean);
  recap.append(...rows.map(([label, text]) => h('li', null, h('span', { class: 'eyebrow' }, label), h('span', null, text))));

  const p = editionProgress(edition.date);
  const answered = (edition.quiz || []).filter((q) => q.id in (p.quiz || {}));
  if (answered.length) {
    const right = answered.filter((q) => p.quiz[q.id] === q.answer).length;
    li.querySelector('.tl-quiz')?.replaceWith(h('span', { class: 'pill' }, icon('trophy'), `Quiz ${right}/${edition.quiz.length}`));
  }
}

// Efekty przewijania. Zwraca funkcję sprzątającą (przy przejściu do innego widoku).
function animate(timeline, today) {
  const days = [...timeline.querySelectorAll('.tl-day')];
  const swimmer = timeline.querySelector('.tl-swimmer');
  let observer = null;

  if ('IntersectionObserver' in window) {
    timeline.classList.add('reveal');
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const li = entry.target;
          li.classList.add('in');
          observer.unobserve(li);
          if (li.classList.contains('tl-day')) {
            loadEdition(li.dataset.date)
              .then((ed) => fillRecap(li, ed))
              .catch(() => {});
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    for (const li of timeline.querySelectorAll('.tl-day, .tl-gap')) observer.observe(li);
  } else {
    for (const li of days) loadEdition(li.dataset.date).then((ed) => fillRecap(li, ed)).catch(() => {});
  }

  let lastY = window.scrollY;
  let ticking = false;
  let focused = null;

  function update() {
    ticking = false;
    if (!timeline.isConnected) return;
    const mark = window.innerHeight * 0.42;
    const box = timeline.getBoundingClientRect();
    const fill = Math.max(0, Math.min(box.height, mark - box.top));
    timeline.style.setProperty('--fill', `${fill}px`);

    // Dzień najbliżej linii karpia jest „teraz oglądany”; wszystkie nad nią – już minięte przez nurt.
    let best = null;
    let bestDist = Infinity;
    for (const li of days) {
      const node = li.querySelector('.tl-node').getBoundingClientRect();
      const y = node.top + node.height / 2;
      li.classList.toggle('is-passed', y <= mark + 1);
      const dist = Math.abs(y - mark);
      if (dist < bestDist) {
        bestDist = dist;
        best = li;
      }
    }
    if (best !== focused) {
      focused?.classList.remove('is-focus');
      best?.classList.add('is-focus');
      focused = best;
    }

    // Karp patrzy w stronę, w którą płyniecie: w dół (w przeszłość) albo w górę (do dziś).
    const y = window.scrollY;
    if (Math.abs(y - lastY) > 2) swimmer.classList.toggle('to-today', y < lastY);
    lastY = y;
  }

  // Podczas przewijania karp macha ogonem.
  let swimTimer = null;
  function onScroll() {
    swimmer.classList.add('swimming');
    clearTimeout(swimTimer);
    swimTimer = setTimeout(() => swimmer.classList.remove('swimming'), 220);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  requestAnimationFrame(update);

  return () => {
    observer?.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}

export function leaveTimeline() {
  cleanup?.();
  cleanup = null;
}
