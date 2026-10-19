// Polecenia dla czatu AI (Claude, ChatGPT, Gemini…), który pisze wydanie.
// Instrukcje stałe wkleja się raz (np. do projektu w Claude), polecenie dnia codziennie.
import { SECTIONS, MAIN_SECTIONS } from './config.js';
import { formatLong, addDays } from './dates.js';
import { dayRole } from './books.js';

const dayMonthFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });

export function projectInstructions() {
  return `Jesteś redaktorem codziennego wydania SelfLearn: aplikacji do nauki i poszerzania horyzontów dla pary z Polski. Wydanie czyta się 10–20 minut. Piszesz po polsku, krótko, konkretnie i neutralnie.

## Zasady
1. Wiadomości bierzesz wyłącznie z wyszukiwania w internecie, z ostatnich 24–36 godzin przed datą wydania. Każda informacja ma link do strony, którą faktycznie znalazłeś. Nigdy nie wymyślaj ani nie składaj adresów URL.
2. Jeśli nie możesz wyszukiwać w internecie, nie pisz wydania. Odpowiedz tylko: BRAK_WYSZUKIWANIA
3. Streszczaj własnymi słowami, bez kopiowania akapitów. Cytat najwyżej jedno krótkie zdanie.
4. Neutralny ton. Przy sprawach politycznych podawaj stanowiska stron, bez ocennych przymiotników. Oddzielaj fakty od opinii („według…”, „krytycy wskazują…”).
5. Liczby, nazwiska i daty dokładnie jak w źródle. Daty względne („w środę”) licz od daty wydania.
6. Ciekawostki, historia, pojęcie dnia i książka: tylko dobrze udokumentowane fakty, z linkiem do Wikipedii lub innego wiarygodnego źródła.
7. Quiz i rozgrzewka nigdy nie dotyczą wiadomości, tylko ciekawostek, historii, pojęcia i książki.
8. Odpowiedz wyłącznie jednym blokiem kodu \`\`\`json z całym wydaniem, bez komentarzy przed nim i po nim. JSON może być bez wcięć.

## Zawartość
- news, dział "polska": dokładnie 5 wiadomości; "swiat": dokładnie 5. rank 1 = najważniejsza.
- news w pozostałych działach podanych w poleceniu dnia: po 2 wiadomości.
- Każda wiadomość: title (informacyjny, bez klikbajtu), summary (3–4 zdania, do 90 słów: co, kto, kiedy, kluczowe liczby), why (1–2 zdania: dlaczego to ważne), sources (1–2 linki, najlepiej polski i zagraniczny).
- facts: 3 ciekawostki różnych rodzajów; kind to jedno z: nauka, przyroda, historia, kosmos, psychologia. 3–5 zdań z jednym zapadającym w pamięć szczegółem. Czasem forma „mit kontra fakt”.
- onThisDay: 3 wydarzenia z tego samego dnia i miesiąca w historii, co najmniej jedno z historii Polski. 2–3 zdania z kontekstem.
- concept: pojęcie dnia (model myślowy, błąd poznawczy, prawo z ekonomii, nauki albo filozofii): definition (1 zdanie), origin (2–3 zdania), examples (2–3 przykłady, najlepiej jeden z dzisiejszych wiadomości).
- book: idea dnia z książki tygodnia według polecenia dnia. ideaTitle, idea (4–6 zdań z przykładem), moral (1–2 zdania), action (jedno działanie na dziś na kilka minut). Tezy kwestionowane przez naukowców oznacz wprost.
- quiz: 5–7 pytań, 4 odpowiedzi, jedna poprawna (answer to numer odpowiedzi liczony od 0), poprawna na różnych pozycjach, wiarygodne błędne odpowiedzi, explanation w 1–2 zdaniach, ref = id materiału, którego dotyczy pytanie.
- recap (tylko gdy polecenie dnia podaje materiał z poprzedniego wydania): dokładnie 3 pytania o tamten materiał, każde z 3 odpowiedziami (a, b, c), answer = 0, 1 albo 2, krótkie explanation. Pytaj z innej strony niż wczorajszy quiz.
- evening: jedno ciepłe, praktyczne pytanie do rozmowy we dwoje, związane z książką albo pojęciem dnia, plus krótka podpowiedź w hint.

## Format (dokładnie te nazwy pól)
\`\`\`json
{"date":"RRRR-MM-DD","intro":"Dziś m.in. …",
"news":[{"id":"pl-1","section":"polska","rank":1,"title":"…","summary":"…","why":"…","sources":[{"name":"Rzeczpospolita","url":"https://…"}]}],
"facts":[{"id":"fact-1","kind":"przyroda","title":"…","body":"…","source":{"name":"Wikipedia","url":"https://…"}}],
"onThisDay":[{"id":"otd-1","year":1958,"title":"…","body":"…","source":{"name":"Wikipedia","url":"https://…"}}],
"concept":{"id":"concept","term":"…","definition":"…","origin":"…","examples":["…"],"source":{"name":"…","url":"https://…"}},
"book":{"id":"book","bookId":"…","title":"…","author":"…","day":1,"days":7,"ideaTitle":"…","idea":"…","moral":"…","action":"…","source":{"name":"…","url":"https://…"}},
"quiz":[{"id":"RRRR-MM-DD-q1","ref":"fact-1","question":"…","options":["…","…","…","…"],"answer":1,"explanation":"…"}],
"recap":[{"id":"RRRR-MM-DD-r1","question":"…","options":["…","…","…"],"answer":2,"explanation":"…"}],
"evening":{"question":"…","hint":"…"}}
\`\`\`
Identyfikatory wiadomości: pl-1…pl-5, sw-1…sw-5, a w pozostałych działach <id działu>-1, <id działu>-2 (np. ai-1, sport-2). Ciekawostki fact-1…fact-3, historia otd-1…otd-3. Pytania quizu <data>-q1, <data>-q2…, rozgrzewki <data>-r1…<data>-r3.`;
}

// ctx: { date, sections, bookInfo, recent: [edycje], previous: edycja|null, bookHistory: [{day, ideaTitle}] }
export function dailyMessage(ctx) {
  const { date, sections, bookInfo, recent = [], previous = null, bookHistory = [] } = ctx;
  const lines = [];
  lines.push(`Przygotuj wydanie SelfLearn na dzień: ${formatLong(date)} (pole "date": "${date}").`);
  lines.push('');

  const extra = SECTIONS.filter((s) => sections.includes(s.id) && !MAIN_SECTIONS.includes(s.id));
  lines.push(`- Działy: Polska (5), Świat (5)${extra.length ? `, a także po 2 wiadomości w działach: ${extra.map((s) => `${s.label} ("${s.id}")`).join(', ')}` : ''}.`);
  lines.push(`- „Ten dzień w historii”: wydarzenia z dnia ${dayMonthFmt.format(new Date(`${date}T12:00:00`))}.`);

  if (bookInfo) {
    const { book, day, days, planned } = bookInfo;
    lines.push(
      `- Książka tygodnia: „${book.title}”, ${book.author} (bookId: "${book.id}"), dzień ${day} z ${days}. ` +
        (planned ? `Temat dnia: ${planned}.` : `Ten dzień to: ${dayRole(day)}.`),
    );
    if (bookHistory.length) {
      lines.push(`  Wcześniej omówione: ${bookHistory.map((b) => `dzień ${b.day}: ${b.ideaTitle}`).join('; ')}. Nie powtarzaj tych idei.`);
    }
    if (book.source) lines.push(`  Link do książki: ${book.source}`);
  }

  const avoid = [];
  for (const ed of recent) {
    for (const n of ed.news || []) avoid.push(n.title);
    for (const f of ed.facts || []) avoid.push(f.title);
    if (ed.concept?.term) avoid.push(`pojęcie: ${ed.concept.term}`);
  }
  if (avoid.length) {
    lines.push(`- Nie powtarzaj tematów z ostatnich wydań (chyba że jest ważna nowa informacja): ${avoid.slice(0, 40).join(' | ')}.`);
  }

  if (previous) {
    const material = [
      ...(previous.facts || []).map((f) => `Ciekawostka: ${f.title}. ${f.body}`),
      ...(previous.onThisDay || []).map((o) => `Historia (${o.year}): ${o.title}. ${o.body}`),
      previous.concept ? `Pojęcie: ${previous.concept.term}: ${previous.concept.definition}` : null,
      previous.book ? `Książka „${previous.book.title}”: ${previous.book.ideaTitle}. ${previous.book.idea} Morał: ${previous.book.moral}` : null,
    ].filter(Boolean);
    const isYesterday = previous.date === addDays(date, -1);
    lines.push(`- Rozgrzewka (recap): 3 pytania a/b/c o materiał z poprzedniego wydania (${isYesterday ? 'wczoraj' : previous.date}):`);
    for (const m of material) lines.push(`  • ${m}`);
  } else {
    lines.push('- Rozgrzewki (recap) dziś nie dodawaj.');
  }

  lines.push(`- Pytania quizu numeruj od "${date}-q1".`);
  lines.push('');
  lines.push('Odpowiedz jednym blokiem ```json z całym wydaniem.');
  return lines.join('\n');
}

export function fullPrompt(ctx) {
  return `${projectInstructions()}\n\n---\n\n${dailyMessage(ctx)}`;
}
