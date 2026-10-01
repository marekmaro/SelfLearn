// Service worker: aplikacja działa offline, a wydania odświeżają się z sieci.
const VERSION = 'v1';
const SHELL = `selflearn-shell-${VERSION}`;
const CONTENT = 'selflearn-content';
const FONTS = 'selflearn-fonts';

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
  './src/views/onboarding.js',
  './src/views/today.js',
  './src/views/review.js',
  './src/views/saved.js',
  './src/views/profile.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
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

  // Wydania: najpierw sieć (świeże treści), w razie braku sieci – ostatnia kopia.
  if (url.origin === location.origin && url.pathname.includes('/content/')) {
    event.respondWith(networkFirst(request, CONTENT));
    return;
  }

  // Czcionki Google: raz pobrane, trzymane na stałe.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }

  // Pliki aplikacji: od razu z pamięci, w tle aktualizacja na następne uruchomienie.
  if (url.origin === location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL));
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request, { cache: 'no-cache' });
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}
