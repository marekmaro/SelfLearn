// Wydania leżą jako pliki JSON w content/. Mogą też być zapisane tylko na tym telefonie
// (przygotowane w zakładce „Przygotuj wydanie”).
import { todayISO } from './dates.js';
import { localEditions } from './store.js';
import { indexEntry } from './edition.js';

const editions = new Map();
let indexPromise = null;

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Nie udało się pobrać ${url} (${res.status})`);
  return res.json();
}

// Lista wydań: indeks z serwera + wydania z tego telefonu + dzisiejszy plik,
// gdyby ktoś dodał go bez aktualizacji indeksu.
export function loadIndex({ fresh = false } = {}) {
  if (!indexPromise || fresh) {
    indexPromise = buildIndex().catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

async function buildIndex() {
  const byDate = new Map();
  let remoteError = null;
  try {
    const remote = await getJSON('content/index.json');
    for (const e of remote.editions || []) byDate.set(e.date, e);
  } catch (err) {
    remoteError = err;
  }
  for (const ed of Object.values(localEditions())) {
    if (!byDate.has(ed.date)) byDate.set(ed.date, { ...indexEntry(ed), local: true });
  }
  const today = todayISO();
  if (!byDate.has(today)) {
    try {
      byDate.set(today, indexEntry(await loadEdition(today)));
    } catch {
      // Dzisiejszego wydania jeszcze nie ma.
    }
  }
  if (!byDate.size && remoteError) throw remoteError;
  return { editions: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)) };
}

export async function loadEdition(date) {
  const local = localEditions()[date];
  if (local) return local;
  if (!editions.has(date)) {
    editions.set(
      date,
      getJSON(`content/editions/${date}.json`).catch((err) => {
        editions.delete(date);
        throw err;
      }),
    );
  }
  return editions.get(date);
}

export function forgetEdition(date) {
  editions.delete(date);
  indexPromise = null;
}

export async function loadBooks() {
  return getJSON('content/books.json');
}

// Wybiera wydanie do pokazania: dzisiejsze, a jeśli go jeszcze nie ma – najnowsze wcześniejsze.
export function pickDate(index, requested) {
  const dates = (index.editions || []).map((e) => e.date).sort().reverse();
  if (!dates.length) return null;
  if (requested && dates.includes(requested)) return requested;
  const today = todayISO();
  return dates.find((d) => d <= today) || dates[0];
}

// Poprzednie wydanie (do rozgrzewki „Test z wczoraj”).
export function previousDate(index, date) {
  return (index.editions || [])
    .map((e) => e.date)
    .filter((d) => d < date)
    .sort()
    .pop() || null;
}

// Sąsiednie wydania do strzałek „poprzedni / następny dzień” nad wydaniem.
// latest to wydanie pokazywane pod #dzis (dzisiejsze albo najnowsze wcześniejsze).
export function neighborDates(index, date) {
  const dates = (index.editions || []).map((e) => e.date).sort();
  const i = dates.indexOf(date);
  return {
    prev: i > 0 ? dates[i - 1] : null,
    next: i >= 0 && i < dates.length - 1 ? dates[i + 1] : null,
    latest: pickDate(index, null),
  };
}

// Adres wydania: najnowsze otwiera się jako „Dziś”, starsze z archiwum.
export function editionHref(date, latest, item = null) {
  if (item) return `#wydanie-${date}/${item}`;
  return date === latest ? '#dzis' : `#wydanie-${date}`;
}
