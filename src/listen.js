// Lektor wydania. Dwa głosy:
// – nagranie MP3 (scripts/make-audio.mjs): gra jak odtwarzacz muzyki, także przy zgaszonym ekranie,
//   z przyciskami na ekranie blokady (Media Session);
// – głos telefonu (syntezator mowy): brzmi zwykle naturalniej, działa bez internetu, ale cichnie po zgaszeniu ekranu.
// Oba korzystają z tego samego odtwarzacza: mały pasek na dole i pełny panel po jego dotknięciu.
import { getState, update } from './store.js';
import { h, icon, toast } from './ui.js';
import { speakable } from './speech-text.js';

export const RATES = [0.9, 1, 1.15, 1.3, 1.5];
const MAX_CHUNK = 220;
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const VOICES = [
  { value: 'nagranie', label: 'Nagranie lektora', sub: 'gra też przy zgaszonym ekranie' },
  { value: 'telefon', label: 'Głos telefonu', sub: 'brzmi naturalniej, cichnie po zgaszeniu ekranu' },
];

let current = null;

// ---------- Co teraz gra (dla spisu treści i podświetlania kart) ----------

let now = null;
const nowSubs = new Set();

function setNow(next) {
  now = next;
  for (const fn of nowSubs) fn(now);
}

// { date, id, chapter, playing, engine } albo null, gdy lektor milczy.
export function nowPlaying() {
  return now;
}

export function onNowPlaying(fn) {
  nowSubs.add(fn);
  return () => nowSubs.delete(fn);
}

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function isListening() {
  return Boolean(current);
}

// Sesja lektora dla danego wydania (żeby „Słuchaj” w innym rozdziale przeskoczyło, a nie zaczynało od nowa).
export function listeningTo(date) {
  return current && current.date === date ? current : null;
}

export function savedRate() {
  const r = getState().settings?.listen?.rate;
  return RATES.includes(r) ? r : 1;
}

function saveRate(rate) {
  update((s) => {
    s.settings ||= {};
    s.settings.listen = { ...(s.settings.listen || {}), rate };
  });
}

// Wybrany głos: nagranie (domyślnie) albo telefon.
export function savedVoice() {
  return getState().settings?.listen?.voice === 'telefon' ? 'telefon' : 'nagranie';
}

export function saveVoice(voice) {
  update((s) => {
    s.settings ||= {};
    s.settings.listen = { ...(s.settings.listen || {}), voice };
  });
}

// Którym głosem grać: wybrany, jeśli jest dostępny, a jeśli nie – ten drugi.
export function pickEngine(preferred, { hasRecording, hasSpeech }) {
  if (preferred === 'telefon' && hasSpeech) return 'telefon';
  if (hasRecording) return 'nagranie';
  return hasSpeech ? 'telefon' : null;
}

// Głosy ładują się asynchronicznie (zwłaszcza w Chrome), więc chwilę na nie czekamy.
function loadVoices(timeout = 1500) {
  const voices = speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
}

// Najlepszy polski głos: najpierw ulepszone (iPhone: „Enhanced”/„Premium”, Android/Edge: „Neural”, „Natural”), potem lokalne.
function pickPolish(voices) {
  const pl = voices.filter((v) => /^pl([-_]|$)/i.test(v.lang));
  const better = pl.find((v) => /premium|enhanced|ulepsz|rozszerz|neural|natural|wavenet/i.test(`${v.name} ${v.voiceURI || ''}`));
  return better || pl.find((v) => v.localService) || pl[0] || null;
}

// Próbka głosu telefonu (w Profilu): jak brzmi i jak się nazywa wybrany głos.
export async function phoneVoiceSample() {
  if (!speechSupported()) return null;
  speechSynthesis.cancel();
  if (IOS) speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
  const voice = pickPolish(await loadVoices());
  const u = new SpeechSynthesisUtterance(speakable('Dzień dobry. Tak brzmi głos telefonu. Dziś jest 27 października, a lektor przeczyta o 7:30 najważniejsze wiadomości.'));
  u.lang = 'pl-PL';
  if (voice) u.voice = voice;
  u.rate = savedRate();
  speechSynthesis.speak(u);
  return voice?.name || null;
}

// Chrome urywa bardzo długie wypowiedzi, więc tekst idzie zdanie po zdaniu (najwyżej ~220 znaków).
export function splitText(text) {
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([.!?…])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„"(0-9])/g, '$1\u0000')
    .split('\u0000');
  const out = [];
  for (const s of sentences) {
    if (!s) continue;
    if (s.length <= MAX_CHUNK) {
      out.push(s);
      continue;
    }
    let rest = s;
    while (rest.length > MAX_CHUNK) {
      const cut = Math.max(rest.lastIndexOf(', ', MAX_CHUNK), rest.lastIndexOf(' ', MAX_CHUNK));
      out.push(rest.slice(0, cut > 40 ? cut + 1 : MAX_CHUNK).trim());
      rest = rest.slice(cut > 40 ? cut + 1 : MAX_CHUNK);
    }
    if (rest.trim()) out.push(rest.trim());
  }
  return out;
}

export function stopListening() {
  current?.stop();
}

// Miejsce w kolejce: pierwsze zdanie fragmentu startAt.id (+ startAt.chunk zdań dalej, jeśli jest).
export function startIndex(queue, items, startAt) {
  if (!startAt?.id) return 0;
  const itemIndex = items.findIndex((it) => it.id === startAt.id);
  const first = queue.findIndex((c) => c.itemIndex === itemIndex);
  if (itemIndex < 0 || first < 0) return 0;
  const chunk = Math.max(0, Number(startAt.chunk) || 0);
  const next = first + chunk;
  return next < queue.length && queue[next].itemIndex === itemIndex ? next : first;
}

// Wspólne opcje obu głosów:
// items: [{ id, chapter, chapterLabel, label, text }];
// onItem(item) – lektor zaczyna nowy fragment; onItemEnd(item) – fragment przeczytany do końca (bez przeskakiwania);
// onPosition(miejsce) – na bieżąco, żeby po zamknięciu aplikacji wrócić w to samo miejsce; startAt – to miejsce;
// onEnd – koniec kolejki; date – wydanie (do „co teraz gra”); title – podpis odtwarzacza;
// voice: { value, available: { nagranie, telefon }, onChange(v, item) } – przełącznik głosu w panelu;
// onShowText(item) – przycisk „Pokaż w tekście”.

// ---------- Głos telefonu ----------

export async function startListening(items, opts = {}) {
  const { onItem, onItemEnd, onEnd, onPosition, startAt = null, date = null, title = 'Lektor', endText = 'To wszystko na dziś. Quiz czeka w wydaniu.' } = opts;
  if (!speechSupported()) {
    toast('Ta przeglądarka nie umie czytać na głos.');
    return;
  }
  current?.stop();
  // iPhone pozwala mówić tylko w odpowiedzi na dotknięcie. Krótka pusta wypowiedź od razu „odblokowuje”
  // syntezator, zanim poczekamy na listę głosów.
  if (IOS) {
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
    } catch {
      // Bez odblokowania czytanie ruszy po drugim dotknięciu „Czytaj”.
    }
  }
  const voices = await loadVoices();
  const voice = pickPolish(voices);
  if (voices.length && !voice) {
    toast('Brak polskiego głosu w telefonie. Dodaj go w ustawieniach: „Zamiana tekstu na mowę”.');
    return;
  }

  const queue = items.flatMap((item, itemIndex) => splitText(speakable(item.text)).map((text) => ({ itemIndex, text })));
  if (!queue.length) return;

  let pos = startIndex(queue, items, startAt);
  let playing = false;
  let token = 0;
  let rate = savedRate();
  let wakeLock = null;
  let lastItem = -1;
  let closed = false;

  const ui = playerUI(items, {
    title,
    voice: opts.voice,
    onShowText: opts.onShowText,
    onToggle: () => (playing ? pause() : play()),
    onPrev: () => jumpItem(-1),
    onNext: () => jumpItem(1),
    onJump: (i) => jumpTo(i),
    onRate: (r) => setRate(r),
    onClose: () => stop(),
    current: () => items[queue[pos].itemIndex],
  });

  async function keepAwake(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
      if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {
      wakeLock = null;
    }
  }

  function announce() {
    const item = items[queue[pos].itemIndex];
    setNow({ date, id: item.id, chapter: item.chapter, playing, engine: 'telefon' });
  }

  function speak() {
    const my = ++token;
    speechSynthesis.cancel();
    const chunk = queue[pos];
    if (chunk.itemIndex !== lastItem) {
      lastItem = chunk.itemIndex;
      onItem?.(items[chunk.itemIndex]);
    }
    onPosition?.({ id: items[chunk.itemIndex].id, chunk: pos - queue.findIndex((c) => c.itemIndex === chunk.itemIndex) });
    const u = new SpeechSynthesisUtterance(chunk.text);
    u.lang = 'pl-PL';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => {
      if (my !== token || !playing) return;
      if (queue[pos + 1]?.itemIndex !== chunk.itemIndex) onItemEnd?.(items[chunk.itemIndex]);
      if (pos < queue.length - 1) {
        pos += 1;
        speak();
      } else {
        finish();
      }
    };
    u.onerror = (e) => {
      if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return;
      playing = false;
      render();
      toast('Czytanie przerwane. Spróbuj jeszcze raz.');
    };
    // Krótka pauza po cancel(): bez niej niektóre telefony gubią nową wypowiedź.
    setTimeout(() => {
      if (my === token && playing) speechSynthesis.speak(u);
    }, 30);
    render();
  }

  function play() {
    playing = true;
    keepAwake(true);
    speak();
  }

  // Pauza jako przerwanie i ponowne czytanie bieżącego zdania: speechSynthesis.pause() na Androidzie bywa zawodne.
  function pause() {
    playing = false;
    token += 1;
    speechSynthesis.cancel();
    keepAwake(false);
    render();
  }

  function jumpTo(itemIndex) {
    const target = Math.min(items.length - 1, Math.max(0, itemIndex));
    pos = queue.findIndex((c) => c.itemIndex === target);
    lastItem = -1;
    if (playing) speak();
    else {
      lastItem = target;
      onItem?.(items[target]);
      render();
    }
  }

  function jumpItem(delta) {
    jumpTo(queue[pos].itemIndex + delta);
  }

  function finish() {
    stop();
    if (endText) toast(endText);
    onEnd?.();
  }

  function stop() {
    if (closed) return;
    closed = true;
    playing = false;
    token += 1;
    speechSynthesis.cancel();
    keepAwake(false);
    document.removeEventListener('visibilitychange', onVisible);
    ui.remove();
    document.querySelector('.is-speaking')?.classList.remove('is-speaking');
    if (current === api) {
      current = null;
      setNow(null);
    }
  }

  function setRate(r) {
    rate = r;
    saveRate(rate);
    if (playing) speak();
    else render();
  }

  function render() {
    if (closed) return;
    const i = queue[pos].itemIndex;
    ui.update({ index: i, playing, rate, progress: ((pos + 1) / queue.length) * 100 });
    announce();
  }

  // Po zablokowaniu ekranu albo przejściu do innej aplikacji telefon zwykle ucisza syntezator.
  // Po powrocie czytanie rusza od zdania, na którym się urwało (i ponownie blokuje wygaszanie ekranu).
  function onVisible() {
    if (document.visibilityState !== 'visible' || !playing) return;
    if (!speechSynthesis.speaking && !speechSynthesis.pending) speak();
    keepAwake(true);
  }
  document.addEventListener('visibilitychange', onVisible);

  const api = {
    date,
    engine: 'telefon',
    stop,
    toggle: () => (playing ? pause() : play()),
    jumpToId: (id) => {
      const i = items.findIndex((it) => it.id === id);
      if (i >= 0) {
        jumpTo(i);
        if (!playing) play();
      }
    },
  };
  current = api;
  play();
}

// ---------- Nagranie lektora (MP3) ----------

// Opis nagrania wczytany raz na wydanie (przy przechodzeniu między rozdziałami nie pytamy serwera od nowa).
const recordings = new Map();

export function loadRecording(date) {
  if (!recordings.has(date)) {
    recordings.set(
      date,
      fetch(`content/audio/${date}.json`, { cache: 'no-cache' })
        .then((res) => (res.ok ? res.json() : null))
        .then((info) => (info?.url && Array.isArray(info.items) && info.items.length ? info : null))
        .catch(() => {
          recordings.delete(date);
          return null;
        }),
    );
  }
  return recordings.get(date);
}

// Fragmenty nagrania do zagrania: tylko te z listy items (np. działy z profilu albo jeden rozdział), w kolejności nagrania.
export function recordingSegments(info, items) {
  const wanted = new Map(items.map((it) => [it.id, it]));
  return (info?.items || []).filter((s) => wanted.has(s.id)).map((s) => ({ ...s, item: wanted.get(s.id) }));
}

// Indeks fragmentu nagrania (wszystkich, także pominiętych), który gra w chwili t.
export function segmentAt(list, t) {
  let found = -1;
  for (let i = 0; i < list.length; i++) if (list[i].start <= t + 0.05) found = i;
  return found;
}

// Oś czasu słuchanej części: same wybrane fragmenty, bez pominiętych działów i przerw między nimi.
export function selectionLength(segs) {
  return segs.reduce((sum, s) => sum + (s.end - s.start), 0);
}

export function toSelection(segs, t) {
  let acc = 0;
  for (const s of segs) {
    if (t < s.start) return acc;
    if (t <= s.end) return acc + (t - s.start);
    acc += s.end - s.start;
  }
  return acc;
}

export function fromSelection(segs, v) {
  let acc = 0;
  for (const s of segs) {
    const len = s.end - s.start;
    if (v < acc + len) return s.start + Math.max(0, v - acc);
    acc += len;
  }
  return segs.length ? segs[segs.length - 1].end : 0;
}

// Wywołuj bezpośrednio w obsłudze dotknięcia: iPhone pozwala włączyć dźwięk tylko wtedy.
// startAt: { id, t } – miejsce zapisane wcześniej przez onPosition; onFail – gdy nagrania nie da się zagrać.
export function playRecording(info, items, opts = {}) {
  const { onItem, onItemEnd, onEnd, onPosition, onFail, startAt = null, date = null, title = 'Lektor', album = 'SelfLearn', endText = 'To wszystko na dziś. Quiz czeka w wydaniu.' } = opts;
  const segs = recordingSegments(info, items);
  if (!segs.length) {
    onFail?.();
    return;
  }
  current?.stop();
  speechSupported() && speechSynthesis.cancel();

  let rate = savedRate();
  let index = -1;
  // Do wczytania nagrania obowiązuje miejsce startu (currentTime jest wtedy jeszcze zerem).
  let ready = false;
  // Po zamknięciu odtwarzacza zdarzenia z czyszczonego <audio> (np. czas 0) nie mogą nadpisać zapisanego miejsca.
  let closed = false;
  let lastSave = 0;
  let lastState = 0;
  const from = segs.find((s) => s.id === startAt?.id);
  let startTime = from ? Math.min(Math.max(Number(startAt.t) || from.start, from.start), from.end - 1) : segs[0].start;
  const pos = () => (ready ? audio.currentTime : startTime);
  const total = selectionLength(segs);
  const segItems = segs.map((s) => s.item);

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = `${info.url}#t=${Math.max(0, startTime).toFixed(1)}`;
  audio.playbackRate = rate;

  const ui = playerUI(segItems, {
    title,
    voice: opts.voice,
    onShowText: opts.onShowText,
    onToggle: () => (audio.paused ? resume() : audio.pause()),
    onPrev: () => jump(-1),
    onNext: () => jump(1),
    onJump: (i) => seek(segs[i].start),
    onSkip: (d) => seek(fromSelection(segs, Math.max(0, toSelection(segs, pos()) + d))),
    onSeek: (v) => seek(fromSelection(segs, v)),
    onRate: (r) => setRate(r),
    onClose: () => stop(),
    current: () => segs[Math.max(0, index)].item,
    total,
  });

  function resume() {
    audio.playbackRate = rate;
    audio.play().catch((err) => {
      if (err?.name === 'NotAllowedError') render();
    });
  }

  function seek(t) {
    if (ready) audio.currentTime = Math.max(0, t);
    else startTime = Math.max(0, t);
    tick();
  }

  function jump(delta) {
    const t = pos();
    const i = Math.max(0, index);
    if (delta < 0 && t - segs[i].start > 3) return seek(segs[i].start);
    const target = i + delta;
    if (target < 0) return seek(segs[0].start);
    if (target >= segs.length) return finish();
    seek(segs[target].start);
  }

  function setRate(r) {
    rate = r;
    audio.playbackRate = rate;
    saveRate(rate);
    render();
  }

  function save() {
    if (!closed && index >= 0) onPosition?.({ id: segs[index].id, t: Math.round(pos()) });
  }

  // Co kilka razy na sekundę: który fragment gra, pomijanie działów spoza listy, koniec rozdziału.
  function tick() {
    if (closed) return;
    const t = pos();
    const all = info.items;
    const nowSeg = all[segmentAt(all, t)];
    if (nowSeg && !segs.some((s) => s.id === nowSeg.id)) {
      // Ten fragment nie należy do słuchanej części (np. dział spoza profilu albo następny rozdział).
      const next = segs.find((s) => s.start > t);
      return next ? seek(next.start) : finish();
    }
    const i = Math.max(0, segmentAt(segs, t));
    if (i !== index) {
      const prev = segs[index];
      if (prev && t >= prev.end - 0.5 && i === index + 1) onItemEnd?.(prev.item);
      index = i;
      onItem?.(segs[i].item);
      setMetadata();
      save();
    }
    const nowMs = Date.now();
    if (nowMs - lastSave > 5000) {
      lastSave = nowMs;
      save();
    }
    if (nowMs - lastState > 1000) {
      lastState = nowMs;
      setPositionState();
    }
    render();
  }

  function render() {
    if (closed) return;
    const i = Math.max(0, index);
    const done = toSelection(segs, pos());
    ui.update({ index: i, playing: !audio.paused, rate, progress: total ? (done / total) * 100 : 0, elapsed: done, total });
    setNow({ date, id: segs[i].id, chapter: segs[i].item.chapter, playing: !audio.paused, engine: 'nagranie' });
  }

  function setMetadata() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const art = (size) => ({ src: new URL(`assets/logo-${size}.png`, document.baseURI).href, sizes: `${size}x${size}`, type: 'image/png' });
    const seg = segs[Math.max(0, index)];
    navigator.mediaSession.metadata = new MediaMetadata({ title: seg.item.label || seg.label, artist: seg.item.chapterLabel ? `SelfLearn · ${seg.item.chapterLabel}` : 'SelfLearn', album, artwork: [art(192), art(512)] });
  }

  function setPositionState() {
    if (!navigator.mediaSession?.setPositionState || !Number.isFinite(audio.duration)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) });
    } catch {
      // Niektóre przeglądarki odrzucają stan tuż po zmianie źródła.
    }
  }

  const handlers = {
    play: () => resume(),
    pause: () => audio.pause(),
    stop: () => stop(),
    previoustrack: () => jump(-1),
    nexttrack: () => jump(1),
    seekbackward: (d) => seek(pos() - (d?.seekOffset || 15)),
    seekforward: (d) => seek(pos() + (d?.seekOffset || 30)),
    seekto: (d) => seek(d.seekTime),
  };
  function mediaHandlers(on) {
    if (!('mediaSession' in navigator)) return;
    for (const [action, fn] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, on ? fn : null);
      } catch {
        // Ta akcja nie jest obsługiwana na tym telefonie.
      }
    }
    if (!on) navigator.mediaSession.metadata = null;
  }

  audio.addEventListener('loadedmetadata', () => {
    // Gdy przeglądarka pominęła „#t=” w adresie, ustaw miejsce startu ręcznie.
    if (Math.abs(audio.currentTime - startTime) > 1) audio.currentTime = startTime;
    ready = true;
    tick();
  });
  audio.addEventListener('timeupdate', () => {
    if (ready) tick();
  });
  audio.addEventListener('play', () => {
    if (closed) return;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    render();
  });
  audio.addEventListener('pause', () => {
    if (closed) return;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    save();
    render();
  });
  audio.addEventListener('ended', () => {
    if (index >= 0) onItemEnd?.(segs[index].item);
    finish();
  });
  audio.addEventListener('error', () => {
    if (closed) return;
    if (ready) {
      toast('Nagranie przerwane. Sprawdź internet i spróbuj jeszcze raz.');
      render();
      return;
    }
    stop();
    onFail?.();
  });
  // Zamknięcie aplikacji w trakcie słuchania: zapisz miejsce.
  window.addEventListener('pagehide', save);

  function finish() {
    stop();
    if (endText) toast(endText);
    onEnd?.();
  }

  function stop() {
    if (closed) return;
    save();
    closed = true;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    window.removeEventListener('pagehide', save);
    mediaHandlers(false);
    ui.remove();
    document.querySelector('.is-speaking')?.classList.remove('is-speaking');
    if (current === api) {
      current = null;
      setNow(null);
    }
  }

  const api = {
    date,
    engine: 'nagranie',
    stop,
    toggle: () => (audio.paused ? resume() : audio.pause()),
    jumpToId: (id) => {
      const seg = segs.find((s) => s.id === id);
      if (!seg) return;
      seek(seg.start);
      if (audio.paused) resume();
    },
  };
  current = api;
  mediaHandlers(true);
  index = -1;
  tick();
  resume();
}

// ---------- Odtwarzacz: pasek na dole i panel ----------

export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const rateLabel = (r) => `${String(r).replace('.', ',')}×`;

// Elementy zmieniają się w miejscu, żeby częste odświeżanie (kilka razy na sekundę) nie gubiło dotknięć.
function playerUI(items, o) {
  let state = { index: 0, playing: false, rate: savedRate(), progress: 0, elapsed: null, total: o.total ?? null };
  let sheet = null;

  const fill = h('span');
  const eyebrow = h('span', { class: 'eyebrow' });
  const title = h('span', { class: 'player-title' });
  const playBtn = h('button', { type: 'button', class: 'icon-btn play', onclick: () => o.onToggle() });
  const el = h(
    'div',
    { class: 'player', role: 'region', 'aria-label': 'Lektor' },
    h('span', { class: 'player-progress', 'aria-hidden': 'true' }, fill),
    h(
      'button',
      { type: 'button', class: 'player-info', 'aria-label': 'Otwórz odtwarzacz: tempo, głos i lista fragmentów', onclick: () => openSheet() },
      eyebrow,
      title,
    ),
    playBtn,
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Następny fragment', onclick: () => o.onNext() }, icon('next')),
    h('button', { type: 'button', class: 'icon-btn player-close', 'aria-label': 'Zakończ słuchanie', onclick: () => o.onClose() }, icon('close')),
  );
  document.body.append(el);
  document.body.classList.add('has-player');

  let shownPlaying = null;
  function setPlayIcon(btn, playing) {
    btn.replaceChildren(icon(playing ? 'pause' : 'play'));
    btn.setAttribute('aria-label', playing ? 'Pauza' : 'Słuchaj');
  }

  function texts() {
    const item = items[state.index] || items[0];
    const left = state.total != null && state.elapsed != null ? ` · ${clock((state.total - state.elapsed) / (state.rate || 1))}` : ` · ${state.index + 1} z ${items.length}`;
    return { item, eyebrow: `${item.chapterLabel || o.title}${left}`, label: item.label };
  }

  function update(patch) {
    state = { ...state, ...patch };
    const t = texts();
    fill.style.width = `${Math.min(100, state.progress)}%`;
    if (eyebrow.textContent !== t.eyebrow) eyebrow.textContent = t.eyebrow;
    if (title.textContent !== t.label) title.textContent = t.label;
    if (shownPlaying !== state.playing) {
      shownPlaying = state.playing;
      setPlayIcon(playBtn, state.playing);
    }
    sheet?.update(t);
  }

  function openSheet() {
    document.querySelector('dialog.sheet')?.remove();
    const sTitle = h('h2', { class: 'ps-title' });
    const sChapter = h('p', { class: 'eyebrow ps-chapter' });
    const sPlay = h('button', { type: 'button', class: 'icon-btn play big', onclick: () => o.onToggle() });
    const seekable = Boolean(o.onSeek) && state.total;
    const range = seekable
      ? h('input', {
          type: 'range',
          class: 'ps-range',
          min: 0,
          max: Math.round(state.total),
          step: 1,
          value: Math.round(state.elapsed || 0),
          'aria-label': 'Miejsce w nagraniu',
          oninput: (e) => {
            seeking = true;
            elapsedEl.textContent = clock(Number(e.target.value));
          },
          onchange: (e) => {
            seeking = false;
            o.onSeek(Number(e.target.value));
          },
        })
      : null;
    let seeking = false;
    const elapsedEl = h('span', { class: 'num' });
    const leftEl = h('span', { class: 'num' });
    const rates = h(
      'div',
      { class: 'ps-rates', role: 'radiogroup', 'aria-label': 'Tempo' },
      RATES.map((r) =>
        h('button', {
          type: 'button',
          class: 'chip',
          role: 'radio',
          'aria-checked': r === state.rate ? 'true' : 'false',
          onclick: (e) => {
            for (const b of rates.children) b.setAttribute('aria-checked', 'false');
            e.currentTarget.setAttribute('aria-checked', 'true');
            o.onRate(r);
          },
        }, rateLabel(r)),
      ),
    );
    const list = h('ol', { class: 'ps-queue' });
    let lastChapter = null;
    items.forEach((it, i) => {
      if (it.chapterLabel && it.chapterLabel !== lastChapter) {
        lastChapter = it.chapterLabel;
        list.append(h('li', { class: 'ps-group', 'aria-hidden': 'true' }, it.chapterLabel));
      }
      list.append(h('li', null, h('button', { type: 'button', class: 'ps-item', dataset: { index: i }, onclick: () => o.onJump(i) }, h('span', { class: 'ps-bullet', 'aria-hidden': 'true' }), h('span', null, it.label))));
    });

    const voice = o.voice;
    const voices = voice
      ? h(
          'div',
          { class: 'ps-voices', role: 'radiogroup', 'aria-label': 'Głos lektora' },
          VOICES.map((v) =>
            h(
              'button',
              {
                type: 'button',
                class: 'voice-option',
                role: 'radio',
                'aria-checked': v.value === voice.value ? 'true' : 'false',
                disabled: !voice.available?.[v.value],
                onclick: () => {
                  if (v.value === voice.value) return;
                  dialog.close();
                  voice.onChange(v.value, texts().item);
                },
              },
              h('strong', null, v.label),
              h('small', null, voice.available?.[v.value] ? v.sub : v.value === 'nagranie' ? 'brak nagrania tego wydania' : 'ta przeglądarka nie czyta na głos'),
            ),
          ),
        )
      : null;

    const dialog = h(
      'dialog',
      { class: 'sheet player-sheet', 'aria-label': 'Odtwarzacz' },
      h('div', { class: 'sheet-head' }, h('h2', null, 'Lektor'), h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Gotowe')),
      h(
        'div',
        { class: 'ps-now' },
        sChapter,
        sTitle,
        range,
        range ? h('div', { class: 'ps-times small muted' }, elapsedEl, leftEl) : h('p', { class: 'ps-times small muted' }, leftEl),
        h(
          'div',
          { class: 'ps-controls' },
          o.onSkip ? h('button', { type: 'button', class: 'icon-btn skip', 'aria-label': 'Cofnij 15 sekund', onclick: () => o.onSkip(-15) }, h('span', { class: 'skip-num' }, '−15')) : h('span'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Poprzedni fragment', onclick: () => o.onPrev() }, icon('prev')),
          sPlay,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Następny fragment', onclick: () => o.onNext() }, icon('next')),
          o.onSkip ? h('button', { type: 'button', class: 'icon-btn skip', 'aria-label': 'Do przodu 30 sekund', onclick: () => o.onSkip(30) }, h('span', { class: 'skip-num' }, '+30')) : h('span'),
        ),
      ),
      h('p', { class: 'eyebrow' }, 'Tempo'),
      rates,
      voices ? h('p', { class: 'eyebrow' }, 'Głos') : null,
      voices,
      h(
        'div',
        { class: 'inline-actions ps-actions' },
        o.onShowText
          ? h('button', { type: 'button', class: 'btn secondary', onclick: () => { dialog.close(); o.onShowText(texts().item); } }, icon('note'), 'Pokaż w tekście')
          : null,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { dialog.close(); o.onClose(); } }, icon('close'), 'Zakończ słuchanie'),
      ),
      h('p', { class: 'eyebrow' }, 'Fragmenty'),
      list,
    );
    let shownIndex = -1;
    let sheetPlaying = null;
    sheet = {
      update(t) {
        if (sTitle.textContent !== t.label) sTitle.textContent = t.label;
        const ch = t.item.chapterLabel || o.title;
        if (sChapter.textContent !== ch) sChapter.textContent = ch;
        if (sheetPlaying !== state.playing) {
          sheetPlaying = state.playing;
          setPlayIcon(sPlay, state.playing);
        }
        if (range && !seeking) {
          range.value = String(Math.round(state.elapsed || 0));
          elapsedEl.textContent = clock(state.elapsed || 0);
        }
        leftEl.textContent = range ? `−${clock((state.total - (state.elapsed || 0)) / (state.rate || 1))}` : `Fragment ${state.index + 1} z ${items.length}`;
        if (shownIndex !== state.index) {
          shownIndex = state.index;
          for (const b of list.querySelectorAll('.ps-item')) b.toggleAttribute('aria-current', Number(b.dataset.index) === state.index);
        }
      },
    };
    dialog.addEventListener('close', () => {
      sheet = null;
      dialog.remove();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    sheet.update(texts());
    // Lista fragmentów przewija się sama do czytanego (w swoim polu, panel zostaje na górze).
    const currentItem = list.querySelector('[aria-current]');
    if (currentItem) list.scrollTop = currentItem.offsetTop - list.offsetTop - list.clientHeight / 2;
  }

  update({});
  return {
    update,
    open: openSheet,
    remove() {
      el.remove();
      document.querySelector('dialog.player-sheet')?.close();
      document.body.classList.remove('has-player');
    },
  };
}

// Otwiera panel odtwarzacza, jeśli lektor gra (np. z przycisku przy rozdziale).
export function openPlayer() {
  document.querySelector('.player .player-info')?.click();
}
