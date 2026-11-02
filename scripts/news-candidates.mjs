// Zbiera nagłówki z Google News RSS do przeglądu redakcyjnego; nie tworzy ani nie publikuje wydań.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
const output = process.argv[2] || `drafts/news-${date}.json`;
const queries = {
  polska: 'Polska',
  swiat: 'świat OR world',
  bezpieczenstwo: 'bezpieczeństwo OR NATO OR wojsko OR Ukraina',
  gospodarka: 'gospodarka OR finanse OR ceny OR podatki',
  nieruchomosci: 'nieruchomości OR mieszkania OR najem OR kredyty',
  prawo: 'prawo OR przepisy OR konsument',
  technologia: 'technologia OR internet OR cyberbezpieczeństwo',
  ai: '"sztuczna inteligencja" OR AI',
  nauka: 'nauka OR badania OR odkrycia',
  kosmos: 'kosmos OR NASA OR astronomia',
  historia: 'historia OR archeologia',
  zdrowie: 'zdrowie OR medycyna OR szpitale',
  psychologia: 'psychologia OR relacje OR mózg',
  edukacja: 'edukacja OR szkoła OR studia',
  srodowisko: 'klimat OR środowisko OR energia',
  zwierzeta: 'zwierzęta OR przyroda OR gatunki',
  kultura: 'kultura OR książki OR teatr OR sztuka',
  filmy: 'film OR kino OR serial OR box office',
  muzyka: 'muzyka OR koncert OR album',
  gry: 'gry OR gaming OR premiera',
  sport: 'sport OR wyniki sportowe',
  motoryzacja: 'motoryzacja OR samochody OR elektromobilność',
  podroze: 'podróże OR loty OR turystyka',
  pokemon: 'Pokémon TCG OR Pokemon TCG',
};

function selectedSections() {
  const files = readdirSync('content/editions')
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .reverse();
  for (const name of files) {
    try {
      const edition = JSON.parse(readFileSync(`content/editions/${name}`, 'utf8'));
      const previousTopics = [...new Set((edition.news || []).map((item) => item.section))]
        .filter((section) => section !== 'polska' && section !== 'swiat' && queries[section]);
      return ['polska', 'swiat', ...previousTopics];
    } catch {
      // Pomijamy nieczytelne archiwum i szukamy najnowszego poprawnego wydania.
    }
  }
  return ['polska', 'swiat'];
}

const feeds = selectedSections().map((section) => {
  const q = encodeURIComponent(`${queries[section]} when:1d`);
  return { section, url: `https://news.google.com/rss/search?q=${q}&hl=pl&gl=PL&ceid=PL%3Apl` };
});

function decode(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
}

function tag(item, name) {
  return item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';
}

async function collect(feed) {
  const response = await fetch(feed.url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'SelfLearn-news-draft/1.0' } });
  if (!response.ok) throw new Error(`RSS ${feed.section}: HTTP ${response.status}`);
  const xml = await response.text();
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = decode(tag(item, 'title'));
    const link = decode(tag(item, 'link'));
    const publishedRaw = decode(tag(item, 'pubDate'));
    const publishedDate = publishedRaw ? new Date(publishedRaw) : null;
    const publishedAt = publishedDate && Number.isFinite(publishedDate.getTime()) ? publishedDate.toISOString() : null;
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const summary = decode(tag(item, 'description'));
    return { title, url: link, source: sourceMatch ? decode(sourceMatch[1]) : 'Google News RSS', publishedAt, summary };
  }).filter((item) => item.title && /^https:\/\//.test(item.url) && (!item.publishedAt || Date.parse(item.publishedAt) >= cutoff));
  return items;
}

const results = await Promise.allSettled(feeds.map(collect));
const sections = {};
for (let i = 0; i < feeds.length; i += 1) {
  const result = results[i];
  if (result.status === 'rejected') {
    console.warn(result.reason.message);
    sections[feeds[i].section] = [];
    continue;
  }
  const seen = new Set();
  sections[feeds[i].section] = result.value.filter((item) => {
    const key = item.title.toLocaleLowerCase('pl-PL');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

if (!Object.values(sections).some((items) => items.length)) throw new Error('Nie udało się pobrać kandydatów z żadnego kanału RSS.');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ date, generatedAt: new Date().toISOString(), reviewRequired: true, note: 'Nagłówki RSS z Polski, świata i działów wybranych w poprzednim wydaniu. Sprawdź źródła i fakty, otwórz artykuł wydawcy, napisz streszczenie własnymi słowami i przenieś zaakceptowane pozycje do wydania.', sections }, null, 2)}\n`);
const counts = feeds.map(({ section }) => `${section}: ${sections[section].length}`).join(', ');
console.log(`Zapisano ${output}: ${counts}. Każdy wpis wymaga weryfikacji.`);
