// Tekst do czytania na głos: skróty, daty, godziny i liczby zapisane tak, jak mówi lektor.
// Wspólny dla głosu telefonu (src/listen.js) i nagrań MP3 (scripts/make-audio.mjs).
// Bez tego syntezator czyta „27 października 1939 r.” jako „dwadzieścia siedem… tysiąc dziewięćset
// trzydzieści dziewięć r”, a „o 3:00” jako „o trzy zero zero”.

// Granice słów liczone z polskimi literami (zwykłe \b w JavaScripcie nie uznaje „ł” czy „ś” za litery).
const word = (src) => new RegExp(`(?<![\\p{L}\\d])${src}(?![\\p{L}])`, 'gu');

const WORDS = [
  [word('m\\.in\\.'), 'między innymi'],
  [word('p\\.n\\.e\\.'), 'przed naszą erą'],
  [word('n\\.e\\.'), 'naszej ery'],
  [word('tzw\\.'), 'tak zwany'],
  [word('np\\.'), 'na przykład'],
  [word('itd\\.'), 'i tak dalej'],
  [word('itp\\.'), 'i tym podobne'],
  [word('tj\\.'), 'to jest'],
  [word('ok\\.'), 'około'],
  [word('ds\\.'), 'do spraw'],
  [word('ws\\.'), 'w sprawie'],
  [word('wg'), 'według'],
  [word('gen\\.'), 'generał'],
  [word('płk'), 'pułkownik'],
  [word('prof\\.'), 'profesor'],
  [word('dr\\.?'), 'doktor'],
  [word('ks\\.'), 'ksiądz'],
  [word('abp'), 'arcybiskup'],
  [word('św\\.'), 'święty'],
  [word('ul\\.'), 'ulica'],
  [word('al\\.'), 'aleja'],
  [word('woj\\.'), 'województwo'],
  [word('im\\.'), 'imienia'],
  [word('godz\\.'), 'godzina'],
  [word('nr'), 'numer'],
  [word('pkt'), 'punktów'],
  [word('proc\\.'), 'procent'],
  [word('tys\\.'), 'tysięcy'],
  [word('mln'), 'milionów'],
  [word('mld'), 'miliardów'],
  [word('bln'), 'bilionów'],
  [word('zł'), 'złotych'],
  [word('km/h'), 'kilometrów na godzinę'],
  [word('km'), 'kilometrów'],
  [word('kg'), 'kilogramów'],
  [word('cm'), 'centymetrów'],
];

// Skróty literowane po polsku (syntezator czytałby je jak słowa albo po angielsku).
const ACRONYMS = {
  AI: 'ej aj', USA: 'u es a', UE: 'u e', ONZ: 'o en zet', IPO: 'i pe o', TSE: 'te es e', CBA: 'ce be a', IPN: 'i pe en',
  KPO: 'ka pe o', PKO: 'pe ka o', WHO: 'wu ha o', RPO: 'er pe o', ABW: 'a be wu', AMD: 'a em de', SEC: 'es e ce', UOKiK: 'uokik',
};
const LETTERS = { B: 'be', C: 'ce', D: 'de', F: 'ef', G: 'gie', H: 'ha', J: 'jot', K: 'ka', L: 'el', M: 'em', N: 'en', P: 'pe', R: 'er', S: 'es', T: 'te', W: 'wu', X: 'iks', Z: 'zet' };

// ---------- Liczebniki porządkowe (daty, lata, godziny) ----------

const UNITS = ['', 'pierwsz', 'drugi', 'trzeci', 'czwart', 'piąt', 'szóst', 'siódm', 'ósm', 'dziewiąt'];
const TEENS = ['dziesiąt', 'jedenast', 'dwunast', 'trzynast', 'czternast', 'piętnast', 'szesnast', 'siedemnast', 'osiemnast', 'dziewiętnast'];
const TENS = ['', '', 'dwudziest', 'trzydziest', 'czterdziest', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
const HUNDREDS = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
const HUNDREDS_ORD = ['', 'setn', 'dwusetn', 'trzechsetn', 'czterechsetn', 'pięćsetn', 'sześćsetn', 'siedemsetn', 'osiemsetn', 'dziewięćsetn'];

// Końcówka przypadka: gen – dopełniacz męski („drugiego”), loc – miejscownik męski („drugim”),
// fem – dopełniacz i miejscownik żeński („drugiej”), nomM / nomF / accF – „drugi”, „druga”, „drugą”
// (ta sama forma co narzędnik: „przed drugą wojną”).
function ending(stem, form) {
  const soft = stem.endsWith('i');
  const hard = stem === 'drugi' ? 'drug' : stem;
  if (form === 'gen') return `${stem}ego`;
  if (form === 'loc') return soft ? `${stem}m` : `${stem}ym`;
  if (form === 'nomM') return soft ? stem : `${stem}y`;
  if (form === 'nomF') return `${hard}a`;
  if (form === 'accF') return `${hard}ą`;
  return `${stem}ej`;
}

// 1–99 jako liczebnik porządkowy, np. 27 → „dwudziestego siódmego”.
function ordinalSmall(n, form) {
  if (n < 10) return ending(UNITS[n], form);
  if (n < 20) return ending(TEENS[n - 10], form);
  const tens = ending(TENS[Math.floor(n / 10)], form);
  return n % 10 ? `${tens} ${ending(UNITS[n % 10], form)}` : tens;
}

// Rok jako liczebnik porządkowy: 1939 → „tysiąc dziewięćset trzydziestego dziewiątego”, 2000 → „dwutysięcznego”.
export function yearOrdinal(year, form = 'gen') {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1000 || y > 2099) return String(year);
  const thousands = Math.floor(y / 1000);
  const hundreds = Math.floor((y % 1000) / 100);
  const rest = y % 100;
  if (!hundreds && !rest) return ending(thousands === 1 ? 'tysięczn' : 'dwutysięczn', form);
  const head = thousands === 1 ? 'tysiąc' : 'dwa tysiące';
  if (!rest) return `${head} ${ending(HUNDREDS_ORD[hundreds], form)}`;
  return [head, HUNDREDS[hundreds], ordinalSmall(rest, form)].filter(Boolean).join(' ');
}

// Liczby rzymskie przed słowem, które mówi, jak je odmienić: „XX wieku”, „II wojny”, „I kwartale”.
const ROMAN_NOUNS = {
  wiek: 'nomM', wieku: 'gen', kwartał: 'nomM', kwartału: 'gen', kwartale: 'loc',
  wojna: 'nomF', wojny: 'fem', wojnie: 'fem', wojnę: 'accF', wojną: 'accF', tura: 'nomF', tury: 'fem', turze: 'fem', turę: 'accF', turą: 'accF',
};

export function romanToInt(text) {
  const values = { I: 1, V: 5, X: 10, L: 50 };
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const v = values[text[i]];
    const next = values[text[i + 1]] || 0;
    total += v < next ? -v : v;
  }
  return total;
}

// Formy: jeden, dwa–cztery, pięć i więcej, ułamek.
const BIG = {
  'tys.': ['tysiąc', 'tysiące', 'tysięcy', 'tysiąca'],
  mln: ['milion', 'miliony', 'milionów', 'miliona'],
  mld: ['miliard', 'miliardy', 'miliardów', 'miliarda'],
  bln: ['bilion', 'biliony', 'bilionów', 'biliona'],
};

function bigNumber(int, frac, forms) {
  if (frac) return forms[3];
  const n = Number(int);
  if (n === 1) return forms[0];
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? forms[1] : forms[2];
}

const MONTHS = 'stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia';

// Kropka w „r.” bywa też końcem zdania: „…od wejścia na giełdę w 2004 r. Wartość spółki…”. Bez niej
// lektor czytałby dwa zdania jednym tchem. Gdy przed datą stoi najwyżej kilka słów („Od 2024 r. Polska…”,
// „27 sierpnia 1896 r. Wielka…”), to zwykle okolicznik czasu na początku zdania, więc kropki nie zostawiamy.
function sentenceEnd(text, at, match, abbr, maxOpening) {
  if (abbr !== 'r.' || !/^\s+[A-ZĄĆĘŁŃÓŚŹŻ]/.test(text.slice(at + match.length))) return '';
  const before = text.slice(0, at);
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
  return before.slice(start + 1).trim().split(/\s+/).filter(Boolean).length > maxOpening ? '.' : '';
}

export function speakable(text) {
  let t = String(text || '');

  // Liczby z odstępami co trzy cyfry („64 256 232”) to jedna liczba, nie trzy.
  t = t.replace(/(?<![\d,])(\d{1,3})((?:[   ]\d{3})+)(?![\d,]|[   ]\d)/g, (m) => m.replace(/[   ]/g, ''));

  // Lata z „r.”/„roku”: „w 2025 r.” → „w dwa tysiące dwudziestym piątym roku”, „z 1997 r.” → „…dziewięćdziesiątego siódmego roku”.
  t = t.replace(/(?<![\p{L}\d])(w|we|W|We)\s+(\d{4})\s*(r\.|roku)(?![\p{L}])/gu, (m, prep, y, r, at, s) => `${prep} ${yearOrdinal(y, 'loc')} roku${sentenceEnd(s, at, m, r, 2)}`);
  t = t.replace(/(?<![\d,])(\d{4})\s*(r\.|roku)(?![\p{L}])/gu, (m, y, r, at, s) => `${yearOrdinal(y, 'gen')} roku${sentenceEnd(s, at, m, r, 3)}`);
  // Pozostałe „r.” po liczbie.
  t = t.replace(/(\d)\s*r\.(?=[\s,;:)]|$)/g, (m, d, at, s) => `${d} roku${sentenceEnd(s, at, m, 'r.', 3)}`);

  // Liczby rzymskie przy wiekach, wojnach, turach i kwartałach. „w XX wieku” to miejscownik („dwudziestym”).
  t = t.replace(new RegExp(`(?<![\\p{L}])(?:(w|we|W|We)\\s+)?([IVXL]{1,6})\\s+(${Object.keys(ROMAN_NOUNS).join('|')})(?![\\p{L}])`, 'gu'), (m, prep, roman, noun) => {
    const n = romanToInt(roman);
    if (!/^(?:X{0,3})(?:IX|IV|V?I{0,3})$/.test(roman) || n < 1 || n > 39) return m;
    const form = prep && noun === 'wieku' ? 'loc' : ROMAN_NOUNS[noun];
    return `${prep ? `${prep} ` : ''}${ordinalSmall(n, form)} ${noun}`;
  });

  // Dzień miesiąca: „27 października” → „dwudziestego siódmego października”.
  t = t.replace(new RegExp(`(?<![\\d,])([1-9]|[12]\\d|3[01])\\s+(${MONTHS})`, 'g'), (m, d, month) => `${ordinalSmall(Number(d), 'gen')} ${month}`);

  // Godziny po „o/od/do”: „o 3:00” → „o trzeciej”, „do 21:30” → „do dwudziestej pierwszej trzydzieści”.
  t = t.replace(/(?<![\p{L}])(o|od|do|około)\s+([01]?\d|2[0-3]):([0-5]\d)(?!\d)/gu, (m, prep, hh, mm) => {
    const hour = Number(hh) === 0 ? 'północy' : ordinalSmall(Number(hh), 'fem');
    return `${prep} ${hour}${mm === '00' ? '' : ` ${Number(mm)}`}`;
  });

  // Tysiące, miliony i miliardy odmienione przez liczbę: „1 mld” → „1 miliard”, „22 mln” → „22 miliony”, „2,5 mln” → „2,5 miliona”.
  t = t.replace(/(?<![\d,])(\d+)(,\d+)?\s*(tys\.|mln|mld|bln)(?![\p{L}])/gu, (m, int, frac, unit) => `${int}${frac || ''} ${bigNumber(int, frac, BIG[unit])}`);

  for (const [re, w] of WORDS) t = t.replace(re, w);
  t = t.replace(/(?<![\p{L}])([A-ZĄĆĘŁŃÓŚŹŻ][A-Za-ząćęłńóśźż]{1,4})(?![\p{L}])/gu, (m) => {
    if (ACRONYMS[m]) return ACRONYMS[m];
    if (m !== m.toUpperCase()) return m;
    // Liczby rzymskie (XX, XIX) zostają; same spółgłoski (NFZ, PKW, PKP) literujemy.
    if (/^[IVXL]+$/.test(m)) return m;
    return [...m].every((ch) => LETTERS[ch]) ? [...m].map((ch) => LETTERS[ch]).join(' ') : m;
  });

  return t
    .replace(/(\d)\s*%/g, '$1 procent')
    .replace(/(\d)\s*°C?/g, '$1 stopni')
    .replace(/\b(\d{1,2}):(\d)(?!\d)/g, '$1 do $2') // wynik meczu 2:1
    .replace(/\b(\d{1,2}):00\b/g, '$1') // godzina 3:00 bez przyimka
    .replace(/\b(\d{1,2}):(\d{2})\b/g, '$1 $2') // godzina 21:30 bez przyimka
    .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 do $2')
    .replace(/[„”"«»]/g, '')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
