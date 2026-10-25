// Wypisuje pełne polecenie dla czatu AI na dany dzień (to samo, co „Przygotuj wydanie” w aplikacji).
// Użycie: node scripts/prompt.mjs [RRRR-MM-DD] [--dwie-czesci]   (domyślnie dziś w strefie Europe/Warsaw)
// --dwie-czesci: czat odpowie w dwóch blokach (dla czatów, które ucinają długie odpowiedzi).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fullPrompt, usedMaterial } from '../src/prompt.js';
import { indexEntry } from '../src/edition.js';
import { bookForDate } from '../src/books.js';
import { addDays } from '../src/dates.js';
import { MAIN_SECTIONS } from '../src/config.js';

const args = process.argv.slice(2);
const parts = args.includes('--dwie-czesci') ? 2 : 1;
const date =
  args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const dir = 'content/editions';
const read = (d) => JSON.parse(readFileSync(join(dir, `${d}.json`), 'utf8'));
const before = readdirSync(dir)
  .map((f) => f.replace('.json', ''))
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < date)
  .sort()
  .reverse();

const recent = before.slice(0, 3).map(read);
const previous = recent[0] || null;
const bookInfo = bookForDate(JSON.parse(readFileSync('content/books.json', 'utf8')), date);
const bookHistory = [];
if (bookInfo) {
  for (let i = bookInfo.day - 1; i >= 1; i -= 1) {
    const d = addDays(date, -i);
    if (!before.includes(d)) continue;
    const ed = read(d);
    if (ed.book?.bookId === bookInfo.book.id) bookHistory.push({ day: ed.book.day, ideaTitle: ed.book.ideaTitle });
  }
}
// Działy: Polska, Świat i te, które były w ostatnim wydaniu.
const sections = [...new Set([...MAIN_SECTIONS, ...(previous?.news || []).map((n) => n.section)])];

const used = usedMaterial(before.map((d) => indexEntry(read(d))), date);

console.log(fullPrompt({ date, sections, bookInfo, recent, previous, bookHistory, used, parts }));
