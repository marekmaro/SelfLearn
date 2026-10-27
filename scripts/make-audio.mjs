// Nagrania lektora (MP3) dla wydań, żeby słuchać jak podcastu, także przy zgaszonym ekranie.
// Tekst pochodzi z src/chapters.js (ten sam, co przy czytaniu głosem telefonu), głos z Piper,
// sklejanie w Node, a MP3 robi ffmpeg. Uruchamia to GitHub Actions (.github/workflows/audio.yml):
// MP3 trafiają do wydania „lektor” na GitHubie (poza historią repozytorium), a czasy fragmentów
// do content/audio/RRRR-MM-DD.json.
//
// Użycie:
//   node scripts/make-audio.mjs --list [daty…]                 daty do nagrania (brak nagrania albo zmieniony tekst)
//   node scripts/make-audio.mjs --tts "<polecenie>" [--voice nazwa] [--out katalog] [--force] daty…
//   node scripts/make-audio.mjs --old 30 plik.mp3…             pliki starsze niż 30 dni (do usunięcia z wydania)
// Polecenie --tts dostaje tekst na wejściu i dopisany argument --output_file plik.wav (jak Piper).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { narrationChapters, editionNarration } from '../src/chapters.js';
import { todayISO, addDays, isISODate } from '../src/dates.js';

const AUDIO_DIR = 'content/audio';
const RELEASE = 'lektor';
const RECENT_DAYS = 3;
const PAUSE_ITEM = 0.7;
const PAUSE_CHAPTER = 1.2;

// Skróty i zapisy, które syntezator czyta źle albo dosłownie. Granice słów liczone z polskimi literami
// (zwykłe \b w JavaScripcie nie uznaje „ł” czy „ś” za litery).
const word = (src) => new RegExp(`(?<![\\p{L}\\d])${src}(?![\\p{L}])`, 'gu');
const WORDS = [
  [word('m\\.in\\.'), 'między innymi'],
  [word('tzw\\.'), 'tak zwany'],
  [word('np\\.'), 'na przykład'],
  [word('itd\\.'), 'i tak dalej'],
  [word('ok\\.'), 'około'],
  [word('ds\\.'), 'do spraw'],
  [word('gen\\.'), 'generał'],
  [word('prof\\.'), 'profesor'],
  [word('dr\\.?'), 'doktor'],
  [word('św\\.'), 'święty'],
  [word('ul\\.'), 'ulica'],
  [word('nr'), 'numer'],
  [word('tys\\.'), 'tysięcy'],
  [word('mln'), 'milionów'],
  [word('mld'), 'miliardów'],
  [word('zł'), 'złotych'],
  [word('km/h'), 'kilometrów na godzinę'],
];

export function speakable(text) {
  let t = String(text || '');
  t = t.replace(/(\d)\s*r\.(?=[\s,;:)]|$)/g, '$1 roku');
  for (const [re, word] of WORDS) t = t.replace(re, word);
  return t
    .replace(/(\d)\s*%/g, '$1 procent')
    .replace(/(\d)\s*°C?/g, '$1 stopni')
    .replace(/\b(\d{1,2}):(\d)(?!\d)/g, '$1 do $2') // wynik meczu 2:1
    .replace(/\b(\d{1,2}):00\b/g, '$1') // godzina 3:00
    .replace(/\b(\d{1,2}):(\d{2})\b/g, '$1 $2') // godzina 21:30
    .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 do $2')
    .replace(/[„”"«»]/g, '')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Odcisk tekstu i głosu: gdy wydanie się zmieni, nagranie trzeba zrobić od nowa.
export function narrationHash(items, voice) {
  const h = createHash('sha256');
  h.update(String(voice));
  for (const it of items) h.update(`\u0000${it.id}\u0000${speakable(it.text)}`);
  return h.digest('hex').slice(0, 16);
}

export function loadNarration(date, dir = 'content/editions') {
  const edition = JSON.parse(readFileSync(join(dir, `${date}.json`), 'utf8'));
  return editionNarration(edition, narrationChapters(edition));
}

// WAV z Piper: 16-bitowe PCM. Zwraca format i same próbki.
export function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('To nie jest plik WAV');
  let off = 12;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === 'data') {
      if (!fmt) throw new Error('WAV bez nagłówka fmt');
      return { ...fmt, data: buf.subarray(off + 8, off + 8 + Math.min(size, buf.length - off - 8)) };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV bez danych');
}

export function writeWav({ channels, sampleRate, bits }, data) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  head.writeUInt16LE((channels * bits) / 8, 32);
  head.writeUInt16LE(bits, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// Skleja nagrania fragmentów z przerwami (dłuższymi między rozdziałami) i liczy, gdzie zaczyna się każdy fragment.
export function joinClips(clips) {
  const fmt = clips[0].wav;
  const bytesPerSecond = (fmt.sampleRate * fmt.channels * fmt.bits) / 8;
  const silence = (s) => Buffer.alloc(Math.round(s * bytesPerSecond / 2) * 2);
  const parts = [silence(0.3)];
  let at = 0.3;
  const items = [];
  clips.forEach((c, i) => {
    const w = c.wav;
    if (w.sampleRate !== fmt.sampleRate || w.channels !== fmt.channels || w.bits !== fmt.bits) throw new Error('Fragmenty mają różne formaty dźwięku');
    if (i > 0) {
      const pause = c.item.chapter !== clips[i - 1].item.chapter ? PAUSE_CHAPTER : PAUSE_ITEM;
      parts.push(silence(pause));
      at += pause;
    }
    const length = w.data.length / bytesPerSecond;
    items.push({ id: c.item.id, chapter: c.item.chapter, label: c.item.label, start: round(at), end: round(at + length) });
    parts.push(w.data);
    at += length;
  });
  parts.push(silence(0.5));
  return { data: Buffer.concat(parts), items, duration: round(at + 0.5) };
}

const round = (x) => Math.round(x * 100) / 100;

function audioMeta(date) {
  const file = join(AUDIO_DIR, `${date}.json`);
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
}

// Daty do nagrania: podane albo wydania z ostatnich dni, bez nagrania lub ze zmienionym tekstem.
export function datesToRecord({ dates = [], voice, today = todayISO(), editionsDir = 'content/editions', meta = audioMeta } = {}) {
  const all = readdirSync(editionsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10));
  const wanted = dates.length ? dates.filter((d) => all.includes(d)) : all.filter((d) => d >= addDays(today, -RECENT_DAYS) && d <= addDays(today, 1));
  return wanted.sort().filter((d) => {
    const m = meta(d);
    return !m || m.hash !== narrationHash(loadNarration(d, editionsDir), voice);
  });
}

function record(date, { tts, voice, out, repo }) {
  const items = loadNarration(date);
  const work = join(tmpdir(), `selflearn-audio-${date}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const [cmd, ...args] = tts.split(/\s+/).filter(Boolean);
  const clips = items.map((item, i) => {
    const wavPath = join(work, `${String(i).padStart(3, '0')}.wav`);
    const run = spawnSync(cmd, [...args, '--output_file', wavPath], { input: speakable(item.text), encoding: 'utf8' });
    if (run.status !== 0 || !existsSync(wavPath)) throw new Error(`Lektor nie nagrał „${item.label}”: ${run.stderr || run.error}`);
    return { item, wav: readWav(readFileSync(wavPath)) };
  });
  const joined = joinClips(clips);
  const allWav = join(work, 'all.wav');
  writeFileSync(allWav, writeWav(clips[0].wav, joined.data));
  mkdirSync(out, { recursive: true });
  const mp3 = join(out, `${date}.mp3`);
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', allWav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '32k', '-metadata', `title=SelfLearn ${date}`, '-metadata', 'artist=SelfLearn', mp3], { encoding: 'utf8' });
  if (ff.status !== 0) throw new Error(`ffmpeg: ${ff.stderr || ff.error}`);
  rmSync(work, { recursive: true, force: true });

  const meta = {
    date,
    file: `${date}.mp3`,
    url: `audio/${date}.mp3`,
    source: `https://github.com/${repo}/releases/download/${RELEASE}/${date}.mp3`,
    voice,
    hash: narrationHash(items, voice),
    duration: joined.duration,
    items: joined.items,
  };
  mkdirSync(AUDIO_DIR, { recursive: true });
  writeFileSync(join(AUDIO_DIR, `${date}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  const size = readFileSync(mp3).length;
  console.log(`${date}: ${items.length} fragmentów, ${Math.round(joined.duration / 60)} min, ${(size / 1048576).toFixed(1)} MB`);
}

function main(argv) {
  const opt = { tts: null, voice: 'piper', out: 'audio-out', force: false, list: false, old: null, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tts') opt.tts = argv[++i];
    else if (a === '--voice') opt.voice = argv[++i];
    else if (a === '--out') opt.out = argv[++i];
    else if (a === '--force') opt.force = true;
    else if (a === '--list') opt.list = true;
    else if (a === '--old') opt.old = Number(argv[++i]);
    else opt.rest.push(a);
  }

  if (opt.old) {
    const limit = addDays(todayISO(), -opt.old);
    for (const f of opt.rest) if (/^\d{4}-\d{2}-\d{2}\.mp3$/.test(f) && f.slice(0, 10) < limit) console.log(f);
    return;
  }

  // Daty z wejścia (np. z formularza w GitHub Actions) przechodzą tylko w postaci RRRR-MM-DD.
  const dates = opt.rest.flatMap((a) => a.split(/[\s,]+/)).filter(isISODate);
  if (opt.list) {
    console.log(datesToRecord({ dates, voice: opt.voice }).join(' '));
    return;
  }
  if (!opt.tts) throw new Error('Podaj --tts "<polecenie lektora>"');
  const todo = opt.force && dates.length ? dates.filter((d) => existsSync(join('content/editions', `${d}.json`))) : datesToRecord({ dates, voice: opt.voice });
  if (!todo.length) console.log('Nic do nagrania.');
  const repo = process.env.GITHUB_REPOSITORY || 'marekmaro/SelfLearn';
  for (const date of todo) record(date, { ...opt, repo });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
