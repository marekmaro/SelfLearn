// „Przygotuj wydanie”: polecenie dla czatu AI → wklejenie odpowiedzi → sprawdzenie → publikacja.
import { SECTIONS, SECTION_GROUPS, MAIN_SECTIONS } from '../config.js';
import { loadIndex, loadEdition, loadBooks, forgetEdition } from '../data.js';
import { todayISO, addDays, isISODate, formatLong } from '../dates.js';
import { getState, update, saveLocalEdition, githubSettings } from '../store.js';
import { bookForDate, BOOK_DAYS } from '../books.js';
import { projectInstructions, dailyMessage, fullPrompt, usedMaterial, CHATS } from '../prompt.js';
import { validateEdition, extractJSON, cleanEdition, describeEdition } from '../edition.js';
import { publishEdition, newFileUrl } from '../github.js';
import { h, mount, icon, toast } from '../ui.js';
import { multiChoice, segmented } from './onboarding.js';

const DRAFT_KEY = 'selflearn:draft';

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeDraft(patch) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...readDraft(), ...patch }));
  } catch {
    // Brak miejsca – szkic po prostu się nie zapisze.
  }
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} skopiowane`);
    return true;
  } catch {
    toast('Nie udało się skopiować. Rozwiń „Pokaż polecenie” i zaznacz tekst ręcznie.');
    return false;
  }
}

// Zbiera wszystko, czego czat potrzebuje na dany dzień.
async function buildContext(date, sections) {
  let index = { editions: [] };
  try {
    index = await loadIndex({ fresh: true });
  } catch {
    // Offline: polecenie powstanie bez listy poprzednich tematów.
  }
  const before = index.editions.map((e) => e.date).filter((d) => d < date).sort().reverse();
  const recent = (await Promise.all(before.slice(0, 3).map((d) => loadEdition(d).catch(() => null)))).filter(Boolean);
  const previous = recent[0] || null;
  const exists = index.editions.some((e) => e.date === date);

  let bookInfo = null;
  try {
    bookInfo = bookForDate(await loadBooks(), date);
  } catch {
    bookInfo = null;
  }
  let bookHistory = [];
  if (bookInfo && bookInfo.day > 1) {
    const weekDates = Array.from({ length: bookInfo.day - 1 }, (_, i) => addDays(date, -(bookInfo.day - 1 - i)));
    const eds = await Promise.all(weekDates.filter((d) => before.includes(d)).map((d) => loadEdition(d).catch(() => null)));
    bookHistory = eds
      .filter((ed) => ed?.book?.bookId === bookInfo.book.id)
      .map((ed) => ({ day: ed.book.day, ideaTitle: ed.book.ideaTitle }));
  }

  const used = usedMaterial(index.editions, date);
  return { date, sections, bookInfo, recent, previous, bookHistory, used, exists };
}

function defaultSections(latest) {
  const fromProfile = getState().profile?.sections || [];
  const fromLatest = (latest?.news || []).map((n) => n.section);
  const set = new Set([...MAIN_SECTIONS, ...fromProfile, ...fromLatest]);
  return SECTIONS.map((s) => s.id).filter((id) => set.has(id));
}

export async function renderPrepare(root, { onChange }) {
  const draft = readDraft();
  let date = isISODate(draft.date) && draft.date >= todayISO() ? draft.date : todayISO();
  let mode = getState().settings?.promptMode || 'projekt';
  let chat = CHATS.find((c) => c.id === getState().settings?.chat) || CHATS[0];
  let parts = getState().settings?.promptParts || chat.parts;
  let sections = getState().settings?.generateSections || null;
  let ctx = null;
  let parsed = null;
  let check = null;
  let fixes = [];
  let publishState = null;
  let acceptMissing = false;

  async function refreshContext() {
    if (!sections) {
      let latest = null;
      try {
        const index = await loadIndex();
        if (index.editions[0]) latest = await loadEdition(index.editions[0].date);
      } catch {
        latest = null;
      }
      sections = defaultSections(latest);
    }
    ctx = { ...(await buildContext(date, sections)), parts };
    render();
  }

  function saveSettings(patch) {
    update((s) => {
      s.settings ||= {};
      Object.assign(s.settings, patch);
    });
  }

  function render() {
    const gh = githubSettings();
    const promptText = ctx ? (mode === 'projekt' ? dailyMessage(ctx) : fullPrompt(ctx)) : 'Przygotowuję polecenie…';
    const setParts = (v) => {
      parts = v;
      saveSettings({ promptParts: v });
      if (ctx) ctx = { ...ctx, parts: v };
      render();
    };

    mount(
      root,
      h(
        'header',
        { class: 'masthead' },
        h('p', { class: 'eyebrow' }, 'Przygotuj wydanie'),
        h('h1', null, date === todayISO() ? 'Wydanie na dziś' : formatLong(date)),
        h(
          'p',
          { class: 'read intro' },
          'Wydanie napisze za Ciebie czat AI z dostępem do internetu. Ty kopiujesz polecenie, wklejasz odpowiedź, a aplikacja ją sprawdza i publikuje.',
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'prep-date' }, 'Na dzień'),
          h('input', {
            class: 'input',
            id: 'prep-date',
            type: 'date',
            value: date,
            onchange: (e) => {
              if (!isISODate(e.target.value)) return;
              date = e.target.value;
              writeDraft({ date });
              parsed = null;
              check = null;
              publishState = null;
              ctx = null;
              render();
              refreshContext();
            },
          }),
        ),
        ctx?.exists ? h('p', { class: 'banner' }, 'Wydanie na ten dzień już istnieje. Nowe je zastąpi.') : null,
      ),

      // ---------- Krok 1 ----------
      h(
        'section',
        { class: 'section step' },
        h('h2', null, h('span', { class: 'step-num' }, '1'), 'Skopiuj polecenie'),
        h('p', { class: 'muted', style: 'margin:0' }, 'Wybierz czat z dostępem do internetu. Polecenie i wskazówki dopasują się do niego.'),
        h(
          'div',
          { class: 'choices', role: 'radiogroup', 'aria-label': 'Czat AI' },
          CHATS.map((c) =>
            h(
              'button',
              {
                type: 'button',
                class: 'choice',
                role: 'radio',
                'aria-checked': c.id === chat.id ? 'true' : 'false',
                onclick: () => {
                  chat = c;
                  saveSettings({ chat: c.id });
                  setParts(c.parts);
                },
              },
              c.label,
            ),
          ),
        ),
        h('ul', { class: 'tips small' }, chat.tips.map((t) => h('li', null, t))),
        segmented(
          [
            { value: 'projekt', label: 'Projekt', sub: 'zasady raz, potem krótko' },
            { value: 'calosc', label: 'Całość', sub: 'wszystko w jednym' },
          ],
          mode,
          (v) => {
            mode = v;
            saveSettings({ promptMode: v });
            render();
          },
        ),
        segmented(
          [
            { value: 1, label: 'Jedna', sub: 'odpowiedź' },
            { value: 2, label: 'Dwie', sub: 'części, gdy czat ucina' },
          ],
          parts,
          setParts,
        ),
        mode === 'projekt'
          ? h(
              'ol',
              { class: 'howto' },
              h(
                'li',
                null,
                h('strong', null, 'Raz: '),
                `wklej stałe zasady do instrukcji projektu (${chat.id === 'gemini' ? 'w Gemini: Gem' : chat.id === 'perplexity' ? 'w Perplexity: Space' : 'np. projekt „SelfLearn”'}).`,
                h('div', { class: 'inline-actions' }, h('button', { type: 'button', class: 'btn secondary', onclick: () => copy(projectInstructions(), 'Instrukcje') }, 'Kopiuj stałe zasady')),
              ),
              h(
                'li',
                null,
                h('strong', null, 'Codziennie: '),
                parts === 2 ? 'nowy czat w projekcie, wklej polecenie dnia, a po pierwszej części napisz „dalej”.' : 'nowy czat w projekcie i wklej polecenie dnia.',
                h(
                  'div',
                  { class: 'inline-actions' },
                  h('button', { type: 'button', class: 'btn', disabled: !ctx, onclick: () => copy(dailyMessage(ctx), 'Polecenie dnia') }, 'Kopiuj polecenie dnia'),
                ),
              ),
            )
          : h(
              'div',
              { class: 'inline-actions' },
              h('button', { type: 'button', class: 'btn', disabled: !ctx, onclick: () => copy(fullPrompt(ctx), 'Polecenie') }, 'Kopiuj całe polecenie'),
            ),
        parts === 2 && mode !== 'projekt' ? h('p', { class: 'small muted', style: 'margin:0' }, 'Po pierwszej części napisz w czacie „dalej”, żeby dostać drugą.') : null,
        chat.url
          ? h(
              'div',
              { class: 'inline-actions' },
              h('a', { class: 'btn ghost', href: chat.url, target: '_blank', rel: 'noopener noreferrer' }, `Otwórz ${chat.label}`, icon('external')),
            )
          : null,
        h(
          'details',
          null,
          h('summary', { class: 'small' }, 'Działy w wydaniu'),
          h('p', { class: 'small muted' }, 'Polska i świat są zawsze. Zaznacz działy, które czyta któreś z Was. Zostaną zapamiętane.'),
          multiChoice(
            SECTIONS.filter((s) => !MAIN_SECTIONS.includes(s.id)),
            sections || [],
            (ids) => {
              sections = [...MAIN_SECTIONS, ...ids];
              saveSettings({ generateSections: sections });
              if (ctx) ctx = { ...ctx, sections };
            },
            SECTION_GROUPS,
          ),
        ),
        h(
          'details',
          null,
          h('summary', { class: 'small' }, 'Pokaż polecenie'),
          h('textarea', { class: 'mono', id: 'prep-prompt', readonly: true, rows: 10 }, promptText),
        ),
        ctx?.bookInfo
          ? h('p', { class: 'small muted', style: 'margin:0' }, `Książka tygodnia: „${ctx.bookInfo.book.title}”, dzień ${ctx.bookInfo.day} z ${BOOK_DAYS}.`)
          : null,
      ),

      // ---------- Krok 2 ----------
      h(
        'section',
        { class: 'section step' },
        h('h2', null, h('span', { class: 'step-num' }, '2'), 'Wklej odpowiedź'),
        h(
          'p',
          { class: 'muted', style: 'margin:0' },
          parts === 2
            ? 'Skopiuj z czatu oba bloki (przycisk kopiowania w rogu bloku) i wklej je poniżej, jeden pod drugim.'
            : 'Skopiuj z czatu cały blok z wydaniem (przycisk kopiowania w rogu bloku) i wklej poniżej.',
        ),
        h('textarea', {
          class: 'mono',
          id: 'prep-answer',
          rows: 8,
          placeholder: '{"date": "…", "news": [ … ] }',
          oninput: (e) => writeDraft({ answer: e.target.value }),
        }, readDraft().answer || ''),
        h('div', { class: 'inline-actions' }, h('button', { type: 'button', class: 'btn', onclick: runCheck }, 'Sprawdź')),
        checkView(),
      ),

      // ---------- Krok 3 ----------
      parsed && check && !check.errors.length
        ? h(
            'section',
            { class: 'section step' },
            h('h2', null, h('span', { class: 'step-num' }, '3'), 'Opublikuj'),
            missingNotice(),
            !canPublish()
              ? null
              : gh.token
              ? h(
                  'div',
                  { class: 'inline-actions' },
                  h('button', { type: 'button', class: 'btn', disabled: publishState === 'pending', onclick: publish }, publishState === 'pending' ? 'Publikuję…' : 'Opublikuj dla obojga'),
                )
              : h(
                  'div',
                  { class: 'card' },
                  h('p', { class: 'read', style: 'margin:0' }, 'Bez tokenu GitHuba: skopiuj plik, a na otwartej stronie GitHuba wklej go i kliknij „Commit changes”. Strona zaktualizuje się w 1–2 minuty.'),
                  h(
                    'div',
                    { class: 'inline-actions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'btn',
                        onclick: () => {
                          // Kopiowanie i otwarcie karty w tym samym dotknięciu, inaczej telefon zablokuje nową kartę.
                          copy(`${JSON.stringify(parsed, null, 2)}\n`, 'Plik wydania');
                          window.open(newFileUrl(gh, date), '_blank', 'noopener');
                        },
                      },
                      'Skopiuj plik i otwórz GitHub',
                      icon('external'),
                    ),
                  ),
                  h('p', { class: 'small muted', style: 'margin:0' }, 'Publikowanie jednym przyciskiem włączysz w profilu, w sekcji „Publikowanie”.'),
                ),
            h(
              'div',
              { class: 'inline-actions', hidden: !canPublish() },
              h('button', { type: 'button', class: 'btn secondary', onclick: saveLocal }, 'Tylko na tym telefonie'),
              publishState === 'done' || publishState === 'local' ? h('a', { class: 'btn ghost', href: `#wydanie-${date}` }, 'Otwórz wydanie', icon('arrow')) : null,
            ),
            publishState === 'done'
              ? h('p', { class: 'banner' }, 'Opublikowane. Za 1–2 minuty wydanie zobaczycie oboje. Na tym telefonie jest już teraz.')
              : null,
            publishState === 'local' ? h('p', { class: 'banner' }, 'Zapisane na tym telefonie. Druga osoba go nie zobaczy, dopóki nie opublikujesz.') : null,
          )
        : null,
    );
  }

  // Brak części wydania (np. quizu albo książki) nie blokuje publikacji, ale wymaga świadomej zgody.
  function canPublish() {
    return !check?.missing?.length || acceptMissing;
  }

  function missingNotice() {
    if (!check?.missing?.length) return null;
    return h(
      'div',
      { class: 'banner' },
      h('p', { style: 'margin:0' }, `W wydaniu brakuje: ${check.missing.join(', ')}. Najlepiej poproś czat o uzupełnienie. Możesz też opublikować wydanie bez tych części.`),
      h(
        'label',
        { class: 'check', style: 'margin-top:8px' },
        h('input', {
          type: 'checkbox',
          checked: acceptMissing,
          onchange: (e) => {
            acceptMissing = e.target.checked;
            render();
          },
        }),
        'Wiem, publikuję mimo braków',
      ),
    );
  }

  function checkView() {
    if (!check) return null;
    if (check.fatal) return h('div', { class: 'check-result bad' }, h('p', null, check.fatal));
    return h(
      'div',
      { class: `check-result ${check.errors.length ? 'bad' : 'ok'}` },
      check.errors.length
        ? h('p', null, h('strong', null, `Do poprawki: ${check.errors.length}. `), 'Wklej czatowi poniższą listę z prośbą o poprawienie wydania.')
        : h('p', null, h('strong', null, 'Wydanie wygląda dobrze. '), describeEdition(parsed)),
      fixes.length ? h('p', { class: 'small' }, `Poprawione automatycznie: ${fixes.join('; ')}.`) : null,
      check.errors.length ? h('ul', null, check.errors.slice(0, 12).map((e) => h('li', null, e))) : null,
      check.errors.length
        ? h('button', { type: 'button', class: 'btn secondary', onclick: () => copy(`Popraw w wydaniu:\n- ${check.errors.join('\n- ')}\nOdpowiedz całym poprawionym wydaniem w jednym bloku json.`, 'Lista poprawek') }, 'Kopiuj listę poprawek')
        : null,
      check.warnings.length ? h('details', null, h('summary', { class: 'small' }, `Uwagi (${check.warnings.length})`), h('ul', { class: 'small' }, check.warnings.map((w) => h('li', null, w)))) : null,
    );
  }

  function runCheck() {
    const text = root.querySelector('#prep-answer').value;
    publishState = null;
    try {
      parsed = extractJSON(text);
    } catch (err) {
      parsed = null;
      check = { fatal: err.message, errors: [], warnings: [] };
      render();
      return;
    }
    acceptMissing = false;
    const truncated = Boolean(parsed?.__truncated);
    try {
      ({ edition: parsed, fixes } = cleanEdition(parsed));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('To nie jest wydanie. Odpowiedź czatu powinna zawierać obiekt JSON z polami „date” i „news”.');
      if (!parsed.date) parsed.date = date;
      check = validateEdition(parsed);
    } catch (err) {
      parsed = null;
      check = { fatal: `Nie udało się sprawdzić odpowiedzi: ${err.message}`, errors: [], warnings: [] };
      render();
      return;
    }
    if (parsed.date !== date) {
      check.errors.unshift(`Data w odpowiedzi (${parsed.date}) różni się od wybranej (${date}). Zmień datę wyżej albo poproś czat o poprawkę.`);
    }
    if (!parsed.facts && !parsed.quiz && Array.isArray(parsed.news) && parsed.news.length) {
      check.errors.unshift('To dopiero pierwsza część (same wiadomości). Napisz w czacie „dalej” i wklej drugą część pod pierwszą.');
    } else if (truncated) {
      check.errors.unshift('Ostatni blok jest ucięty. Napisz czatowi „dokończ” i wklej brakujący fragment albo całą odpowiedź jeszcze raz.');
    }
    render();
    root.querySelector('.check-result')?.scrollIntoView({ block: 'nearest' });
  }

  function saveLocal() {
    try {
      saveLocalEdition(parsed);
    } catch {
      toast('Brak miejsca na telefonie. Usuń stare wydania albo opublikuj na GitHubie.');
      return;
    }
    forgetEdition(date);
    publishState = 'local';
    writeDraft({ answer: '' });
    toast('Zapisane na tym telefonie');
    render();
    onChange?.();
  }

  async function publish() {
    publishState = 'pending';
    render();
    try {
      await publishEdition(githubSettings(), parsed);
      try {
        saveLocalEdition(parsed); // od razu widoczne tutaj, zanim GitHub Pages się przebuduje
      } catch {
        // Brak miejsca lokalnie nie szkodzi: wydanie i tak jest już na GitHubie.
      }
      forgetEdition(date);
      publishState = 'done';
      writeDraft({ answer: '' });
      toast('Opublikowane');
    } catch (err) {
      publishState = null;
      toast(err.message || 'Publikacja się nie udała.');
    }
    render();
    onChange?.();
  }

  render();
  await refreshContext();
}
