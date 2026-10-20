// Widok wydania: rozgrzewka z wczorajszej wiedzy, potem rozdziały (Polska → Świat → Twoje tematy → …
// → Na wieczór), każdy kończy się przyciskiem „Dalej”. Po ostatnim wydanie jest ukończone.
import { SECTIONS, MAIN_SECTIONS, TIME_BUDGETS, FACT_KINDS, WORDS_PER_MINUTE, LEVELS } from '../config.js';
import { loadIndex, loadEdition, pickDate, previousDate } from '../data.js';
import { todayISO, formatLong, formatShort, addDays } from '../dates.js';
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
  isActive,
  weekActivity,
} from '../store.js';
import { grade, dueCards } from '../srs.js';
import { h, mount, icon, koiMark, sourceLinks, toast, plural } from '../ui.js';
import { getLook, openAppearanceSheet } from '../look.js';
import { speechSupported, startListening, stopListening, isListening } from '../listen.js';
import { challengeFor, shareChallenge, verdict } from '../challenge.js';

const sectionLabel = (id) => SECTIONS.find((s) => s.id === id)?.label || id;
const kindLabel = (id) => FACT_KINDS.find((k) => k.id === id)?.label || id;

export async function renderToday(root, { date: requested, onChange }) {
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
    mount(root, errorState(err, () => renderToday(root, { date: requested, onChange })));
    return;
  }

  // Rozgrzewka: 3 pytania z poprzedniego wydania.
  const prevDate = previousDate(index, date);
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
    if (showEnd || !active) {
      content.append(...endView());
    } else {
      content.append(...chapterView(active));
    }

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
        h('p', { class: 'eyebrow' }, requested && requested !== today ? 'Wydanie z archiwum' : `Dzień dobry${name}`),
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
      h('h1', { class: 'date' }, formatLong(date)),
      streakWidget(s),
      edition.intro ? h('p', { class: 'read intro' }, edition.intro) : null,
      challengeBanner(),
      date < today && !requested
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

  function saveButton(id, entry) {
    const pressed = isSaved(date, id);
    return h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-pressed': pressed ? 'true' : 'false',
        'aria-label': pressed ? 'Usuń z zeszytu' : 'Zapisz w zeszycie',
        title: pressed ? 'Usuń z zeszytu' : 'Zapisz w zeszycie',
        onclick: (e) => {
          const now = toggleSaved(date, id, entry);
          e.currentTarget.setAttribute('aria-pressed', now ? 'true' : 'false');
          e.currentTarget.setAttribute('aria-label', now ? 'Usuń z zeszytu' : 'Zapisz w zeszycie');
          toast(now ? 'Zapisane w zeszycie' : 'Usunięte z zeszytu');
        },
      },
      icon('bookmark'),
    );
  }

  function newsCard(item, rank) {
    const head = h('div', { class: 'news-head' }, h('span', { class: 'rank', 'aria-label': `Miejsce ${rank}` }, rank), h('h3', null, item.title));
    const why = item.why
      ? h('div', { class: 'why' }, h('p', { class: 'eyebrow' }, 'Dlaczego to ważne'), h('p', null, item.why))
      : null;
    const foot = h(
      'div',
      { class: 'card-foot' },
      sourceLinks(item.sources),
      saveButton(item.id, { type: 'news', section: item.section, title: item.title, text: item.summary, sources: item.sources }),
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
        saveButton(item.id, { type: 'fact', title: item.title, text: item.body, sources: item.source }),
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
        saveButton(item.id, { type: 'history', title: `${item.year}: ${item.title}`, text: item.body, sources: item.source }),
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
        saveButton(c.id, { type: 'concept', title: c.term, text: c.definition, sources: c.source }),
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
        saveButton(b.id, { type: 'book', title: `${b.title}: ${b.ideaTitle}`, text: b.moral, sources: b.source }),
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
    const chosen = answers[q.id];
    const done = chosen !== undefined;
    const card = h(
      'article',
      { class: 'card q' },
      h('p', { class: 'eyebrow' }, `Pytanie ${i + 1} z ${warmup.length}`),
      h('p', { class: 'q-text' }, q.question),
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
        h('p', { class: `verdict ${ok ? 'ok' : 'bad'}` }, ok ? 'Dobrze!' : `Poprawna odpowiedź: ${'abc'[q.answer]}.`),
        q.explanation ? h('p', { class: 'read' }, q.explanation) : null,
      );
    }
    return card;
  }

  function answerWarmup(q, chosen) {
    const today = todayISO();
    const correct = chosen === q.answer;
    let allDone = false;
    updateEdition(date, (p) => {
      p.warmup ||= {};
      p.warmup[q.id] = chosen;
      allDone = warmup.every((x) => p.warmup[x.id] !== undefined);
    });
    update((s) => {
      grade(s.deck, q, correct, today, { from: { date: prevDate, title: q.fromTitle || null } });
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
          ? 'Pytania z dzisiejszych ciekawostek, pojęcia i książki. Każda odpowiedź trafia do powtórek, więc wiedza zostanie na dłużej.'
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
        h('p', { class: `verdict ${ok ? 'ok' : 'bad'}` }, ok ? 'Dobrze!' : 'Tym razem nie.'),
        q.explanation ? h('p', { class: 'read' }, q.explanation) : null,
      );
    }
    return card;
  }

  function answer(q, chosen) {
    const today = todayISO();
    const correct = chosen === q.answer;
    const ref = findRef(edition, q.ref);
    updateEdition(date, (p) => {
      p.quiz[q.id] = chosen;
    });
    update((s) => {
      grade(s.deck, q, correct, today, { from: { date, title: ref?.title || null } });
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
        h('label', { for: `note-${date}`, class: 'small muted' }, 'Twoja notatka (trafi do zeszytu)'),
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
          h('a', { class: 'btn secondary', href: '#zeszyt' }, 'Zeszyt'),
          h('a', { class: 'btn ghost', href: '#ustawienia' }, icon('sliders'), 'Zmień tematy'),
        ),
      ),
    ];
  }

  render();
  restorePosition(date);
  watchScroll();
}

// ---------- Przewijanie ----------

const POS_KEY = 'selflearn:pozycja';
let scrollWatched = false;
let saveTimer = null;

function smoothScroll() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

// Cienka linia pod paskiem rozdziałów: ile z bieżącego rozdziału już przeczytane.
function updateReadProgress() {
  const bar = document.querySelector('.read-progress > span');
  const chapter = document.getElementById('rozdzial');
  if (!bar || !chapter) return;
  const stripH = document.querySelector('.chapters')?.offsetHeight || 0;
  const top = chapter.getBoundingClientRect().top + window.scrollY - stripH;
  const span = chapter.offsetHeight - (window.innerHeight - stripH);
  const ratio = span <= 0 ? 1 : (window.scrollY - top) / span;
  bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
}

// Zapamiętuje miejsce w rozdziale, żeby po powrocie do aplikacji czytać dalej.
function savePosition() {
  const chapter = document.getElementById('rozdzial');
  if (!chapter) return;
  const offset = Math.round(window.scrollY - (chapter.getBoundingClientRect().top + window.scrollY));
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ date: chapter.dataset.date, chapter: chapter.dataset.chapter, offset }));
  } catch {
    // Brak pamięci – trudno, zaczniemy od początku rozdziału.
  }
}

function restorePosition(date) {
  let pos = null;
  try {
    pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
  } catch {
    pos = null;
  }
  const chapter = document.getElementById('rozdzial');
  if (!pos || !chapter || pos.date !== date || pos.chapter !== chapter.dataset.chapter || pos.offset < 160) return;
  requestAnimationFrame(() => {
    const top = chapter.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + pos.offset, behavior: 'instant' });
    updateReadProgress();
  });
}

function watchScroll() {
  if (scrollWatched) return;
  scrollWatched = true;
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateReadProgress();
      });
      clearTimeout(saveTimer);
      saveTimer = setTimeout(savePosition, 400);
    },
    { passive: true },
  );
  window.addEventListener('resize', updateReadProgress, { passive: true });
}

// Pierwsze zdanie streszczenia (do widoku „Nagłówki”), z ominięciem skrótów typu „ul.”, „ok.”, „J.”.
const ABBREVIATIONS = new Set(['ul', 'al', 'pl', 'ok', 'tzw', 'np', 'r', 'godz', 'ks', 'św', 'prof', 'dr', 'gen', 'płk', 'art', 'nr', 'tys', 'mln', 'mld', 'zł', 'in', 'wg', 'ang', 'im', 'sen', 'min']);

export function firstSentence(text = '') {
  const re = /[.!?…](?=\s+[A-ZĄĆĘŁŃÓŚŹŻ„"(])/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index).split(/[\s(]/).pop();
    const word = before.split('.').pop();
    if (m[0] === '.' && (ABBREVIATIONS.has(word.toLowerCase()) || /^[A-ZĄĆĘŁŃÓŚŹŻ]$/.test(word))) continue;
    if (m.index < 30) continue;
    return text.slice(0, m.index + 1);
  }
  return text.length > 220 ? `${text.slice(0, 200).replace(/\s+\S*$/, '')}…` : text;
}

// ---------- Budowa rozdziałów ----------

export function buildChapters(edition, profile, warmup = null) {
  const budget = TIME_BUDGETS[profile?.minutes] || TIME_BUDGETS[15];
  const wanted = new Set(profile?.sections || MAIN_SECTIONS);
  const bySection = {};
  for (const item of edition.news || []) (bySection[item.section] ||= []).push(item);
  for (const list of Object.values(bySection)) list.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  const chapters = [];
  if (warmup) {
    const yesterday = addDays(edition.date, -1);
    chapters.push({
      id: 'rozgrzewka',
      label: 'Rozgrzewka',
      title: warmup.prevDate === yesterday ? 'Test z wczoraj' : `Test z wydania ${formatShort(warmup.prevDate)}`,
      type: 'warmup',
    });
  }
  for (const id of MAIN_SECTIONS) {
    if (wanted.has(id) && bySection[id]?.length) {
      chapters.push({
        id,
        label: sectionLabel(id),
        title: id === 'polska' ? 'Polska: top 5' : 'Świat: top 5',
        type: 'news',
        groups: [{ section: id, items: bySection[id], limit: budget.top }],
      });
    }
  }

  const topics = SECTIONS.filter((s) => !MAIN_SECTIONS.includes(s.id) && wanted.has(s.id) && bySection[s.id]?.length);
  if (topics.length) {
    chapters.push({
      id: 'tematy',
      label: 'Twoje tematy',
      lead: topics.map((t) => t.label).join(' · '),
      type: 'topics',
      groups: topics.map((t) => ({ section: t.id, items: bySection[t.id], limit: budget.topic })),
    });
  }

  if (edition.facts?.length) {
    const pref = profile?.factKinds || [];
    const facts = [...edition.facts].sort((a, b) => rankKind(pref, a.kind) - rankKind(pref, b.kind));
    chapters.push({ id: 'ciekawostki', label: 'Ciekawostki', type: 'facts', items: facts, limit: budget.facts });
  }
  if (edition.onThisDay?.length) {
    chapters.push({ id: 'historia', label: 'Ten dzień w historii', type: 'otd', items: edition.onThisDay, limit: budget.otd });
  }
  if (edition.concept) chapters.push({ id: 'pojecie', label: 'Pojęcie dnia', type: 'concept' });
  if (edition.book) chapters.push({ id: 'ksiazka', label: 'Książka tygodnia', type: 'book' });
  if (edition.quiz?.length) chapters.push({ id: 'quiz', label: 'Quiz', title: 'Sprawdź się', type: 'quiz' });
  if (edition.evening) chapters.push({ id: 'wieczor', label: 'Na wieczór', title: 'Na wieczór', type: 'evening' });
  return chapters;
}

// ---------- Seria dni ----------

const DOW = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const dowOf = (iso) => DOW[new Date(`${iso}T12:00:00`).getDay()];

function streakWidget(s) {
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

// ---------- Rozgrzewka ----------

// 3 pytania a/b/c: z pola „recap” wydania (gdy czat je przygotował),
// a jeśli go nie ma – z quizu poprzedniego wydania, najpierw te z błędną odpowiedzią.
export function buildWarmup(edition, prevEdition, prevProgress) {
  if (Array.isArray(edition.recap) && edition.recap.length) {
    return edition.recap.slice(0, 3).map((q) => ({ ...q, fromTitle: q.fromTitle || null }));
  }
  if (!prevEdition?.quiz?.length) return [];
  const answers = prevProgress?.quiz || {};
  const score = (q) => (answers[q.id] === undefined ? 1 : answers[q.id] === q.answer ? 2 : 0);
  const ranked = prevEdition.quiz
    .map((q, i) => ({ q, i }))
    .sort((a, b) => score(a.q) - score(b.q) || a.i - b.i)
    .map((x) => x.q);
  return ranked.slice(0, 3).map((q) => toThreeOptions(q, findRef(prevEdition, q.ref)?.title));
}

function toThreeOptions(q, fromTitle) {
  const hsh = hash(q.id);
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
  const picked = wrong.length <= 2 ? wrong : [wrong[hsh % wrong.length], wrong[(hsh + 1) % wrong.length]];
  const idxs = [q.answer, ...picked];
  const r = hsh % idxs.length;
  const order = [...idxs.slice(r), ...idxs.slice(0, r)];
  return {
    id: q.id,
    ref: q.ref,
    question: q.question,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
    explanation: q.explanation,
    fromTitle: fromTitle || null,
  };
}

function hash(text) {
  let x = 0;
  for (const ch of String(text)) x = (x * 31 + ch.codePointAt(0)) >>> 0;
  return x;
}

function rankKind(pref, kind) {
  const i = pref.indexOf(kind);
  return i === -1 ? 99 : i;
}

function words(...texts) {
  return texts.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
}

function estimateMinutes(chapters, edition, expanded) {
  let total = 0;
  for (const ch of chapters) {
    if (ch.groups) {
      for (const g of ch.groups) {
        const n = expanded.has(`news:${g.section}`) ? g.items.length : g.limit;
        for (const it of g.items.slice(0, n)) total += words(it.title, it.summary, it.why);
      }
    } else if (ch.items) {
      const n = expanded.has(ch.id) ? ch.items.length : ch.limit;
      for (const it of ch.items.slice(0, n)) total += words(it.title, it.body);
    } else if (ch.type === 'concept') {
      const c = edition.concept;
      total += words(c.term, c.definition, c.origin, ...(c.examples || []));
    } else if (ch.type === 'book') {
      const b = edition.book;
      total += words(b.ideaTitle, b.idea, b.moral, b.action);
    } else if (ch.type === 'quiz') {
      total += edition.quiz.length * 60;
    } else if (ch.type === 'warmup') {
      total += 3 * 50;
    } else if (ch.type === 'evening') {
      total += 120;
    }
  }
  return Math.max(1, Math.round(total / WORDS_PER_MINUTE));
}

function findRef(edition, ref) {
  if (!ref) return null;
  const pools = [edition.facts, edition.onThisDay, edition.news].filter(Boolean).flat();
  const hit = pools.find((x) => x.id === ref);
  if (hit) return { title: hit.title };
  if (edition.concept?.id === ref) return { title: `Pojęcie: ${edition.concept.term}` };
  if (edition.book?.id === ref) return { title: `${edition.book.title}: ${edition.book.ideaTitle}` };
  return null;
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
