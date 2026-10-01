// Widok wydania: rozdziały (Polska → Świat → Twoje tematy → … → Na wieczór),
// każdy kończy się przyciskiem „Dalej”. Po ostatnim wydanie jest ukończone.
import { SECTIONS, MAIN_SECTIONS, TIME_BUDGETS, FACT_KINDS, WORDS_PER_MINUTE, LEVELS } from '../config.js';
import { loadIndex, loadEdition, pickDate } from '../data.js';
import { todayISO, formatLong, formatShort } from '../dates.js';
import {
  getState,
  update,
  editionProgress,
  updateEdition,
  isSaved,
  toggleSaved,
  streak,
  completedCount,
} from '../store.js';
import { grade, dueCards } from '../srs.js';
import { h, mount, icon, koiMark, sourceLinks, toast, plural } from '../ui.js';

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

  const profile = getState().profile;
  const chapters = buildChapters(edition, profile);
  const expanded = new Set();

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
    if (justCompleted) toast('Wydanie ukończone');
    render({ scroll: true });
    onChange?.();
  }

  function render({ scroll = false } = {}) {
    const progress = editionProgress(date);
    const showEnd = progress.chapter === 'koniec' || (progress.completedOn && progress.chapter == null);
    const activeId = showEnd ? null : currentChapterId();
    const active = chapters.find((c) => c.id === activeId);

    const content = h('section', { class: 'chapter', id: 'rozdzial', 'aria-live': 'polite' });
    if (showEnd || !active) {
      content.append(...endView());
    } else {
      content.append(...chapterView(active));
    }

    mount(
      root,
      masthead(),
      chapterStrip(activeId),
      content,
    );

    const current = root.querySelector('.chip[aria-current="step"]');
    current?.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (scroll) content.scrollIntoView({ block: 'start' });
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
        h('p', { class: 'eyebrow' }, date === today ? `Dzień dobry${name}` : 'Wydanie z archiwum'),
        h(
          'div',
          { class: 'meta-row' },
          s > 0 ? h('span', { class: 'pill koi', title: 'Seria dni z ukończonym wydaniem' }, icon('flame'), `${s} ${plural(s, 'dzień', 'dni', 'dni')}`) : null,
          h('span', { class: 'pill' }, icon('clock'), `ok. ${minutes} min`),
        ),
      ),
      h('h1', { class: 'date' }, formatLong(date)),
      edition.intro ? h('p', { class: 'read intro' }, edition.intro) : null,
      date < today && !requested
        ? h('p', { class: 'banner' }, `Dzisiejsze wydanie jeszcze się przygotowuje. Poniżej najnowsze, z ${formatShort(date)}.`)
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
    return h(
      'nav',
      { class: 'chapters', 'aria-label': 'Rozdziały wydania' },
      h(
        'ol',
        null,
        chapters.map((c) => {
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
        }),
        p.completedOn
          ? h('li', null, h('button', { type: 'button', class: 'chip', 'aria-current': activeId ? null : 'step', onclick: () => goTo('koniec') }, 'Podsumowanie'))
          : null,
      ),
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
        ch.lead ? h('p', { class: 'muted' }, ch.lead) : null,
      ),
    );

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

  function newsGroup(group, showTitle) {
    const items = group.items;
    const key = `news:${group.section}`;
    const limit = expanded.has(key) ? items.length : group.limit;
    const hidden = items.length - limit;
    return h(
      'div',
      { class: 'group' },
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
    return h(
      'article',
      { class: 'card' },
      h('div', { class: 'news-head' }, h('span', { class: 'rank', 'aria-label': `Miejsce ${rank}` }, rank), h('h3', null, item.title)),
      h('p', { class: 'read' }, item.summary),
      item.why
        ? h('div', { class: 'why' }, h('p', { class: 'eyebrow' }, 'Dlaczego to ważne'), h('p', null, item.why))
        : null,
      h(
        'div',
        { class: 'card-foot' },
        sourceLinks(item.sources),
        saveButton(item.id, { type: 'news', section: item.section, title: item.title, text: item.summary, sources: item.sources }),
      ),
    );
  }

  function factCard(item) {
    return h(
      'article',
      { class: 'card' },
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
      { class: 'card' },
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
      { class: 'card' },
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
      { class: 'card' },
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

  function quizView() {
    const p = editionProgress(date);
    const answered = Object.keys(p.quiz).length;
    const right = edition.quiz.filter((q) => p.quiz[q.id] === q.answer).length;
    return [
      h(
        'p',
        { class: 'muted' },
        answered < edition.quiz.length
          ? 'Pytania z dzisiejszych ciekawostek, pojęcia i książki. Każda odpowiedź trafia do powtórek, więc wiedza zostanie na dłużej.'
          : `Wynik: ${right} z ${edition.quiz.length}. Pytania wrócą w powtórkach w odpowiednim momencie.`,
      ),
      ...edition.quiz.map((q, i) => questionCard(q, i)),
    ];
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
      { class: 'card' },
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
        ),
      ),
    ];
  }

  render();
}

// ---------- Budowa rozdziałów ----------

export function buildChapters(edition, profile) {
  const budget = TIME_BUDGETS[profile?.minutes] || TIME_BUDGETS[15];
  const wanted = new Set(profile?.sections || MAIN_SECTIONS);
  const bySection = {};
  for (const item of edition.news || []) (bySection[item.section] ||= []).push(item);
  for (const list of Object.values(bySection)) list.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  const chapters = [];
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
