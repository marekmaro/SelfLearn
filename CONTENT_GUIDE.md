# Jak przygotować wydanie dnia

Instrukcja dla codziennej rutyny (Claude Code), która rano tworzy nowe wydanie SelfLearn.
Czytelnicy to para z Polski. Wydanie czyta się 10–20 minut, a jego celem jest szersze spojrzenie na świat i nauka, a nie przewijanie.

Wzór gotowego wydania: [`content/editions/2026-10-01.json`](content/editions/2026-10-01.json).

## Kroki

1. **Ustal datę** w strefie Europe/Warsaw: `TZ=Europe/Warsaw date +%F`. Plik wydania to `content/editions/RRRR-MM-DD.json`.
   Jeśli taki plik już istnieje, zakończ pracę bez zmian.
2. **Przejrzyj 3 poprzednie wydania** (najnowsze pliki w `content/editions/`), żeby nie powtarzać tematów, ciekawostek, pojęć ani pytań.
3. **Zbierz wiadomości** z ostatnich 24–36 godzin (źródła niżej). Używaj WebSearch, a gdy sieć na to pozwala, także WebFetch i kanałów RSS.
   Jeśli WebFetch jest zablokowany, opieraj się na tym, co pokazują wyniki WebSearch, i **nie dopisuj faktów, których tam nie ma**.
4. **Napisz wydanie** według zasad poniżej i zapisz plik.
5. **Zaktualizuj książkę tygodnia** w `content/books.json`, jeśli zaczyna się nowa (patrz „Książka tygodnia”).
6. **Sprawdź:** `node scripts/build-index.mjs && node scripts/validate.mjs`. Popraw wszystkie błędy, a uwagi przejrzyj.
7. **Zapisz zmiany:** commit `Wydanie RRRR-MM-DD` i `git push origin HEAD:main`. Publikacja na stronie dzieje się automatycznie.

## Zasady ogólne

- Język polski, zdania krótkie i konkretne, bez żargonu. Terminy obce wyjaśniaj w nawiasie.
- **Każda informacja musi mieć źródło**, czyli adres strony, którą faktycznie widzisz w wynikach wyszukiwania lub pobrałeś. Nigdy nie zgaduj ani nie składaj adresów.
- Streszczaj własnymi słowami. Nie kopiuj akapitów z artykułów. Cytat najwyżej jedno krótkie zdanie, w cudzysłowie.
- Neutralny ton. Przy sprawach politycznych podawaj stanowiska obu stron, bez ocennych przymiotników. Fakty oddzielaj od opinii („według…”, „krytycy wskazują…”).
- Bez sensacji. Liczby, nazwiska i daty podawaj tak, jak w źródle.
- Daty względne („w środę”, „wczoraj”) licz od daty wydania.

## Struktura pliku

```jsonc
{
  "date": "RRRR-MM-DD",
  "intro": "Jedno zdanie: „Dziś m.in. …” z 3–4 najciekawszymi tematami.",
  "news": [ /* wiadomości, patrz niżej */ ],
  "facts": [ /* 3 ciekawostki */ ],
  "onThisDay": [ /* 3 wydarzenia z tej daty */ ],
  "concept": { /* pojęcie dnia */ },
  "book": { /* książka tygodnia */ },
  "quiz": [ /* 5–7 pytań */ ],
  "evening": { "question": "…", "hint": "…" }
}
```

### Wiadomości (`news`)

| Dział (`section`) | Ile | Na co zwracać uwagę |
|---|---|---|
| `polska` | dokładnie 5 | Sprawy ważne dla kraju i codziennego życia: polityka, gospodarka, prawo, bezpieczeństwo, społeczeństwo. |
| `swiat` | dokładnie 5 | Wydarzenia o największym znaczeniu globalnym, ze szczególnym uwzględnieniem tego, co dotyczy Polski i Europy. |
| `technologia` | 2–3 | Sprzęt, internet, energia, cyberbezpieczeństwo. |
| `ai` | 2–3 | Modele, firmy, regulacje, wpływ na pracę i życie. |
| `nauka` | 2–3 | Odkrycia opublikowane w recenzowanych pismach lub ogłoszone przez instytucje naukowe. |
| `zdrowie` | 2–3 | Wyniki badań z zaznaczeniem ich ograniczeń (obserwacyjne czy kliniczne, wielkość grupy). Bez porad medycznych. |
| `kultura` | 2–3 | Polska i światowa: film, książki, muzyka, wystawy, nagrody. |
| `pokemon` | 2–3 | Pokémon TCG: nowe dodatki i produkty, terminy prerelease, zmiany w zasadach, turnieje, TCG Pocket. |

Każda pozycja:

```json
{
  "id": "pl-1",
  "section": "polska",
  "rank": 1,
  "title": "Tytuł informacyjny, nie klikbajt",
  "summary": "3–4 zdania, najwyżej ok. 90 słów: co się stało, kto, kiedy, kluczowe liczby.",
  "why": "1–2 zdania: dlaczego to ważne i co z tego wynika.",
  "sources": [{ "name": "Rzeczpospolita", "url": "https://…" }]
}
```

- `id`: `pl-1…pl-5`, `sw-1…sw-5`, `tech-N`, `ai-N`, `nauka-N`, `zdrowie-N`, `kultura-N`, `pokemon-N`.
- `rank`: 1 = najważniejsza w dziale.
- `sources`: 1–2 linki, najlepiej jeden polski i jeden zagraniczny albo dwa niezależne.

### Ciekawostki (`facts`)

3 ciekawostki, każda innego rodzaju (`kind`): `nauka`, `przyroda`, `historia`, `kosmos`, `psychologia`. Rodzaje zmieniaj z dnia na dzień.

- Tylko dobrze udokumentowane fakty, z linkiem do Wikipedii, instytucji naukowej lub publikacji.
- Od czasu do czasu forma „mit kontra fakt”.
- 3–5 zdań, z jedną konkretną liczbą lub szczegółem, który zostaje w głowie.

```json
{ "id": "fact-1", "kind": "przyroda", "title": "…", "body": "…", "source": { "name": "Wikipedia", "url": "https://pl.wikipedia.org/wiki/…" } }
```

### Ten dzień w historii (`onThisDay`)

3 wydarzenia z tego samego dnia i miesiąca, co najmniej jedno z historii Polski. Datę sprawdź w źródle.

```json
{ "id": "otd-1", "year": 1958, "title": "…", "body": "2–3 zdania z kontekstem i skutkiem.", "source": { "name": "Wikipedia", "url": "https://…" } }
```

### Pojęcie dnia (`concept`)

Model myślowy, błąd poznawczy, prawo lub termin z ekonomii, nauki czy filozofii, który pomaga lepiej rozumieć świat. Jeśli się da, powiąż go z dzisiejszymi wiadomościami.

```json
{
  "id": "concept",
  "term": "Prawo Goodharta",
  "definition": "Jedno zdanie.",
  "origin": "Skąd się wzięło, 2–3 zdania.",
  "examples": ["2–3 przykłady z życia, w tym jeden z dzisiejszego wydania"],
  "source": { "name": "Wikipedia", "url": "https://…" }
}
```

### Książka tygodnia (`book`)

1. Otwórz `content/books.json`. Dzień książki = liczba dni od `current.startedOn` + 1.
2. Jeśli wychodzi więcej niż 7, zacznij następną książkę z `queue` (po bieżącej; po ostatniej wróć na początek kolejki): ustaw `current.id` i `current.startedOn` na dzisiejszą datę, a dzień na 1.
3. Jeśli książka ma `plan`, trzymaj się go. Jeśli nie, rozpisz tydzień według pola `format` i dopisz `plan` do `books.json`.
4. Dni 1–5: jedna kluczowa idea dziennie. Dzień 6: najważniejszy morał i plan zastosowania. Dzień 7: podsumowanie tygodnia.
5. Opisuj idee własnymi słowami. Przy tezach, które naukowcy kwestionują, zaznacz to wprost.

```json
{
  "id": "book",
  "bookId": "atomowe-nawyki",
  "title": "Atomowe nawyki",
  "author": "James Clear",
  "day": 1,
  "days": 7,
  "ideaTitle": "Krótki tytuł idei",
  "idea": "4–6 zdań wyjaśnienia z przykładem.",
  "moral": "1–2 zdania: esencja.",
  "action": "Jedno konkretne działanie na dziś, do zrobienia w kilka minut.",
  "source": { "name": "O książce", "url": "https://…" }
}
```

### Quiz (`quiz`)

5–7 pytań **wyłącznie** z ciekawostek, historii, pojęcia i książki. **Nigdy z wiadomości.**

- `id` musi zaczynać się od daty: `RRRR-MM-DD-q1`, `RRRR-MM-DD-q2`… (pytania trafiają do powtórek na wiele tygodni).
- `ref` wskazuje `id` materiału, którego dotyczy pytanie (`fact-1`, `otd-2`, `concept`, `book`).
- 4 odpowiedzi, jedna poprawna (`answer` to jej numer liczony od 0). Błędne odpowiedzi mają być wiarygodne i same czegoś uczyć.
- Poprawną odpowiedź umieszczaj na różnych pozycjach.
- `explanation`: 1–2 zdania, które utrwalają wiedzę także po błędnej odpowiedzi.

### Na wieczór (`evening`)

Jedno otwarte pytanie do rozmowy we dwoje, związane z książką albo pojęciem dnia. Ciepłe i praktyczne, bez tonu terapii. `hint` to krótka podpowiedź, jak zacząć.

## Gdzie szukać

- **Polska:** PAP, Rzeczpospolita, TVN24, Polsat News, RMF24, Interia, Onet, Wirtualna Polska, Gazeta Wyborcza, Notes from Poland, Nauka w Polsce.
- **Świat:** Reuters, AP, BBC, The Guardian, Politico Europe, Financial Times, Al Jazeera.
- **Technologia i AI:** The Verge, Ars Technica, TechCrunch, CNBC Tech, Axios, Spider's Web, Antyweb, blogi firm (Anthropic, OpenAI, Google DeepMind, Meta AI).
- **Nauka i zdrowie:** ScienceDaily, Nature News, Phys.org, EurekAlert!, STAT News, NIH, Medexpress, Puls Medycyny.
- **Kultura:** Filmweb, Culture.pl, Dwutygodnik, Booklips, Kultura Onet, Variety.
- **Pokémon TCG:** pokemon.com (news), PokeBeach, PokeGuardian, Limitless TCG, Serebii.

## Lista kontrolna przed commitem

- [ ] Polska i świat mają po 5 wiadomości, pozostałe działy po 2–3.
- [ ] Każdy link pochodzi z wyników wyszukiwania lub pobranej strony.
- [ ] Liczby, nazwiska i daty zgadzają się ze źródłami.
- [ ] Brak powtórek z 3 poprzednich wydań.
- [ ] Quiz dotyczy tylko materiałów spoza wiadomości, a `id` pytań zaczynają się od daty.
- [ ] `node scripts/validate.mjs` kończy się bez błędów.
