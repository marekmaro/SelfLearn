// Sprawdza poprawność wydań i indeksu. Uruchamiane w CI i przez codzienną rutynę.
// Użycie: node scripts/validate.mjs [ścieżka-do-wydania.json ...]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SECTIONS = ['polska', 'swiat', 'technologia', 'nauka', 'ai', 'zdrowie', 'kultura', 'pokemon'];
const FACT_KINDS = ['nauka', 'przyroda', 'historia', 'kosmos', 'psychologia'];
const dir = 'content/editions';

const errors = [];
const warnings = [];

function err(file, msg) {
  errors.push(`${file}: ${msg}`);
}
function warn(file, msg) {
  warnings.push(`${file}: ${msg}`);
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);

function checkSource(file, where, s) {
  if (!s || typeof s !== 'object') return err(file, `${where}: brak źródła`);
  if (!isText(s.name)) err(file, `${where}: źródło bez nazwy`);
  if (!isUrl(s.url)) err(file, `${where}: źródło bez poprawnego adresu https`);
}

function checkEdition(path) {
  const file = path.split('/').pop();
  let ed;
  try {
    ed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return err(file, `niepoprawny JSON: ${e.message}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(ed.date || '')) err(file, 'pole "date" musi mieć format RRRR-MM-DD');
  if (file !== `${ed.date}.json`) err(file, `nazwa pliku nie zgadza się z datą (${ed.date})`);
  if (!isText(ed.intro)) warn(file, 'brak "intro"');

  const ids = new Set();
  const addId = (id, where) => {
    if (!isText(id)) return err(file, `${where}: brak "id"`);
    if (ids.has(id)) err(file, `${where}: powtórzone id "${id}"`);
    ids.add(id);
  };

  if (!Array.isArray(ed.news) || ed.news.length === 0) err(file, '"news" musi być niepustą listą');
  const perSection = {};
  for (const [i, n] of (ed.news || []).entries()) {
    const where = `news[${i}]`;
    addId(n.id, where);
    if (!SECTIONS.includes(n.section)) err(file, `${where}: nieznany dział "${n.section}"`);
    perSection[n.section] = (perSection[n.section] || 0) + 1;
    if (!Number.isInteger(n.rank) || n.rank < 1) err(file, `${where}: "rank" musi być liczbą od 1`);
    for (const key of ['title', 'summary', 'why']) if (!isText(n[key])) err(file, `${where}: brak "${key}"`);
    if (!Array.isArray(n.sources) || n.sources.length === 0) err(file, `${where}: potrzebne co najmniej jedno źródło`);
    for (const [j, s] of (n.sources || []).entries()) checkSource(file, `${where}.sources[${j}]`, s);
    if (isText(n.summary) && n.summary.split(/\s+/).length > 110) warn(file, `${where}: streszczenie dłuższe niż 110 słów`);
  }
  for (const main of ['polska', 'swiat']) {
    if ((perSection[main] || 0) < 5) warn(file, `dział "${main}" ma ${perSection[main] || 0} z 5 wiadomości`);
  }

  for (const [i, f] of (ed.facts || []).entries()) {
    const where = `facts[${i}]`;
    addId(f.id, where);
    if (!FACT_KINDS.includes(f.kind)) err(file, `${where}: nieznany rodzaj "${f.kind}"`);
    for (const key of ['title', 'body']) if (!isText(f[key])) err(file, `${where}: brak "${key}"`);
    checkSource(file, where, f.source);
  }

  for (const [i, o] of (ed.onThisDay || []).entries()) {
    const where = `onThisDay[${i}]`;
    addId(o.id, where);
    if (!Number.isInteger(o.year)) err(file, `${where}: "year" musi być liczbą`);
    for (const key of ['title', 'body']) if (!isText(o[key])) err(file, `${where}: brak "${key}"`);
    checkSource(file, where, o.source);
  }

  if (ed.concept) {
    const c = ed.concept;
    addId(c.id, 'concept');
    for (const key of ['term', 'definition']) if (!isText(c[key])) err(file, `concept: brak "${key}"`);
    if (c.examples && !Array.isArray(c.examples)) err(file, 'concept.examples musi być listą');
    checkSource(file, 'concept', c.source);
  }

  if (ed.book) {
    const b = ed.book;
    addId(b.id, 'book');
    for (const key of ['bookId', 'title', 'author', 'ideaTitle', 'idea', 'moral', 'action']) if (!isText(b[key])) err(file, `book: brak "${key}"`);
    if (!Number.isInteger(b.day) || !Number.isInteger(b.days) || b.day < 1 || b.day > b.days) err(file, 'book: "day" musi być między 1 a "days"');
    checkSource(file, 'book', b.source);
  }

  const quizIds = new Set();
  for (const [i, q] of (ed.quiz || []).entries()) {
    const where = `quiz[${i}]`;
    if (!isText(q.id)) err(file, `${where}: brak "id"`);
    else if (quizIds.has(q.id)) err(file, `${where}: powtórzone id "${q.id}"`);
    else if (!q.id.startsWith(ed.date)) err(file, `${where}: id pytania musi zaczynać się od daty wydania (unikalność w powtórkach)`);
    quizIds.add(q.id);
    if (!isText(q.question)) err(file, `${where}: brak "question"`);
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isText)) err(file, `${where}: potrzebne co najmniej 2 odpowiedzi`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options || []).length) err(file, `${where}: "answer" poza zakresem odpowiedzi`);
    if (!isText(q.explanation)) warn(file, `${where}: brak wyjaśnienia`);
    if (q.ref) {
      if (!ids.has(q.ref)) err(file, `${where}: "ref" wskazuje nieistniejące "${q.ref}"`);
      if ((ed.news || []).some((n) => n.id === q.ref)) err(file, `${where}: quiz nie może dotyczyć wiadomości (tylko ciekawostki, historia, pojęcie, książka)`);
    } else {
      warn(file, `${where}: brak "ref"`);
    }
  }

  if (ed.evening && !isText(ed.evening.question)) err(file, 'evening: brak "question"');
}

const targets = process.argv.slice(2);
const files = targets.length
  ? targets
  : readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(dir, f));

for (const f of files) checkEdition(f);

// Indeks musi wskazywać istniejące pliki i zawierać wszystkie wydania.
if (!targets.length) {
  const indexPath = 'content/index.json';
  if (!existsSync(indexPath)) {
    errors.push('content/index.json: brak pliku (uruchom node scripts/build-index.mjs)');
  } else {
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const listed = new Set((index.editions || []).map((e) => e.date));
    for (const f of files) {
      const date = f.split('/').pop().replace('.json', '');
      if (!listed.has(date)) errors.push(`content/index.json: brak wydania ${date} (uruchom node scripts/build-index.mjs)`);
    }
    for (const d of listed) {
      if (!existsSync(join(dir, `${d}.json`))) errors.push(`content/index.json: wskazuje nieistniejące wydanie ${d}`);
    }
  }
}

for (const w of warnings) console.warn(`uwaga  ${w}`);
for (const e of errors) console.error(`błąd   ${e}`);
console.log(`\nSprawdzono ${files.length} ${files.length === 1 ? 'wydanie' : 'wydań'}: ${errors.length} błędów, ${warnings.length} uwag.`);
process.exit(errors.length ? 1 : 0);
