// Czytanie bez internetu: ostatnie wydania pobierają się z wyprzedzeniem do tej samej pamięci,
// z której korzysta service worker (sw.js, „selflearn-content”). Otwarte wydania trafiają tam i tak,
// a to pobieranie dokłada te, których jeszcze nie było na ekranie, np. przed podróżą.
import { todayISO } from './dates.js';
import { getState, update } from './store.js';

export const CONTENT_CACHE = 'selflearn-content';
export const DEFAULT_OFFLINE = { auto: true, count: 7 };
const EDITION_PATH = /\/content\/editions\/(\d{4}-\d{2}-\d{2})\.json$/;

const hasCaches = () => typeof caches !== 'undefined';

export function offlineSettings() {
  return { ...DEFAULT_OFFLINE, ...(getState().settings?.offline || {}) };
}

export function setOfflineSettings(patch) {
  update((s) => {
    s.settings ||= {};
    s.settings.offline = { ...offlineSettings(), ...patch };
  });
}

// Adres taki sam, jak przy zwykłym otwarciu wydania (fetch względem strony), żeby kopia się zgadzała.
export function contentUrl(path) {
  return new URL(path, document.baseURI).href;
}

export function editionUrl(date) {
  return contentUrl(`content/editions/${date}.json`);
}

// Które wydania dociągnąć: najnowsze `count` (do dziś włącznie), bez tych już zapisanych
// i bez przygotowanych na tym telefonie (te i tak są w pamięci aplikacji).
export function datesToPrefetch(index, cached, { count = DEFAULT_OFFLINE.count, today = todayISO() } = {}) {
  const have = new Set(cached);
  return (index?.editions || [])
    .filter((e) => !e.local && e.date <= today)
    .map((e) => e.date)
    .sort()
    .reverse()
    .slice(0, count)
    .filter((d) => !have.has(d));
}

export async function cachedEditionDates() {
  if (!hasCaches()) return new Set();
  const cache = await caches.open(CONTENT_CACHE);
  const dates = new Set();
  for (const req of await cache.keys()) {
    const m = new URL(req.url).pathname.match(EDITION_PATH);
    if (m) dates.add(m[1]);
  }
  return dates;
}

// Kopia z pamięci, gdy nie ma sieci, a service worker jeszcze nie działa (np. pierwsze uruchomienie po instalacji).
export async function cachedResponse(url) {
  if (!hasCaches()) return null;
  try {
    const cache = await caches.open(CONTENT_CACHE);
    return (await cache.match(new URL(url, document.baseURI).href, { ignoreSearch: true })) || null;
  } catch {
    return null;
  }
}

let running = null;

// Pobiera wydania po kolei (bez zalewania sieci). Zwraca liczbę zapisanych.
export function prefetchEditions(dates, { onProgress } = {}) {
  if (!hasCaches() || !dates.length) return Promise.resolve(0);
  const work = (running || Promise.resolve()).then(async () => {
    const cache = await caches.open(CONTENT_CACHE);
    let saved = 0;
    for (const date of dates) {
      try {
        const res = await fetch(editionUrl(date), { cache: 'no-cache' });
        if (res.ok) {
          await cache.put(editionUrl(date), res);
          saved += 1;
        }
      } catch {
        break; // Sieć zniknęła w trakcie: reszta poczeka na następny raz.
      }
      onProgress?.(saved, dates.length);
    }
    return saved;
  });
  running = work.catch(() => 0);
  return work;
}

export async function offlineStats() {
  if (!hasCaches()) return { supported: false, count: 0, bytes: 0 };
  const cache = await caches.open(CONTENT_CACHE);
  let count = 0;
  let bytes = 0;
  for (const req of await cache.keys()) {
    if (!EDITION_PATH.test(new URL(req.url).pathname)) continue;
    count += 1;
    const res = await cache.match(req);
    bytes += res ? (await res.blob()).size : 0;
  }
  return { supported: true, count, bytes };
}

export async function clearOfflineEditions() {
  if (!hasCaches()) return 0;
  const cache = await caches.open(CONTENT_CACHE);
  let removed = 0;
  for (const req of await cache.keys()) {
    if (EDITION_PATH.test(new URL(req.url).pathname) && (await cache.delete(req))) removed += 1;
  }
  return removed;
}

// Po starcie aplikacji, gdy jest sieć i chwila spokoju: dociągnij brakujące z ostatnich wydań.
export async function autoPrefetch(loadIndex) {
  const settings = offlineSettings();
  if (!settings.auto || !hasCaches() || navigator.onLine === false) return 0;
  const dates = datesToPrefetch(await loadIndex(), await cachedEditionDates(), { count: settings.count });
  return prefetchEditions(dates);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
