// Sprawdza poprawność wydań i indeksu. Uruchamiane w CI i przez codzienną rutynę.
// Użycie: node scripts/validate.mjs [ścieżka-do-wydania.json ...]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { validateEdition } from '../src/edition.js';

const dir = 'content/editions';
const errors = [];
const warnings = [];

function checkEdition(path) {
  const file = basename(path);
  let ed;
  try {
    ed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${file}: niepoprawny JSON: ${e.message}`);
    return;
  }
  if (file !== `${ed.date}.json`) errors.push(`${file}: nazwa pliku nie zgadza się z datą (${ed.date})`);
  const result = validateEdition(ed);
  errors.push(...result.errors.map((m) => `${file}: ${m}`));
  warnings.push(...result.warnings.map((m) => `${file}: ${m}`));
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
      const date = basename(f, '.json');
      if (!listed.has(date)) errors.push(`content/index.json: brak wydania ${date} (uruchom node scripts/build-index.mjs)`);
    }
    for (const d of listed) {
      if (!existsSync(join(dir, `${d}.json`))) errors.push(`content/index.json: wskazuje nieistniejące wydanie ${d}`);
    }
  }
}

for (const w of warnings) console.warn(`uwaga  ${w}`);
for (const e of errors) console.error(`błąd   ${e}`);
const n = files.length;
const word = n === 1 ? 'wydanie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'wydania' : 'wydań';
console.log(`\nSprawdzono ${n} ${word}: błędy: ${errors.length}, uwagi: ${warnings.length}.`);
process.exit(errors.length ? 1 : 0);
