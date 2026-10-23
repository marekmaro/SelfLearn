// Wątki: lista długich tematów i oś czasu jednego wątku (#watki, #watek-<nazwa>).
import { loadIndex, loadEdition, editionHref } from '../data.js';
import { formatShort, formatWeekday } from '../dates.js';
import { threadsFromIndex, threadSlug } from '../threads.js';
import { sectionLabel } from '../chapters.js';
import { h, mount, icon, plural } from '../ui.js';

const MAX_LOADED = 30;

export async function renderThreads(root, { slug = null } = {}) {
  let index = { editions: [] };
  try {
    index = await loadIndex();
  } catch {
    // Bez indeksu nie ma wątków do pokazania.
  }
  const threads = threadsFromIndex(index);
  const latest = index.editions[0]?.date;
  const thread = slug ? threads.find((t) => t.slug === slug) : null;
  if (slug && thread) return renderThread(root, thread, latest);
  mount(root, listView(threads, slug));
}

function listView(threads, missing) {
  return [
    h(
      'header',
      { class: 'masthead' },
      h('p', { class: 'eyebrow' }, 'Wątki'),
      h('h1', null, 'Tematy, które trwają'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Sprawy, które wracają w kolejnych wydaniach. Każdy wątek ma własną oś czasu, od najnowszej wiadomości wstecz.'),
    ),
    missing ? h('div', { class: 'banner' }, h('p', { style: 'margin:0' }, 'Nie ma takiego wątku. Poniżej wszystkie, które są.')) : null,
    threads.length
      ? h(
          'ol',
          { class: 'thread-list' },
          threads.map((t) =>
            h(
              'li',
              null,
              h(
                'a',
                { class: 'card thread-card', href: `#watek-${t.slug}` },
                h('h3', null, t.name),
                h('p', { class: 'read', style: 'margin:0' }, t.items[0].title),
                h('p', { class: 'small muted', style: 'margin:0' }, `${t.days} ${plural(t.days, 'dzień', 'dni', 'dni')} · ostatnio ${formatShort(t.last)}`),
              ),
            ),
          ),
        )
      : h('div', { class: 'empty' }, h('h2', null, 'Wątków jeszcze nie ma'), h('p', null, 'Pojawią się, gdy wiadomości o tej samej sprawie przyjdą w kolejnych wydaniach.')),
  ];
}

async function renderThread(root, thread, latest) {
  const items = thread.items.slice(0, MAX_LOADED);
  const editions = new Map(
    (await Promise.all([...new Set(items.map((i) => i.date))].map((d) => loadEdition(d).then((e) => [d, e]).catch(() => [d, null])))).filter(([, e]) => e),
  );
  const newsOf = (it) => (editions.get(it.date)?.news || []).find((n) => n.id === it.item);

  mount(
    root,
    h(
      'header',
      { class: 'masthead' },
      h('a', { class: 'day-step prev', href: '#watki' }, icon('back'), 'Wszystkie wątki'),
      h('p', { class: 'eyebrow' }, 'Wątek'),
      h('h1', null, thread.name),
      h(
        'p',
        { class: 'muted', style: 'margin:0' },
        thread.days > 1 ? `${thread.days} ${plural(thread.days, 'dzień', 'dni', 'dni')}, od ${formatShort(thread.first)} do ${formatShort(thread.last)}.` : `Na razie jeden dzień: ${formatShort(thread.last)}.`,
      ),
    ),
    h(
      'ol',
      { class: 'thread-items' },
      items.map((it) => {
        const n = newsOf(it);
        return h(
          'li',
          null,
          h('span', { class: 'thread-node', 'aria-hidden': 'true' }),
          h(
            'article',
            { class: 'card' },
            h('p', { class: 'eyebrow' }, `${formatWeekday(it.date)}, ${formatShort(it.date)}${n ? ` · ${sectionLabel(n.section)}` : ''}`),
            h('h3', null, it.title),
            n?.summary ? h('p', { class: 'read' }, n.summary) : null,
            h('a', { class: 'btn secondary', href: editionHref(it.date, latest, it.item) }, 'Otwórz w wydaniu', icon('arrow')),
          ),
        );
      }),
    ),
    thread.items.length > MAX_LOADED ? h('p', { class: 'small muted' }, `Pokazano ${MAX_LOADED} najnowszych z ${thread.items.length}.`) : null,
  );
}

// Odnośnik do wątku pod tytułem wiadomości.
export function threadLink(name, threads) {
  const slug = threadSlug(name);
  const days = threads.find((t) => t.slug === slug)?.days || 1;
  return h('a', { class: 'thread-link', href: `#watek-${slug}` }, icon('timeline'), name, days > 1 ? h('span', { class: 'muted' }, ` · ${days} ${plural(days, 'dzień', 'dni', 'dni')}`) : null);
}
