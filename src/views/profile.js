// Profil: ustawienia wydania, wygląd, przypomnienia, publikowanie, poziom (karp → smok), archiwum (oś czasu), kopia danych.
import { SECTIONS, SECTION_GROUPS, FACT_KINDS, LEVELS } from '../config.js';
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
  markBackedUp,
} from '../store.js';
import { downloadBackup } from './backup.js';
import { formatShort, todayISO } from '../dates.js';
import { loadIndex, forgetEdition } from '../data.js';
import { icsFile, googleCalendarUrl } from '../calendar.js';
import { checkAccess } from '../github.js';
import { appearancePanel, applyLook } from '../look.js';
import { getNotify, setNotify, capabilities, enableSystem, disableSystem, testNotification, remindersOverlap, WEEK_DAYS } from '../notify.js';
import { h, mount, icon, toast, plural } from '../ui.js';
import { multiChoice, segmented } from './onboarding.js';
import { offlineSettings, setOfflineSettings, offlineStats, cachedEditionDates, datesToPrefetch, prefetchEditions, clearOfflineEditions, autoPrefetch, formatBytes } from '../offline.js';
import { ankiTSV, favoritesMarkdown, downloadFile } from '../exporters.js';
import { favoriteEntries } from '../favorites.js';

const PAGE_SECTIONS = [
  { id: 'ustawienia', label: 'Wydanie' },
  { id: 'wyglad', label: 'Wygląd' },
  { id: 'przypomnienia', label: 'Przypomnienia' },
  { id: 'publikowanie', label: 'Publikowanie' },
  { id: 'postepy', label: 'Postępy' },
  { id: 'archiwum', label: 'Archiwum' },
  { id: 'offline', label: 'Offline' },
  { id: 'dane', label: 'Dane' },
];

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
          h('li', null, 'Expiration: ustaw datę ważności, np. 90 dni. Po wygaśnięciu wygeneruj nowy token i wklej go tutaj.'),
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

  // Spis sekcji przypięty u góry: profil jest długi, więc łatwo przeskoczyć do potrzebnej części.
  function pageNav() {
    return h(
      'nav',
      { class: 'page-nav', 'aria-label': 'Sekcje profilu' },
      PAGE_SECTIONS.map((sec) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            onclick: () => {
              const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
              root.querySelector(`#${sec.id}`)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
            },
          },
          sec.label,
        ),
      ),
    );
  }

  function remindersSection() {
    const n = getNotify();
    const caps = capabilities();
    const saveNotify = (patch, message = 'Zapisano') => {
      setNotify(patch);
      toast(message);
      render();
      root.querySelector('#przypomnienia')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    };

    let status;
    if (!caps.notifications) {
      status = caps.ios
        ? 'Na iPhonie aplikacja internetowa nie może sama przypominać bez serwera. Tu najlepiej działa kalendarz.'
        : 'Ta przeglądarka nie obsługuje powiadomień. Użyj kalendarza.';
    } else if (caps.permission === 'denied') {
      status = 'Powiadomienia są zablokowane dla tej strony. Odblokujesz je w ustawieniach przeglądarki (ikona kłódki przy adresie).';
    } else if (n.system && n.background) {
      status = 'Włączone. Telefon kilka razy dziennie sprawdza w tle, czy jest nowe wydanie i czy seria jest zagrożona. Dokładny moment wybiera system, więc powiadomienie może przyjść trochę po wybranej godzinie.';
    } else if (n.system && caps.background && !caps.installed) {
      status = 'Włączone tylko częściowo: dodaj aplikację do ekranu głównego (menu ⋮ → „Dodaj do ekranu głównego”), otwórz ją stamtąd i włącz powiadomienia jeszcze raz. Wtedy telefon może sprawdzać w tle.';
    } else if (n.system && caps.background) {
      status = 'Włączone, ale telefon nie pozwolił jeszcze na sprawdzanie w tle. Zwykle zgadza się, gdy aplikacja jest używana regularnie. Do tego czasu pewniejszy jest kalendarz.';
    } else if (n.system) {
      status = 'Włączone, ale ta przeglądarka nie sprawdza w tle. Próbne powiadomienie zadziała, a codzienne przypomnienia daje kalendarz.';
    } else {
      status = 'Wyłączone. Najlepiej działają w Chrome na Androidzie, w aplikacji dodanej do ekranu głównego.';
    }

    const timeField = (id, label, value, disabled, onchange) =>
      h(
        'div',
        { class: 'field' },
        h('label', { for: id }, label),
        h('input', { class: 'input', id, type: 'time', value, disabled, onchange }),
      );

    return h(
      'section',
      { class: 'section', id: 'przypomnienia' },
      h('h2', null, 'Przypomnienia'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Rano o nowym wydaniu, wieczorem tylko wtedy, gdy seria jest zagrożona.'),
      h(
        'div',
        { class: 'time-row' },
        timeField('reminder-time', 'Rano', n.morning, false, (e) => e.target.value && saveNotify({ morning: e.target.value })),
        timeField('evening-time', 'Wieczorem', n.evening, !n.eveningOn, (e) => e.target.value && saveNotify({ evening: e.target.value })),
      ),
      remindersOverlap(n)
        ? h('p', { class: 'banner', style: 'margin:0' }, 'Wieczorne przypomnienie jest ustawione wcześniej niż poranne. Ustaw wieczór na później, żeby przypomnienia przychodziły we właściwej kolejności.')
        : null,
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked: n.eveningOn, onchange: (e) => saveNotify({ eveningOn: e.target.checked }) }),
        'Wieczorne przypomnienie o serii',
      ),
      h('p', { class: 'eyebrow' }, 'W które dni'),
      h(
        'div',
        { class: 'day-toggles', role: 'group', 'aria-label': 'Dni przypomnień' },
        WEEK_DAYS.map((d) =>
          h(
            'button',
            {
              type: 'button',
              class: 'choice day',
              'aria-pressed': n.days.includes(d.value) ? 'true' : 'false',
              onclick: () => {
                const days = n.days.includes(d.value) ? n.days.filter((x) => x !== d.value) : [...n.days, d.value];
                if (!days.length) return toast('Zostaw co najmniej jeden dzień');
                saveNotify({ days });
              },
            },
            d.label,
          ),
        ),
      ),

      h(
        'div',
        { class: 'card channel' },
        h('h3', null, icon('calendar'), 'Kalendarz w telefonie'),
        h(
          'p',
          { class: 'small muted', style: 'margin:0' },
          'Najpewniejszy sposób: przypomnienie przyjdzie o czasie, nawet gdy aplikacja jest zamknięta. Wieczorne wydarzenie przypomni o serii każdego wybranego dnia. Po zmianie godzin dodaj wydarzenia jeszcze raz.',
        ),
        h(
          'div',
          { class: 'inline-actions' },
          h('a', { class: 'btn', href: googleCalendarUrl('rano', n), target: '_blank', rel: 'noopener noreferrer' }, 'Google: rano'),
          n.eveningOn ? h('a', { class: 'btn secondary', href: googleCalendarUrl('wieczor', n), target: '_blank', rel: 'noopener noreferrer' }, 'Google: wieczór') : null,
          h(
            'button',
            {
              type: 'button',
              class: 'btn secondary',
              onclick: () => {
                const url = URL.createObjectURL(icsFile(n));
                const a = h('a', { href: url, download: 'selflearn-przypomnienia.ics' });
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              },
            },
            'iPhone / Outlook (.ics)',
          ),
        ),
      ),

      h(
        'div',
        { class: 'card channel' },
        h('h3', null, icon('bell'), 'Powiadomienia z aplikacji'),
        h('p', { class: 'small muted', style: 'margin:0', dataset: { notifyStatus: '' } }, status),
        caps.notifications && caps.permission !== 'denied'
          ? h(
              'div',
              { class: 'inline-actions' },
              n.system
                ? [
                    h('button', { type: 'button', class: 'btn secondary', onclick: () => testNotification().then(() => toast('Wysłane. Sprawdź pasek powiadomień.')).catch(() => toast('Nie udało się wysłać powiadomienia.')) }, 'Wyślij próbne'),
                    h('button', { type: 'button', class: 'btn ghost', onclick: async () => { await disableSystem(); toast('Powiadomienia wyłączone'); render(); } }, 'Wyłącz'),
                  ]
                : h(
                    'button',
                    {
                      type: 'button',
                      class: 'btn',
                      onclick: async () => {
                        const result = await enableSystem();
                        if (!result.ok) toast(result.reason === 'denied' ? 'Bez zgody na powiadomienia zostaje kalendarz.' : 'Ta przeglądarka nie obsługuje powiadomień.');
                        else toast(result.background ? 'Włączone. Telefon będzie sprawdzał w tle.' : 'Włączone. Zobacz opis poniżej.');
                        render();
                        root.querySelector('#przypomnienia')?.scrollIntoView({ block: 'start', behavior: 'instant' });
                      },
                    },
                    icon('bell'),
                    'Włącz powiadomienia',
                  ),
            )
          : null,
      ),
      caps.badge
        ? h(
            'label',
            { class: 'check' },
            h('input', { type: 'checkbox', checked: n.badge, onchange: (e) => saveNotify({ badge: e.target.checked }) }),
            'Liczba na ikonie aplikacji: dzisiejsza nauka i powtórki',
          )
        : null,
    );
  }

  function restoreBackup(text) {
    try {
      const result = importJSON(text);
      if (result.editions) forgetEdition('');
      applyLook();
      toast(
        [
          'Dane wczytane',
          result.editions ? `w tym ${result.editions} ${plural(result.editions, 'wydanie', 'wydania', 'wydań')} z telefonu` : '',
          result.needsToken ? 'token GitHuba wklej ponownie w „Publikowaniu”' : '',
        ]
          .filter(Boolean)
          .join(', ') + '.',
      );
      onChange?.();
      render();
    } catch (err) {
      toast(err.message || 'To nie jest poprawna kopia.');
    }
  }

  // Czytanie bez internetu: ile wydań jest na telefonie, pobieranie na zapas i sprzątanie.
  function offlineSection() {
    const settings = offlineSettings();
    const remote = (index?.editions || []).filter((e) => !e.local);
    const status = h('p', { class: 'small muted', style: 'margin:0', 'aria-live': 'polite' }, 'Sprawdzam, co jest na telefonie…');
    const refresh = async () => {
      const st = await offlineStats().catch(() => ({ supported: false }));
      if (!status.isConnected) return;
      status.textContent = st.supported
        ? `Na telefonie: ${st.count} z ${remote.length} ${plural(remote.length, 'wydania', 'wydań', 'wydań')} (${formatBytes(st.bytes)}).`
        : 'Ta przeglądarka nie pozwala zapisywać wydań na później. Otwarte wydania mogą działać offline po instalacji aplikacji.';
    };
    const getAll = h(
      'button',
      {
        type: 'button',
        class: 'btn secondary',
        onclick: async () => {
          if (navigator.onLine === false) {
            toast('Brak internetu. Spróbuj, gdy wróci sieć.');
            return;
          }
          const dates = datesToPrefetch(index, await cachedEditionDates(), { count: Infinity });
          if (!dates.length) {
            toast('Wszystkie wydania są już na telefonie');
            return;
          }
          getAll.disabled = true;
          const saved = await prefetchEditions(dates, { onProgress: (n, total) => (status.textContent = `Pobieram: ${n} z ${total}…`) });
          getAll.disabled = false;
          toast(saved === dates.length ? `Pobrano ${saved} ${plural(saved, 'wydanie', 'wydania', 'wydań')}` : `Pobrano ${saved} z ${dates.length}. Reszta, gdy wróci sieć.`);
          refresh();
        },
      },
      icon('download'),
      'Pobierz wszystkie wydania',
    );
    const section = h(
      'section',
      { class: 'section', id: 'offline' },
      h('h2', null, 'Bez internetu'),
      h('p', { class: 'muted', style: 'margin:0' }, 'Otwarte wydania zostają na telefonie i działają bez internetu, razem z quizem i powtórkami. Ostatnie wydania mogą też pobierać się same, na zapas, np. przed podróżą.'),
      status,
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: settings.auto,
          onchange: (e) => {
            setOfflineSettings({ auto: e.target.checked });
            toast(e.target.checked ? `Ostatnie ${settings.count} wydań będzie zawsze na telefonie` : 'Pobieranie na zapas wyłączone');
            if (e.target.checked) autoPrefetch(loadIndex).then(refresh, () => {});
          },
        }),
        `Trzymaj na telefonie ${settings.count} ostatnich wydań`,
      ),
      h(
        'div',
        { class: 'inline-actions' },
        getAll,
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost',
            onclick: async () => {
              const removed = await clearOfflineEditions();
              const back = offlineSettings().auto ? ' Ostatnie pobiorą się znowu przy następnym uruchomieniu.' : '';
              toast(removed ? `Usunięto ${removed} ${plural(removed, 'wydanie', 'wydania', 'wydań')} z pamięci telefonu.${back}` : 'Nie ma zapisanych wydań');
              refresh();
            },
          },
          icon('trash'),
          'Usuń zapisane wydania',
        ),
      ),
    );
    refresh();
    return section;
  }

  // Powtórki do Anki i ulubione do Markdowna (Obsidian, Notion, notatki).
  function exportCard() {
    const state = getState();
    const cards = Object.keys(state.deck || {}).length;
    const favorites = favoriteEntries(state).length;
    const stamp = todayISO();
    return h(
      'div',
      { class: 'card export-card' },
      h('p', { class: 'eyebrow' }, 'Eksport do innych aplikacji'),
      h(
        'div',
        { class: 'inline-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn secondary',
            disabled: !cards,
            onclick: () => {
              downloadFile(`selflearn-anki-${stamp}.txt`, ankiTSV(getState().deck));
              toast('Talia zapisana. W Anki: Plik → Importuj.');
            },
          },
          icon('download'),
          `Powtórki do Anki (${cards})`,
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn secondary',
            disabled: !favorites,
            onclick: () => {
              downloadFile(`selflearn-ulubione-${stamp}.md`, favoritesMarkdown(favoriteEntries(getState())), 'text/markdown');
              toast('Ulubione zapisane jako Markdown');
            },
          },
          icon('download'),
          `Ulubione do Markdowna (${favorites})`,
        ),
      ),
      h('p', { class: 'small muted', style: 'margin:0' }, 'Anki: plik tekstowy importuje się przez Plik → Importuj (pytanie z odpowiedziami na przodzie, wyjaśnienie z tyłu). Markdown otworzysz w Obsidianie, Notion albo zwykłym edytorze. Eksport niczego nie usuwa z aplikacji.'),
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
      pageNav(),

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
        multiChoice(
          SECTIONS,
          profile.sections,
          (ids) => {
            if (!ids.length) {
              toast('Zostaw co najmniej jeden dział');
              render();
              return;
            }
            saveProfile((p) => { p.sections = ids; });
          },
          SECTION_GROUPS,
        ),
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

      h('section', { class: 'section', id: 'wyglad' }, h('h2', null, 'Wygląd'), h('p', { class: 'muted', style: 'margin:0' }, 'Zmiany widać od razu. Każde z Was może mieć inny wygląd na swoim telefonie.'), appearancePanel()),

      remindersSection(),

      publishingSection(),

      h(
        'section',
        { class: 'section', id: 'postepy' },
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
        h('a', { class: 'btn secondary', href: '#tydzien', style: 'justify-self:start' }, 'Podsumowanie tygodnia', icon('arrow')),
      ),

      h(
        'section',
        { class: 'section', id: 'archiwum' },
        h('h2', null, 'Archiwum wydań'),
        index?.editions?.length
          ? h(
              'a',
              { class: 'row archive-link', href: '#dni' },
              h(
                'div',
                null,
                h('strong', null, 'Oś czasu'),
                h(
                  'p',
                  { class: 'small muted', style: 'margin:2px 0 0' },
                  `${index.editions.length} ${plural(index.editions.length, 'wydanie', 'wydania', 'wydań')}, ${
                    index.editions.filter((e) => progress[e.date]?.completedOn).length
                  } przeczytanych. Wróć do dowolnego dnia i przypomnij sobie, co było.`,
                ),
              ),
              icon('timeline'),
            )
          : h('p', { class: 'muted' }, 'Archiwum pojawi się po wczytaniu wydań.'),
      ),

      offlineSection(),

      h(
        'section',
        { class: 'section', id: 'dane' },
        h('h2', null, 'Dane'),
        h('p', { class: 'muted', style: 'margin:0' }, 'Postępy są zapisane tylko na tym telefonie. Kopia pozwala przenieść je na nowy telefon: obejmuje profil, postępy, powtórki, ulubione i wydania przygotowane na tym telefonie. Token GitHuba nie trafia do kopii, więc na nowym telefonie trzeba go wkleić ponownie.'),
        h('p', { class: 'small muted', style: 'margin:0' }, backupStatus(getState().settings || {})),
        h(
          'div',
          { class: 'inline-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: () => {
                downloadBackup();
                toast('Kopia zapisana do pliku');
                render();
              },
            },
            'Zapisz kopię do pliku',
          ),
          h('a', { class: 'btn secondary', href: '#ankieta' }, 'Wypełnij ankietę ponownie'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn secondary',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(exportJSON());
                  markBackedUp();
                  toast('Kopia skopiowana do schowka');
                } catch {
                  toast('Nie udało się skopiować. Spróbuj w innej przeglądarce.');
                }
              },
            },
            'Skopiuj kopię danych',
          ),
        ),
        exportCard(),
        h(
          'details',
          null,
          h('summary', { class: 'small', style: 'cursor:pointer;padding:8px 0' }, 'Wczytaj kopię danych'),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'import-file', class: 'small muted' }, 'Wybierz plik kopii'),
            h('input', {
              id: 'import-file',
              type: 'file',
              accept: '.json,application/json',
              onchange: async (e) => {
                const file = e.target.files?.[0];
                if (file) restoreBackup(await file.text());
              },
            }),
            h('label', { for: 'import-data', class: 'small muted' }, 'albo wklej skopiowaną kopię'),
            h('textarea', { id: 'import-data' }),
            h(
              'button',
              {
                type: 'button',
                class: 'btn secondary',
                onclick: () => restoreBackup(root.querySelector('#import-data').value),
              },
              'Wczytaj',
            ),
          ),
        ),
        confirmReset
          ? h(
              'div',
              { class: 'card' },
              h('p', { class: 'read', style: 'margin:0' }, 'Na pewno? Znikną profil, postępy, powtórki i ulubione z tego telefonu.'),
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
  const nav = root.querySelector('.page-nav');
  if (nav) document.documentElement.style.setProperty('--chapters-h', `${nav.offsetHeight}px`);
  if (focus) root.querySelector(`#${focus}`)?.scrollIntoView({ block: 'start' });
}

// Kiedy była ostatnia kopia i czy przeglądarka obiecała nie czyścić danych.
function backupStatus(settings) {
  const last = settings.lastBackup ? `Ostatnia kopia: ${formatShort(settings.lastBackup)}.` : 'Nie zapisano jeszcze kopii.';
  if (settings.persisted === true) return `${last} Przeglądarka nie usunie tych danych sama.`;
  if (settings.persisted === false) return `${last} Przeglądarka może kiedyś usunąć te dane, więc zapisuj kopię co tydzień.`;
  return last;
}
