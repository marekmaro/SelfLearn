// Cały stan użytkownika żyje w localStorage tego telefonu.
// Każda osoba ma własny telefon, więc ma też własny profil, postępy i powtórki.
import { todayISO, addDays } from './dates.js';

const KEY = 'selflearn:v1';

function blank() {
  return { profile: null, progress: {}, deck: {}, saved: {} };
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

export function exportJSON() {
  return JSON.stringify(state, null, 2);
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

export function completedDays() {
  const days = new Set();
  for (const p of Object.values(state.progress)) {
    if (p.completedOn) days.add(p.completedOn);
  }
  return days;
}

export function completedCount() {
  return Object.values(state.progress).filter((p) => p.completedOn).length;
}

// Seria = kolejne dni z ukończonym wydaniem, licząc od dziś (albo od wczoraj,
// jeśli dzisiejsze wydanie jeszcze przed nami).
export function streak(today = todayISO()) {
  const days = completedDays();
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// ---------- Zeszyt ----------

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
