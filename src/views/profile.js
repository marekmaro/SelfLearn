// Profil: poziom (karp → smok), ustawienia, przypomnienie, archiwum wydań, kopia danych.
import { SECTIONS, FACT_KINDS, LEVELS } from '../config.js';
import { getState, update, completedCount, streak, resetAll, exportJSON, importJSON } from '../store.js';
import { loadIndex } from '../data.js';
import { formatLong } from '../dates.js';
import { icsFile, googleCalendarUrl } from '../calendar.js';
import { h, mount, icon, toast, plural } from '../ui.js';
import { multiChoice, segmented } from './onboarding.js';

export async function renderProfile(root, { onReset, onChange }) {
  let index = null;
  try {
    index = await loadIndex();
  } catch {
    index = null;
  }
  let confirmReset = false;

  function saveProfile(fn) {
    update((s) => fn(s.profile));
    onChange?.();
  }

  function render() {
    const profile = getState().profile;
    const count = completedCount();
    const levelIdx = LEVELS.reduce((acc, l, i) => (count >= l.min ? i : acc), 0);
    const level = LEVELS[levelIdx];
    const next = LEVELS[levelIdx + 1];
    const s = streak();
    const progress = getState().progress;

    mount(
      root,
      h('header', { class: 'masthead' }, h('p', { class: 'eyebrow' }, 'Profil'), h('h1', null, profile.name || 'Ty')),

      h(
        'section',
        { class: 'card level-card' },
        h('p', { class: 'eyebrow' }, 'Twój poziom'),
        h('p', { class: 'level-name', style: 'margin:0' }, level.name),
        h('div', { class: 'level-track', 'aria-hidden': 'true' }, LEVELS.map((_, i) => h('span', { class: i <= levelIdx ? 'on' : '' }))),
        h('p', { class: 'read', style: 'margin:0' }, level.text, next ? ` Następny poziom, „${next.name}”, po ${next.min} ${plural(next.min, 'wydaniu', 'wydaniach', 'wydaniach')}.` : ''),
        h(
          'p',
          { class: 'legend' },
          'Według chińskiej legendy karp, który płynie pod prąd Żółtej Rzeki i przeskoczy wodospad Smoczej Bramy, zmienia się w smoka. Każde ukończone wydanie to kolejny ruch płetwą.',
        ),
      ),

      h(
        'div',
        { class: 'stats', style: 'margin-top:12px' },
        h('div', { class: 'stat' }, h('strong', null, count), h('span', null, plural(count, 'wydanie', 'wydania', 'wydań'))),
        h('div', { class: 'stat' }, h('strong', null, s), h('span', null, `${plural(s, 'dzień', 'dni', 'dni')} serii`)),
        h('div', { class: 'stat' }, h('strong', null, Object.keys(getState().deck).length), h('span', null, 'w powtórkach')),
      ),

      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Tematy'),
        multiChoice(SECTIONS, profile.sections, (ids) => saveProfile((p) => { p.sections = ids.length ? ids : ['polska']; })),
        h('h3', { class: 'group-title', style: 'margin-top:8px' }, 'Ciekawostki najpierw z'),
        multiChoice(FACT_KINDS, profile.factKinds, (ids) => saveProfile((p) => { p.factKinds = ids; })),
        h('h3', { class: 'group-title', style: 'margin-top:8px' }, 'Czas dziennie'),
        segmented(
          [
            { value: 10, label: '10 min', sub: 'skrót' },
            { value: 15, label: '15 min', sub: 'standard' },
            { value: 20, label: '20 min', sub: 'pełne' },
          ],
          profile.minutes,
          (v) => saveProfile((p) => { p.minutes = v; }),
        ),
      ),

      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Przypomnienie'),
        h('p', { class: 'muted', style: 'margin:0' }, 'Codzienne wydarzenie w kalendarzu telefonu. Powiadomienie przyjdzie o wybranej godzinie, nawet gdy aplikacja jest zamknięta.'),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'reminder-time' }, 'Godzina'),
          h('input', {
            class: 'input',
            id: 'reminder-time',
            type: 'time',
            value: profile.reminder,
            onchange: (e) => {
              saveProfile((p) => { p.reminder = e.target.value || p.reminder; });
              render();
            },
          }),
        ),
        h(
          'div',
          { class: 'inline-actions' },
          h('a', { class: 'btn', href: googleCalendarUrl(profile.reminder), target: '_blank', rel: 'noopener noreferrer' }, icon('calendar'), 'Kalendarz Google'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn secondary',
              onclick: () => {
                const url = URL.createObjectURL(icsFile(profile.reminder));
                const a = h('a', { href: url, download: 'selflearn-przypomnienie.ics' });
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              },
            },
            icon('calendar'),
            'iPhone / Outlook (.ics)',
          ),
        ),
      ),

      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Archiwum wydań'),
        index?.editions?.length
          ? h(
              'ul',
              { class: 'list' },
              [...index.editions]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((e) =>
                  h(
                    'li',
                    { class: 'row' },
                    h(
                      'div',
                      null,
                      h('a', { href: `#wydanie-${e.date}`, class: 'date' }, formatLong(e.date)),
                      e.headline ? h('p', { class: 'small muted', style: 'margin:2px 0 0' }, e.headline) : null,
                    ),
                    progress[e.date]?.completedOn ? h('span', { class: 'pill nurt' }, icon('check'), 'Przeczytane') : null,
                  ),
                ),
            )
          : h('p', { class: 'muted' }, 'Archiwum pojawi się po wczytaniu wydań.'),
      ),

      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Dane'),
        h('p', { class: 'muted', style: 'margin:0' }, 'Postępy są zapisane tylko na tym telefonie. Kopia pozwala przenieść je na nowy telefon.'),
        h(
          'div',
          { class: 'inline-actions' },
          h('a', { class: 'btn secondary', href: '#ankieta' }, 'Wypełnij ankietę ponownie'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn secondary',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(exportJSON());
                  toast('Kopia skopiowana do schowka');
                } catch {
                  toast('Nie udało się skopiować. Spróbuj w innej przeglądarce.');
                }
              },
            },
            'Skopiuj kopię danych',
          ),
        ),
        h(
          'details',
          null,
          h('summary', { class: 'small', style: 'cursor:pointer;padding:8px 0' }, 'Wczytaj kopię danych'),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'import-data', class: 'small muted' }, 'Wklej skopiowaną kopię'),
            h('textarea', { id: 'import-data' }),
            h(
              'button',
              {
                type: 'button',
                class: 'btn secondary',
                onclick: () => {
                  const text = root.querySelector('#import-data').value;
                  try {
                    importJSON(text);
                    toast('Dane wczytane');
                    onChange?.();
                    render();
                  } catch (err) {
                    toast(err.message || 'To nie jest poprawna kopia.');
                  }
                },
              },
              'Wczytaj',
            ),
          ),
        ),
        confirmReset
          ? h(
              'div',
              { class: 'card' },
              h('p', { class: 'read', style: 'margin:0' }, 'Na pewno? Zniknie profil, postępy, powtórki i zeszyt z tego telefonu.'),
              h(
                'div',
                { class: 'inline-actions' },
                h('button', { type: 'button', class: 'btn danger', onclick: () => { resetAll(); onReset(); } }, icon('trash'), 'Tak, usuń wszystko'),
                h('button', { type: 'button', class: 'btn secondary', onclick: () => { confirmReset = false; render(); } }, 'Anuluj'),
              ),
            )
          : h('button', { type: 'button', class: 'btn ghost', style: 'justify-self:start', onclick: () => { confirmReset = true; render(); } }, 'Usuń dane z tego telefonu'),
      ),
    );
  }

  render();
}
