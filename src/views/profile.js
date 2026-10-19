// Profil: ustawienia wydania, przypomnienie, poziom (karp → smok), archiwum wydań, kopia danych.
import { SECTIONS, FACT_KINDS, LEVELS } from '../config.js';
import {
  getState,
  update,
  completedCount,
  streak,
  longestStreak,
  totalActiveDays,
  resetAll,
  exportJSON,
  importJSON,
  githubSettings,
  setGithubSettings,
} from '../store.js';
import { loadIndex } from '../data.js';
import { formatLong } from '../dates.js';
import { icsFile, googleCalendarUrl } from '../calendar.js';
import { checkAccess } from '../github.js';
import { h, mount, icon, toast, plural } from '../ui.js';
import { multiChoice, segmented } from './onboarding.js';

export async function renderProfile(root, { onReset, onChange, focus }) {
  let index = null;
  try {
    index = await loadIndex();
  } catch {
    index = null;
  }
  let confirmReset = false;

  function saveProfile(fn) {
    update((s) => fn(s.profile));
    toast('Zapisano');
    onChange?.();
  }

  function publishingSection() {
    const gh = githubSettings();
    return h(
      'section',
      { class: 'section', id: 'publikowanie' },
      h('h2', null, 'Publikowanie wydań'),
      h(
        'p',
        { class: 'muted', style: 'margin:0' },
        'Wydanie pisze czat AI (Claude, ChatGPT, Gemini) z dostępem do internetu. Aplikacja przygotuje dla niego polecenie, sprawdzi odpowiedź i ją opublikuje.',
      ),
      h('div', { class: 'inline-actions' }, h('a', { class: 'btn', href: '#przygotuj' }, 'Przygotuj wydanie', icon('arrow'))),
      h(
        'details',
        { open: gh.token ? null : true },
        h('summary', null, gh.token ? 'Token GitHuba: zapisany' : 'Publikowanie jednym przyciskiem (token GitHuba)'),
        h(
          'ol',
          { class: 'howto small' },
          h('li', null, 'Na github.com: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
          h('li', null, `Repository access: Only select repositories → ${gh.repo}.`),
          h('li', null, 'Permissions → Repository permissions → Contents: Read and write. Reszta bez zmian.'),
          h('li', null, 'Wygeneruj token, skopiuj go i wklej poniżej.'),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'gh-repo' }, 'Repozytorium'),
          h('input', { class: 'input', id: 'gh-repo', type: 'text', value: `${gh.owner}/${gh.repo}`, autocomplete: 'off', spellcheck: 'false' }),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'gh-token' }, 'Token'),
          h('input', { class: 'input', id: 'gh-token', type: 'password', placeholder: gh.token ? '•••••••• (zapisany)' : 'github_pat_…', autocomplete: 'off' }),
        ),
        h('p', { class: 'small muted', style: 'margin:0' }, 'Token zostaje tylko na tym telefonie i nie trafia do kopii danych.'),
        h(
          'div',
          { class: 'inline-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn secondary',
              onclick: async () => {
                const [owner, repo] = root.querySelector('#gh-repo').value.trim().split('/');
                const token = root.querySelector('#gh-token').value.trim() || gh.token;
                if (!owner || !repo) return toast('Wpisz repozytorium jako właściciel/nazwa.');
                if (!token) return toast('Wklej token.');
                setGithubSettings({ owner, repo, token });
                try {
                  await checkAccess(githubSettings());
                  toast('Token działa. Możesz publikować.');
                } catch (err) {
                  toast(err.message);
                }
                render();
              },
            },
            'Zapisz i sprawdź',
          ),
          gh.token
            ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { setGithubSettings({ token: '' }); toast('Token usunięty'); render(); } }, 'Usuń token')
            : null,
        ),
      ),
    );
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
      h('header', { class: 'masthead' }, h('p', { class: 'eyebrow' }, 'Profil i ustawienia'), h('h1', null, profile.name || 'Ty')),

      h(
        'section',
        { class: 'section', id: 'ustawienia' },
        h('h2', null, 'Twoje wydanie'),
        h('p', { class: 'muted', style: 'margin:0' }, 'Zmiany zapisują się od razu i działają już w dzisiejszym wydaniu.'),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'profile-name' }, 'Imię w powitaniu'),
          h('input', {
            class: 'input',
            id: 'profile-name',
            type: 'text',
            autocomplete: 'given-name',
            maxlength: 30,
            value: profile.name,
            onchange: (e) => {
              const name = e.target.value.trim();
              if (!name) {
                e.target.value = profile.name;
                toast('Imię nie może być puste');
                return;
              }
              saveProfile((p) => { p.name = name; });
              render();
            },
          }),
        ),
        h('h3', { class: 'group-title', style: 'margin-top:8px' }, 'Działy wiadomości'),
        multiChoice(SECTIONS, profile.sections, (ids) => {
          if (!ids.length) {
            toast('Zostaw co najmniej jeden dział');
            render();
            return;
          }
          saveProfile((p) => { p.sections = ids; });
        }),
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

      publishingSection(),

      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Postępy'),
        h(
          'div',
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
          { class: 'stats four' },
          h('div', { class: 'stat' }, h('strong', null, s), h('span', null, `${plural(s, 'dzień', 'dni', 'dni')} z rzędu`)),
          h('div', { class: 'stat' }, h('strong', null, longestStreak()), h('span', null, 'najdłuższa seria')),
          h('div', { class: 'stat' }, h('strong', null, totalActiveDays()), h('span', null, 'dni nauki łącznie')),
          h('div', { class: 'stat' }, h('strong', null, count), h('span', null, `${plural(count, 'wydanie', 'wydania', 'wydań')} za Tobą`)),
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
  if (focus) root.querySelector(`#${focus}`)?.scrollIntoView({ block: 'start' });
}
