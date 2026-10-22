// Przypomnienia w trzech warstwach:
// 1. Kalendarz telefonu – działa zawsze, także na iPhonie i przy zamkniętej aplikacji.
// 2. Powiadomienia z aplikacji – service worker sam sprawdza w tle, czy jest nowe wydanie
//    i czy seria jest zagrożona (Chrome na Androidzie, aplikacja dodana do ekranu głównego).
// 3. Plakietka na ikonie – ile rzeczy czeka dziś (nauka dnia + powtórki).
import { getState, update, streak, isActive } from './store.js';
import { dueCards } from './srs.js';
import { todayISO, addDays } from './dates.js';

export const SYNC_TAG = 'selflearn-dzien';
export const META_CACHE = 'selflearn-meta';
export const META_URL = './__meta.json';

export const WEEK_DAYS = [
  { value: 1, label: 'Pn' },
  { value: 2, label: 'Wt' },
  { value: 3, label: 'Śr' },
  { value: 4, label: 'Cz' },
  { value: 5, label: 'Pt' },
  { value: 6, label: 'So' },
  { value: 0, label: 'Nd' },
];

export const DEFAULT_NOTIFY = {
  morning: '07:30',
  eveningOn: true,
  evening: '20:30',
  days: [1, 2, 3, 4, 5, 6, 0],
  system: false,
  background: false,
  badge: true,
};

export function getNotify() {
  const st = getState();
  return { ...DEFAULT_NOTIFY, morning: st.profile?.reminder || DEFAULT_NOTIFY.morning, ...(st.settings?.notify || {}) };
}

export function setNotify(patch) {
  update((s) => {
    s.settings ||= {};
    s.settings.notify = { ...getNotify(), ...patch };
    if (patch.morning && s.profile) s.profile.reminder = patch.morning;
  });
  refreshReminders();
}

export function toMinutes(time) {
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  return hh * 60 + (mm || 0);
}

// Wieczorne przypomnienie powinno być później niż poranne.
export function remindersOverlap(n) {
  return Boolean(n.eveningOn) && toMinutes(n.evening) <= toMinutes(n.morning);
}

// Do której minuty dnia może przyjść poranne przypomnienie (ta sama zasada jest w sw.js).
export function morningWindowEnd(n) {
  const evening = n.eveningOn ? toMinutes(n.evening) : 24 * 60;
  return evening > toMinutes(n.morning) ? evening : 24 * 60;
}

// Co potrafi ten telefon i ta przeglądarka.
export function capabilities() {
  const hasSW = 'serviceWorker' in navigator;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    notifications: hasSW && 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    background: hasSW && typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype,
    badge: 'setAppBadge' in navigator,
    installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    ios,
  };
}

// Service worker może nie istnieć (np. podgląd bez https) – wtedy nie czekamy w nieskończoność.
async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function enableSystem() {
  const caps = capabilities();
  if (!caps.notifications) return { ok: false, reason: 'unsupported' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };
  const reg = await registration();
  let background = false;
  if (reg && 'periodicSync' in reg) {
    try {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register(SYNC_TAG, { minInterval: 2 * 60 * 60 * 1000 });
        background = true;
      }
    } catch {
      background = false;
    }
  }
  setNotify({ system: true, background });
  return { ok: true, background };
}

export async function disableSystem() {
  const reg = await registration();
  try {
    await reg?.periodicSync?.unregister(SYNC_TAG);
  } catch {
    // Nie było rejestracji – nic do zrobienia.
  }
  setNotify({ system: false, background: false });
}

// Treść powiadomień – ta sama logika jest w sw.js (service worker nie importuje modułów).
export function morningText({ headline, streakDays }) {
  return {
    title: 'Wydanie na dziś jest gotowe',
    body: [headline, streakDays > 0 ? `Seria: ${streakDays} ${streakDays === 1 ? 'dzień' : 'dni'}. Nie przerywaj jej.` : '10–20 minut i dzień zaliczony.'].filter(Boolean).join('\n'),
  };
}

export function eveningText({ streakDays }) {
  return streakDays > 0
    ? { title: `Seria ${streakDays} ${streakDays === 1 ? 'dzień' : 'dni'} czeka na Ciebie`, body: 'Wystarczy rozgrzewka: 3 pytania z wczoraj, około minuty.' }
    : { title: 'Minuta nauki przed snem?', body: 'Rozgrzewka z wczorajszej wiedzy zaczyna nową serię.' };
}

export async function testNotification() {
  const { title, body } = morningText({ headline: 'Tak będzie wyglądać poranne przypomnienie.', streakDays: streak() });
  const options = { body, icon: 'assets/logo-192.png', badge: 'assets/logo-badge-96.png', tag: 'selflearn-test', lang: 'pl', data: { url: './#dzis' } };
  const reg = await registration();
  if (reg?.showNotification) return reg.showNotification(title, options);
  return new Notification(title, options);
}

// Stan dla service workera: kiedy przypominać i czy dziś już była nauka.
// Zapisywany w Cache Storage, bo service worker nie ma dostępu do localStorage.
export async function syncMeta() {
  if (!('caches' in window)) return;
  try {
    const today = todayISO();
    const s = streak(today);
    const streakEnd = isActive(today) ? today : isActive(addDays(today, -1)) ? addDays(today, -1) : null;
    const cache = await caches.open(META_CACHE);
    const old = await cache.match(META_URL);
    const prev = old ? await old.json() : {};
    const meta = {
      ...prev,
      notify: getNotify(),
      activeOn: isActive(today) ? today : null,
      streak: s,
      streakEnd,
      updatedAt: new Date().toISOString(),
    };
    await cache.put(META_URL, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Brak dostępu do pamięci podręcznej – powiadomienia w tle po prostu się nie pojawią.
  }
}

// Plakietka na ikonie aplikacji: dzisiejsza nauka (jeśli jeszcze nie było) + powtórki do zrobienia.
export function updateAppBadge() {
  if (!('setAppBadge' in navigator)) return;
  const n = getNotify();
  const count = n.badge ? (isActive() ? 0 : 1) + dueCards(getState().deck, todayISO()).length : 0;
  const op = count ? navigator.setAppBadge(count) : navigator.clearAppBadge();
  op?.catch?.(() => {});
}

export function refreshReminders() {
  updateAppBadge();
  syncMeta();
}
