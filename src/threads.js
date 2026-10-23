// Wątki: długie tematy (ustawa w parlamencie, wojna, wybory), które wracają w kolejnych wydaniach.
// Wiadomość należy do wątku, gdy ma pole "thread" z jego nazwą. Bez DOM.

export const MAX_THREAD_NAME = 60;

// „Ustawy o aborcji” → „ustawy-o-aborcji” (do adresu #watek-…).
export function threadSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Wpisy wątków do content/index.json: nazwa, id wiadomości i jej tytuł.
export function editionThreads(edition) {
  return (Array.isArray(edition?.news) ? edition.news : [])
    .filter((n) => typeof n?.thread === 'string' && threadSlug(n.thread))
    .map((n) => ({ name: n.thread.trim(), item: n.id, title: n.title }));
}

// Wszystkie wątki z indeksu, od najświeższego. Nazwa wątku pochodzi z najnowszej wiadomości.
export function threadsFromIndex(index) {
  const bySlug = new Map();
  for (const e of index?.editions || []) {
    for (const t of e.threads || []) {
      const slug = threadSlug(t.name);
      if (!slug) continue;
      const thread = bySlug.get(slug) || { slug, name: t.name, items: [] };
      thread.items.push({ date: e.date, item: t.item, title: t.title });
      bySlug.set(slug, thread);
    }
  }
  const threads = [...bySlug.values()];
  for (const t of threads) {
    t.items.sort((a, b) => b.date.localeCompare(a.date));
    t.last = t.items[0].date;
    t.first = t.items[t.items.length - 1].date;
    t.days = new Set(t.items.map((i) => i.date)).size;
    t.name = (index.editions.find((e) => e.date === t.last)?.threads || []).find((x) => threadSlug(x.name) === t.slug)?.name || t.name;
  }
  return threads.sort((a, b) => b.last.localeCompare(a.last) || b.days - a.days);
}

// Nazwy wątków z ostatnich wydań do polecenia dnia, żeby czat używał tych samych nazw.
export function recentThreadNames(editions) {
  const names = new Map();
  for (const ed of editions || []) {
    for (const t of editionThreads(ed)) if (!names.has(threadSlug(t.name))) names.set(threadSlug(t.name), t.name);
  }
  return [...names.values()];
}
