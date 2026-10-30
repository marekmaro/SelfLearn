// Składa stronę do katalogu public/ (Vercel publikuje tylko jego zawartość).
// Do tego pobiera nagrania lektora (MP3) z wydania „lektor” na GitHubie: w repozytorium są tylko
// ich opisy (content/audio/*.json), a strona serwuje pliki z własnego adresu (audio/…), żeby iPhone
// dostał właściwy typ pliku i mógł przewijać nagranie.
// Użycie: node scripts/build-site.mjs  (bez sieci strona i tak się złoży, tylko bez nagrań)
import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'public';
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'assets', 'content'];
const AUDIO_DAYS = 10;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of FILES) {
  if (!existsSync(f)) throw new Error(`Brak ${f} – nie mogę złożyć strony.`);
  cpSync(f, `${OUT}/${f}`, { recursive: true });
}
console.log(`Strona gotowa w ${OUT}/ (${FILES.join(', ')})`);

// Nagrania z ostatnich dni, dla każdego lektora osobno (RRRR-MM-DD.json to głos domyślny,
// RRRR-MM-DD-darkman.json itd. – pozostałe). Gdy pliku nie da się pobrać, jego opis znika ze strony,
// a aplikacja gra inne nagranie albo czyta głosem telefonu.
const metaDir = `${OUT}/content/audio`;
if (existsSync(metaDir)) {
  const metas = readdirSync(metaDir).filter((f) => /^\d{4}-\d{2}-\d{2}(-[a-z0-9_]+)?\.json$/.test(f)).sort();
  const byVoice = new Map();
  for (const f of metas) {
    const voice = f.slice(10, -5);
    byVoice.set(voice, [...(byVoice.get(voice) || []), f]);
  }
  const keep = new Set([...byVoice.values()].flatMap((list) => list.slice(-AUDIO_DAYS)));
  mkdirSync(`${OUT}/audio`, { recursive: true });
  let ok = 0;
  for (const f of metas) {
    if (!keep.has(f)) {
      rmSync(`${metaDir}/${f}`);
      continue;
    }
    try {
      const meta = JSON.parse(readFileSync(`${metaDir}/${f}`, 'utf8'));
      if (meta.file !== `${f.slice(0, -5)}.mp3` || !/^https:\/\/github\.com\//.test(meta.source)) throw new Error('nieprawidłowy opis');
      const res = await fetch(meta.source);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(`${OUT}/audio/${meta.file}`, Buffer.from(await res.arrayBuffer()));
      ok += 1;
    } catch (err) {
      console.warn(`Nagranie ${f}: ${err.message} – to wydanie będzie czytane głosem telefonu.`);
      rmSync(`${metaDir}/${f}`, { force: true });
    }
  }
  console.log(`Nagrania lektora: ${ok} z ${keep.size}`);
}
