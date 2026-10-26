// „Posłuchaj”: wydanie czytane na głos przez syntezator mowy telefonu.
// Działa bez internetu i bez kosztów. Odtwarzacz przewija wydanie za lektorem i podświetla czytaną kartę.
import { getState, update } from './store.js';
import { h, icon, toast } from './ui.js';

const RATES = [0.9, 1, 1.15, 1.3, 1.5];
const MAX_CHUNK = 220;
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let current = null;

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function isListening() {
  return Boolean(current);
}

function savedRate() {
  const r = getState().settings?.listen?.rate;
  return RATES.includes(r) ? r : 1;
}

// Głosy ładują się asynchronicznie (zwłaszcza w Chrome), więc chwilę na nie czekamy.
function loadVoices(timeout = 1500) {
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
}

function pickPolish(voices) {
  const pl = voices.filter((v) => /^pl([-_]|$)/i.test(v.lang));
  return pl.find((v) => v.localService) || pl[0] || null;
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

// items: [{ id, chapter, label, text }]; onItem(item) – wywoływane, gdy lektor zaczyna nowy fragment,
// onItemEnd(item) – gdy fragment został przeczytany do końca (bez przeskakiwania).
// onPosition({ id, chunk }) – przy każdym zdaniu, żeby po zamknięciu aplikacji wrócić w to samo miejsce;
// startAt – miejsce zapisane wcześniej przez onPosition.
// title – podpis odtwarzacza, endText – komunikat po przeczytaniu wszystkiego.
export async function startListening(items, { onItem, onItemEnd, onEnd, onPosition, startAt = null, title = 'Posłuchaj', endText = 'To wszystko na dziś. Quiz czeka w wydaniu.' } = {}) {
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

  const queue = items.flatMap((item, itemIndex) => splitText(item.text).map((text) => ({ itemIndex, text })));
  if (!queue.length) return;

  let pos = startIndex(queue, items, startAt);
  let playing = false;
  let token = 0;
  let rate = savedRate();
  let wakeLock = null;
  let lastItem = -1;

  const bar = h('div', { class: 'player', role: 'region', 'aria-label': 'Odtwarzacz wydania' });
  document.body.append(bar);
  document.body.classList.add('has-player');

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
      renderBar();
      toast('Czytanie przerwane. Spróbuj jeszcze raz.');
    };
    // Krótka pauza po cancel(): bez niej niektóre telefony gubią nową wypowiedź.
    setTimeout(() => {
      if (my === token && playing) speechSynthesis.speak(u);
    }, 30);
    renderBar();
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
    renderBar();
  }

  function jumpItem(delta) {
    const target = Math.min(items.length - 1, Math.max(0, queue[pos].itemIndex + delta));
    pos = queue.findIndex((c) => c.itemIndex === target);
    lastItem = -1;
    if (playing) speak();
    else {
      lastItem = target;
      onItem?.(items[target]);
      renderBar();
    }
  }

  function finish() {
    stop();
    if (endText) toast(endText);
    onEnd?.();
  }

  function stop() {
    playing = false;
    token += 1;
    speechSynthesis.cancel();
    keepAwake(false);
    document.removeEventListener('visibilitychange', onVisible);
    bar.remove();
    document.body.classList.remove('has-player');
    document.querySelector('.is-speaking')?.classList.remove('is-speaking');
    if (current === api) current = null;
  }

  function cycleRate() {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    update((s) => {
      s.settings ||= {};
      s.settings.listen = { ...(s.settings.listen || {}), rate };
    });
    if (playing) speak();
    else renderBar();
  }

  function renderBar() {
    const item = items[queue[pos].itemIndex];
    const progress = ((queue[pos].itemIndex + 1) / items.length) * 100;
    bar.replaceChildren(
      h('span', { class: 'player-progress', 'aria-hidden': 'true' }, h('span', { style: `width:${progress}%` })),
      h(
        'div',
        { class: 'player-info' },
        h('p', { class: 'eyebrow' }, `${title} · ${queue[pos].itemIndex + 1} z ${items.length}`),
        h('p', { class: 'player-title' }, item.label),
      ),
      h('button', { type: 'button', class: 'icon-btn player-close', 'aria-label': 'Zamknij odtwarzacz', onclick: stop }, icon('close')),
      h(
        'div',
        { class: 'player-controls' },
        h('button', { type: 'button', class: 'rate', 'aria-label': `Tempo czytania: ${rate}×`, onclick: cycleRate }, `${String(rate).replace('.', ',')}×`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Poprzedni fragment', onclick: () => jumpItem(-1) }, icon('prev')),
        h(
          'button',
          { type: 'button', class: 'icon-btn play', 'aria-label': playing ? 'Pauza' : 'Czytaj', onclick: () => (playing ? pause() : play()) },
          icon(playing ? 'pause' : 'play'),
        ),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Następny fragment', onclick: () => jumpItem(1) }, icon('next')),
        h('span', { class: 'rate-spacer', 'aria-hidden': 'true' }),
      ),
    );
  }

  // Po zablokowaniu ekranu albo przejściu do innej aplikacji telefon zwykle ucisza syntezator.
  // Po powrocie czytanie rusza od zdania, na którym się urwało (i ponownie blokuje wygaszanie ekranu).
  function onVisible() {
    if (document.visibilityState !== 'visible' || !playing) return;
    if (!speechSynthesis.speaking && !speechSynthesis.pending) speak();
    keepAwake(true);
  }
  document.addEventListener('visibilitychange', onVisible);

  const api = { stop };
  current = api;
  play();
}

// ---------- Nagranie lektora (MP3) ----------
// Gdy wydanie ma nagranie (scripts/make-audio.mjs), gra ono jak odtwarzacz muzyki: także przy zgaszonym
// ekranie i z przyciskami na ekranie blokady (Media Session). Bez nagrania zostaje głos telefonu.

export async function loadRecording(date) {
  try {
    const res = await fetch(`content/audio/${date}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const info = await res.json();
    return info?.url && Array.isArray(info.items) && info.items.length ? info : null;
  } catch {
    return null;
  }
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

// Wywołuj bezpośrednio w obsłudze dotknięcia: iPhone pozwala włączyć dźwięk tylko wtedy.
// startAt: { id, t } – miejsce zapisane wcześniej przez onPosition; onFail – gdy nagrania nie da się zagrać.
export function playRecording(info, items, { onItem, onItemEnd, onEnd, onPosition, onFail, startAt = null, title = 'Lektor', album = 'SelfLearn', endText = 'To wszystko na dziś. Quiz czeka w wydaniu.' } = {}) {
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

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = `${info.url}#t=${Math.max(0, startTime).toFixed(1)}`;
  audio.playbackRate = rate;

  const bar = playerBar({
    onClose: () => stop(),
    onRate: () => cycleRate(),
    onPrev: () => jump(-1),
    onNext: () => jump(1),
    onToggle: () => (audio.paused ? resume() : audio.pause()),
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

  function cycleRate() {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    audio.playbackRate = rate;
    update((s) => {
      s.settings ||= {};
      s.settings.listen = { ...(s.settings.listen || {}), rate };
    });
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
    const now = all[segmentAt(all, t)];
    if (now && !segs.some((s) => s.id === now.id)) {
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
    const i = Math.max(0, index);
    const total = Number.isFinite(audio.duration) ? audio.duration : info.duration;
    const left = segs.slice(i).reduce((sum, s) => sum + (s.end - Math.max(s.start, Math.min(s.end, pos()))), 0) / (audio.playbackRate || 1);
    bar.update({
      eyebrow: `${title} · ${i + 1} z ${segs.length} · ${clock(left)}`,
      label: segs[i].label,
      playing: !audio.paused,
      rate,
      progress: total ? (pos() / total) * 100 : 0,
    });
  }

  function setMetadata() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    const art = (size) => ({ src: new URL(`assets/logo-${size}.png`, document.baseURI).href, sizes: `${size}x${size}`, type: 'image/png' });
    navigator.mediaSession.metadata = new MediaMetadata({ title: segs[Math.max(0, index)].label, artist: 'SelfLearn', album, artwork: [art(192), art(512)] });
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
    bar.remove();
    document.querySelector('.is-speaking')?.classList.remove('is-speaking');
    if (current === api) current = null;
  }

  const api = { stop };
  current = api;
  mediaHandlers(true);
  index = -1;
  tick();
  resume();
}

function clock(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Pasek odtwarzacza nagrania: elementy zmieniają się w miejscu, żeby częste odświeżanie nie gubiło dotknięć.
function playerBar({ onClose, onRate, onPrev, onNext, onToggle }) {
  const fill = h('span');
  const eyebrow = h('p', { class: 'eyebrow' });
  const title = h('p', { class: 'player-title' });
  const rateBtn = h('button', { type: 'button', class: 'rate', onclick: onRate });
  const playBtn = h('button', { type: 'button', class: 'icon-btn play', onclick: onToggle });
  const el = h(
    'div',
    { class: 'player', role: 'region', 'aria-label': 'Odtwarzacz wydania' },
    h('span', { class: 'player-progress', 'aria-hidden': 'true' }, fill),
    h('div', { class: 'player-info' }, eyebrow, title),
    h('button', { type: 'button', class: 'icon-btn player-close', 'aria-label': 'Zamknij odtwarzacz', onclick: onClose }, icon('close')),
    h(
      'div',
      { class: 'player-controls' },
      rateBtn,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Poprzedni fragment', onclick: onPrev }, icon('prev')),
      playBtn,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Następny fragment', onclick: onNext }, icon('next')),
      h('span', { class: 'rate-spacer', 'aria-hidden': 'true' }),
    ),
  );
  document.body.append(el);
  document.body.classList.add('has-player');
  let shownPlaying = null;
  return {
    update({ eyebrow: e, label, playing, rate, progress }) {
      fill.style.width = `${Math.min(100, progress)}%`;
      if (eyebrow.textContent !== e) eyebrow.textContent = e;
      if (title.textContent !== label) title.textContent = label;
      const r = `${String(rate).replace('.', ',')}×`;
      if (rateBtn.textContent !== r) {
        rateBtn.textContent = r;
        rateBtn.setAttribute('aria-label', `Tempo czytania: ${rate}×`);
      }
      if (shownPlaying !== playing) {
        shownPlaying = playing;
        playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
        playBtn.setAttribute('aria-label', playing ? 'Pauza' : 'Słuchaj');
      }
    },
    remove() {
      el.remove();
      document.body.classList.remove('has-player');
    },
  };
}
