// Cały stan użytkownika żyje w localStorage tego telefonu.
// Każda osoba ma własny telefon, więc ma też własny profil, postępy i powtórki.
import { todayISO, addDays } from './dates.js';
import { STREAK_MILESTONES, DEFAULT_REPO } from './config.js';
import { validateEdition } from './edition.js';

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

// Kopia danych: stan aplikacji i wydania zapisane tylko na tym telefonie.
// Token GitHuba celowo zostaje poza kopią, więc przy wczytywaniu zachowujemy ten, który już jest.
const BACKUP_FORMAT = 'selflearn-kopia';

export function exportJSON() {
  const copy = structuredClone(state);
  if (copy.settings?.github) delete copy.settings.github.token;
  return JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), state: copy, editions: localEditions() }, null, 2);
}

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Wczytuje kopię (także starszą, bez wydań). Zwraca, ile wydań przybyło i czy trzeba wkleić token.
export function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('To nie jest kopia SelfLearn: tekst nie jest poprawnym JSON-em.');
  }
  const incoming = data?.format === BACKUP_FORMAT ? data.state : data;
  const editions = data?.format === BACKUP_FORMAT && isPlainObject(data.editions) ? data.editions : {};
  if (!isPlainObject(incoming) || !isPlainObject(incoming.progress)) {
    throw new Error('To nie jest kopia SelfLearn.');
  }
  for (const key of ['deck', 'saved', 'activity', 'settings']) {
    if (incoming[key] !== undefined && !isPlainObject(incoming[key])) throw new Error(`Kopia jest uszkodzona (pole „${key}”).`);
  }
  if (incoming.profile !== undefined && incoming.profile !== null && !isPlainObject(incoming.profile)) {
    throw new Error('Kopia jest uszkodzona (pole „profile”).');
  }

  const token = state.settings?.github?.token || '';
  const next = { ...blank(), ...structuredClone(incoming) };
  if (token) {
    next.settings ||= {};
    next.settings.github = { ...(next.settings.github || {}), token };
  }
  state = next;
  save();

  let restored = 0;
  for (const ed of Object.values(editions)) {
    // Wczytujemy tylko wydania, które przechodzą tę samą kontrolę co przy przygotowaniu.
    if (!isPlainObject(ed) || validateEdition(ed).errors.length) continue;
    try {
      saveLocalEdition(ed);
      restored += 1;
    } catch {
      break; // Brak miejsca w pamięci telefonu – reszta wydań zostaje w kopii.
    }
  }
  return { editions: restored, tokenKept: Boolean(token), needsToken: !token && Boolean(incoming.settings?.github?.owner) };
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
