// Ankieta na start: imię, tematy, ciekawostki, czas dziennie, pora przypomnienia.
import { SECTIONS, SECTION_GROUPS, FACT_KINDS, DEFAULT_PROFILE } from '../config.js';
import { getState, update } from '../store.js';
import { getNotify, refreshReminders } from '../notify.js';
import { h, mount, icon, koiMark } from '../ui.js';

export function renderOnboarding(root, { onDone }) {
  const existing = getState().profile;
  const draft = structuredClone(existing || DEFAULT_PROFILE);
  let eveningOn = getNotify().eveningOn;
  let step = 0;

  const steps = [
    {
      render: () =>
        h(
          'div',
          { class: 'onb-hero' },
          koiMark(),
          h('h1', null, existing ? 'Zmieńmy ustawienia' : 'Dzień dobry w SelfLearn'),
          h(
            'p',
            { class: 'lead' },
            'Codziennie jedno wydanie na 10–20 minut: najważniejsze sprawy z Polski i świata, Twoje tematy, ciekawostki, książka tygodnia i krótki quiz. Zanim zaczniemy, pięć krótkich pytań.',
          ),
        ),
      next: 'Zaczynamy',
    },
    {
      render: () => {
        const input = h('input', {
          class: 'input',
          id: 'onb-name',
          type: 'text',
          autocomplete: 'given-name',
          placeholder: 'np. Marek',
          value: draft.name,
          maxlength: 30,
          oninput: (e) => {
            draft.name = e.target.value.trim();
          },
        });
        queueMicrotask(() => input.focus());
        return [
          h('h1', null, 'Jak masz na imię?'),
          h('p', { class: 'lead' }, 'Będzie w porannym powitaniu. Profil zostaje tylko na tym telefonie.'),
          h('div', { class: 'field' }, h('label', { for: 'onb-name' }, 'Imię'), input),
        ];
      },
      canNext: () => draft.name.length > 0,
    },
    {
      render: () => [
        h('h1', null, 'Co Cię interesuje?'),
        h('p', { class: 'lead' }, 'Polska i świat to zawsze top 5. Do tego wybierz działy, które chcesz czytać codziennie.'),
        multiChoice(
          SECTIONS,
          draft.sections,
          (ids) => {
            draft.sections = ids;
          },
          SECTION_GROUPS,
        ),
      ],
      canNext: () => draft.sections.length > 0,
    },
    {
      render: () => [
        h('h1', null, 'Jakie ciekawostki lubisz?'),
        h('p', { class: 'lead' }, 'Te pokażę w pierwszej kolejności. Quiz zapyta tylko o ciekawostki z tych rodzajów, a do tego o historię dnia, pojęcie i książkę.'),
        multiChoice(FACT_KINDS, draft.factKinds, (ids) => {
          draft.factKinds = ids;
        }),
      ],
      canNext: () => draft.factKinds.length > 0,
    },
    {
      render: () => [
        h('h1', null, 'Ile masz czasu dziennie?'),
        h('p', { class: 'lead' }, 'Wydanie dopasuje długość. Zawsze możesz rozwinąć więcej.'),
        segmented(
          [
            { value: 10, label: '10 min', sub: 'skrót' },
            { value: 15, label: '15 min', sub: 'standard' },
            { value: 20, label: '20 min', sub: 'pełne' },
          ],
          draft.minutes,
          (v) => {
            draft.minutes = v;
          },
        ),
      ],
    },
    {
      render: () => [
        h('h1', null, 'O której przypominać?'),
        h(
          'p',
          { class: 'lead' },
          'Wybierz porę na codzienne wydanie. W profilu dodasz przypomnienie do kalendarza albo włączysz powiadomienia.',
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'onb-time' }, 'Godzina przypomnienia'),
          h('input', {
            class: 'input',
            id: 'onb-time',
            type: 'time',
            value: draft.reminder,
            oninput: (e) => {
              draft.reminder = e.target.value || DEFAULT_PROFILE.reminder;
            },
          }),
        ),
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: eveningOn,
            onchange: (e) => {
              eveningOn = e.target.checked;
            },
          }),
          'Wieczorem przypomnij, jeśli seria dni jest zagrożona',
        ),
      ],
      next: existing ? 'Zapisz' : 'Otwórz pierwsze wydanie',
    },
  ];

  function render() {
    const s = steps[step];
    const nextBtn = h(
      'button',
      {
        class: 'btn',
        type: 'button',
        onclick: () => {
          if (s.canNext && !s.canNext()) return;
          if (step < steps.length - 1) {
            step += 1;
            render();
          } else {
            finish();
          }
        },
      },
      s.next || 'Dalej',
      icon('arrow'),
    );

    const refreshNext = () => {
      nextBtn.disabled = Boolean(s.canNext && !s.canNext());
    };

    const body = h('div', { class: 'onb', oninput: refreshNext, onclick: refreshNext },
      h(
        'div',
        { class: 'onb-steps', 'aria-label': `Krok ${step + 1} z ${steps.length}` },
        steps.map((_, i) => h('span', { class: i <= step ? 'on' : '' })),
      ),
      s.render(),
      h(
        'div',
        { class: 'onb-actions' },
        step > 0
          ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { step -= 1; render(); } }, icon('back'), 'Wstecz')
          : existing
            ? h('button', { class: 'btn ghost', type: 'button', onclick: () => onDone() }, 'Anuluj')
            : h('span'),
        nextBtn,
      ),
    );
    mount(root, body);
    refreshNext();
    window.scrollTo(0, 0);
  }

  function finish() {
    const notify = { ...getNotify(), morning: draft.reminder, eveningOn };
    update((st) => {
      st.profile = { ...draft, createdAt: existing?.createdAt || new Date().toISOString() };
      st.settings ||= {};
      st.settings.notify = notify;
    });
    refreshReminders();
    onDone();
  }

  render();
}

// Wybór wielu opcji. Gdy podasz grupy, opcje są pokazane pod nagłówkami grup.
function multiChoice(options, selected, onChange, groups = null) {
  const chosen = new Set(selected);
  const chip = (o) =>
    h(
      'button',
      {
        type: 'button',
        class: 'choice',
        'aria-pressed': chosen.has(o.id) ? 'true' : 'false',
        title: o.hint || null,
        onclick: (e) => {
          if (chosen.has(o.id)) chosen.delete(o.id);
          else chosen.add(o.id);
          e.currentTarget.setAttribute('aria-pressed', chosen.has(o.id) ? 'true' : 'false');
          onChange(options.map((x) => x.id).filter((id) => chosen.has(id)));
        },
      },
      o.label,
    );

  if (!groups) return h('div', { class: 'choices', role: 'group' }, options.map(chip));
  return h(
    'div',
    { class: 'choice-groups' },
    groups
      .map((g) => ({ g, items: options.filter((o) => o.group === g.id) }))
      .filter(({ items }) => items.length)
      .map(({ g, items }) =>
        h('div', { class: 'choice-group', role: 'group', 'aria-label': g.label }, h('p', { class: 'eyebrow' }, g.label), h('div', { class: 'choices' }, items.map(chip))),
      ),
  );
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  for (const o of options) {
    wrap.append(
      h(
        'button',
        {
          type: 'button',
          class: 'choice',
          role: 'radio',
          'aria-checked': o.value === value ? 'true' : 'false',
          onclick: (e) => {
            for (const b of wrap.children) b.setAttribute('aria-checked', 'false');
            e.currentTarget.setAttribute('aria-checked', 'true');
            onChange(o.value);
          },
        },
        h('strong', null, o.label),
        o.sub ? h('small', null, o.sub) : null,
      ),
    );
  }
  return wrap;
}

export { multiChoice };
