// Ulubione: wiadomości, ciekawostki i pojęcia oznaczone sercem oraz notatki z wieczorów.
// Można je przeszukać, przefiltrować, dopisać własną notatkę, otworzyć w wydaniu i wysłać drugiej osobie.
import { getState, setSavedNote, removeSaved, restoreSaved, updateEdition } from '../store.js';
import { formatLong, todayISO } from '../dates.js';
import { SECTIONS } from '../config.js';
import { editionHref } from '../data.js';
import { FAVORITE_TYPES, TYPE_LABELS, favoriteEntries, filterFavorites, countByType, groupByDate, favoriteText, favoritesText } from '../favorites.js';
import { h, mount, icon, sourceLinks, toast, shareOrCopy, plural } from '../ui.js';
import { favoritesMarkdown, downloadFile } from '../exporters.js';

const LONG_TEXT = 320;

export function renderFavorites(root) {
  let type = 'all';
  let query = '';
  const editing = new Set();
  const opened = new Set();

  const chipsEl = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Pokaż' });
  const listEl = h('div', { class: 'fav-list' });
  const summaryEl = h('p', { class: 'muted fav-summary' });
  const footEl = h('div', { class: 'fav-foot' });
  const search = h('input', {
    type: 'search',
    class: 'input',
    placeholder: 'Szukaj w ulubionych',
    'aria-label': 'Szukaj w ulubionych',
    enterkeyhint: 'search',
    oninput: (e) => {
      query = e.target.value;
      refresh();
    },
  });

  function all() {
    return favoriteEntries(getState());
  }

  function refresh() {
    const entries = all();
    const counts = countByType(entries);
    if (type !== 'all' && !counts[type]) type = 'all';
    const shown = filterFavorites(entries, { type, query });

    const days = groupByDate(entries).length;
    summaryEl.textContent = entries.length
      ? `${entries.length} ${plural(entries.length, 'wpis', 'wpisy', 'wpisów')} z ${days} ${plural(days, 'dnia', 'dni', 'dni')}`
      : '';

    chipsEl.replaceChildren(
      ...FAVORITE_TYPES.filter((t) => t.id === 'all' || counts[t.id]).map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': t.id === type ? 'true' : 'false',
            onclick: () => {
              type = t.id;
              refresh();
            },
          },
          t.label,
          h('span', { class: 'count' }, counts[t.id] || 0),
        ),
      ),
    );
    chipsEl.hidden = entries.length < 2;
    search.closest('.fav-search').hidden = entries.length < 2;

    if (!entries.length) {
      listEl.replaceChildren(emptyState());
    } else if (!shown.length) {
      listEl.replaceChildren(
        h('div', { class: 'empty' }, h('p', { style: 'margin:0' }, query ? `Nic nie pasuje do „${query.trim()}”.` : 'W tej grupie nic jeszcze nie ma.')),
      );
    } else {
      listEl.replaceChildren(...groupByDate(shown).map(dayGroup));
    }

    const sendAll = h(
      'button',
      {
        type: 'button',
        class: 'btn secondary',
        onclick: () => shareOrCopy({ title: 'Ulubione z SelfLearn', text: favoritesText(shown.length ? shown : entries) }),
      },
      icon('share'),
      query || type !== 'all' ? 'Wyślij te wpisy' : 'Wyślij wszystkie ulubione',
    );
    const toMarkdown = h(
      'button',
      {
        type: 'button',
        class: 'btn ghost',
        title: 'Plik do Obsidiana, Notion albo zwykłego edytora',
        onclick: () => {
          downloadFile(`selflearn-ulubione-${todayISO()}.md`, favoritesMarkdown(shown.length ? shown : entries), 'text/markdown');
          toast('Zapisano plik Markdown');
        },
      },
      icon('download'),
      'Zapisz jako Markdown',
    );
    footEl.replaceChildren(...(entries.length ? [h('div', { class: 'inline-actions' }, sendAll, toMarkdown)] : []));
  }

  function dayGroup(group) {
    return h(
      'section',
      { class: 'fav-day' },
      h(
        'div',
        { class: 'fav-day-head' },
        h('h2', null, formatLong(group.date)),
        h('a', { class: 'small', href: `#wydanie-${group.date}` }, 'Wydanie', icon('arrow')),
      ),
      h('ul', { class: 'list' }, group.items.map((e) => h('li', null, favCard(e)))),
    );
  }

  function favCard(e) {
    const section = e.section ? SECTIONS.find((s) => s.id === e.section)?.label : null;
    const isLong = e.text.length > LONG_TEXT;
    const isOpen = opened.has(e.key);
    const card = h(
      'article',
      { class: `card fav-card type-${e.type}` },
      h('p', { class: 'eyebrow' }, [TYPE_LABELS[e.type] || 'Wpis', section].filter(Boolean).join(' · ')),
      h('h3', null, e.title),
      e.text ? h('p', { class: `read${isLong && !isOpen ? ' clamp' : ''}` }, e.text) : null,
      isLong
        ? h(
            'button',
            {
              type: 'button',
              class: 'link-btn',
              onclick: () => {
                if (isOpen) opened.delete(e.key);
                else opened.add(e.key);
                refresh();
              },
            },
            isOpen ? 'Zwiń' : 'Pokaż całość',
          )
        : null,
      editing.has(e.key) ? noteEditor(e) : e.note ? h('div', { class: 'my-note' }, h('p', { class: 'eyebrow' }, 'Twoja notatka'), h('p', null, e.note)) : null,
      h(
        'div',
        { class: 'card-foot' },
        sourceLinks(e.sources),
        h(
          'div',
          { class: 'fav-actions' },
          editing.has(e.key)
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  class: 'icon-btn',
                  'aria-label': e.note ? 'Edytuj notatkę' : 'Dopisz notatkę',
                  title: e.note ? 'Edytuj notatkę' : 'Dopisz notatkę',
                  onclick: () => {
                    editing.add(e.key);
                    refresh();
                    listEl.querySelector(`textarea[data-key="${CSS.escape(e.key)}"]`)?.focus();
                  },
                },
                icon('note'),
              ),
          h('a', { class: 'icon-btn', href: editionHref(e.date, null, e.id), 'aria-label': 'Otwórz w wydaniu', title: 'Otwórz w wydaniu' }, icon('arrow')),
          h(
            'button',
            { type: 'button', class: 'icon-btn', 'aria-label': 'Wyślij', title: 'Wyślij', onclick: () => shareOrCopy({ title: e.title, text: favoriteText(e) }) },
            icon('share'),
          ),
          e.kind === 'saved'
            ? h(
                'button',
                { type: 'button', class: 'icon-btn', 'aria-label': 'Usuń z ulubionych', title: 'Usuń z ulubionych', onclick: () => remove(e) },
                icon('trash'),
              )
            : null,
        ),
      ),
    );
    return card;
  }

  function noteEditor(e) {
    const area = h('textarea', { class: 'input', rows: 3, placeholder: 'Co chcesz zapamiętać? Dlaczego to ważne dla Ciebie?', dataset: { key: e.key } }, e.note);
    const close = () => {
      editing.delete(e.key);
      refresh();
    };
    return h(
      'div',
      { class: 'note-edit' },
      h('label', { class: 'note-label' }, h('span', { class: 'eyebrow' }, 'Twoja notatka'), area),
      h(
        'div',
        { class: 'inline-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onclick: () => {
              const note = area.value.trim();
              if (e.kind === 'evening') {
                updateEdition(e.date, (p) => {
                  p.note = note;
                });
              } else {
                setSavedNote(e.key, note);
              }
              toast(note ? 'Notatka zapisana' : 'Notatka usunięta');
              close();
            },
          },
          'Zapisz',
        ),
        h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Anuluj'),
      ),
    );
  }

  function remove(e) {
    const entry = removeSaved(e.key);
    refresh();
    toast('Usunięte z ulubionych', {
      action: {
        label: 'Cofnij',
        onClick: () => {
          restoreSaved(e.key, entry);
          refresh();
        },
      },
    });
  }

  mount(
    root,
    h('header', { class: 'masthead' }, h('p', { class: 'eyebrow' }, 'Ulubione'), h('h1', null, 'To, co chcesz zapamiętać'), summaryEl),
    h('div', { class: 'fav-tools' }, h('label', { class: 'fav-search' }, icon('search'), search), chipsEl),
    listEl,
    footEl,
  );
  refresh();
}

function emptyState() {
  return h(
    'div',
    { class: 'empty fav-empty' },
    h('span', { class: 'fav-empty-icon' }, icon('heart')),
    h('p', { style: 'margin:0' }, 'Dotknij serca przy wiadomości, ciekawostce, wydarzeniu z historii albo pojęciu dnia, a trafi tutaj.'),
    h('p', { style: 'margin:0' }, 'Przy każdym wpisie możesz dopisać własną notatkę. Odpowiedzi na pytania na wieczór też zbierają się w tym miejscu.'),
    h('a', { class: 'btn secondary', href: '#dzis' }, 'Przejdź do wydania', icon('arrow')),
  );
}
