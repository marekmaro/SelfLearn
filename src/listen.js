// „Posłuchaj”: wydanie czytane na głos przez syntezator mowy telefonu.
// Działa bez internetu i bez kosztów. Odtwarzacz przewija wydanie za lektorem i podświetla czytaną kartę.
import { getState, update } from './store.js';
import { h, icon, toast } from './ui.js';

const RATES = [0.9, 1, 1.15, 1.3, 1.5];
const MAX_CHUNK = 220;

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

// items: [{ id, chapter, label, text }]; onItem(item) – wywoływane, gdy lektor zaczyna nowy fragment,
// onItemEnd(item) – gdy fragment został przeczytany do końca (bez przeskakiwania).
// title – podpis odtwarzacza, endText – komunikat po przeczytaniu wszystkiego.
export async function startListening(items, { onItem, onItemEnd, onEnd, title = 'Posłuchaj', endText = 'To wszystko na dziś. Quiz czeka w wydaniu.' } = {}) {
  if (!speechSupported()) {
    toast('Ta przeglądarka nie umie czytać na głos.');
    return;
  }
  current?.stop();
  const voices = await loadVoices();
  const voice = pickPolish(voices);
  if (voices.length && !voice) {
    toast('Brak polskiego głosu w telefonie. Dodaj go w ustawieniach: „Zamiana tekstu na mowę”.');
    return;
  }

  const queue = items.flatMap((item, itemIndex) => splitText(item.text).map((text) => ({ itemIndex, text })));
  if (!queue.length) return;

  let pos = 0;
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

  const api = { stop };
  current = api;
  play();
}
