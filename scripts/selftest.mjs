// Sprawdza, czy aplikacja poradzi sobie z odpowiedziami różnych czatów AI:
// znaczniki cytowań i linki z utm (ChatGPT), przypisy [1] (Perplexity), linki przekierowujące (Gemini),
// wydanie w dwóch częściach, przecinki na końcu list i ucięta odpowiedź.
// Użycie: node scripts/selftest.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { extractJSON, cleanEdition, validateEdition } from '../src/edition.js';
import { projectInstructions, dailyMessage, CHATS } from '../src/prompt.js';
import { recurrence } from '../src/calendar.js';
import { neighborDates, editionHref } from '../src/data.js';
import { favoriteEntries, filterFavorites, groupByDate, countByType, favoriteText } from '../src/favorites.js';
import { grade } from '../src/srs.js';
import { getState, update, resetAll, exportJSON, importJSON, saveLocalEdition, localEditions, setGithubSettings, backupDue, markBackedUp, snoozeBackup, backupFileName } from '../src/store.js';
import { buildChapters, buildWarmup, firstSentence, estimateMinutes } from '../src/chapters.js';
import { weekEnd, weekDates, weekBannerDue, weekSummary, weekQuiz } from '../src/week.js';
import { deepenPrompt, deepenUrl, DEEPEN_MODES } from '../src/deepen.js';
import { threadSlug, editionThreads, threadsFromIndex, recentThreadNames } from '../src/threads.js';
import { indexEntry } from '../src/edition.js';
import { morningWindowEnd, remindersOverlap } from '../src/notify.js';
import { safePath } from './serve.mjs';
import { join } from 'node:path';

// Pamięć przeglądarki na czas testów (store.js zapisuje do localStorage).
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const latest = readdirSync('content/editions').filter((f) => f.endsWith('.json')).sort().pop();
const base = JSON.parse(readFileSync(`content/editions/${latest}`, 'utf8'));
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok     ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`BŁĄD   ${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const fence = (obj) => `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
const check = (text) => {
  const { edition, fixes } = cleanEdition(extractJSON(text));
  return { edition, fixes, ...validateEdition(edition) };
};

test('ChatGPT: znaczniki cytowań, utm, liczby jako tekst i odpowiedź literą', () => {
  const ed = structuredClone(base);
  ed.news[0].summary += ' citeturn0search1';
  ed.news[1].summary += ' citeturn0news3turn0search7';
  ed.news[2].why = `${ed.news[2].why} 【4†source】`;
  ed.news[0].sources[0].url += '?utm_source=chatgpt.com';
  ed.news[0].rank = '1';
  ed.quiz[0].answer = 'c';
  const r = check(`Oto wydanie na dziś:\n\n${fence(ed)}\n\nDaj znać, czy coś poprawić.`);
  assert(!r.errors.length, r.errors.join('; '));
  assert(!/cite|【|/.test(JSON.stringify(r.edition.news)), 'zostały znaczniki cytowań');
  assert(!r.edition.news[0].sources[0].url.includes('utm_'), 'został parametr utm');
  assert(r.edition.news[0].rank === 1, 'rank nie jest liczbą');
  assert(r.edition.quiz[0].answer === 2, 'odpowiedź „c” nie zamieniła się na 2');
  assert(r.fixes.length >= 4, `za mało poprawek: ${r.fixes.join('; ')}`);
});

test('Perplexity: przypisy [1][2] w tekście', () => {
  const ed = structuredClone(base);
  ed.news[3].summary = `${ed.news[3].summary.replace(/\.$/, '')}[1][2].`;
  const r = check(fence(ed));
  assert(!/\[\d\]/.test(r.edition.news[3].summary), 'zostały przypisy');
  assert(r.edition.news[3].summary.endsWith('.'), 'zgubiona kropka');
});

test('Gemini: link przekierowujący to błąd', () => {
  const ed = structuredClone(base);
  ed.news[4].sources[0].url = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';
  const r = check(fence(ed));
  assert(r.errors.some((e) => e.includes('przekierowujący')), 'brak błędu o przekierowaniu');
});

test('Dwie części wklejone razem sklejają się w jedno wydanie', () => {
  const { date, intro, news, ...rest } = base;
  const text = `Część 1:\n${fence({ date, intro, news })}\n\nCzęść 2:\n${fence({ date, ...rest })}`;
  const r = check(text);
  assert(!r.errors.length, r.errors.join('; '));
  assert(r.edition.news.length === base.news.length && r.edition.quiz.length === base.quiz.length, 'części nie zostały sklejone');
});

test('Sama pierwsza część daje uwagę o brakach', () => {
  const r = check(fence({ date: base.date, intro: base.intro, news: base.news }));
  assert(r.warnings.some((w) => w.startsWith('brak:')), 'brak uwagi o brakujących częściach');
});

test('Przecinek po ostatnim elemencie listy jest naprawiany', () => {
  const json = JSON.stringify(base).replace('}],"facts"', '},],"facts"');
  assert(json.includes('},],"facts"'), 'test nie wstawił przecinka');
  let strict = true;
  try {
    JSON.parse(json);
  } catch {
    strict = false;
  }
  assert(!strict, 'zepsuty JSON przeszedł zwykłe JSON.parse');
  const r = check(json);
  assert(r.edition.news.length === base.news.length, 'nie udało się odczytać');
});

test('Ucięta odpowiedź daje zrozumiały komunikat', () => {
  const text = fence(base).slice(0, 3000);
  let message = '';
  try {
    extractJSON(text);
  } catch (err) {
    message = err.message;
  }
  assert(message.includes('ucięta'), `komunikat: ${message || '(brak błędu)'}`);
});

test('Polecenie: zasady o linkach i cytowaniach, tryb dwóch części, czaty', () => {
  const rules = projectInstructions();
  assert(rules.includes('utm_') && rules.includes('vertexaisearch') && rules.includes('cite'), 'brak zasad o linkach i cytowaniach');
  const msg = dailyMessage({ date: '2026-10-21', sections: ['polska', 'swiat'], parts: 2 });
  assert(msg.includes('dwóch częściach') && msg.includes('„dalej”'), 'brak instrukcji dla dwóch części');
  assert(CHATS.length >= 5 && CHATS.every((c) => c.tips.length), 'brak wskazówek dla czatów');
});

test('Kalendarz: reguła powtarzania dla wybranych dni', () => {
  assert(recurrence([0, 1, 2, 3, 4, 5, 6]) === 'RRULE:FREQ=DAILY', 'codziennie');
  assert(recurrence([1, 2, 3, 4, 5]) === 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'dni robocze');
});

test('Oś czasu: poprzedni i następny dzień, adresy wydań', () => {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  const index = { editions: [{ date: day(0) }, { date: day(-1) }, { date: day(-5) }] };
  const mid = neighborDates(index, day(-1));
  assert(mid.prev === day(-5) && mid.next === day(0) && mid.latest === day(0), JSON.stringify(mid));
  const first = neighborDates(index, day(-5));
  assert(first.prev === null && first.next === day(-1), 'najstarsze wydanie');
  assert(neighborDates(index, day(0)).next === null, 'najnowsze wydanie nie ma następnego');
  assert(editionHref(day(0), day(0)) === '#dzis', 'najnowsze jako „Dziś”');
  assert(editionHref(day(-1), day(0)) === `#wydanie-${day(-1)}`, 'starsze z archiwum');
  assert(editionHref(day(-1), day(0), 'fact-2') === `#wydanie-${day(-1)}/fact-2`, 'link do karty');
});

test('Ulubione: wpisy, notatki z wieczorów, filtry i wyszukiwanie bez polskich znaków', () => {
  const state = {
    saved: {
      '2026-10-20:fact-1': { type: 'fact', title: 'Żółw morski śpi pod wodą', text: 'Do 7 godzin.', date: '2026-10-20', savedAt: '2026-10-20T08:00:00Z', note: 'Pokazać' },
      '2026-10-21:pl-1': { type: 'news', section: 'polska', title: 'Sejm przyjął ustawę', text: 'Opis.', date: '2026-10-21', savedAt: '2026-10-21T08:00:00Z', sources: [{ name: 'TVN24', url: 'https://tvn24.pl/x' }] },
    },
    progress: { '2026-10-19': { note: 'Obejrzeć dokument', noteQuestion: 'Co Was zaskoczyło?' }, '2026-10-20': { note: '' } },
  };
  const all = favoriteEntries(state);
  assert(all.length === 3, `wpisów: ${all.length}`);
  assert(all.map((e) => e.date).join() === '2026-10-21,2026-10-20,2026-10-19', 'kolejność: najnowsze dni najpierw');
  assert(all[1].id === 'fact-1' && all[2].type === 'evening', 'id i notatka z wieczoru');
  assert(filterFavorites(all, { query: 'zolw' }).length === 1, '„zolw” nie znalazł „Żółw”');
  assert(filterFavorites(all, { query: 'pokazac' }).length === 1, 'szukanie w notatkach');
  assert(filterFavorites(all, { type: 'news' }).length === 1, 'filtr typu');
  assert(countByType(all).evening === 1 && countByType(all).all === 3, 'liczniki');
  assert(groupByDate(all).length === 3, 'grupy dni');
  const text = favoriteText(all[0]);
  assert(text.includes('Sejm przyjął ustawę') && text.includes('https://tvn24.pl/x'), text);
});

test('Powtórki: pierwsza po 1 dniu, potem 3 dni, błąd wraca na jutro', () => {
  const deck = {};
  const q = { id: 'x-q1', question: 'P?', options: ['a', 'b'], answer: 0 };
  let card = grade(deck, q, true, '2026-10-22');
  assert(card.box === 1 && card.due === '2026-10-23', `po pierwszej dobrej: pudełko ${card.box}, termin ${card.due}`);
  card = grade(deck, q, true, '2026-10-23');
  assert(card.box === 2 && card.due === '2026-10-26', `po drugiej dobrej: pudełko ${card.box}, termin ${card.due}`);
  card = grade(deck, q, false, '2026-10-26');
  assert(card.box === 1 && card.due === '2026-10-27', `po błędzie: pudełko ${card.box}, termin ${card.due}`);
  const fresh = grade({}, { ...q, id: 'x-q2' }, false, '2026-10-22');
  assert(fresh.box === 1 && fresh.due === '2026-10-23', 'nowe pytanie z błędem też na jutro');
});

test('Kopia danych: wydania z telefonu w kopii, token zostaje, zła kopia odrzucona', () => {
  resetAll();
  memory.clear();
  update((s) => {
    s.profile = { name: 'Betti', sections: ['polska'] };
    s.saved['2026-10-22:pl-1'] = { type: 'news', title: 'T', date: '2026-10-22' };
  });
  setGithubSettings({ owner: 'marekmaro', repo: 'SelfLearn', token: 'github_pat_STARY' });
  saveLocalEdition(structuredClone(base));
  const backup = exportJSON();
  assert(!backup.includes('github_pat_STARY'), 'token trafił do kopii');
  assert(JSON.parse(backup).editions[base.date], 'brak wydania z telefonu w kopii');

  // Nowy telefon: inny token, brak wydań.
  resetAll();
  memory.clear();
  setGithubSettings({ token: 'github_pat_NOWY' });
  const result = importJSON(backup);
  assert(getState().profile?.name === 'Betti' && getState().saved['2026-10-22:pl-1'], 'nie wczytano stanu');
  assert(getState().settings.github.token === 'github_pat_NOWY', 'import skasował token');
  assert(localEditions()[base.date] && result.editions === 1, 'nie wczytano wydania z telefonu');

  // Uszkodzone wydanie w kopii jest pomijane.
  const broken = JSON.parse(backup);
  broken.editions = { '2026-01-01': { date: '2026-01-01', news: [null] } };
  assert(importJSON(JSON.stringify(broken)).editions === 0 && !localEditions()['2026-01-01'], 'wczytano uszkodzone wydanie');

  // Starsza kopia (sam stan) nadal działa.
  importJSON(JSON.stringify({ profile: { name: 'Marek' }, progress: {} }));
  assert(getState().profile.name === 'Marek', 'starsza kopia nie działa');

  for (const bad of ['to nie json', '{"x":1}', '{"progress":[]}', '{"progress":{},"deck":[]}']) {
    let threw = false;
    try {
      importJSON(bad);
    } catch {
      threw = true;
    }
    assert(threw, `przyjęto złą kopię: ${bad}`);
  }
  assert(getState().profile.name === 'Marek', 'zła kopia zmieniła dane');
});

test('Walidator: puste i dziwne wpisy dają błędy zamiast awarii', () => {
  const ed = structuredClone(base);
  ed.news.push(null);
  ed.facts = [null, ...ed.facts];
  ed.quiz.push(42);
  ed.recap = [null];
  ed.concept = 'pojęcie';
  let r;
  try {
    r = check(fence(ed));
  } catch (err) {
    throw new Error(`awaria: ${err.message}`);
  }
  assert(r.errors.some((e) => e.startsWith('news[') && e.includes('nie jest obiekt')), 'brak błędu dla null w news');
  assert(r.errors.some((e) => e.startsWith('concept')), 'brak błędu dla pojęcia');
  const partial = validateEdition({ ...structuredClone(base), quiz: [], book: undefined });
  assert(partial.missing.includes('quizu') && partial.missing.includes('książki tygodnia'), `missing: ${partial.missing}`);
});

test('Serwer podglądu: tylko pliki aplikacji, bez wychodzenia poza projekt', () => {
  const root = join('/tmp', 'SelfLearn');
  assert(safePath(root, '/') === join(root, 'index.html'), 'strona główna');
  assert(safePath(root, '/src/main.js') === join(root, 'src', 'main.js'), 'plik aplikacji');
  for (const url of ['/..%2fSelfLearn-sekret/plik.txt', '/.git/config', '/%2e%2e/etc/passwd', '/scripts/serve.mjs', '/package.json', '/%E0%A4%A', '/content/../.git/HEAD']) {
    assert(safePath(root, url) === null, `wydano: ${url}`);
  }
});

test('Przypomnienia: wieczór przed porankiem nie blokuje porannego', () => {
  assert(morningWindowEnd({ morning: '07:30', evening: '20:30', eveningOn: true }) === 20 * 60 + 30, 'zwykły układ');
  assert(morningWindowEnd({ morning: '21:00', evening: '08:00', eveningOn: true }) === 24 * 60, 'odwrócone godziny');
  assert(morningWindowEnd({ morning: '07:30', evening: '06:00', eveningOn: false }) === 24 * 60, 'bez wieczoru');
  assert(remindersOverlap({ morning: '21:00', evening: '08:00', eveningOn: true }), 'brak ostrzeżenia');
  assert(!remindersOverlap({ morning: '07:30', evening: '20:30', eveningOn: true }), 'fałszywe ostrzeżenie');
});

test('Kopia danych: przypomnienie po tygodniu, „Później” odkłada je o tydzień', () => {
  resetAll();
  assert(!backupDue('2026-10-22'), 'przypomnienie bez żadnych postępów');
  update((s) => {
    s.activity = { '2026-10-20': 'warmup', '2026-10-21': 'warmup', '2026-10-22': 'warmup' };
  });
  assert(backupDue('2026-10-22'), 'brak przypomnienia przy 3 dniach bez kopii');
  markBackedUp('2026-10-22');
  assert(!backupDue('2026-10-28'), 'przypomnienie przed upływem tygodnia');
  assert(backupDue('2026-10-29'), 'brak przypomnienia po tygodniu');
  snoozeBackup('2026-10-29');
  assert(!backupDue('2026-11-04'), '„Później” nie odłożyło przypomnienia');
  assert(backupDue('2026-11-05'), 'odłożone przypomnienie nie wróciło');
  const copy = exportJSON('2026-11-05');
  assert(JSON.parse(copy).state.settings.lastBackup === '2026-11-05', 'kopia bez daty zrobienia');
  importJSON(copy);
  assert(!backupDue('2026-11-05'), 'przypomnienie wraca zaraz po wczytaniu kopii');
  assert(backupFileName('2026-10-22') === 'selflearn-kopia-2026-10-22.json', 'nazwa pliku');
  resetAll();
});

test('Rozdziały wydania: kolejność, wybrane działy, rozgrzewka i czas czytania', () => {
  const chapters = buildChapters(base, { sections: ['polska', 'swiat', 'technologia'], minutes: 15 }, { prevDate: '2026-10-21' });
  const ids = chapters.map((c) => c.id);
  assert(ids[0] === 'rozgrzewka' && ids[1] === 'polska' && ids[2] === 'swiat', `kolejność: ${ids.join(', ')}`);
  const topics = chapters.find((c) => c.id === 'tematy');
  assert(!topics || topics.groups.every((g) => g.section === 'technologia'), 'dział spoza profilu');
  if (base.quiz?.length) assert(ids.includes('quiz'), 'brak quizu');
  const minutes = estimateMinutes(chapters, base, new Set());
  assert(minutes >= 1 && minutes < 120, `czas czytania: ${minutes}`);
  const warmup = buildWarmup({ date: '2026-10-23' }, base, null);
  assert(warmup.length === Math.min(3, base.quiz?.length || 0), 'rozgrzewka z poprzedniego quizu');
  assert(warmup.every((q) => q.options.length <= 3 && q.options[q.answer] !== undefined), 'pytania a/b/c');
  assert(firstSentence('Prezydent podpisał ustawę ok. 15 osób. Druga część zdania.') === 'Prezydent podpisał ustawę ok. 15 osób.', 'pierwsze zdanie ze skrótem');
});

test('Podsumowanie tygodnia: tydzień do niedzieli, przypomnienie, statystyki i dobór pytań', () => {
  assert(weekEnd('2026-10-25') === '2026-10-25', 'niedziela kończy swój tydzień');
  assert(weekEnd('2026-10-26') === '2026-10-25', 'poniedziałek pokazuje poprzedni tydzień');
  assert(weekEnd('2026-10-22') === '2026-10-18', 'czwartek');
  assert(weekDates('2026-10-25')[0] === '2026-10-19', 'tydzień zaczyna się w poniedziałek');
  assert(weekBannerDue('2026-10-25', {}) && weekBannerDue('2026-10-26', {}), 'brak przypomnienia w niedzielę i poniedziałek');
  assert(!weekBannerDue('2026-10-22', {}), 'przypomnienie w czwartek');
  assert(!weekBannerDue('2026-10-26', { '2026-10-25': { doneOn: '2026-10-25' } }), 'przypomnienie po zrobionym quizie');

  const q = (id, answer = 0) => ({ id, question: id, options: ['a', 'b', 'c'], answer });
  const e1 = { date: '2026-10-20', news: [{ title: 'Nagłówek 20' }], quiz: [q('a1'), q('a2'), q('a3')] };
  const e2 = { date: '2026-10-22', news: [{ title: 'Nagłówek 22' }], quiz: [q('b1'), q('b2')] };
  const progress = { '2026-10-20': { quiz: { a1: 0, a2: 1 } }, '2026-10-22': { quiz: {}, completedOn: '2026-10-22' } };
  const state = { progress, activity: { '2026-10-20': 'rozgrzewka' }, saved: { '2026-10-20:fact-1': {}, '2026-10-01:x': {} } };
  const sum = weekSummary('2026-10-25', [e1, e2], state, { '2026-10-22': 'Z indeksu' });
  assert(sum.activeDays === 2 && sum.editions === 2, `dni: ${sum.activeDays}, wydania: ${sum.editions}`);
  assert(sum.quizTotal === 5 && sum.quizAnswered === 2 && sum.quizRight === 1, 'wynik quizów');
  assert(sum.saved === 1, 'ulubione spoza tygodnia');
  assert(sum.days.find((d) => d.date === '2026-10-22').headline === 'Z indeksu', 'nagłówek z indeksu');
  assert(sum.days.find((d) => d.date === '2026-10-20').headline === 'Nagłówek 20', 'nagłówek z wydania');

  const quiz = weekQuiz([e1, e2], progress, 4);
  assert(quiz.length === 4 && quiz[0].id === 'a2', `najpierw błędna odpowiedź: ${quiz.map((x) => x.id)}`);
  assert(!quiz.some((x) => x.id === 'a1'), 'dobrze rozwiązane przed nierozwiązanymi');
  assert(quiz.every((x) => x.date), 'pytanie bez daty wydania');
  assert(JSON.stringify(weekQuiz([e1, e2], progress, 4)) === JSON.stringify(quiz), 'zestaw zmienia się między otwarciami');
});

test('Pogłęb: polecenie dla każdego trybu i adres czatu z gotowym pytaniem', () => {
  const news = { type: 'news', title: 'Sejm przyjął ustawę', text: 'Streszczenie wiadomości.', sources: [{ name: 'PAP', url: 'https://www.pap.pl/a' }] };
  const simple = deepenPrompt(news, 'prosciej', { date: '2026-10-22' });
  assert(simple.includes('„Sejm przyjął ustawę”') && simple.includes('https://www.pap.pl/a') && simple.includes('prościej'), 'tryb „prościej”');
  assert(deepenPrompt(news, 'kontekst').includes('Sprawdź w internecie'), 'kontekst wiadomości bez wyszukiwania');
  const fact = { type: 'fact', title: 'Banany', text: 'Potas-40.', sources: { name: 'NASA', url: 'https://nasa.gov/x' } };
  assert(!deepenPrompt(fact, 'kontekst').includes('Sprawdź w internecie') && deepenPrompt(fact, 'kontekst').includes('https://nasa.gov/x'), 'kontekst ciekawostki');
  assert(deepenPrompt(fact, 'pytanie', { question: '  Ile to sievertów? ' }).includes('Moje pytanie: Ile to sievertów?'), 'własne pytanie');
  assert(deepenPrompt({ ...fact, text: 'słowo '.repeat(1000) }, 'prosciej').length < 1700, 'długi tekst nie jest skracany');
  assert(DEEPEN_MODES.length === 3, 'tryby');

  const claude = CHATS.find((c) => c.id === 'claude');
  const gemini = CHATS.find((c) => c.id === 'gemini');
  const a = deepenUrl(claude, simple);
  assert(a.prefilled && a.url.startsWith('https://claude.ai/new?q=') && decodeURIComponent(a.url.split('q=')[1]) === simple, 'Claude z pytaniem w adresie');
  const b = deepenUrl(gemini, simple);
  assert(!b.prefilled && b.url === gemini.url, 'Gemini bez pytania w adresie');
  assert(!deepenUrl(claude, 'x'.repeat(7000)).prefilled, 'za długi adres');
  assert(deepenUrl({ id: 'inny', url: null }, simple).url === null, 'czat bez adresu');
});

test('Wątki: nazwa w adresie, wpisy w indeksie, oś czasu, polecenie dnia i walidator', () => {
  assert(threadSlug('Ustawy o aborcji') === 'ustawy-o-aborcji', 'slug');
  assert(threadSlug('  Wojna w Ukrainie!  ') === 'wojna-w-ukrainie', 'slug ze znakami');
  assert(threadSlug('Łódź – żółć') === 'lodz-zolc', 'polskie znaki');
  // Wątki z prawdziwego wydania są usuwane, żeby test nie zależał od treści najnowszego wydania.
  const day = (date, threads) => ({
    ...base,
    date,
    news: base.news.map(({ thread, ...n }, i) => (threads[i] ? { ...n, thread: threads[i] } : n)),
  });
  const d1 = day('2026-10-20', ['Wojna w Ukrainie', 'Budżet 2027']);
  const d2 = day('2026-10-21', ['Wojna w ukrainie']);
  const d3 = day('2026-10-22', [null, 'Budżet 2027', 'Wojna w Ukrainie']);
  assert(editionThreads(d1).length === 2 && editionThreads(d1)[0].item === base.news[0].id, 'wątki wydania');
  assert(!('threads' in indexEntry(base)) || base.news.some((n) => n.thread), 'pusty wpis wątków w indeksie');
  const index = { editions: [d3, d2, d1].map(indexEntry) };
  const threads = threadsFromIndex(index);
  const war = threads.find((t) => t.slug === 'wojna-w-ukrainie');
  assert(threads.length === 2, `liczba wątków: ${threads.length}`);
  assert(war.days === 3 && war.first === '2026-10-20' && war.last === '2026-10-22', 'oś czasu wątku');
  assert(war.items[0].date === '2026-10-22', 'najnowsze pierwsze');
  assert(war.name === 'Wojna w Ukrainie', 'nazwa z najnowszego wydania');
  assert(JSON.stringify(recentThreadNames([d3, d2])) === JSON.stringify(['Budżet 2027', 'Wojna w Ukrainie']), 'nazwy do polecenia');
  const msg = dailyMessage({ date: '2026-10-23', sections: ['polska', 'swiat'], recent: [d3, d2] });
  assert(msg.includes('Trwające wątki') && msg.includes('Budżet 2027 | Wojna w Ukrainie'), 'polecenie dnia bez wątków');
  assert(projectInstructions().includes('"thread"'), 'zasady bez pola thread');
  const bad = validateEdition({ ...base, news: base.news.map((n, i) => (i === 0 ? { ...n, thread: 42 } : i === 1 ? { ...n, thread: 'x'.repeat(70) } : n)) });
  assert(bad.errors.some((e) => e.includes('"thread"')), 'zła nazwa wątku przechodzi');
  assert(bad.warnings.some((w) => w.includes('dłuższa niż')), 'brak uwagi o długiej nazwie');
  assert(!validateEdition({ ...d1, date: base.date }).errors.length, 'poprawny wątek daje błąd');
});

test('Tryb offline: service worker zna wszystkie pliki aplikacji', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const files = [
    ...readdirSync('src').filter((f) => /\.(js|css)$/.test(f)).map((f) => `./src/${f}`),
    ...readdirSync('src/views').filter((f) => f.endsWith('.js')).map((f) => `./src/views/${f}`),
  ];
  const missing = files.filter((f) => !sw.includes(`'${f}'`));
  assert(!missing.length, `brak w SHELL_FILES (sw.js): ${missing.join(', ')}`);
});

console.log(failed ? `\nNie przeszło: ${failed}.` : '\nWszystkie testy przeszły.');
process.exit(failed ? 1 : 0);
