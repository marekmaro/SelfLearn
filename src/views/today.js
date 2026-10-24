// Widok wydania: rozgrzewka z wczorajszej wiedzy, potem rozdziały (Polska → Świat → Twoje tematy → …
// → Na wieczór), każdy kończy się przyciskiem „Dalej”. Po ostatnim wydanie jest ukończone.
import { FACT_KINDS, LEVELS } from '../config.js';
import { loadIndex, loadEdition, pickDate, previousDate, neighborDates, editionHref } from '../data.js';
import { todayISO, formatLong, formatShort, formatTiny } from '../dates.js';
import {
  getState,
  update,
  editionProgress,
  updateEdition,
  isSaved,
  toggleSaved,
  streak,
  completedCount,
  markActive,
  backupDue,
} from '../store.js';
import { grade, dueCards } from '../srs.js';
import { h, mount, icon, koiMark, sourceLinks, toast, plural } from '../ui.js';
import { getLook, openAppearanceSheet } from '../look.js';
import { speechSupported, startListening, stopListening, isListening } from '../listen.js';
import { challengeFor, shareChallenge, verdict } from '../challenge.js';
import { sectionLabel, firstSentence, buildChapters, buildWarmup, estimateMinutes, findRef } from '../chapters.js';
import { smoothScroll, updateReadProgress, restorePosition, watchScroll } from './reading.js';
import { streakWidget } from './streak.js';
import { backupBanner } from './backup.js';
import { weekBanner } from './week.js';
import { deepenButton } from './deepen.js';
import { weekBannerDue } from '../week.js';
import { threadLink } from './threads.js';
import { threadsFromIndex } from '../threads.js';
import { guessToggle, verdictText } from '../confidence.js';

const kindLabel = (id) => FACT_KINDS.find((k) => k.id === id)?.label || id;

export async function renderToday(root, { date: requested, focus = null, onChange }) {
  let index;
  let date;
  let edition;
  try {
    index = await loadIndex();
    date = pickDate(index, requested);
    if (!date) {
      mount(root, emptyState());
      return;
    }
    edition = await loadEdition(date);
  } catch (err) {
    mount(root, errorState(err, () => renderToday(root, { date: requested, focus, onChange })));
    return;
  }
  const threads = threadsFromIndex(index);

  // Rozgrzewka: 3 pytania z poprzedniego wydania.
  const prevDate = previousDate(index, date);
  const around = neighborDates(index, date);
  const isArchive = date !== around.latest;
  let prevEdition = null;
  if (prevDate) {
    try {
      prevEdition = await loadEdition(prevDate);
    } catch {
      prevEdition = null;
    }
  }
  const warmup = buildWarmup(edition, prevEdition, editionProgress(prevDate || ''));

  const profile = getState().profile;
  const chapters = buildChapters(edition, profile, warmup.length ? { prevDate } : null);
  const expanded = new Set();
  const openCards = new Set();
  // Pytania z zaznaczonym „Zgaduję”, zanim padnie odpowiedź (po odpowiedzi flaga trafia do postępów).
  const guessing = new Set();
  let lastChapter = null;

  function currentChapterId() {
    const p = editionProgress(date);
    if (p.chapter && chapters.some((c) => c.id === p.chapter)) return p.chapter;
    return chapters.find((c) => !p.done.includes(c.id))?.id || chapters[0]?.id;
  }

  function goTo(id, { scroll = true } = {}) {
    updateEdition(date, (p) => {
      p.chapter = id;
    });
    render({ scroll });
  }

  function finishChapter(id) {
    const idx = chapters.findIndex((c) => c.id === id);
    let justCompleted = false;
    updateEdition(date, (p) => {
      if (!p.done.includes(id)) p.done.push(id);
      const notDone = (c) => !p.done.includes(c.id);
      const allDone = chapters.every((c) => !notDone(c));
      // Po ukończeniu całości „Dalej” idzie po kolei; wcześniej prowadzi do pominiętych rozdziałów.
      const next = allDone ? chapters[idx + 1] : chapters.slice(idx + 1).find(notDone) || chapters.find(notDone);
      p.chapter = next ? next.id : 'koniec';
      if (chapters.every((c) => p.done.includes(c.id)) && !p.completedOn) {
        p.completedOn = todayISO();
        p.completedAt = new Date().toISOString();
        justCompleted = true;
      }
    });
    if (justCompleted) {
      const milestone = markActive('wydanie');
      toast(milestone ? `Seria: ${milestone} dni z rzędu!` : 'Wydanie ukończone');
    }
    render({ scroll: true });
    onChange?.();
  }

  function render({ scroll = false } = {}) {
    const progress = editionProgress(date);
    const showEnd = progress.chapter === 'koniec' || (progress.completedOn && progress.chapter == null);
    const activeId = showEnd ? null : currentChapterId();
    const active = chapters.find((c) => c.id === activeId);

    const chapterKey = activeId || 'koniec';
    const entering = lastChapter !== null && lastChapter !== chapterKey;
    lastChapter = chapterKey;

    const content = h('section', {
      class: `chapter${entering ? ' entering' : ''}`,
      id: 'rozdzial',
      'aria-live': 'polite',
      dataset: { date, chapter: chapterKey },
    });
    // Zwykłe append zamieniłby puste miejsca (null) na tekst „null”.
    content.append(...(showEnd || !active ? endView() : chapterView(active)).filter(Boolean));

    const strip = chapterStrip(activeId);
    mount(root, masthead(), strip, content);

    // Wysokość paska rozdziałów (zależy od wielkości tekstu) – potrzebna do przewijania pod nim.
    document.documentElement.style.setProperty('--chapters-h', `${strip.offsetHeight}px`);
    const scroller = strip.querySelector('.chapters-scroll');
    const current = strip.querySelector('.chip[aria-current="step"]');
    if (scroller && current) scroller.scrollLeft = current.offsetLeft - (scroller.clientWidth - current.offsetWidth) / 2;
    if (scroll) content.scrollIntoView({ block: 'start', behavior: 'instant' });
    updateReadProgress();
  }

  // ---------- Nagłówek ----------

  function masthead() {
    const p = editionProgress(date);
    const doneCount = chapters.filter((c) => p.done.includes(c.id)).length;
    const minutes = estimateMinutes(chapters, edition, expanded);
    const today = todayISO();
    const name = profile?.name ? `, ${profile.name}` : '';
    const s = streak();

    return h(
      'header',
      { class: 'masthead' },
      h(
        'div',
        { class: 'masthead-top' },
        h('p', { class: 'eyebrow' }, isArchive ? 'Wydanie z archiwum' : `Dzień dobry${name}`),
        h(
          'div',
          { class: 'meta-row' },
          h('span', { class: 'pill', title: 'Szacowany czas czytania' }, icon('clock'), `${minutes} min`),
          speechSupported()
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'pill pill-link nurt',
                  'aria-label': 'Posłuchaj wydania',
                  title: 'Posłuchaj wydania: telefon przeczyta je na głos',
                  onclick: () => (isListening() ? stopListening() : listen()),
                },
                icon('headphones'),
                'Posłuchaj',
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              class: 'pill pill-link aa',
              'aria-label': 'Wygląd: motyw, kolor i wielkość tekstu',
              title: 'Wygląd: motyw, kolor i wielkość tekstu',
              onclick: () => openAppearanceSheet({ onChange: () => render() }),
            },
            'Aa',
          ),
          h('a', { class: 'pill pill-link icon-pill', href: '#ustawienia', title: 'Dostosuj: działy, długość wydania i przypomnienia', 'aria-label': 'Dostosuj wydanie' }, icon('sliders')),
        ),
      ),
      dayNav(),
      h('h1', { class: 'date' }, formatLong(date)),
      isArchive
        ? h(
            'div',
            { class: 'banner archive-banner' },
            h('p', { style: 'margin:0' }, 'Wracasz do wcześniejszego dnia. Twoje odpowiedzi i postępy z tamtego wydania są zapisane.'),
            h('a', { class: 'btn secondary', href: '#dzis' }, 'Wróć do dziś', icon('arrow')),
          )
        : streakWidget(s),
      edition.intro ? h('p', { class: 'read intro' }, edition.intro) : null,
      !isArchive && backupDue() ? backupBanner() : null,
      !isArchive && weekBannerDue(today, getState().weeks) ? weekBanner() : null,
      challengeBanner(),
      date < today && !isArchive
        ? h(
            'div',
            { class: 'banner' },
            h('p', { style: 'margin:0' }, `Dzisiejszego wydania jeszcze nie ma. Poniżej najnowsze, z ${formatShort(date)}.`),
            h('a', { class: 'btn secondary', href: '#przygotuj', style: 'margin-top:10px' }, 'Przygotuj dzisiejsze wydanie', icon('arrow')),
          )
        : null,
      h(
        'div',
        { class: 'progress', role: 'progressbar', 'aria-label': 'Postęp wydania', 'aria-valuemin': 0, 'aria-valuemax': chapters.length, 'aria-valuenow': doneCount },
        h('span', { style: `width:${chapters.length ? (doneCount / chapters.length) * 100 : 0}%` }),
      ),
    );
  }

  // Strzałki „poprzedni / następny dzień” i wejście na oś czasu.
  function dayNav() {
    const step = (target, dir) => {
      if (!target) return h('span', { class: `day-step ${dir} is-empty`, 'aria-hidden': 'true' });
      const label = dir === 'next' && target === around.latest && target === todayISO() ? 'Dziś' : formatTiny(target);
      return h(
        'a',
        {
          class: `day-step ${dir}`,
          href: editionHref(target, around.latest),
          'aria-label': `${dir === 'prev' ? 'Poprzednie wydanie' : 'Następne wydanie'}: ${formatLong(target)}`,
        },
        dir === 'prev' ? icon('back') : null,
        label,
        dir === 'next' ? icon('arrow') : null,
      );
    };
    return h(
      'nav',
      { class: 'day-nav', 'aria-label': 'Poprzednie i następne dni' },
      step(around.prev, 'prev'),
      h('a', { class: 'day-step timeline-link', href: '#dni', 'aria-label': 'Oś czasu: wszystkie poprzednie dni' }, icon('timeline'), 'Oś czasu'),
      step(around.next, 'next'),
    );
  }

  function chapterStrip(activeId) {
    const p = editionProgress(date);
    const items = chapters.map((c) => {
      const done = p.done.includes(c.id);
      return h(
        'li',
        null,
        h(
          'button',
          {
            type: 'button',
            class: `chip${done ? ' is-done' : ''}`,
            'aria-current': c.id === activeId ? 'step' : null,
            onclick: () => goTo(c.id),
          },
          done ? icon('check') : null,
          c.label,
        ),
      );
    });
    if (p.completedOn) {
      items.push(h('li', null, h('button', { type: 'button', class: 'chip', 'aria-current': activeId ? null : 'step', onclick: () => goTo('koniec') }, 'Podsumowanie')));
    }
    return h(
      'nav',
      { class: 'chapters', 'aria-label': 'Rozdziały wydania' },
      h('div', { class: 'chapters-scroll' }, h('ol', null, items)),
      h('span', { class: 'read-progress', 'aria-hidden': 'true' }, h('span')),
    );
  }

  // ---------- Rozdziały ----------

  function chapterView(ch) {
    const idx = chapters.indexOf(ch);
    const next = chapters[idx + 1];
    const body = [];

    body.push(
      h(
        'div',
        { class: 'chapter-head' },
        h('p', { class: 'eyebrow' }, `Rozdział ${idx + 1} z ${chapters.length}`),
        h('h2', null, ch.title || ch.label),
        ch.type === 'topics' ? topicNav(ch.groups) : ch.lead ? h('p', { class: 'muted' }, ch.lead) : null,
      ),
    );

    if (ch.type === 'warmup') body.push(...warmupView());
    if (ch.type === 'news') body.push(...ch.groups.map((g) => newsGroup(g, false)));
    if (ch.type === 'topics') body.push(...ch.groups.map((g) => newsGroup(g, true)));
    if (ch.type === 'facts') body.push(limitedList(ch.id, ch.items, ch.limit, factCard));
    if (ch.type === 'otd') body.push(limitedList(ch.id, ch.items, ch.limit, otdCard));
    if (ch.type === 'concept') body.push(conceptCard(edition.concept));
    if (ch.type === 'book') body.push(bookCard(edition.book));
    if (ch.type === 'quiz') body.push(...quizView());
    if (ch.type === 'evening') body.push(eveningCard(edition.evening));

    const p = editionProgress(date);
    const isDone = p.done.includes(ch.id);
    body.push(
      h(
        'div',
        { class: 'next-wrap' },
        h(
          'button',
          { type: 'button', class: 'btn block', onclick: () => finishChapter(ch.id) },
          next ? `Dalej: ${next.label}` : isDone && p.completedOn ? 'Pokaż podsumowanie' : 'Zakończ wydanie',
          icon(next ? 'arrow' : 'check'),
        ),
      ),
    );
    return body;
  }

  // Spis działów na górze „Twoich tematów”: dotknięcie przewija do działu.
  function topicNav(groups) {
    return h(
      'div',
      { class: 'subnav', role: 'navigation', 'aria-label': 'Działy w tym rozdziale' },
      groups.map((g) =>
        h(
          'button',
          {
            type: 'button',
            class: 'subnav-chip',
            onclick: () => document.getElementById(`dzial-${g.section}`)?.scrollIntoView({ block: 'start', behavior: smoothScroll() }),
          },
          sectionLabel(g.section),
          h('span', { class: 'count' }, g.items.length),
        ),
      ),
    );
  }

  function newsGroup(group, showTitle) {
    const items = group.items;
    const key = `news:${group.section}`;
    const limit = expanded.has(key) ? items.length : group.limit;
    const hidden = items.length - limit;
    return h(
      'div',
      { class: 'group', id: showTitle ? `dzial-${group.section}` : null },
      showTitle ? h('h3', { class: 'group-title' }, sectionLabel(group.section)) : null,
      items.slice(0, limit).map((item, i) => newsCard(item, i + 1)),
      hidden > 0
        ? h(
            'button',
            { type: 'button', class: 'more-btn', onclick: () => { expanded.add(key); render(); } },
            `Pokaż więcej (${hidden})`,
          )
        : null,
    );
  }

  function limitedList(key, items, limit, renderItem) {
    const shown = expanded.has(key) ? items.length : limit;
    const hidden = items.length - shown;
    return h(
      'div',
      { class: 'group' },
      items.slice(0, shown).map(renderItem),
      hidden > 0
        ? h('button', { type: 'button', class: 'more-btn', onclick: () => { expanded.add(key); render(); } }, `Pokaż więcej (${hidden})`)
        : null,
    );
  }

  // Przyciski pod kartą: „Pogłęb” (pytanie do czatu AI) i serce (Ulubione).
  function cardActions(id, entry, extra = '') {
    return h('span', { class: 'card-actions' }, deepenButton(date, extra ? { ...entry, text: `${entry.text}\n${extra}` } : entry), saveButton(id, entry));
  }

  function saveButton(id, entry) {
    const pressed = isSaved(date, id);
    const label = (on) => (on ? 'Usuń z ulubionych' : 'Dodaj do ulubionych');
    return h(
      'button',
      {
        type: 'button',
        class: 'icon-btn fav-btn',
        'aria-pressed': pressed ? 'true' : 'false',
        'aria-label': label(pressed),
        title: label(pressed),
        onclick: (e) => {
          const btn = e.currentTarget;
          const now = toggleSaved(date, id, entry);
          btn.setAttribute('aria-pressed', now ? 'true' : 'false');
          btn.setAttribute('aria-label', label(now));
          btn.setAttribute('title', label(now));
          if (now) {
            btn.classList.remove('pop');
            void btn.offsetWidth;
            btn.classList.add('pop');
          }
          toast(now ? 'Dodane do ulubionych' : 'Usunięte z ulubionych', now ? { action: { label: 'Zobacz', onClick: () => (location.hash = '#ulubione') } } : {});
        },
      },
      icon('heart'),
    );
  }

  function newsCard(item, rank) {
    const head = h(
      'div',
      { class: 'news-head' },
      h('span', { class: 'rank', 'aria-label': `Miejsce ${rank}` }, rank),
      h('div', null, h('h3', null, item.title), item.thread ? threadLink(item.thread, threads) : null),
    );
    const why = item.why
      ? h('div', { class: 'why' }, h('p', { class: 'eyebrow' }, 'Dlaczego to ważne'), h('p', null, item.why))
      : null;
    const foot = h(
      'div',
      { class: 'card-foot' },
      sourceLinks(item.sources),
      cardActions(item.id, { type: 'news', section: item.section, title: item.title, text: item.summary, sources: item.sources }, item.why ? `Dlaczego to ważne: ${item.why}` : ''),
    );

    // Widok „Nagłówki”: tytuł i pierwsze zdanie, reszta po dotknięciu.
    if (getLook().layout === 'skrot') {
      return h(
        'details',
        {
          class: 'card news-compact',
          dataset: { item: item.id },
          open: openCards.has(item.id),
          ontoggle: (e) => {
            if (e.currentTarget.open) openCards.add(item.id);
            else openCards.delete(item.id);
          },
        },
        h(
          'summary',
          null,
          head,
          h('p', { class: 'lead' }, firstSentence(item.summary)),
          h('span', { class: 'expand-hint' }, h('span', { class: 'when-closed' }, 'Czytaj dalej'), h('span', { class: 'when-open' }, 'Zwiń'), icon('chevron')),
        ),
        h('div', { class: 'news-body' }, h('p', { class: 'read' }, item.summary), why, foot),
      );
    }

    return h('article', { class: 'card', dataset: { item: item.id } }, head, h('p', { class: 'read' }, item.summary), why, foot);
  }

  function factCard(item) {
    return h(
      'article',
      { class: 'card', dataset: { item: item.id } },
      h('p', { class: 'eyebrow kind' }, kindLabel(item.kind)),
      h('h3', null, item.title),
      h('p', { class: 'read' }, item.body),
      h(
        'div',
        { class: 'card-foot' },
        sourceLinks(item.source),
        cardActions(item.id, { type: 'fact', title: item.title, text: item.body, sources: item.source }),
      ),
    );
  }

  function otdCard(item) {
    return h(
      'article',
      { class: 'card', dataset: { item: item.id } },
      h('span', { class: 'year' }, item.year),
      h('h3', null, item.title),
      h('p', { class: 'read' }, item.body),
      h(
        'div',
        { class: 'card-foot' },
        sourceLinks(item.source),
        cardActions(item.id, { type: 'history', title: `${item.year}: ${item.title}`, text: item.body, sources: item.source }),
      ),
    );
  }

  function conceptCard(c) {
    return h(
      'article',
      { class: 'card', dataset: { item: 'concept' } },
      h('h3', { class: 'concept-term' }, c.term),
      h('p', { class: 'quote-like' }, c.definition),
      c.origin ? h('p', { class: 'read' }, c.origin) : null,
      c.examples?.length
        ? h(
            'div',
            { class: 'why' },
            h('p', { class: 'eyebrow' }, 'Gdzie to widać'),
            h('ul', { class: 'read', style: 'margin:0;padding-left:1.1em;display:grid;gap:6px' }, c.examples.map((e) => h('li', null, e))),
          )
        : null,
      h(
        'div',
        { class: 'card-foot' },
        sourceLinks(c.source),
        cardActions(c.id, { type: 'concept', title: c.term, text: c.definition, sources: c.source }, c.origin || ''),
      ),
    );
  }

  function bookCard(b) {
    const p = editionProgress(date);
    return h(
      'article',
      { class: 'card', dataset: { item: 'book' } },
      h(
        'div',
        { class: 'book-cover' },
        h('span', { class: 'spine', 'aria-hidden': 'true' }),
        h(
          'div',
          null,
          h('p', { class: 'eyebrow' }, `Dzień ${b.day} z ${b.days}`),
          h('h3', null, b.title),
          h('p', { class: 'muted', style: 'margin:0' }, b.author),
        ),
      ),
      h('div', { class: 'days', 'aria-hidden': 'true' }, Array.from({ length: b.days }, (_, i) => h('span', { class: i < b.day ? 'on' : '' }))),
      h('h3', null, b.ideaTitle),
      h('p', { class: 'read' }, b.idea),
      h('div', { class: 'box moral' }, h('p', { class: 'eyebrow' }, 'Morał'), h('p', { class: 'read' }, b.moral)),
      h(
        'div',
        { class: 'box action' },
        h('p', { class: 'eyebrow' }, 'Zastosuj dziś'),
        h('p', { class: 'read' }, b.action),
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            id: `action-${date}`,
            checked: p.actionDone,
            onchange: (e) => {
              updateEdition(date, (pp) => {
                pp.actionDone = e.target.checked;
              });
              if (e.target.checked) toast('Brawo. Mały krok zrobiony.');
            },
          }),
          'Zrobione',
        ),
      ),
      h(
        'div',
        { class: 'card-foot' },
        sourceLinks(b.source),
        cardActions(b.id, { type: 'book', title: `${b.title}: ${b.ideaTitle}`, text: b.moral, sources: b.source }, `Idea: ${b.idea}`),
      ),
    );
  }

  // ---------- Rozgrzewka ----------

  function warmupView() {
    const p = editionProgress(date);
    const answers = p.warmup || {};
    const answered = warmup.filter((q) => answers[q.id] !== undefined).length;
    const right = warmup.filter((q) => answers[q.id] === q.answer).length;
    return [
      h(
        'p',
        { class: 'muted' },
        answered < warmup.length
          ? 'Trzy szybkie pytania z poprzedniego wydania. Przypominanie sobie to najlepszy sposób, żeby wiedza została na dłużej. Rozgrzewka wystarczy też, żeby utrzymać serię dni.'
          : `Rozgrzewka zaliczona: ${right} z ${warmup.length}. Seria na dziś jest bezpieczna.`,
      ),
      ...warmup.map((q, i) => warmupCard(q, i, answers)),
    ];
  }

  function warmupCard(q, i, answers) {
    const p = editionProgress(date);
    const chosen = answers[q.id];
    const done = chosen !== undefined;
    const card = h(
      'article',
      { class: 'card q' },
      h('p', { class: 'eyebrow' }, `Pytanie ${i + 1} z ${warmup.length}`),
      h('p', { class: 'q-text' }, q.question),
      done ? null : guessSwitch(q),
      h(
        'div',
        { class: 'options' },
        q.options.map((opt, oi) => {
          let cls = 'option lettered';
          if (done && oi === q.answer) cls += ' is-right';
          else if (done && oi === chosen) cls += ' is-wrong';
          return h(
            'button',
            { type: 'button', class: cls, disabled: done, onclick: () => answerWarmup(q, oi) },
            h('span', { class: 'letter', 'aria-hidden': 'true' }, 'abc'[oi] || ''),
            h('span', null, opt),
          );
        }),
      ),
    );
    if (done) {
      const ok = chosen === q.answer;
      card.append(
        h('p', { class: `verdict ${ok ? 'ok' : 'bad'}` }, ok ? verdictText(true, p.guess?.[q.id]) : `Poprawna odpowiedź: ${'abc'[q.answer]}.`),
        q.explanation ? h('p', { class: 'read' }, q.explanation) : '', // append() zamieniłby null na tekst
      );
    }
    return card;
  }

  function answerWarmup(q, chosen) {
    const today = todayISO();
    const correct = chosen === q.answer;
    const guessed = guessing.has(q.id);
    let allDone = false;
    updateEdition(date, (p) => {
      p.warmup ||= {};
      p.warmup[q.id] = chosen;
      if (guessed) (p.guess ||= {})[q.id] = true;
      allDone = warmup.every((x) => p.warmup[x.id] !== undefined);
    });
    update((s) => {
      grade(s.deck, q, correct, today, { from: { date: prevDate, title: q.fromTitle || null }, guessed });
    });
    if (allDone) {
      const milestone = markActive('rozgrzewka');
      toast(milestone ? `Seria: ${milestone} dni z rzędu!` : 'Rozgrzewka zaliczona');
    }
    render();
    onChange?.();
  }

  function quizView() {
    const p = editionProgress(date);
    const answered = Object.keys(p.quiz).length;
    const right = edition.quiz.filter((q) => p.quiz[q.id] === q.answer).length;
    const done = answered >= edition.quiz.length;
    const challenge = challengeFor(date);
    return [
      h(
        'p',
        { class: 'muted' },
        !done
          ? 'Pytania z dzisiejszych ciekawostek, pojęcia i książki. Każda odpowiedź trafia do powtórek, więc wiedza zostanie na dłużej. Nie wiesz na pewno? Zaznacz „Zgaduję”, zanim odpowiesz.'
          : `Wynik: ${right} z ${edition.quiz.length}. Pytania wrócą w powtórkach w odpowiednim momencie.`,
      ),
      challenge && !done
        ? h('div', { class: 'challenge' }, icon('trophy'), h('p', null, h('strong', null, `Wyzwanie: ${challenge.from} ma ${challenge.score}/${challenge.total}.`), ' Pobijesz ten wynik?'))
        : null,
      ...edition.quiz.map((q, i) => questionCard(q, i)),
      done ? challengeResult(right) : null,
    ];
  }

  // Po quizie: porównanie z wyzwaniem albo propozycja wysłania własnego.
  function challengeResult(right) {
    const total = edition.quiz.length;
    const challenge = challengeFor(date);
    return h(
      'div',
      { class: 'challenge' },
      icon('trophy'),
      h(
        'div',
        null,
        challenge
          ? h('p', null, h('strong', null, `Ty: ${right}/${total} · ${challenge.from}: ${challenge.score}/${challenge.total}. `), verdict(right, challenge))
          : h('p', null, h('strong', null, 'Wyzwanie we dwoje. '), 'Wyślij link drugiej osobie: rozwiąże ten sam quiz i zobaczycie, kto wygrał.'),
        h(
          'button',
          { type: 'button', class: 'btn secondary', onclick: () => shareChallenge(date, right, total) },
          icon('share'),
          challenge ? 'Odeślij swój wynik' : 'Wyślij wyzwanie',
        ),
      ),
    );
  }

  function challengeBanner() {
    const challenge = challengeFor(date);
    const p = editionProgress(date);
    if (!challenge || !edition.quiz?.length || Object.keys(p.quiz).length >= edition.quiz.length) return null;
    return h(
      'div',
      { class: 'challenge' },
      icon('trophy'),
      h(
        'div',
        null,
        h('p', null, h('strong', null, `${challenge.from} rzuca Ci wyzwanie: ${challenge.score}/${challenge.total} w quizie.`)),
        h('button', { type: 'button', class: 'btn secondary', onclick: () => goTo('quiz') }, 'Do quizu', icon('arrow')),
      ),
    );
  }

  // ---------- Posłuchaj ----------

  // Kolejka dla lektora: to samo, co widać w wydaniu (bez rozgrzewki i quizu, które wymagają dotknięć).
  function listenItems() {
    const items = [];
    const add = (id, chapter, label, text) => items.push({ id, chapter, label, text });
    add('intro', chapters.find((c) => c.type !== 'warmup')?.id, 'Wstęp', `${formatLong(date)}. ${edition.intro || ''}`);
    for (const ch of chapters) {
      if (ch.groups) {
        for (const g of ch.groups) {
          const n = expanded.has(`news:${g.section}`) ? g.items.length : g.limit;
          g.items.slice(0, n).forEach((it, i) => {
            const lead = i === 0 ? `${sectionLabel(g.section)}. ` : '';
            add(it.id, ch.id, it.title, `${lead}${it.title}. ${it.summary} ${it.why ? `Dlaczego to ważne: ${it.why}` : ''}`);
          });
        }
      } else if (ch.type === 'facts' || ch.type === 'otd') {
        const n = expanded.has(ch.id) ? ch.items.length : ch.limit;
        ch.items.slice(0, n).forEach((it, i) => {
          const lead = i === 0 ? `${ch.label}. ` : '';
          const head = ch.type === 'otd' ? `Rok ${it.year}. ${it.title}.` : `${kindLabel(it.kind)}: ${it.title}.`;
          add(it.id, ch.id, ch.type === 'otd' ? `${it.year}: ${it.title}` : it.title, `${lead}${head} ${it.body}`);
        });
      } else if (ch.type === 'concept') {
        const c = edition.concept;
        add('concept', ch.id, `Pojęcie: ${c.term}`, `Pojęcie dnia: ${c.term}. ${c.definition} ${c.origin || ''} ${(c.examples || []).join(' ')}`);
      } else if (ch.type === 'book') {
        const b = edition.book;
        add('book', ch.id, `${b.title}: ${b.ideaTitle}`, `Książka tygodnia: „${b.title}”, ${b.author}. Dzień ${b.day} z ${b.days}: ${b.ideaTitle}. ${b.idea} Morał: ${b.moral} Zastosuj dziś: ${b.action}`);
      } else if (ch.type === 'evening') {
        add('evening', ch.id, 'Na wieczór', `Na wieczór we dwoje: ${edition.evening.question} ${edition.evening.hint || ''}`);
      }
    }
    return items.filter((it) => it.text.trim());
  }

  function listen() {
    startListening(listenItems(), {
      onItem: (item) => {
        // Lektor prowadzi przez wydanie, ale tylko gdy to wydanie jest nadal na ekranie.
        const shown = document.getElementById('rozdzial');
        if (!shown || shown.dataset.date !== date) return;
        if (item.chapter && shown.dataset.chapter !== item.chapter) goTo(item.chapter, { scroll: false });
        document.querySelector('.is-speaking')?.classList.remove('is-speaking');
        const card = item.id === 'intro' ? root.querySelector('.masthead') : root.querySelector(`[data-item="${item.id}"]`);
        if (!card) return;
        card.classList.add('is-speaking');
        card.scrollIntoView({ block: item.id === 'intro' ? 'start' : 'center', behavior: smoothScroll() });
      },
    });
  }

  function questionCard(q, i) {
    const p = editionProgress(date);
    const chosen = p.quiz[q.id];
    const done = chosen !== undefined;
    const card = h('article', { class: 'card q' });
    card.append(
      h('p', { class: 'eyebrow' }, `Pytanie ${i + 1}`),
      h('p', { class: 'q-text' }, q.question),
      done ? null : guessSwitch(q),
      h(
        'div',
        { class: 'options' },
        q.options.map((opt, oi) => {
          let cls = 'option';
          if (done && oi === q.answer) cls += ' is-right';
          else if (done && oi === chosen) cls += ' is-wrong';
          return h(
            'button',
            {
              type: 'button',
              class: cls,
              disabled: done,
              onclick: () => answer(q, oi),
            },
            opt,
          );
        }),
      ),
    );
    if (done) {
      const ok = chosen === q.answer;
      card.append(
        h('p', { class: `verdict ${ok ? 'ok' : 'bad'}` }, verdictText(ok, p.guess?.[q.id])),
        q.explanation ? h('p', { class: 'read' }, q.explanation) : '', // append() zamieniłby null na tekst
      );
    }
    return card;
  }

  function guessSwitch(q) {
    return guessToggle(guessing.has(q.id), (on) => (on ? guessing.add(q.id) : guessing.delete(q.id)));
  }

  function answer(q, chosen) {
    const today = todayISO();
    const correct = chosen === q.answer;
    const ref = findRef(edition, q.ref);
    const guessed = guessing.has(q.id);
    updateEdition(date, (p) => {
      p.quiz[q.id] = chosen;
      if (guessed) (p.guess ||= {})[q.id] = true;
    });
    update((s) => {
      grade(s.deck, q, correct, today, { from: { date, title: ref?.title || null }, guessed });
    });
    render();
    onChange?.();
  }

  function eveningCard(ev) {
    const p = editionProgress(date);
    return h(
      'article',
      { class: 'card', dataset: { item: 'evening' } },
      h('p', { class: 'eyebrow' }, 'Pytanie na wieczór we dwoje'),
      h('p', { class: 'evening-q' }, ev.question),
      ev.hint ? h('p', { class: 'read muted' }, ev.hint) : null,
      h(
        'div',
        { class: 'field' },
        h('label', { for: `note-${date}`, class: 'small muted' }, 'Twoja notatka (zobaczysz ją w Ulubionych)'),
        h('textarea', {
          id: `note-${date}`,
          placeholder: 'Jedno, dwa zdania…',
          onchange: (e) => {
            updateEdition(date, (pp) => {
              pp.note = e.target.value.trim();
              pp.noteQuestion = ev.question;
            });
            toast('Notatka zapisana');
          },
        }, p.note || ''),
      ),
    );
  }

  // ---------- Koniec wydania ----------

  function endView() {
    const p = editionProgress(date);
    const count = completedCount();
    const level = [...LEVELS].reverse().find((l) => count >= l.min);
    const nextLevel = LEVELS.find((l) => l.min > count);
    const due = dueCards(getState().deck, todayISO()).length;
    const right = edition.quiz?.filter((q) => p.quiz[q.id] === q.answer).length ?? 0;
    const s = streak();

    return [
      h(
        'div',
        { class: 'done-card' },
        koiMark(),
        h('p', { class: 'eyebrow' }, p.completedOn ? 'Wydanie ukończone' : 'Prawie koniec'),
        h('h2', null, p.completedOn ? 'Na dziś to wszystko.' : 'Zostały jeszcze rozdziały'),
        h(
          'div',
          { class: 'stats' },
          h('div', { class: 'stat' }, h('strong', null, s), h('span', null, `${plural(s, 'dzień', 'dni', 'dni')} z rzędu`)),
          h('div', { class: 'stat' }, h('strong', null, `${right}/${edition.quiz?.length ?? 0}`), h('span', null, 'w quizie')),
          h('div', { class: 'stat' }, h('strong', null, count), h('span', null, plural(count, 'wydanie', 'wydania', 'wydań'))),
        ),
        edition.quiz?.length && Object.keys(p.quiz).length >= edition.quiz.length ? challengeResult(right) : null,
        h(
          'p',
          { class: 'read' },
          `Twój poziom: ${level.name}. `,
          nextLevel ? `Do poziomu „${nextLevel.name}” brakuje ${nextLevel.min - count} ${plural(nextLevel.min - count, 'wydania', 'wydań', 'wydań')}.` : level.text,
        ),
        h(
          'div',
          { class: 'inline-actions' },
          due > 0 ? h('a', { class: 'btn', href: '#powtorki' }, `Powtórki (${due})`, icon('arrow')) : null,
          h('a', { class: 'btn secondary', href: '#ulubione' }, icon('heart'), 'Ulubione'),
          h('a', { class: 'btn secondary', href: '#dni' }, icon('timeline'), 'Oś czasu'),
          h('a', { class: 'btn ghost', href: '#ustawienia' }, icon('sliders'), 'Zmień tematy'),
        ),
      ),
    ];
  }

  // Otwarcie wydania na konkretnej karcie (np. z Ulubionych): przejdź do rozdziału, rozwiń listę i podświetl kartę.
  function focusItem(id) {
    const inGroups = (c) => (c.groups || []).find((g) => g.items.some((i) => i.id === id));
    const ch = chapters.find((c) => {
      if (c.type === 'news' || c.type === 'topics') return Boolean(inGroups(c));
      if (c.type === 'facts' || c.type === 'otd') return c.items.some((i) => i.id === id);
      return { concept: 'concept', book: 'book', evening: 'evening', quiz: 'quiz' }[c.type] === id;
    });
    if (!ch) {
      toast('Tego działu nie ma teraz w Twoim wydaniu. Możesz go włączyć w ustawieniach.');
      return false;
    }
    const group = inGroups(ch);
    if (group) expanded.add(`news:${group.section}`);
    if (ch.type === 'facts' || ch.type === 'otd') expanded.add(ch.id);
    openCards.add(id);
    goTo(ch.id, { scroll: false });
    const el = root.querySelector(`[data-item="${CSS.escape(id)}"]`) || document.getElementById('rozdzial');
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      el.classList.add('is-found');
      setTimeout(() => el.classList.remove('is-found'), 2600);
    });
    return true;
  }

  render();
  if (!focus || !focusItem(focus)) restorePosition(date);
  watchScroll();
}

function emptyState() {
  return h(
    'div',
    { class: 'empty' },
    h('h2', null, 'Pierwsze wydanie jest w drodze'),
    h('p', null, 'Nowe wydania pojawiają się codziennie rano. Zajrzyj tu za chwilę.'),
  );
}

function errorState(err, retry) {
  return h(
    'div',
    { class: 'empty' },
    h('h2', null, 'Nie udało się wczytać wydania'),
    h('p', null, 'Sprawdź połączenie z internetem i spróbuj ponownie. Wydania, które już były otwarte, działają też offline.'),
    h('p', { class: 'small' }, String(err?.message || err)),
    h('button', { type: 'button', class: 'btn', onclick: retry }, 'Spróbuj ponownie'),
  );
}
