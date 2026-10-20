// Sprawdza, czy aplikacja poradzi sobie z odpowiedziami różnych czatów AI:
// znaczniki cytowań i linki z utm (ChatGPT), przypisy [1] (Perplexity), linki przekierowujące (Gemini),
// wydanie w dwóch częściach, przecinki na końcu list i ucięta odpowiedź.
// Użycie: node scripts/selftest.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { extractJSON, cleanEdition, validateEdition } from '../src/edition.js';
import { projectInstructions, dailyMessage, CHATS } from '../src/prompt.js';
import { recurrence } from '../src/calendar.js';

const latest = readdirSync('content/editions').filter((f) => f.endsWith('.json')).sort().pop();
const base = JSON.parse(readFileSync(`content/editions/${latest}`, 'utf8'));
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok     ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`BŁĄD   ${name}: ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const fence = (obj) => `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
const check = (text) => {
  const { edition, fixes } = cleanEdition(extractJSON(text));
  return { edition, fixes, ...validateEdition(edition) };
};

test('ChatGPT: znaczniki cytowań, utm, liczby jako tekst i odpowiedź literą', () => {
  const ed = structuredClone(base);
  ed.news[0].summary += ' citeturn0search1';
  ed.news[1].summary += ' citeturn0news3turn0search7';
  ed.news[2].why = `${ed.news[2].why} 【4†source】`;
  ed.news[0].sources[0].url += '?utm_source=chatgpt.com';
  ed.news[0].rank = '1';
  ed.quiz[0].answer = 'c';
  const r = check(`Oto wydanie na dziś:\n\n${fence(ed)}\n\nDaj znać, czy coś poprawić.`);
  assert(!r.errors.length, r.errors.join('; '));
  assert(!/cite|【|/.test(JSON.stringify(r.edition.news)), 'zostały znaczniki cytowań');
  assert(!r.edition.news[0].sources[0].url.includes('utm_'), 'został parametr utm');
  assert(r.edition.news[0].rank === 1, 'rank nie jest liczbą');
  assert(r.edition.quiz[0].answer === 2, 'odpowiedź „c” nie zamieniła się na 2');
  assert(r.fixes.length >= 4, `za mało poprawek: ${r.fixes.join('; ')}`);
});

test('Perplexity: przypisy [1][2] w tekście', () => {
  const ed = structuredClone(base);
  ed.news[3].summary = `${ed.news[3].summary.replace(/\.$/, '')}[1][2].`;
  const r = check(fence(ed));
  assert(!/\[\d\]/.test(r.edition.news[3].summary), 'zostały przypisy');
  assert(r.edition.news[3].summary.endsWith('.'), 'zgubiona kropka');
});

test('Gemini: link przekierowujący to błąd', () => {
  const ed = structuredClone(base);
  ed.news[4].sources[0].url = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';
  const r = check(fence(ed));
  assert(r.errors.some((e) => e.includes('przekierowujący')), 'brak błędu o przekierowaniu');
});

test('Dwie części wklejone razem sklejają się w jedno wydanie', () => {
  const { date, intro, news, ...rest } = base;
  const text = `Część 1:\n${fence({ date, intro, news })}\n\nCzęść 2:\n${fence({ date, ...rest })}`;
  const r = check(text);
  assert(!r.errors.length, r.errors.join('; '));
  assert(r.edition.news.length === base.news.length && r.edition.quiz.length === base.quiz.length, 'części nie zostały sklejone');
});

test('Sama pierwsza część daje uwagę o brakach', () => {
  const r = check(fence({ date: base.date, intro: base.intro, news: base.news }));
  assert(r.warnings.some((w) => w.startsWith('brak:')), 'brak uwagi o brakujących częściach');
});

test('Przecinek po ostatnim elemencie listy jest naprawiany', () => {
  const json = JSON.stringify(base).replace('}],"facts"', '},],"facts"');
  assert(json.includes('},],"facts"'), 'test nie wstawił przecinka');
  let strict = true;
  try {
    JSON.parse(json);
  } catch {
    strict = false;
  }
  assert(!strict, 'zepsuty JSON przeszedł zwykłe JSON.parse');
  const r = check(json);
  assert(r.edition.news.length === base.news.length, 'nie udało się odczytać');
});

test('Ucięta odpowiedź daje zrozumiały komunikat', () => {
  const text = fence(base).slice(0, 3000);
  let message = '';
  try {
    extractJSON(text);
  } catch (err) {
    message = err.message;
  }
  assert(message.includes('ucięta'), `komunikat: ${message || '(brak błędu)'}`);
});

test('Polecenie: zasady o linkach i cytowaniach, tryb dwóch części, czaty', () => {
  const rules = projectInstructions();
  assert(rules.includes('utm_') && rules.includes('vertexaisearch') && rules.includes('cite'), 'brak zasad o linkach i cytowaniach');
  const msg = dailyMessage({ date: '2026-10-21', sections: ['polska', 'swiat'], parts: 2 });
  assert(msg.includes('dwóch częściach') && msg.includes('„dalej”'), 'brak instrukcji dla dwóch części');
  assert(CHATS.length >= 5 && CHATS.every((c) => c.tips.length), 'brak wskazówek dla czatów');
});

test('Kalendarz: reguła powtarzania dla wybranych dni', () => {
  assert(recurrence([0, 1, 2, 3, 4, 5, 6]) === 'RRULE:FREQ=DAILY', 'codziennie');
  assert(recurrence([1, 2, 3, 4, 5]) === 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'dni robocze');
});

console.log(failed ? `\nNie przeszło: ${failed}.` : '\nWszystkie testy przeszły.');
process.exit(failed ? 1 : 0);
