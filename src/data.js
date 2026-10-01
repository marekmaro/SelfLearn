// Wydania leżą jako pliki JSON w content/. Generuje je codzienna rutyna (patrz CONTENT_GUIDE.md).
import { todayISO } from './dates.js';

const editions = new Map();
let indexPromise = null;

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Nie udało się pobrać ${url} (${res.status})`);
  return res.json();
}

export function loadIndex({ fresh = false } = {}) {
  if (!indexPromise || fresh) {
    indexPromise = getJSON('content/index.json').catch((err) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}

export async function loadEdition(date) {
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

// Wybiera wydanie do pokazania: dzisiejsze, a jeśli go jeszcze nie ma – najnowsze wcześniejsze.
export function pickDate(index, requested) {
  const dates = (index.editions || []).map((e) => e.date).sort().reverse();
  if (!dates.length) return null;
  if (requested && dates.includes(requested)) return requested;
  const today = todayISO();
  return dates.find((d) => d <= today) || dates[0];
}
