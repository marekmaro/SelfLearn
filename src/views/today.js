// Wydanie w dwóch widokach:
// – okładka (#dzis, #wydanie-RRRR-MM-DD): data, „Czytaj” i „Słuchaj”, a pod nimi spis treści z zapowiedzią
//   każdego rozdziału;
// – czytanie (#czytaj/rozdział, #czytaj-RRRR-MM-DD/rozdział): jeden rozdział na ekranie, u góry gdzie jesteś,
//   na dole „Dalej”. Przesunięcie palcem w lewo to „Dalej”, w prawo – poprzedni rozdział.
// Lektor prowadzi przez wydanie: w czytaniu podświetla i pokazuje czytaną kartę, na okładce zaznacza rozdział.
import { FACT_KINDS, LEVELS } from '../config.js';
import { loadIndex, loadEdition, pickDate, previousDate, neighborDates, editionHref, readerHref } from '../data.js';
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
import {
  speechSupported,
  startListening,
  loadRecording,
  playRecording,
  listeningTo,
  nowPlaying,
  onNowPlaying,
  savedVoice,
  saveVoice,
  pickEngine,
  openPlayer,
} from '../listen.js';
import { challengeFor, shareChallenge, verdict } from '../challenge.js';
import { sectionLabel, firstSentence, buildChapters, buildWarmup, estimateMinutes, findRef, withPersonalQuiz, chapterNarration, editionNarration, chapterPreview } from '../chapters.js';
import { smoothScroll, updateReadProgress, restorePosition, watchScroll } from './reading.js';
import { streakWidget } from './streak.js';
import { backupBanner } from './backup.js';
import { weekBanner } from './week.js';
import { deepenButton } from './deepen.js';
import { weekBannerDue } from '../week.js';
import { threadLink } from './threads.js';
import { threadsFromIndex } from '../threads.js';
import { installBanner, installBannerDue } from '../install.js';
import { guessToggle, verdictText } from '../confidence.js';

const kindLabel = (id) => FACT_KINDS.find((k) => k.id === id)?.label || id;

// Widok wydania, który jest teraz na ekranie (lektor uruchomiony z innego widoku prowadzi właśnie ten).
let live = null;
let viewCount = 0;
// Czytanie otwarte z okładki: strzałka „Spis treści” wraca wtedy krokiem wstecz w historii.
let enteredFromCover = null;
// Karta do pokazania po otwarciu czytania z odtwarzacza („Pokaż w tekście”).
let pendingShow = null;

export async function renderToday(root, { date: requested, mode = 'cover', chapter: wantChapter = null, focus = null, onChange }) {
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
    // Quiz tylko z tematów wybranych w profilu.
    edition = withPersonalQuiz(await loadEdition(date), getState().profile);
  } catch (err) {
    mount(root, errorState(err, () => renderToday(root, { date: requested, mode, chapter: wantChapter, focus, onChange })));
    return;
  }
  const threads = threadsFromIndex(index);

  // Rozgrzewka: 3 pytania z poprzedniego wydania.
  const prevDate = previousDate(index, date);
  const around = neighborDates(index, date);
  const latest = around.latest;
  const isArchive = date !== latest;
  let prevEdition = null;
  if (prevDate) {
    try {
      prevEdition = withPersonalQuiz(await loadEdition(prevDate), getState().profile);
    } catch {
      prevEdition = null;
    }
  }
  const warmup = buildWarmup(edition, prevEdition, editionProgress(prevDate || ''));

  const profile = getState().profile;
  // Nagranie lektora (MP3), jeśli jest: wczytane zawczasu, bo na iPhonie dźwięk musi ruszyć od razu po dotknięciu.
  const recording = await Promise.race([loadRecording(date), new Promise((resolve) => setTimeout(() => resolve(null), 1500))]);
  const canListen = () => Boolean(recording) || speechSupported();
  const chapters = buildChapters(edition, profile, warmup.length ? { prevDate } : null);
  const expanded = new Set();
  const openCards = new Set();
  // Pytania z zaznaczonym „Zgaduję”, zanim padnie odpowiedź (po odpowiedzi flaga trafia do postępów).
  const guessing = new Set();
  const viewId = `edition-${++viewCount}`;
  const mounted = () => Boolean(root.querySelector(`[data-view="${viewId}"]`));
  let lastChapter = null;
  // Lektor przewija za sobą tekst, dopóki nie przewiniesz sam; wtedy pojawia się „Wróć do lektora”.
  let followPaused = false;

  live = { date, mounted, follow: (item) => followItem(item), refresh: () => render(), key: (e) => onKey(e) };
  watchKeys();
  document.body.classList.toggle('is-reader', mode === 'reader');

  function currentChapterId() {
    const p = editionProgress(date);
    if (p.chapter && chapters.some((c) => c.id === p.chapter)) return p.chapter;
    return chapters.find((c) => !p.done.includes(c.id))?.id || chapters[0]?.id;
  }

  // ---------- Przejścia ----------

  function openReader(id) {
    updateEdition(date, (p) => {
      p.chapter = id;
    });
    enteredFromCover = date;
    location.hash = readerHref(date, latest, id);
  }

  function backToCover() {
    if (enteredFromCover === date) {
      enteredFromCover = null;
      history.back();
    } else {
      location.replace(editionHref(date, latest));
    }
  }

  // Zmiana rozdziału w czytaniu: bez przeładowania widoku, adres zmienia się w miejscu (wstecz wraca do spisu).
  function goTo(id, { scroll = true } = {}) {
    updateEdition(date, (p) => {
      p.chapter = id;
    });
    render({ scroll });
  }

  // Zalicza rozdział; gdy był ostatnim brakującym, całe wydanie jest ukończone. move: przejdź do następnego.
  function markDone(id, { move = false } = {}) {
    const idx = chapters.findIndex((c) => c.id === id);
    let justCompleted = false;
    updateEdition(date, (p) => {
      if (!p.done.includes(id)) p.done.push(id);
      const notDone = (c) => !p.done.includes(c.id);
      const allDone = chapters.every((c) => !notDone(c));
      if (move) {
        // Po ukończeniu całości „Dalej” idzie po kolei; wcześniej prowadzi do pominiętych rozdziałów.
        const next = allDone ? chapters[idx + 1] : chapters.slice(idx + 1).find(notDone) || chapters.find(notDone);
        p.chapter = next ? next.id : 'koniec';
      }
      if (allDone && !p.completedOn) {
        p.completedOn = todayISO();
        p.completedAt = new Date().toISOString();
        justCompleted = true;
      }
    });
    if (justCompleted) {
      const milestone = markActive('wydanie');
      toast(milestone ? `Seria: ${milestone} dni z rzędu!` : 'Wydanie ukończone');
    }
    return justCompleted;
  }

  function finishChapter(id) {
    markDone(id, { move: true });
    render({ scroll: true });
    onChange?.();
  }

  function previousChapter(id) {
    const idx = id === 'koniec' ? chapters.length : chapters.findIndex((c) => c.id === id);
    if (idx > 0) goTo(chapters[idx - 1].id);
  }

  function render(opts = {}) {
    if (mode === 'reader') renderReader(opts);
    else renderCover();
  }

  // ---------- Okładka ----------

  function renderCover() {
    enteredFromCover = null;
    mount(
      root,
      h(
        'div',
        { class: 'cover', dataset: { view: viewId } },
        coverHead(),
        heroCard(),
        !isArchive ? guideCard() : null,
        !isArchive && installBannerDue() ? installBanner() : null,
        isArchive
          ? h(
              'div',
              { class: 'banner archive-banner' },
              h('p', { style: 'margin:0' }, 'Wracasz do wcześniejszego dnia. Twoje odpowiedzi i postępy z tamtego wydania są zapisane.'),
              h('a', { class: 'btn secondary', href: '#dzis' }, 'Wróć do dziś', icon('arrow')),
            )
          : null,
        !isArchive && backupDue() ? backupBanner() : null,
        !isArchive && weekBannerDue(todayISO(), getState().weeks) ? weekBanner() : null,
        challengeBanner(),
        missingTodayBanner(),
        tocSection(),
        !isArchive ? streakWidget(streak()) : null,
      ),
    );
    markPlaying(nowPlaying());
    watchNowPlaying();
  }

  function coverHead() {
    const name = profile?.name ? `, ${profile.name}` : '';
    return h(
      'header',
      { class: 'cover-head' },
      h(
        'div',
        { class: 'cover-top' },
        h('p', { class: 'eyebrow' }, isArchive ? 'Wydanie z archiwum' : `Dzień dobry${name}`),
        h(
          'div',
          { class: 'meta-row' },
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
          h('a', { class: 'pill pill-link icon-pill', href: '#dni', title: 'Oś czasu: poprzednie wydania', 'aria-label': 'Oś czasu: poprzednie wydania' }, icon('timeline')),
          h('a', { class: 'pill pill-link icon-pill', href: '#ustawienia', title: 'Dostosuj: działy, długość wydania i przypomnienia', 'aria-label': 'Dostosuj wydanie' }, icon('sliders')),
        ),
      ),
      h('h1', { class: 'date' }, formatLong(date)),
      dayNav(),
    );
  }

  // Strzałki „poprzedni / następny dzień”.
  function dayNav() {
    if (!around.prev && !around.next) return null;
    const step = (target, dir) => {
      if (!target) return h('span', { class: `day-step ${dir} is-empty`, 'aria-hidden': 'true' });
      const label = dir === 'next' && target === latest && target === todayISO() ? 'Dziś' : formatTiny(target);
      return h(
        'a',
        {
          class: `day-step ${dir}`,
          href: editionHref(target, latest),
          'aria-label': `${dir === 'prev' ? 'Poprzednie wydanie' : 'Następne wydanie'}: ${formatLong(target)}`,
        },
        dir === 'prev' ? icon('back') : null,
        label,
        dir === 'next' ? icon('arrow') : null,
      );
    };
    return h('nav', { class: 'day-nav', 'aria-label': 'Poprzednie i następne dni' }, step(around.prev, 'prev'), step(around.next, 'next'));
  }

  // Najważniejsze miejsce okładki: zapowiedź wydania, postęp i dwa przyciski – „Czytaj” i „Słuchaj”.
  function heroCard() {
    const p = editionProgress(date);
    const left = chapters.filter((c) => !p.done.includes(c.id));
    const started = left.length < chapters.length || Boolean(p.chapter);
    const cur = chapters.find((c) => c.id === currentChapterId());
    const minutes = estimateMinutes(p.completedOn ? chapters : left, edition, expanded);
    const listening = listeningTo(date);
    const resumeAt = listenResumeItem();
    const engine = pickEngine(savedVoice(), { hasRecording: Boolean(recording), hasSpeech: speechSupported() });

    const segments = h(
      'div',
      { class: 'segments', role: 'progressbar', 'aria-label': 'Postęp wydania', 'aria-valuemin': 0, 'aria-valuemax': chapters.length, 'aria-valuenow': chapters.length - left.length },
      chapters.map((c) => h('span', { class: p.done.includes(c.id) ? 'on' : '' })),
    );

    if (p.completedOn) {
      const due = dueCards(getState().deck, todayISO()).length;
      const right = edition.quiz?.filter((q) => p.quiz[q.id] === q.answer).length ?? 0;
      return h(
        'section',
        { class: 'hero is-done' },
        h('p', { class: 'hero-done' }, icon('check'), 'Wydanie przeczytane'),
        edition.intro ? h('p', { class: 'read hero-intro' }, edition.intro) : null,
        segments,
        h('p', { class: 'small muted hero-meta' }, edition.quiz?.length ? `Quiz: ${right} z ${edition.quiz.length} · seria: ${streak()} ${plural(streak(), 'dzień', 'dni', 'dni')}` : `Seria: ${streak()} ${plural(streak(), 'dzień', 'dni', 'dni')}`),
        h(
          'div',
          { class: 'hero-actions' },
          due
            ? h('a', { class: 'btn', href: '#powtorki' }, `Powtórki (${due})`, icon('arrow'))
            : h('button', { type: 'button', class: 'btn', onclick: () => openReader('koniec') }, 'Podsumowanie', icon('arrow')),
          canListen() ? listenHeroButton(listening, resumeAt) : null,
        ),
        h('p', { class: 'small muted hero-note' }, isArchive ? 'Możesz wrócić do dowolnego rozdziału ze spisu poniżej.' : 'Nowe wydanie jutro rano. Każdy rozdział możesz otworzyć jeszcze raz ze spisu.'),
      );
    }

    return h(
      'section',
      { class: 'hero' },
      edition.intro ? h('p', { class: 'read hero-intro' }, edition.intro) : null,
      segments,
      h(
        'p',
        { class: 'small muted hero-meta' },
        started
          ? `${chapters.length - left.length} z ${chapters.length} ${plural(chapters.length, 'rozdziału', 'rozdziałów', 'rozdziałów')} · do końca ok. ${minutes} min czytania`
          : `${chapters.length} ${plural(chapters.length, 'rozdział', 'rozdziały', 'rozdziałów')} · ok. ${minutes} min czytania`,
      ),
      h(
        'div',
        { class: 'hero-actions' },
        h(
          'button',
          { type: 'button', class: 'btn', onclick: () => openReader(currentChapterId()) },
          icon('book'),
          started && cur ? 'Czytaj dalej' : 'Czytaj',
        ),
        canListen() ? listenHeroButton(listening, resumeAt) : null,
      ),
      canListen()
        ? h(
            'p',
            { class: 'small muted hero-note' },
            started && cur ? `Czytanie: dalej od rozdziału „${cur.label}”. ` : '',
            engine === 'nagranie'
              ? `Słuchanie: ok. ${Math.max(1, Math.round(recording.duration / 60))} min, gra też przy zgaszonym ekranie.`
              : 'Słuchanie: głos telefonu, przy zgaszonym ekranie zamilknie.',
          )
        : null,
    );
  }

  function listenHeroButton(listening, resumeAt) {
    return h(
      'button',
      {
        type: 'button',
        class: 'btn secondary hero-listen',
        onclick: () => (listening ? openPlayer() : listenEdition()),
      },
      icon('headphones'),
      listening ? 'Odtwarzacz' : resumeAt ? 'Wznów słuchanie' : 'Słuchaj',
    );
  }

  function missingTodayBanner() {
    if (!(date < todayISO() && !isArchive)) return null;
    return h(
      'div',
      { class: 'banner' },
      h('p', { style: 'margin:0' }, `Dzisiejszego wydania jeszcze nie ma. Poniżej najnowsze, z ${formatShort(date)}.`),
      h('a', { class: 'btn secondary', href: '#przygotuj', style: 'margin-top:10px' }, 'Przygotuj dzisiejsze wydanie', icon('arrow')),
    );
  }

  // Spis treści: każdy rozdział z zapowiedzią, czasem i stanem (przeczytany, następny, teraz słuchany).
  function tocSection() {
    const p = editionProgress(date);
    const next = p.completedOn ? null : currentChapterId();
    const started = p.done.length > 0 || Boolean(p.chapter);
    return h(
      'section',
      { class: 'toc', 'aria-labelledby': `${viewId}-toc` },
      h('div', { class: 'toc-head' }, h('h2', { id: `${viewId}-toc` }, 'Spis treści'), h('span', { class: 'small muted' }, `${chapters.filter((c) => p.done.includes(c.id)).length} z ${chapters.length}`)),
      h(
        'ol',
        { class: 'toc-list' },
        chapters.map((c, i) => {
          const done = p.done.includes(c.id);
          const preview = chapterPreview(c, edition, p, warmup);
          const mins = estimateMinutes([c], edition, expanded);
          return h(
            'li',
            null,
            h(
              'a',
              {
                class: `toc-row${done ? ' is-done' : ''}${c.id === next ? ' is-next' : ''}`,
                href: readerHref(date, latest, c.id),
                dataset: { chapter: c.id },
                onclick: (e) => {
                  e.preventDefault();
                  openReader(c.id);
                },
              },
              h('span', { class: 'toc-mark', 'aria-hidden': 'true' }, done ? icon('check') : String(i + 1)),
              h(
                'span',
                { class: 'toc-text' },
                h(
                  'span',
                  { class: 'toc-label' },
                  c.label,
                  c.id === next ? h('span', { class: 'toc-badge' }, started ? 'Następny' : 'Zacznij tu') : null,
                  h('span', { class: 'toc-badge playing' }, icon('headphones'), 'Słuchasz'),
                ),
                preview.teaser ? h('span', { class: 'toc-teaser' }, preview.teaser) : null,
                h('span', { class: 'toc-meta' }, [preview.meta, `${mins} min`].filter(Boolean).join(' · ')),
              ),
              h('span', { class: 'toc-go', 'aria-hidden': 'true' }, icon('chevronRight')),
            ),
          );
        }),
      ),
    );
  }

  // Okładka i czytanie śledzą lektora: zaznaczony rozdział w spisie, przycisk „Słuchaj” przy rozdziale.
  function markPlaying(state) {
    const playing = state && state.date === date ? state : null;
    for (const row of root.querySelectorAll('.toc-row')) row.classList.toggle('is-playing', Boolean(playing && row.dataset.chapter === playing.chapter));
    const pill = root.querySelector('.reader-bar .listen-btn');
    if (pill) {
      const here = playing && playing.chapter === pill.dataset.chapter && playing.playing;
      pill.classList.toggle('is-on', Boolean(here));
      pill.querySelector('.listen-label').textContent = here ? 'Pauza' : 'Słuchaj';
      pill.querySelector('.icon').replaceWith(icon(here ? 'pause' : 'headphones'));
    }
  }

  // Jedna subskrypcja na widok; wygasa sama, gdy widok zniknie z ekranu.
  let nowSub = null;
  function watchNowPlaying() {
    if (nowSub) return;
    let last = '';
    let wasPlaying = Boolean(listeningTo(date));
    nowSub = onNowPlaying((state) => {
      if (!mounted()) {
        nowSub?.();
        nowSub = null;
        return;
      }
      const key = state ? `${state.date}|${state.chapter}|${state.playing}` : '';
      if (key === last) return;
      last = key;
      markPlaying(state);
      // „Słuchaj” na okładce zmienia się w „Odtwarzacz”, gdy lektor gra, i z powrotem po jego zamknięciu.
      const session = Boolean(listeningTo(date));
      if (session !== wasPlaying) {
        wasPlaying = session;
        root.querySelector('.hero-listen')?.replaceWith(listenHeroButton(listeningTo(date), listenResumeItem()));
      }
    });
  }

  // Krótka instrukcja dla nowych osób: znika po „Rozumiem” albo po pierwszym ukończonym wydaniu.
  function guideCard() {
    if (getState().settings?.guideDone || completedCount() > 0) return null;
    const card = h(
      'div',
      { class: 'guide-card' },
      h('p', { class: 'eyebrow' }, 'Jak korzystać'),
      h(
        'ul',
        { class: 'guide-list' },
        h('li', null, icon('book'), h('span', null, '„Czytaj” otwiera następny rozdział. Spis treści poniżej prowadzi prosto do wybranego.')),
        h('li', null, icon('arrow'), h('span', null, 'W czytaniu „Dalej” na dole (albo przesunięcie palcem w lewo) przenosi do kolejnego rozdziału.')),
        h('li', null, icon('headphones'), h('span', null, '„Słuchaj” czyta wydanie na głos, także przy zgaszonym ekranie. Głos i tempo zmienisz w odtwarzaczu.')),
        h('li', null, icon('heart'), h('span', null, '„Zapisz” dodaje kartę do Ulubionych, a „Dopytaj” otwiera czat AI z gotowym pytaniem.')),
        h('li', null, icon('check'), h('span', null, 'Odpowiedzi z quizu wracają w Powtórkach. Liczba na dolnym pasku mówi, ile czeka.')),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn secondary',
          onclick: () => {
            update((st) => {
              st.settings ||= {};
              st.settings.guideDone = true;
            });
            card.remove();
          },
        },
        'Rozumiem',
      ),
    );
    return card;
  }

  // ---------- Czytanie ----------

  function renderReader({ scroll = false } = {}) {
    const progress = editionProgress(date);
    const showEnd = progress.chapter === 'koniec';
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
    swipeable(content, chapterKey);

    const bar = readerBar(active);
    mount(root, h('div', { class: 'reader', dataset: { view: viewId } }, bar, content));

    // Wysokość paska u góry (zależy od wielkości tekstu) – potrzebna do przewijania pod nim.
    document.documentElement.style.setProperty('--chapters-h', `${bar.offsetHeight}px`);
    // Adres rozdziału bez nowego wpisu w historii (Safari ogranicza liczbę takich zmian, więc tylko gdy trzeba).
    const href = readerHref(date, latest, chapterKey);
    if (location.hash !== href) history.replaceState(history.state, '', href);
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
    updateReadProgress();
    markPlaying(nowPlaying());
    watchNowPlaying();
  }

  // Pasek u góry czytania: powrót do spisu, gdzie jesteś, wygląd i lektor; pod spodem postęp wydania i rozdziału.
  function readerBar(active) {
    const p = editionProgress(date);
    const idx = active ? chapters.indexOf(active) : chapters.length;
    return h(
      'header',
      { class: 'chapters reader-bar' },
      h(
        'div',
        { class: 'reader-row' },
        h('button', { type: 'button', class: 'icon-btn back-btn', 'aria-label': 'Spis treści', title: 'Spis treści', onclick: backToCover }, icon('back')),
        h(
          'button',
          { type: 'button', class: 'reader-where', 'aria-label': active ? `Spis treści. Teraz: ${active.label}, rozdział ${idx + 1} z ${chapters.length}` : 'Spis treści', onclick: backToCover },
          h('span', { class: 'eyebrow' }, active ? `Rozdział ${idx + 1} z ${chapters.length}` : 'Koniec wydania'),
          h('span', { class: 'reader-title' }, active ? active.label : 'Podsumowanie'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'pill pill-link aa',
            'aria-label': 'Wygląd: motyw, kolor i wielkość tekstu',
            title: 'Wygląd',
            onclick: () => openAppearanceSheet({ onChange: () => render() }),
          },
          'Aa',
        ),
        active && listenable(active) ? chapterListenButton(active) : null,
      ),
      h(
        'ol',
        { class: 'reader-dots', 'aria-hidden': 'true' },
        chapters.map((c) => h('li', { class: `${p.done.includes(c.id) ? 'done' : ''}${c.id === active?.id ? ' on' : ''}` })),
      ),
      h('span', { class: 'read-progress', 'aria-hidden': 'true' }, h('span')),
    );
  }

  const listenable = (ch) => canListen() && !['warmup', 'quiz'].includes(ch.type);

  // „Słuchaj” przy rozdziale: lektor zaczyna od tego rozdziału i czyta dalej całe wydanie.
  function chapterListenButton(ch) {
    return h(
      'button',
      {
        type: 'button',
        class: 'pill pill-link nurt listen-btn',
        dataset: { chapter: ch.id },
        'aria-label': `Słuchaj od rozdziału: ${ch.label}`,
        title: 'Lektor czyta od tego rozdziału. Przesłuchany rozdział jest zaliczony.',
        onclick: () => {
          const session = listeningTo(date);
          const state = nowPlaying();
          if (session && state?.chapter === ch.id) session.toggle();
          else listenFromChapter(ch);
        },
      },
      icon('headphones'),
      h('span', { class: 'listen-label' }, 'Słuchaj'),
    );
  }

  // Klawiatura (komputer, tablet z klawiaturą): strzałki zmieniają rozdział, Escape wraca do spisu.
  function onKey(e) {
    if (mode !== 'reader' || !mounted() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], dialog')) return;
    const key = root.querySelector('#rozdzial')?.dataset.chapter;
    if (!key) return;
    if (e.key === 'ArrowRight' && key !== 'koniec') finishChapter(key);
    else if (e.key === 'ArrowLeft') previousChapter(key);
    else if (e.key === 'Escape') backToCover();
    else return;
    e.preventDefault();
  }

  // Przesunięcie palcem: w lewo – „Dalej”, w prawo – poprzedni rozdział.
  function swipeable(el, chapterKey) {
    let start = null;
    el.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0];
        start = e.touches.length === 1 && !e.target.closest('input, textarea, select, .subnav, .options, details') ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
      },
      { passive: true },
    );
    el.addEventListener(
      'touchend',
      (e) => {
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        const quick = Date.now() - start.at < 700;
        start = null;
        if (!quick || Math.abs(dx) < 80 || Math.abs(dx) < 2.2 * Math.abs(dy)) return;
        if (dx < 0 && chapterKey !== 'koniec') finishChapter(chapterKey);
        else if (dx > 0) previousChapter(chapterKey);
      },
      { passive: true },
    );
  }

  function chapterView(ch) {
    const idx = chapters.indexOf(ch);
    const next = chapters[idx + 1];
    const prev = chapters[idx - 1];
    const body = [];

    body.push(
      h(
        'div',
        { class: 'chapter-head' },
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
        h(
          'div',
          { class: 'next-links' },
          prev ? h('button', { type: 'button', class: 'link-btn', onclick: () => goTo(prev.id) }, icon('back'), prev.label) : h('span'),
          h('button', { type: 'button', class: 'link-btn', onclick: backToCover }, icon('list'), 'Spis treści'),
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
      showTitle ? h('div', { class: 'group-head' }, h('h3', { class: 'group-title' }, sectionLabel(group.section))) : null,
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

  // Przyciski pod kartą: „Dopytaj” (pytanie do czatu AI) i „Zapisz” (Ulubione).
  function cardActions(id, entry, extra = '') {
    return h('span', { class: 'card-actions' }, deepenButton(date, extra ? { ...entry, text: `${entry.text}\n${extra}` } : entry, { labelled: true }), saveButton(id, entry));
  }

  function saveButton(id, entry) {
    const pressed = isSaved(date, id);
    const label = (on) => (on ? 'Zapisane. Usuń z ulubionych' : 'Zapisz w ulubionych');
    const text = (on) => (on ? 'Zapisane' : 'Zapisz');
    return h(
      'button',
      {
        type: 'button',
        class: 'act-btn fav-btn',
        'aria-pressed': pressed ? 'true' : 'false',
        'aria-label': label(pressed),
        title: label(pressed),
        onclick: (e) => {
          const btn = e.currentTarget;
          const now = toggleSaved(date, id, entry);
          btn.setAttribute('aria-pressed', now ? 'true' : 'false');
          btn.setAttribute('aria-label', label(now));
          btn.setAttribute('title', label(now));
          btn.querySelector('.act-label').textContent = text(now);
          if (now) {
            btn.classList.remove('pop');
            void btn.offsetWidth;
            btn.classList.add('pop');
          }
          toast(now ? 'Dodane do ulubionych' : 'Usunięte z ulubionych', now ? { action: { label: 'Zobacz', onClick: () => (location.hash = '#ulubione') } } : {});
        },
      },
      icon('heart'),
      h('span', { class: 'act-label' }, text(pressed)),
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
            h('ul', { class: 'read examples' }, c.examples.map((e) => h('li', null, e))),
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
    // Liczą się tylko pytania z Twoich tematów (stare odpowiedzi na odfiltrowane pytania pomijamy).
    const answered = edition.quiz.filter((q) => p.quiz[q.id] !== undefined).length;
    const right = edition.quiz.filter((q) => p.quiz[q.id] === q.answer).length;
    const done = answered >= edition.quiz.length;
    const challenge = challengeFor(date);
    return [
      h(
        'p',
        { class: 'muted' },
        !done
          ? 'Pytania z Twoich tematów w dzisiejszych ciekawostkach, historii, pojęciu i książce. Każda odpowiedź trafia do powtórek, więc wiedza zostanie na dłużej. Nie wiesz na pewno? Zaznacz „Zgaduję”, zanim odpowiesz.'
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
    if (!challenge || !edition.quiz?.length || edition.quiz.every((q) => p.quiz[q.id] !== undefined)) return null;
    return h(
      'div',
      { class: 'challenge' },
      icon('trophy'),
      h(
        'div',
        null,
        h('p', null, h('strong', null, `${challenge.from} rzuca Ci wyzwanie: ${challenge.score}/${challenge.total} w quizie.`)),
        h('button', { type: 'button', class: 'btn secondary', onclick: () => openReader('quiz') }, 'Do quizu', icon('arrow')),
      ),
    );
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
    const missing = chapters.filter((c) => !p.done.includes(c.id));

    return [
      h(
        'div',
        { class: 'done-card' },
        koiMark(),
        h('p', { class: 'eyebrow' }, p.completedOn ? 'Wydanie ukończone' : 'Prawie koniec'),
        h('h2', null, p.completedOn ? 'Na dziś to wszystko.' : 'Zostały jeszcze rozdziały'),
        !p.completedOn && missing.length
          ? h(
              'div',
              { class: 'inline-actions' },
              missing.map((c) => h('button', { type: 'button', class: 'chip', onclick: () => goTo(c.id) }, c.label)),
            )
          : null,
        h(
          'div',
          { class: 'stats' },
          h('div', { class: 'stat' }, h('strong', null, s), h('span', null, `${plural(s, 'dzień', 'dni', 'dni')} z rzędu`)),
          h('div', { class: 'stat' }, h('strong', null, `${right}/${edition.quiz?.length ?? 0}`), h('span', null, 'w quizie')),
          h('div', { class: 'stat' }, h('strong', null, count), h('span', null, plural(count, 'wydanie', 'wydania', 'wydań'))),
        ),
        edition.quiz?.length && edition.quiz.every((q) => p.quiz[q.id] !== undefined) ? challengeResult(right) : null,
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
          h('button', { type: 'button', class: 'btn secondary', onclick: backToCover }, icon('list'), 'Spis treści'),
          h('a', { class: 'btn secondary', href: '#ulubione' }, icon('heart'), 'Ulubione'),
          h('a', { class: 'btn secondary', href: '#dni' }, icon('timeline'), 'Oś czasu'),
          h('a', { class: 'btn ghost', href: '#ustawienia' }, icon('sliders'), 'Zmień tematy'),
        ),
      ),
    ];
  }

  // ---------- Lektor ----------

  // Kolejka dla lektora: to samo, co widać w wydaniu (bez rozgrzewki i quizu, które wymagają dotknięć).
  function listenItems() {
    return editionNarration(edition, chapters);
  }

  function chapterItems(ch) {
    return chapterNarration(ch, edition);
  }

  // Przesłuchany do końca fragment trafia do postępów; gdy cały rozdział jest przesłuchany, rozdział jest zaliczony.
  function heard(item) {
    const ch = chapters.find((c) => c.id === item.chapter);
    if (!ch || item.id === 'intro') return;
    let complete = false;
    updateEdition(date, (p) => {
      p.heard ||= [];
      if (!p.heard.includes(item.id)) p.heard.push(item.id);
      complete = !p.done.includes(ch.id) && chapterItems(ch).every((it) => p.heard.includes(it.id));
    });
    if (!complete) return;
    if (!markDone(ch.id)) toast(`Przesłuchane: rozdział „${ch.label}” zaliczony`);
    // Odśwież widok tego wydania, który jest teraz na ekranie (okładkę albo czytanie), poza kartą, którą czyta lektor.
    if (live?.date === date && live.mounted()) live.refresh();
    onChange?.();
  }

  // Fragment, od którego wznowi się słuchanie całego wydania (jeśli wcześniej przerwane).
  function listenResumeItem() {
    const saved = editionProgress(date).listenAt;
    return saved ? listenItems().find((it) => it.id === saved.id) || null : null;
  }

  // Miejsce w wydaniu zapisuje się na bieżąco, więc po zamknięciu aplikacji słuchanie wraca w to samo miejsce.
  const keepPlace = {
    onPosition: (at) =>
      updateEdition(date, (p) => {
        p.listenAt = at;
      }),
    onEnd: () =>
      updateEdition(date, (p) => {
        delete p.listenAt;
      }),
  };

  function listenEdition({ fromStart = false } = {}) {
    const resumeAt = fromStart ? null : listenResumeItem();
    listen(listenItems(), { ...keepPlace, startAt: resumeAt ? editionProgress(date).listenAt : null });
    if (resumeAt) toast(`Wznawiam od: ${resumeAt.label}`, { action: { label: 'Od początku', onClick: () => listenEdition({ fromStart: true }) } });
  }

  function listenFromChapter(ch) {
    const first = chapterItems(ch)[0];
    if (!first) return;
    followPaused = false;
    const session = listeningTo(date);
    if (session) session.jumpToId(first.id);
    else listen(listenItems(), { ...keepPlace, startAt: { id: first.id } });
  }

  // Przełącznik głosu w odtwarzaczu: zapamiętuje wybór i gra dalej od tego samego fragmentu.
  function voiceOption(engine) {
    return {
      value: engine,
      available: { nagranie: Boolean(recording), telefon: speechSupported() },
      onChange: (voice, item) => {
        saveVoice(voice);
        listen(listenItems(), { ...keepPlace, startAt: { id: item.id } });
        toast(voice === 'telefon' ? 'Głos telefonu. Przy zgaszonym ekranie zamilknie.' : 'Nagranie lektora. Gra też przy zgaszonym ekranie.');
      },
    };
  }

  function listen(items, options = {}) {
    const engine = pickEngine(savedVoice(), { hasRecording: Boolean(recording), hasSpeech: speechSupported() });
    if (!engine) {
      toast('Ta przeglądarka nie umie czytać na głos.');
      return;
    }
    const common = {
      ...options,
      date,
      title: 'Lektor',
      onItemEnd: heard,
      onItem: (item) => {
        if (live?.date === date && live.mounted()) live.follow(item);
      },
      onShowText: (item) => showText(item),
      voice: voiceOption(engine),
    };
    if (engine === 'telefon') {
      startListening(items, common);
      return;
    }
    playRecording(recording, items, {
      ...common,
      album: `SelfLearn · ${formatShort(date)}`,
      onFail: () => {
        toast('Nagranie niedostępne. Czyta głos telefonu.');
        startListening(items, { ...common, voice: voiceOption('telefon') });
      },
    });
  }

  // Lektor prowadzi przez tekst: w czytaniu przechodzi do rozdziału, rozwija „Pokaż więcej” i pokazuje kartę.
  function followItem(item) {
    if (mode !== 'reader' || item.id === 'intro') return;
    const shown = root.querySelector('#rozdzial');
    if (item.chapter && shown?.dataset.chapter !== item.chapter) {
      if (followPaused) return;
      updateEdition(date, (p) => {
        p.chapter = item.chapter;
      });
      if (item.reveal) expanded.add(item.reveal);
      render({ scroll: true });
    } else if (item.reveal && !expanded.has(item.reveal)) {
      expanded.add(item.reveal);
      render();
    }
    highlight(item.id, { scroll: !followPaused });
  }

  function highlight(id, { scroll = true } = {}) {
    document.querySelector('.is-speaking')?.classList.remove('is-speaking');
    const card = root.querySelector(`[data-item="${CSS.escape(id)}"]`);
    if (!card) return;
    card.classList.add('is-speaking');
    if (scroll) card.scrollIntoView({ block: 'center', behavior: smoothScroll() });
  }

  // „Pokaż w tekście” z odtwarzacza: rozdział z czytaną kartą, a lektor znowu prowadzi.
  function showText(item) {
    followPaused = false;
    hideFollowButton();
    if (live?.date === date && live.mounted() && mode === 'reader') {
      followItem(item);
      highlight(item.id);
      return;
    }
    pendingShow = { date, id: item.id };
    updateEdition(date, (p) => {
      p.chapter = item.chapter;
    });
    enteredFromCover = mode === 'cover' && mounted() ? date : null;
    location.hash = readerHref(date, latest, item.chapter);
  }

  // Własne przewinięcie podczas słuchania wstrzymuje prowadzenie; przycisk „Wróć do lektora” je przywraca.
  function onManualScroll(e) {
    if (mode !== 'reader' || !mounted() || !listeningTo(date) || followPaused) return;
    if (e?.target?.closest?.('dialog, .player, .follow-btn')) return;
    followPaused = true;
    showFollowButton(() => {
      followPaused = false;
      const state = nowPlaying();
      if (state?.date !== date) return;
      const item = listenItems().find((it) => it.id === state.id);
      if (item) followItem(item);
    });
  }

  // ---------- Otwarcie wydania na konkretnej karcie (np. z Ulubionych) ----------

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

  // ---------- Start ----------

  if (mode === 'reader') {
    if (wantChapter === 'koniec' || (wantChapter && chapters.some((c) => c.id === wantChapter))) {
      updateEdition(date, (p) => {
        p.chapter = wantChapter;
      });
    }
    const show = pendingShow?.date === date ? pendingShow : null;
    pendingShow = null;
    if (focus) {
      if (!focusItem(focus)) render({ scroll: true });
    } else if (show) {
      const item = listenItems().find((it) => it.id === show.id);
      if (item?.reveal) expanded.add(item.reveal);
      render({ scroll: true });
      requestAnimationFrame(() => highlight(show.id));
    } else {
      render();
      restorePosition(date);
    }
    watchScroll();
    watchManualScroll(onManualScroll);
  } else {
    render();
  }
}

let keysWatched = false;
function watchKeys() {
  if (keysWatched) return;
  keysWatched = true;
  document.addEventListener('keydown', (e) => live?.key(e));
}

// ---------- „Wróć do lektora” ----------

let manualScrollHandler = null;
function watchManualScroll(fn) {
  const first = !manualScrollHandler;
  manualScrollHandler = fn;
  if (!first) return;
  const run = (e) => manualScrollHandler?.(e);
  window.addEventListener('touchmove', run, { passive: true });
  window.addEventListener('wheel', run, { passive: true });
}

function showFollowButton(onClick) {
  hideFollowButton();
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'follow-btn',
      onclick: () => {
        hideFollowButton();
        onClick();
      },
    },
    icon('headphones'),
    'Wróć do lektora',
  );
  document.body.append(btn);
  // Znika samo, gdy lektor przestanie grać.
  const off = onNowPlaying((state) => {
    if (!state) {
      off();
      hideFollowButton();
    }
  });
}

function hideFollowButton() {
  document.querySelector('.follow-btn')?.remove();
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
