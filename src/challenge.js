// Wyzwanie we dwoje: wynik quizu wysłany linkiem. Druga osoba rozwiązuje ten sam quiz
// i oboje widzicie porównanie. Bez serwera: wynik i imię są zapisane w samym linku.
import { getState, update } from './store.js';
import { toast } from './ui.js';

// #wyzwanie/2026-10-20/6/7/Marek
export function parseChallenge(hash) {
  const m = String(hash || '').match(/^wyzwanie\/(\d{4}-\d{2}-\d{2})\/(\d{1,2})\/(\d{1,2})\/(.{1,40})$/);
  if (!m) return null;
  const score = Number(m[2]);
  const total = Number(m[3]);
  if (!total || score > total) return null;
  return { date: m[1], score, total, from: m[4].trim() };
}

export function receiveChallenge(ch) {
  update((s) => {
    s.challenges ||= {};
    s.challenges[ch.date] = { from: ch.from, score: ch.score, total: ch.total, at: new Date().toISOString() };
  });
}

export function challengeFor(date) {
  return getState().challenges?.[date] || null;
}

export function verdict(mine, theirs) {
  if (mine > theirs.score) return 'Wygrywasz!';
  if (mine === theirs.score) return 'Remis!';
  return `Tym razem wygrywa ${theirs.from}.`;
}

export async function shareChallenge(date, score, total) {
  const name = getState().profile?.name || 'Ktoś';
  const url = `${location.href.split('#')[0]}#wyzwanie/${date}/${score}/${total}/${encodeURIComponent(name)}`;
  const reply = Boolean(challengeFor(date));
  const text = reply
    ? `Mój wynik w quizie SelfLearn: ${score}/${total}. Zobacz porównanie:`
    : `Mam ${score}/${total} w quizie SelfLearn. Pobijesz ten wynik?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Wyzwanie SelfLearn', text, url });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Link skopiowany. Wyślij go drugiej osobie.');
  } catch {
    toast('Nie udało się skopiować linku.');
  }
}
