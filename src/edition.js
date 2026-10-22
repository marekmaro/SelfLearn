// Wspólne dla aplikacji i skryptów: sprawdzanie wydania, wpis do indeksu,
// wyciąganie JSON-a z odpowiedzi czatu. Bez zależności od przeglądarki.
import { SECTIONS, FACT_KINDS } from './config.js';

const SECTION_IDS = SECTIONS.map((s) => s.id);
const KIND_IDS = FACT_KINDS.map((k) => k.id);

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

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
    if (!isUrl(s.url)) return err(`${where}: źródło bez poprawnego adresu https`);
    if (isRedirect(s.url)) err(`${where}: link przekierowujący (${new URL(s.url).hostname}) zamiast adresu artykułu. Poproś czat o bezpośredni link`);
    else if (isHomepage(s.url) && where.startsWith('news')) warn(`${where}: link prowadzi na stronę główną serwisu, a nie do artykułu`);
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
    if (!isObj(n)) {
      err(`${where}: to nie jest obiekt wiadomości`);
      continue;
    }
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
    if (!isObj(f)) {
      err(`${where}: to nie jest obiekt ciekawostki`);
      continue;
    }
    addId(f.id, where);
    if (!KIND_IDS.includes(f.kind)) err(`${where}: nieznany rodzaj "${f.kind}"`);
    for (const key of ['title', 'body']) if (!isText(f[key])) err(`${where}: brak "${key}"`);
    checkSource(where, f.source);
  }

  for (const [i, o] of (Array.isArray(ed.onThisDay) ? ed.onThisDay : []).entries()) {
    const where = `onThisDay[${i}]`;
    if (!isObj(o)) {
      err(`${where}: to nie jest obiekt wydarzenia`);
      continue;
    }
    addId(o.id, where);
    if (!Number.isInteger(o.year)) err(`${where}: "year" musi być liczbą`);
    for (const key of ['title', 'body']) if (!isText(o[key])) err(`${where}: brak "${key}"`);
    checkSource(where, o.source);
  }

  if (ed.concept && !isObj(ed.concept)) err('concept: to nie jest obiekt pojęcia');
  else if (ed.concept) {
    const c = ed.concept;
    addId(c.id, 'concept');
    for (const key of ['term', 'definition']) if (!isText(c[key])) err(`concept: brak "${key}"`);
    if (c.examples && !Array.isArray(c.examples)) err('concept.examples musi być listą');
    checkSource('concept', c.source);
  }

  if (ed.book && !isObj(ed.book)) err('book: to nie jest obiekt książki');
  else if (ed.book) {
    const b = ed.book;
    addId(b.id, 'book');
    for (const key of ['bookId', 'title', 'author', 'ideaTitle', 'idea', 'moral', 'action']) if (!isText(b[key])) err(`book: brak "${key}"`);
    if (!Number.isInteger(b.day) || !Number.isInteger(b.days) || b.day < 1 || b.day > b.days) err('book: "day" musi być między 1 a "days"');
    checkSource('book', b.source);
  }

  const quizIds = new Set();
  for (const [i, q] of (Array.isArray(ed.quiz) ? ed.quiz : []).entries()) {
    const where = `quiz[${i}]`;
    if (!isObj(q)) {
      err(`${where}: to nie jest obiekt pytania`);
      continue;
    }
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
      if (list(ed.news).some((n) => n?.id === q.ref)) {
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
      if (!isObj(q)) {
        err(`${where}: to nie jest obiekt pytania`);
        continue;
      }
      if (!isText(q.id) || (isText(ed.date) && !q.id.startsWith(ed.date))) err(`${where}: id musi zaczynać się od daty wydania`);
      else if (quizIds.has(q.id)) err(`${where}: powtórzone id "${q.id}"`);
      quizIds.add(q.id);
      if (!isText(q.question)) err(`${where}: brak "question"`);
      if (!Array.isArray(q.options) || q.options.length !== 3 || !q.options.every(isText)) err(`${where}: potrzebne dokładnie 3 odpowiedzi (a, b, c)`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 2) err(`${where}: "answer" musi być 0, 1 albo 2`);
    }
  }

  if (ed.evening && (!isObj(ed.evening) || !isText(ed.evening.question))) err('evening: brak "question"');

  // Brakujące części wydania (np. gdy wklejono tylko pierwszą z dwóch odpowiedzi czatu).
  const missing = [
    ['facts', 'ciekawostek'],
    ['onThisDay', '„Tego dnia w historii”'],
    ['concept', 'pojęcia dnia'],
    ['book', 'książki tygodnia'],
    ['quiz', 'quizu'],
    ['evening', 'pytania na wieczór'],
  ].filter(([key]) => !ed[key] || (Array.isArray(ed[key]) && !ed[key].length));
  if (missing.length) warn(`brak: ${missing.map(([, label]) => label).join(', ')}`);

  return { errors, warnings, missing: missing.map(([, label]) => label) };
}

// Linki, które czaty podają zamiast adresu artykułu (np. Gemini: vertexaisearch…). Szybko wygasają.
const REDIRECT_HOSTS = ['vertexaisearch.cloud.google.com', 'l.facebook.com', 't.co', 'news.google.com'];

function isRedirect(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (REDIRECT_HOSTS.includes(host)) return true;
    if (host === 'bing.com' && u.pathname.startsWith('/ck/')) return true;
    return /^google\.[a-z.]+$/.test(host) && u.pathname === '/url';
  } catch {
    return false;
  }
}

function isHomepage(url) {
  try {
    const u = new URL(url);
    return (u.pathname === '/' || u.pathname === '') && !u.search;
  } catch {
    return false;
  }
}

// Wpis do content/index.json.
export function indexEntry(ed) {
  const news = Array.isArray(ed.news) ? ed.news : [];
  const top = news.find((n) => n?.section === 'polska' && n.rank === 1) || news.find(isObj);
  return { date: ed.date, headline: top?.title || '' };
}

// Wyciąga wydanie z odpowiedzi czatu: z bloku ```json albo z gołego tekstu.
// Przyjmuje też kilka bloków naraz (wydanie w dwóch częściach) i skleja je w jedno.
export function extractJSON(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Wklej odpowiedź z czatu.');
  if (raw.includes('BRAK_WYSZUKIWANIA')) {
    throw new Error('Czat nie ma włączonego wyszukiwania w internecie. Włącz je i poproś o wydanie jeszcze raz.');
  }
  const { blocks, truncated } = jsonBlocks(raw.replace(/^\s*```[a-zA-Z]*\s*$/gm, ''));
  if (!blocks.length) {
    if (truncated) {
      throw new Error('Odpowiedź jest ucięta: brakuje końca danych. Napisz czatowi „dokończ” albo wybierz wyżej odpowiedź w dwóch częściach.');
    }
    throw new Error('Nie widzę tu danych wydania. Skopiuj całą odpowiedź, razem z nawiasami { }.');
  }
  const parts = blocks.map((block, i) => {
    try {
      return parseLenient(block);
    } catch (e) {
      throw new Error(
        `${blocks.length > 1 ? `Część ${i + 1} jest uszkodzona` : 'Odpowiedź jest uszkodzona'} (${e.message}). Poproś czat: „Wypisz to jeszcze raz jako poprawny JSON, bez komentarzy”.`,
      );
    }
  });
  const merged = mergeParts(parts.filter((p) => p && typeof p === 'object' && !Array.isArray(p)));
  if (truncated) merged.__truncated = true;
  return merged;
}

// Znajduje kolejne obiekty { … } na najwyższym poziomie, z pominięciem nawiasów w tekstach.
function jsonBlocks(text) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) blocks.push(text.slice(start, i + 1));
    }
  }
  return { blocks, truncated: depth > 0 };
}

// JSON.parse, a gdy się nie uda – drugie podejście po usunięciu przecinków przed } i ].
function parseLenient(block) {
  try {
    return JSON.parse(block);
  } catch (first) {
    try {
      return JSON.parse(block.replace(/,(\s*[}\]])/g, '$1'));
    } catch {
      throw first;
    }
  }
}

function mergeParts(parts) {
  const out = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (Array.isArray(value) && Array.isArray(out[key])) out[key] = [...out[key], ...value];
      else if (value !== undefined && value !== null) out[key] = value;
    }
  }
  return out;
}

// Porządki po czatach: znaczniki cytowań w tekście (ChatGPT: „citeturn0search1”, 【4†source】, Perplexity: [1]),
// parametry śledzące w linkach (?utm_source=chatgpt.com), http zamiast https, liczby zapisane jako tekst
// i odpowiedzi w quizie podane literą. Zwraca poprawione wydanie i listę tego, co zmieniono.
export function cleanEdition(input) {
  if (!isObj(input)) return { edition: input, fixes: [] };
  const ed = structuredClone(input);
  delete ed.__truncated;
  const counts = { cite: 0, utm: 0, https: 0, numbers: 0, letters: 0 };

  const cleanText = (t) => {
    if (typeof t !== 'string') return t;
    const before = counts.cite;
    let out = t
      .replace(/\uE200[^\uE201]*\uE201/g, () => (counts.cite++, ''))
      .replace(/【[^】]*】/g, () => (counts.cite++, ''))
      .replace(/\s*\bcite(?:turn\d+[a-z]+\d+)+/g, () => (counts.cite++, ''))
      .replace(/(?:\s?\[\d{1,2}\])+/g, () => (counts.cite++, ''))
      .replace(/[\uE200-\uE2FF]/g, '');
    // Po usunięciu znacznika zostają podwójne spacje albo spacja przed kropką.
    if (counts.cite > before) out = out.replace(/\s+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ');
    return out.trim();
  };

  const cleanUrl = (url) => {
    if (typeof url !== 'string') return url;
    let u = url.trim().replace(/[)\].,;]+$/, '');
    if (u.startsWith('http://')) {
      u = `https://${u.slice(7)}`;
      counts.https++;
    }
    try {
      const parsed = new URL(u);
      const tracking = [...parsed.searchParams.keys()].filter((k) => /^utm_|^(fbclid|gclid|ocid|cmpid)$/i.test(k));
      if (tracking.length) {
        for (const k of tracking) parsed.searchParams.delete(k);
        counts.utm++;
        u = parsed.toString();
      }
    } catch {
      // Niepoprawny adres zostawiamy – walidacja go wskaże.
    }
    return u;
  };

  const walk = (node, key) => {
    if (Array.isArray(node)) return node.map((x) => walk(x, key));
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'url') node[k] = cleanUrl(v);
        else node[k] = walk(v, k);
      }
      return node;
    }
    return typeof node === 'string' ? cleanText(node) : node;
  };
  walk(ed);

  const toInt = (obj, key) => {
    if (obj && typeof obj[key] === 'string' && /^\d+$/.test(obj[key].trim())) {
      obj[key] = Number(obj[key]);
      counts.numbers++;
    }
  };
  for (const n of list(ed.news)) toInt(n, 'rank');
  for (const o of list(ed.onThisDay)) toInt(o, 'year');
  if (isObj(ed.book)) {
    toInt(ed.book, 'day');
    toInt(ed.book, 'days');
  }
  for (const q of [...list(ed.quiz), ...list(ed.recap)]) {
    if (typeof q?.answer === 'string' && /^[a-dA-D]$/.test(q.answer.trim())) {
      q.answer = 'abcd'.indexOf(q.answer.trim().toLowerCase());
      counts.letters++;
    } else toInt(q, 'answer');
  }

  const fixes = [];
  if (counts.cite) fixes.push(`usunięto znaczniki cytowań z tekstu: ${counts.cite}`);
  if (counts.utm) fixes.push(`oczyszczono linki z parametrów śledzących: ${counts.utm}`);
  if (counts.https) fixes.push(`zmieniono http na https: ${counts.https}`);
  if (counts.numbers) fixes.push(`zamieniono liczby zapisane jako tekst: ${counts.numbers}`);
  if (counts.letters) fixes.push(`zamieniono odpowiedzi podane literą na numer: ${counts.letters}`);
  return { edition: ed, fixes };
}

// Krótki opis zawartości, np. do podglądu po wklejeniu.
export function describeEdition(ed) {
  const count = (section) => list(ed.news).filter((n) => n?.section === section).length;
  const topics = list(ed.news).filter((n) => isObj(n) && !['polska', 'swiat'].includes(n.section)).length;
  return [
    `Polska: ${count('polska')}`,
    `Świat: ${count('swiat')}`,
    `Twoje tematy: ${topics}`,
    `Ciekawostki: ${list(ed.facts).length}`,
    `Historia: ${list(ed.onThisDay).length}`,
    `Quiz: ${list(ed.quiz).length}`,
  ].join(' · ');
}
