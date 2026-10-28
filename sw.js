// Service worker: aplikacja działa offline, a wydania odświeżają się z sieci.
const VERSION = 'v18';
const SHELL = `selflearn-shell-${VERSION}`;
const CONTENT = 'selflearn-content';
const FONTS = 'selflearn-fonts';
const META = 'selflearn-meta';
const META_URL = new URL('./__meta.json', self.registration.scope).href;
const SYNC_TAG = 'selflearn-dzien';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/main.js',
  './src/config.js',
  './src/dates.js',
  './src/store.js',
  './src/srs.js',
  './src/data.js',
  './src/ui.js',
  './src/calendar.js',
  './src/edition.js',
  './src/books.js',
  './src/prompt.js',
  './src/github.js',
  './src/views/onboarding.js',
  './src/views/today.js',
  './src/views/reading.js',
  './src/views/streak.js',
  './src/views/backup.js',
  './src/views/week.js',
  './src/views/deepen.js',
  './src/views/threads.js',
  './src/views/review.js',
  './src/views/favorites.js',
  './src/views/timeline.js',
  './src/favorites.js',
  './src/views/profile.js',
  './src/views/prepare.js',
  './src/look.js',
  './src/notify.js',
  './src/listen.js',
  './src/speech-text.js',
  './src/challenge.js',
  './src/chapters.js',
  './src/week.js',
  './src/deepen.js',
  './src/threads.js',
  './src/confidence.js',
  './src/offline.js',
  './src/exporters.js',
  './src/install.js',
  './assets/logo.svg',
  './assets/logo-192.png',
  './assets/logo-512.png',
  './assets/logo-badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('selflearn-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Nagrania lektora idą prosto do sieci: odtwarzacz pobiera je kawałkami (Range), a pamięć
  // service workera oddałaby cały plik naraz i iPhone nie mógłby przewijać.
  if (url.origin === location.origin && url.pathname.includes('/audio/')) return;

  // Wydania: najpierw sieć (świeże treści), w razie braku sieci – ostatnia kopia.
  if (url.origin === location.origin && url.pathname.includes('/content/')) {
    event.respondWith(networkFirst(event, request, CONTENT));
    return;
  }

  // Czcionki Google: raz pobrane, trzymane na stałe.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event, request, FONTS));
    return;
  }

  // Pliki aplikacji: od razu z pamięci, w tle aktualizacja na następne uruchomienie.
  // waitUntil pilnuje, żeby przeglądarka nie przerwała zapisu nowej wersji, gdy odpowiedź już poszła.
  if (url.origin === location.origin) {
    const update = fetchAndCache(request, SHELL);
    event.respondWith(cachedOr(request, SHELL, update));
    event.waitUntil(update.catch(() => {}));
  }
});

async function networkFirst(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request, { cache: 'no-cache' });
    if (fresh.ok) event.waitUntil(cache.put(request, fresh.clone()).catch(() => {}));
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok || fresh.type === 'opaque') event.waitUntil(cache.put(request, fresh.clone()).catch(() => {}));
  return fresh;
}

async function fetchAndCache(request, cacheName) {
  const res = await fetch(request);
  if (res.ok) await (await caches.open(cacheName)).put(request, res.clone());
  return res;
}

async function cachedOr(request, cacheName, update) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached || update;
}

// ---------- Przypomnienia w tle ----------
// Telefon (Chrome na Androidzie, aplikacja na ekranie głównym) co jakiś czas budzi service worker.
// Sprawdzamy wtedy, czy jest nowe wydanie i czy seria jest zagrożona. Stan zapisuje aplikacja (src/notify.js).

self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(dailyCheck());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './#dzis', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open) return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : c));
      return self.clients.openWindow(url);
    }),
  );
});

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

function daysWord(n) {
  return n === 1 ? 'dzień' : 'dni';
}

async function todaysHeadline(today) {
  try {
    const url = new URL(`./content/editions/${today}.json`, self.registration.scope).href;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    (await caches.open(CONTENT)).put(url, res.clone());
    const ed = await res.json();
    const top = (ed.news || []).find((n) => n.section === 'polska' && n.rank === 1) || (ed.news || [])[0];
    return top?.title || 'Nowe wydanie czeka.';
  } catch {
    return null;
  }
}

async function dailyCheck() {
  const cache = await caches.open(META);
  const res = await cache.match(META_URL);
  if (!res) return;
  const meta = await res.json();
  const n = meta.notify || {};
  if (!n.system) return;

  const now = new Date();
  const today = isoDate(now);
  const yesterday = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const minutes = now.getHours() * 60 + now.getMinutes();
  const days = Array.isArray(n.days) && n.days.length ? n.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(now.getDay()) || meta.activeOn === today) return;

  // Seria trwa, jeśli ostatni zaliczony dzień to wczoraj.
  const streak = meta.streakEnd === yesterday ? meta.streak || 0 : 0;
  const sent = meta.sent || {};
  const show = (title, body, tag) =>
    self.registration.showNotification(title, {
      body,
      tag,
      lang: 'pl',
      icon: new URL('./assets/logo-192.png', self.registration.scope).href,
      badge: new URL('./assets/logo-badge-96.png', self.registration.scope).href,
      data: { url: './#dzis' },
    });

  // Wieczór ustawiony wcześniej niż poranek nie może zablokować porannego przypomnienia
  // (ta sama zasada co morningWindowEnd w src/notify.js).
  const morningAt = toMinutes(n.morning);
  const eveningAt = n.eveningOn ? toMinutes(n.evening) : 24 * 60;
  const morningUntil = eveningAt > morningAt ? eveningAt : 24 * 60;
  if (sent.morning !== today && minutes >= morningAt && minutes < morningUntil) {
    const headline = await todaysHeadline(today);
    if (headline) {
      const tail = streak > 0 ? `Seria: ${streak} ${daysWord(streak)}. Nie przerywaj jej.` : '10–20 minut i dzień zaliczony.';
      await show('Wydanie na dziś jest gotowe', `${headline}\n${tail}`, 'selflearn-rano');
      sent.morning = today;
      if (n.badge !== false && self.navigator.setAppBadge) self.navigator.setAppBadge(1).catch(() => {});
    }
  }
  if (n.eveningOn && sent.evening !== today && minutes >= eveningAt) {
    if (streak > 0) await show(`Seria ${streak} ${daysWord(streak)} czeka na Ciebie`, 'Wystarczy rozgrzewka: 3 pytania z wczoraj, około minuty.', 'selflearn-wieczor');
    else await show('Minuta nauki przed snem?', 'Rozgrzewka z wczorajszej wiedzy zaczyna nową serię.', 'selflearn-wieczor');
    sent.evening = today;
  }
  await cache.put(META_URL, new Response(JSON.stringify({ ...meta, sent }), { headers: { 'Content-Type': 'application/json' } }));
}
