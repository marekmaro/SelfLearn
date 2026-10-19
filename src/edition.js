// Wspólne dla aplikacji i skryptów: sprawdzanie wydania, wpis do indeksu,
// wyciąganie JSON-a z odpowiedzi czatu. Bez zależności od przeglądarki.
import { SECTIONS, FACT_KINDS } from './config.js';

const SECTION_IDS = SECTIONS.map((s) => s.id);
const KIND_IDS = FACT_KINDS.map((k) => k.id);

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);

// Zwraca { errors, warnings } z komunikatami po polsku.
export function validateEdition(ed) {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  const warn = (msg) => warnings.push(msg);

  if (!ed || typeof ed !== 'object' || Array.isArray(ed)) {
    return { errors: ['To nie jest obiekt wydania.'], warnings };
  }

  const checkSource = (where, s) => {
    if (!s || typeof s !== 'object') return err(`${where}: brak źródła`);
    if (!isText(s.name)) err(`${where}: źródło bez nazwy`);
    if (!isUrl(s.url)) err(`${where}: źródło bez poprawnego adresu https`);
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(ed.date || '')) err('pole "date" musi mieć format RRRR-MM-DD');
  if (!isText(ed.intro)) warn('brak wstępu ("intro")');

  const ids = new Set();
  const addId = (id, where) => {
    if (!isText(id)) return err(`${where}: brak "id"`);
    if (ids.has(id)) err(`${where}: powtórzone id "${id}"`);
    ids.add(id);
  };

  if (!Array.isArray(ed.news) || ed.news.length === 0) err('"news" musi być niepustą listą');
  const perSection = {};
  for (const [i, n] of (Array.isArray(ed.news) ? ed.news : []).entries()) {
    const where = `news[${i}]`;
    addId(n.id, where);
    if (!SECTION_IDS.includes(n.section)) err(`${where}: nieznany dział "${n.section}"`);
    perSection[n.section] = (perSection[n.section] || 0) + 1;
    if (!Number.isInteger(n.rank) || n.rank < 1) err(`${where}: "rank" musi być liczbą od 1`);
    for (const key of ['title', 'summary', 'why']) if (!isText(n[key])) err(`${where}: brak "${key}"`);
    if (!Array.isArray(n.sources) || n.sources.length === 0) err(`${where}: potrzebne co najmniej jedno źródło`);
    for (const [j, s] of (Array.isArray(n.sources) ? n.sources : []).entries()) checkSource(`${where}.sources[${j}]`, s);
    if (isText(n.summary) && n.summary.split(/\s+/).length > 110) warn(`${where}: streszczenie dłuższe niż 110 słów`);
  }
  for (const main of ['polska', 'swiat']) {
    if ((perSection[main] || 0) < 5) warn(`dział "${main}" ma ${perSection[main] || 0} z 5 wiadomości`);
  }

  for (const [i, f] of (Array.isArray(ed.facts) ? ed.facts : []).entries()) {
    const where = `facts[${i}]`;
    addId(f.id, where);
    if (!KIND_IDS.includes(f.kind)) err(`${where}: nieznany rodzaj "${f.kind}"`);
    for (const key of ['title', 'body']) if (!isText(f[key])) err(`${where}: brak "${key}"`);
    checkSource(where, f.source);
  }

  for (const [i, o] of (Array.isArray(ed.onThisDay) ? ed.onThisDay : []).entries()) {
    const where = `onThisDay[${i}]`;
    addId(o.id, where);
    if (!Number.isInteger(o.year)) err(`${where}: "year" musi być liczbą`);
    for (const key of ['title', 'body']) if (!isText(o[key])) err(`${where}: brak "${key}"`);
    checkSource(where, o.source);
  }

  if (ed.concept) {
    const c = ed.concept;
    addId(c.id, 'concept');
    for (const key of ['term', 'definition']) if (!isText(c[key])) err(`concept: brak "${key}"`);
    if (c.examples && !Array.isArray(c.examples)) err('concept.examples musi być listą');
    checkSource('concept', c.source);
  }

  if (ed.book) {
    const b = ed.book;
    addId(b.id, 'book');
    for (const key of ['bookId', 'title', 'author', 'ideaTitle', 'idea', 'moral', 'action']) if (!isText(b[key])) err(`book: brak "${key}"`);
    if (!Number.isInteger(b.day) || !Number.isInteger(b.days) || b.day < 1 || b.day > b.days) err('book: "day" musi być między 1 a "days"');
    checkSource('book', b.source);
  }

  const quizIds = new Set();
  for (const [i, q] of (Array.isArray(ed.quiz) ? ed.quiz : []).entries()) {
    const where = `quiz[${i}]`;
    if (!isText(q.id)) err(`${where}: brak "id"`);
    else if (quizIds.has(q.id)) err(`${where}: powtórzone id "${q.id}"`);
    else if (isText(ed.date) && !q.id.startsWith(ed.date)) err(`${where}: id pytania musi zaczynać się od daty wydania`);
    quizIds.add(q.id);
    if (!isText(q.question)) err(`${where}: brak "question"`);
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isText)) err(`${where}: potrzebne co najmniej 2 odpowiedzi`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (Array.isArray(q.options) ? q.options.length : 0)) {
      err(`${where}: "answer" poza zakresem odpowiedzi`);
    }
    if (!isText(q.explanation)) warn(`${where}: brak wyjaśnienia`);
    if (q.ref) {
      if (!ids.has(q.ref)) err(`${where}: "ref" wskazuje nieistniejące "${q.ref}"`);
      if ((Array.isArray(ed.news) ? ed.news : []).some((n) => n.id === q.ref)) {
        err(`${where}: quiz nie może dotyczyć wiadomości (tylko ciekawostki, historia, pojęcie, książka)`);
      }
    } else {
      warn(`${where}: brak "ref"`);
    }
  }

  // Rozgrzewka: 3 pytania a/b/c o wiedzę z poprzedniego wydania (opcjonalnie).
  if (ed.recap !== undefined) {
    if (!Array.isArray(ed.recap)) err('"recap" musi być listą');
    for (const [i, q] of (Array.isArray(ed.recap) ? ed.recap : []).entries()) {
      const where = `recap[${i}]`;
      if (!isText(q.id) || (isText(ed.date) && !q.id.startsWith(ed.date))) err(`${where}: id musi zaczynać się od daty wydania`);
      else if (quizIds.has(q.id)) err(`${where}: powtórzone id "${q.id}"`);
      quizIds.add(q.id);
      if (!isText(q.question)) err(`${where}: brak "question"`);
      if (!Array.isArray(q.options) || q.options.length !== 3 || !q.options.every(isText)) err(`${where}: potrzebne dokładnie 3 odpowiedzi (a, b, c)`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 2) err(`${where}: "answer" musi być 0, 1 albo 2`);
    }
  }

  if (ed.evening && !isText(ed.evening.question)) err('evening: brak "question"');

  return { errors, warnings };
}

// Wpis do content/index.json.
export function indexEntry(ed) {
  const news = Array.isArray(ed.news) ? ed.news : [];
  const top = news.find((n) => n.section === 'polska' && n.rank === 1) || news[0];
  return { date: ed.date, headline: top?.title || '' };
}

// Wyciąga obiekt wydania z odpowiedzi czatu: z bloku ```json albo z gołego tekstu.
export function extractJSON(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Wklej odpowiedź z czatu.');
  if (raw.includes('BRAK_WYSZUKIWANIA')) {
    throw new Error('Czat nie ma włączonego wyszukiwania w internecie. Włącz je i poproś o wydanie jeszcze raz.');
  }
  const withoutFences = raw.replace(/^\s*```[a-zA-Z]*\s*$/gm, '');
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('Nie widzę tu danych wydania. Skopiuj całą odpowiedź, razem z nawiasami { }.');
  }
  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch (e) {
    throw new Error(
      `Odpowiedź jest ucięta albo uszkodzona (${e.message}). Jeśli czat urwał tekst w połowie, poproś go: „Wypisz jeszcze raz całe wydanie, bez wcięć”.`,
    );
  }
}

// Krótki opis zawartości, np. do podglądu po wklejeniu.
export function describeEdition(ed) {
  const count = (section) => (ed.news || []).filter((n) => n.section === section).length;
  const topics = (ed.news || []).filter((n) => !['polska', 'swiat'].includes(n.section)).length;
  return [
    `Polska: ${count('polska')}`,
    `Świat: ${count('swiat')}`,
    `Twoje tematy: ${topics}`,
    `Ciekawostki: ${(ed.facts || []).length}`,
    `Historia: ${(ed.onThisDay || []).length}`,
    `Quiz: ${(ed.quiz || []).length}`,
  ].join(' · ');
}
