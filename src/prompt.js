// Polecenia dla czatu AI (Claude, ChatGPT, Gemini, Perplexity, Copilot…), który pisze wydanie.
// Instrukcje stałe wkleja się raz (projekt w Claude/ChatGPT, Gem w Gemini, Space w Perplexity),
// polecenie dnia codziennie. Długie wydanie można dostać w dwóch częściach (dla czatów, które ucinają odpowiedzi).
import { SECTIONS, MAIN_SECTIONS } from './config.js';
import { formatLong, addDays } from './dates.js';
import { dayRole } from './books.js';

const dayMonthFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });

export function projectInstructions() {
  return `Jesteś redaktorem codziennego wydania SelfLearn: aplikacji do nauki i poszerzania horyzontów dla pary z Polski. Wydanie czyta się 10–20 minut. Piszesz po polsku, krótko, konkretnie i neutralnie.

## Zasady
1. Wiadomości bierzesz wyłącznie z wyszukiwania w internecie, z ostatnich 24–36 godzin przed datą wydania. Każda informacja ma link do strony, którą faktycznie znalazłeś. Nigdy nie wymyślaj ani nie składaj adresów URL.
2. Jeśli nie możesz wyszukiwać w internecie, nie pisz wydania. Odpowiedz tylko: BRAK_WYSZUKIWANIA
3. Linki kopiuj dokładnie z wyników wyszukiwania: bezpośredni adres artykułu (nie strona główna serwisu), bez przekierowań (vertexaisearch…, google.com/url, bing.com/ck) i bez parametrów śledzących (utm_…).
4. Streszczaj własnymi słowami, bez kopiowania akapitów. Cytat najwyżej jedno krótkie zdanie. W tekstach nie wstawiaj przypisów ani znaczników cytowań ([1], 【…】, cite…); źródła podajesz tylko w polach sources i source.
5. Neutralny ton. Przy sprawach politycznych podawaj stanowiska stron, bez ocennych przymiotników. Oddzielaj fakty od opinii („według…”, „krytycy wskazują…”).
6. Liczby, nazwiska i daty dokładnie jak w źródle. Daty względne („w środę”) licz od daty wydania. Gdy źródła się różnią, napisz to wprost.
7. Ciekawostki, historia, pojęcie dnia i książka: tylko dobrze udokumentowane fakty, z linkiem do Wikipedii lub innego wiarygodnego źródła.
8. Quiz i rozgrzewka nigdy nie dotyczą wiadomości, tylko ciekawostek, historii, pojęcia i książki.
9. Odpowiadasz wyłącznie blokiem kodu \`\`\`json, bez komentarzy przed nim i po nim (dwoma blokami, jeśli polecenie dnia prosi o dwie części). JSON może być bez wcięć. Proste cudzysłowy " tylko wokół kluczy i tekstów; cudzysłów wewnątrz tekstu zapisuj jako „…”. Bez przecinka po ostatnim elemencie listy. rank, year, day, days i answer to liczby, bez cudzysłowów.

## Zawartość
- news, dział "polska": dokładnie 5 wiadomości; "swiat": dokładnie 5. rank 1 = najważniejsza.
- news w pozostałych działach podanych w poleceniu dnia: po 1–2 wiadomości. Jeśli w dziale nie ma nic wartościowego z ostatnich 36 godzin, pomiń go: lepiej jedna dobra wiadomość niż dwie słabe.
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
Identyfikatory wiadomości: pl-1…pl-5, sw-1…sw-5, a w pozostałych działach <id działu>-1, <id działu>-2 (np. ai-1, sport-2). Ciekawostki fact-1…fact-3, historia otd-1…otd-3. Pytania quizu <data>-q1, <data>-q2…, rozgrzewki <data>-r1…<data>-r3.

## Zanim wyślesz
Sprawdź: każdy link prowadzi do konkretnego artykułu; Polska i świat mają po 5 wiadomości; quiz i rozgrzewka nie dotyczą wiadomości; JSON jest kompletny i domknięty.`;
}

// ctx: { date, sections, bookInfo, recent: [edycje], previous: edycja|null, bookHistory: [{day, ideaTitle}], parts: 1|2 }
export function dailyMessage(ctx) {
  const { date, sections, bookInfo, recent = [], previous = null, bookHistory = [], parts = 1 } = ctx;
  const lines = [];
  lines.push(`Przygotuj wydanie SelfLearn na dzień: ${formatLong(date)} (pole "date": "${date}").`);
  lines.push('');

  const extra = SECTIONS.filter((s) => sections.includes(s.id) && !MAIN_SECTIONS.includes(s.id));
  lines.push(`- Działy: Polska (5), Świat (5)${extra.length ? `, a także po 1–2 wiadomości w działach: ${extra.map((s) => `${s.label} ("${s.id}")`).join(', ')}` : ''}.`);
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
  if (parts === 2) {
    lines.push('Wydanie jest długie, więc odpowiedz w dwóch częściach:');
    lines.push(`1. Teraz: blok \`\`\`json z polami "date", "intro" i "news" (wszystkie wiadomości).`);
    lines.push(`2. Gdy napiszę „dalej”: drugi blok \`\`\`json z polami "date", "facts", "onThisDay", "concept", "book", "quiz", "recap" i "evening".`);
  } else {
    lines.push('Odpowiedz jednym blokiem ```json z całym wydaniem.');
  }
  return lines.join('\n');
}

// Czaty, które dobrze piszą wydanie, i wskazówki do każdego z nich.
// parts: domyślna liczba części odpowiedzi (2 dla czatów, które często ucinają długie odpowiedzi).
export const CHATS = [
  {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai/new',
    parts: 1,
    tips: [
      'Utwórz projekt „SelfLearn” i wklej do jego instrukcji stałe zasady. Codziennie zaczynaj w nim nowy czat.',
      'Włącz wyszukiwanie w sieci, bez niego Claude odpowie BRAK_WYSZUKIWANIA.',
    ],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    parts: 2,
    tips: [
      'Stałe zasady wklej do instrukcji projektu w ChatGPT albo wybierz niżej „Całość”.',
      'Włącz wyszukiwanie w sieci, inaczej linki mogą być zmyślone.',
      'Znaczniki cytowań i dopiski „utm_source=chatgpt.com” w linkach aplikacja usunie sama.',
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    url: 'https://gemini.google.com/app',
    parts: 1,
    tips: [
      'Stałe zasady zapisz w Gemie (instrukcje Gema) albo wybierz niżej „Całość”.',
      'Gemini czasem podaje linki przekierowujące zamiast adresów artykułów. Aplikacja je wychwyci, wtedy poproś o bezpośrednie linki.',
    ],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    parts: 2,
    tips: [
      'Stałe zasady zapisz w instrukcjach Space albo wybierz niżej „Całość”.',
      'Wyszukiwanie jest zawsze włączone. Długie odpowiedzi bywają ucinane, dlatego domyślnie dwie części.',
    ],
  },
  {
    id: 'copilot',
    label: 'Copilot',
    url: 'https://copilot.microsoft.com/',
    parts: 2,
    tips: ['Wklej całe polecenie w nowej rozmowie (tryb „Całość”).', 'Odpowiedzi bywają krótsze, dlatego domyślnie dwie części.'],
  },
  {
    id: 'inny',
    label: 'Inny',
    url: null,
    parts: 2,
    tips: ['Czat musi mieć dostęp do internetu, inaczej linki będą zmyślone.', 'Jeśli odpowiedź się urwie, wybierz dwie części.'],
  },
];

export function fullPrompt(ctx) {
  return `${projectInstructions()}\n\n---\n\n${dailyMessage(ctx)}`;
}
