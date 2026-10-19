// Składa stronę do katalogu public/ (Vercel publikuje tylko jego zawartość).
// Użycie: node scripts/build-site.mjs
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

const OUT = 'public';
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'assets', 'content'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of FILES) {
  if (!existsSync(f)) throw new Error(`Brak ${f} – nie mogę złożyć strony.`);
  cpSync(f, `${OUT}/${f}`, { recursive: true });
}
console.log(`Strona gotowa w ${OUT}/ (${FILES.join(', ')})`);
