// Ulubione: zapisane wiadomości, ciekawostki i notatki z wieczorów jako jedna lista.
// Tu tylko logika (filtry, wyszukiwanie, tekst do udostępnienia), widok jest w views/favorites.js.
import { formatShort } from './dates.js';

export const FAVORITE_TYPES = [
  { id: 'all', label: 'Wszystko' },
  { id: 'news', label: 'Wiadomości' },
  { id: 'fact', label: 'Ciekawostki' },
  { id: 'history', label: 'Historia' },
  { id: 'concept', label: 'Pojęcia' },
  { id: 'book', label: 'Książki' },
  { id: 'evening', label: 'Wieczory' },
];

export const TYPE_LABELS = {
  news: 'Wiadomość',
  fact: 'Ciekawostka',
  history: 'Ten dzień w historii',
  concept: 'Pojęcie',
  book: 'Książka',
  evening: 'Pytanie na wieczór',
};

// Zapisane karty (state.saved) i notatki z wieczorów (state.progress[date].note), najnowsze dni na górze.
export function favoriteEntries(state) {
  const saved = Object.entries(state.saved || {}).map(([key, e]) => {
    const cut = key.indexOf(':');
    return {
      key,
      kind: 'saved',
      type: e.type || 'news',
      date: e.date || key.slice(0, cut),
      id: key.slice(cut + 1),
      section: e.section || null,
      title: e.title || '',
      text: e.text || '',
      note: e.note || '',
      sources: e.sources || [],
      savedAt: e.savedAt || '',
    };
  });
  const evenings = Object.entries(state.progress || {})
    .filter(([, p]) => p?.note)
    .map(([date, p]) => ({
      key: `${date}:evening`,
      kind: 'evening',
      type: 'evening',
      date,
      id: 'evening',
      section: null,
      title: p.noteQuestion || 'Pytanie na wieczór',
      text: '',
      note: p.note,
      sources: [],
      savedAt: '',
    }));
  return [...saved, ...evenings].sort((a, b) => b.date.localeCompare(a.date) || b.savedAt.localeCompare(a.savedAt));
}

// Wyszukiwanie bez polskich znaków: „zolw” znajdzie „żółw”.
export function fold(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function filterFavorites(entries, { type = 'all', query = '' } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (type !== 'all' && e.type !== type) return false;
    if (!words.length) return true;
    const hay = fold([e.title, e.text, e.note, e.section].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export function countByType(entries) {
  const counts = { all: entries.length };
  for (const e of entries) counts[e.type] = (counts[e.type] || 0) + 1;
  return counts;
}

// [{ date, items }] – kolejność dni i wpisów jak na wejściu.
export function groupByDate(entries) {
  const groups = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }
  return groups;
}

// Tekst jednego wpisu do wysłania drugiej osobie.
export function favoriteText(e) {
  const sources = (Array.isArray(e.sources) ? e.sources : [e.sources]).filter((s) => s?.url);
  return [
    e.title,
    e.text,
    e.note ? `Moja notatka: ${e.note}` : '',
    ...sources.slice(0, 2).map((s) => `${s.name || 'Źródło'}: ${s.url}`),
    `(z SelfLearn, ${formatShort(e.date)})`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Całe ulubione jako zwykły tekst, pogrupowane po dniach.
export function favoritesText(entries) {
  return groupByDate(entries)
    .map((g) => [`— ${formatShort(g.date)} —`, ...g.items.map((e) => favoriteText(e).replace(/\n\(z SelfLearn, [^)]*\)$/, ''))].join('\n\n'))
    .join('\n\n');
}
