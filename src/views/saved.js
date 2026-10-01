// Zeszyt: zapisane karty i notatki z pytań na wieczór.
import { getState, update } from '../store.js';
import { formatShort } from '../dates.js';
import { SECTIONS } from '../config.js';
import { h, mount, icon, sourceLinks, toast } from '../ui.js';

const TYPE_LABELS = {
  news: 'Wiadomość',
  fact: 'Ciekawostka',
  history: 'Ten dzień w historii',
  concept: 'Pojęcie',
  book: 'Książka',
};

export function renderSaved(root) {
  function render() {
    const { saved, progress } = getState();
    const entries = Object.entries(saved).sort((a, b) => (b[1].savedAt || '').localeCompare(a[1].savedAt || ''));
    const notes = Object.entries(progress)
      .filter(([, p]) => p.note)
      .sort((a, b) => b[0].localeCompare(a[0]));

    mount(
      root,
      h('header', { class: 'masthead' }, h('p', { class: 'eyebrow' }, 'Zeszyt'), h('h1', null, 'To, co chcesz zapamiętać')),
      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Zapisane'),
        entries.length
          ? h('ul', { class: 'list' }, entries.map(([key, e]) => savedItem(key, e)))
          : h('div', { class: 'empty' }, h('p', null, 'Dotknij zakładki przy dowolnej karcie w wydaniu, a trafi tutaj.')),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Notatki z wieczorów'),
        notes.length
          ? h(
              'ul',
              { class: 'list' },
              notes.map(([date, p]) =>
                h(
                  'li',
                  { class: 'card' },
                  h('p', { class: 'eyebrow' }, formatShort(date)),
                  p.noteQuestion ? h('p', { class: 'muted', style: 'margin:0' }, p.noteQuestion) : null,
                  h('p', { class: 'read' }, p.note),
                ),
              ),
            )
          : h('div', { class: 'empty' }, h('p', null, 'Ostatni rozdział każdego wydania to pytanie na wieczór. Twoje odpowiedzi zbiorą się tutaj.')),
      ),
    );
  }

  function savedItem(key, e) {
    const section = e.section ? SECTIONS.find((s) => s.id === e.section)?.label : null;
    return h(
      'li',
      { class: 'card' },
      h('p', { class: 'eyebrow' }, [TYPE_LABELS[e.type] || 'Notatka', section, formatShort(e.date)].filter(Boolean).join(' · ')),
      h('h3', null, e.title),
      e.text ? h('p', { class: 'read' }, e.text) : null,
      h(
        'div',
        { class: 'card-foot' },
        sourceLinks(e.sources),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': 'Usuń z zeszytu',
            title: 'Usuń z zeszytu',
            onclick: () => {
              update((s) => {
                delete s.saved[key];
              });
              toast('Usunięte z zeszytu');
              render();
            },
          },
          icon('trash'),
        ),
      ),
    );
  }

  render();
}
