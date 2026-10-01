// Odbudowuje content/index.json na podstawie plików w content/editions/.
// Uruchom po dodaniu nowego wydania: node scripts/build-index.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'content/editions';
const editions = readdirSync(dir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .reverse()
  .map((f) => {
    const ed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const top = (ed.news || []).find((n) => n.section === 'polska' && n.rank === 1) || (ed.news || [])[0];
    return { date: ed.date, headline: top?.title || '' };
  });

writeFileSync('content/index.json', `${JSON.stringify({ editions }, null, 2)}\n`);
const n = editions.length;
const word = n === 1 ? 'wydanie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'wydania' : 'wydań';
console.log(`content/index.json: ${n} ${word}`);
