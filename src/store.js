// Cały stan użytkownika żyje w localStorage tego telefonu.
// Każda osoba ma własny telefon, więc ma też własny profil, postępy i powtórki.
import { todayISO, addDays } from './dates.js';
import { STREAK_MILESTONES, DEFAULT_REPO } from './config.js';

const KEY = 'selflearn:v1';
const EDITIONS_KEY = 'selflearn:editions';
const MAX_LOCAL_EDITIONS = 30;

function blank() {
  return { profile: null, progress: {}, deck: {}, saved: {}, activity: {}, settings: {} };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch {
    // Brak dostępu do pamięci (tryb prywatny) – działamy tylko w tej sesji.
  }
  return blank();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // jw.
  }
}

export function getState() {
  return state;
}

export function update(fn) {
  fn(state);
  save();
}

export function resetAll() {
  state = blank();
  save();
}

// Kopia bez tokenu GitHuba: token zostaje tylko na tym telefonie.
export function exportJSON() {
  const copy = structuredClone(state);
  if (copy.settings?.github) delete copy.settings.github.token;
  return JSON.stringify(copy, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !('progress' in data)) {
    throw new Error('To nie jest plik kopii SelfLearn.');
  }
  state = { ...blank(), ...data };
  save();
}

// ---------- Postęp w wydaniach ----------

export function editionProgress(date) {
  return state.progress[date] || { chapter: null, done: [], quiz: {}, actionDone: false, note: '' };
}

export function updateEdition(date, fn) {
  update((s) => {
    const p = s.progress[date] || { chapter: null, done: [], quiz: {}, actionDone: false, note: '' };
    fn(p);
    s.progress[date] = p;
  });
}

export function completedCount() {
  return Object.values(state.progress).filter((p) => p.completedOn).length;
}

// ---------- Seria dni (jak w Duolingo) ----------
// Dzień liczy się do serii, gdy ukończysz wydanie albo rozgrzewkę z wczorajszej wiedzy.

function activeDays() {
  const days = new Set(Object.keys(state.activity || {}));
  for (const p of Object.values(state.progress)) if (p.completedOn) days.add(p.completedOn);
  return days;
}

export function isActive(date = todayISO()) {
  return activeDays().has(date);
}

// Zapisuje aktywność. Zwraca nową długość serii, jeśli właśnie osiągnięto kamień milowy.
export function markActive(reason, date = todayISO()) {
  const before = streak(date);
  const wasActive = isActive(date);
  update((s) => {
    s.activity ||= {};
    s.activity[date] ||= reason;
  });
  const after = streak(date);
  if (!wasActive && after > before && STREAK_MILESTONES.includes(after)) return after;
  return null;
}

// Seria = kolejne aktywne dni, licząc od dziś (albo od wczoraj, jeśli dziś jeszcze przed nami).
export function streak(today = todayISO()) {
  const days = activeDays();
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak() {
  const days = [...activeDays()].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function totalActiveDays() {
  return activeDays().size;
}

// Ostatnie 7 dni, kończąc na dziś, z zaznaczeniem aktywności.
export function weekActivity(today = todayISO()) {
  const days = activeDays();
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, active: days.has(date), isToday: date === today };
  });
}

// ---------- Wydania przygotowane na tym telefonie ----------

export function localEditions() {
  try {
    return JSON.parse(localStorage.getItem(EDITIONS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveLocalEdition(edition) {
  const all = { ...localEditions(), [edition.date]: edition };
  const dates = Object.keys(all).sort().reverse();
  for (const old of dates.slice(MAX_LOCAL_EDITIONS)) delete all[old];
  localStorage.setItem(EDITIONS_KEY, JSON.stringify(all));
}

export function removeLocalEdition(date) {
  const all = localEditions();
  delete all[date];
  try {
    localStorage.setItem(EDITIONS_KEY, JSON.stringify(all));
  } catch {
    // jw.
  }
}

// ---------- Publikowanie na GitHubie ----------

export function githubSettings() {
  return { ...DEFAULT_REPO, ...repoFromLocation(), ...(state.settings?.github || {}) };
}

export function setGithubSettings(patch) {
  update((s) => {
    s.settings ||= {};
    s.settings.github = { ...(s.settings.github || {}), ...patch };
  });
}

// Na GitHub Pages adres wygląda tak: https://<owner>.github.io/<repo>/
function repoFromLocation() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? { owner: m[1], repo } : {};
}

// ---------- Ulubione ----------

export function savedKey(date, id) {
  return `${date}:${id}`;
}

export function isSaved(date, id) {
  return Boolean(state.saved[savedKey(date, id)]);
}

export function toggleSaved(date, id, entry) {
  const key = savedKey(date, id);
  update((s) => {
    if (s.saved[key]) delete s.saved[key];
    else s.saved[key] = { ...entry, date, savedAt: new Date().toISOString() };
  });
  return Boolean(state.saved[key]);
}

// Własna notatka przy ulubionym wpisie.
export function setSavedNote(key, note) {
  update((s) => {
    if (s.saved[key]) s.saved[key].note = note;
  });
}

// Usuwa wpis i zwraca go, żeby dało się cofnąć usunięcie.
export function removeSaved(key) {
  const entry = state.saved[key];
  update((s) => {
    delete s.saved[key];
  });
  return entry;
}

export function restoreSaved(key, entry) {
  if (!entry) return;
  update((s) => {
    s.saved[key] = entry;
  });
}

export function savedCountFor(date) {
  return Object.keys(state.saved).filter((k) => k.startsWith(`${date}:`)).length;
}
