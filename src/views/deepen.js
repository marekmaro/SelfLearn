// Arkusz „Pogłęb” otwierany z karty wydania.
import { getState, update } from '../store.js';
import { CHATS } from '../prompt.js';
import { DEEPEN_MODES, deepenPrompt, deepenUrl } from '../deepen.js';
import { h, icon, toast } from '../ui.js';

// labelled: przycisk z podpisem „Dopytaj” (na kartach wydania), bez niego sama ikona.
export function deepenButton(date, entry, { labelled = false } = {}) {
  return h(
    'button',
    {
      type: 'button',
      class: labelled ? 'act-btn deepen-btn' : 'icon-btn deepen-btn',
      'aria-label': 'Dopytaj: zapytaj czat AI o szczegóły',
      title: 'Dopytaj czat AI',
      onclick: () => openDeepenSheet(date, entry),
    },
    icon('spark'),
    labelled ? h('span', { class: 'act-label' }, 'Dopytaj') : null,
  );
}

export function openDeepenSheet(date, entry) {
  document.querySelector('dialog.sheet')?.remove();
  let mode = 'prosciej';
  let chat = CHATS.find((c) => c.id === getState().settings?.chat) || CHATS[0];

  const question = h('textarea', { id: 'deepen-question', rows: 3, placeholder: 'Np. Co to zmienia dla nas?' });
  const questionField = h('div', { class: 'field', hidden: true }, h('label', { for: 'deepen-question', class: 'small muted' }, 'O co chcesz zapytać?'), question);
  const go = h('button', { type: 'button', class: 'btn', onclick: () => ask() });
  const body = h('div', { class: 'deepen' });

  function render() {
    questionField.hidden = mode !== 'pytanie';
    go.replaceChildren(chat.url ? `Zapytaj ${chat.label}` : 'Skopiuj pytanie', icon(chat.url ? 'external' : 'check'));
    body.replaceChildren(
      h('p', { class: 'from' }, entry.title),
      h('p', { class: 'eyebrow', style: 'margin:0' }, 'Jak pogłębić'),
      h(
        'div',
        { class: 'choices', role: 'radiogroup', 'aria-label': 'Jak pogłębić' },
        DEEPEN_MODES.map((m) =>
          h('button', { type: 'button', class: 'choice', role: 'radio', 'aria-checked': m.id === mode ? 'true' : 'false', onclick: () => { mode = m.id; render(); } }, m.label),
        ),
      ),
      questionField,
      h('p', { class: 'eyebrow', style: 'margin:0' }, 'W którym czacie'),
      h(
        'div',
        { class: 'choices', role: 'radiogroup', 'aria-label': 'Czat' },
        CHATS.filter((c) => c.url).map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'choice',
              role: 'radio',
              'aria-checked': c.id === chat.id ? 'true' : 'false',
              onclick: () => {
                chat = c;
                update((s) => {
                  s.settings ||= {};
                  s.settings.chat = c.id;
                });
                render();
              },
            },
            c.label,
          ),
        ),
      ),
      go,
      h('p', { class: 'small muted', style: 'margin:0' }, chat.ask ? 'Pytanie otworzy się w nowym czacie i trafi też do schowka.' : 'Pytanie trafi do schowka. Wklej je w nowym czacie.'),
    );
  }

  async function ask() {
    if (mode === 'pytanie' && !question.value.trim()) {
      question.focus();
      toast('Wpisz pytanie.');
      return;
    }
    const prompt = deepenPrompt(entry, mode, { date, question: question.value });
    const { url, prefilled } = deepenUrl(chat, prompt);
    // Okno otwieramy od razu po dotknięciu, zanim przeglądarka uzna je za wyskakujące.
    if (url) window.open(url, '_blank', 'noopener');
    let copied = false;
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    } catch {
      // Schowek niedostępny – przy otwartym czacie z pytaniem to nie przeszkadza.
    }
    if (!prefilled) toast(copied ? `Pytanie skopiowane${url ? '. Wklej je w czacie.' : '.'}` : 'Nie udało się skopiować pytania.');
    dialog.close();
  }

  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-label': 'Pogłęb' },
    h('div', { class: 'sheet-head' }, h('h2', null, 'Pogłęb'), h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Zamknij')),
    body,
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  render();
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}
