# SelfLearn

Codzienne wydanie do nauki i poszerzania horyzontów, w formie aplikacji na telefon (PWA). Codziennie 10–20 minut:

- **Rozgrzewka**: 3 pytania a/b/c z poprzedniego wydania,
- **Polska: top 5** i **Świat: top 5**: streszczenie, „dlaczego to ważne” i link do pełnego artykułu,
- **Twoje tematy** do wyboru: gospodarka, technologia, AI, nauka, kosmos, zdrowie, klimat, kultura, sport, gry, motoryzacja, Pokémon TCG,
- **Ciekawostki**: nauka, przyroda, historia, kosmos, psychologia,
- **Ten dzień w historii**,
- **Pojęcie dnia**: model myślowy albo błąd poznawczy,
- **Książka tygodnia**: jedna idea dziennie, morał i „zastosuj dziś”,
- **Quiz** z ciekawostek, pojęcia i książki (bez pytań z wiadomości), a potem **powtórki** w odstępach 1, 3, 7, 16 i 35 dni,
- **Pytanie na wieczór** do rozmowy we dwoje,
- **Seria dni** jak w Duolingo: dzień się liczy po rozgrzewce albo całym wydaniu, z paskiem ostatnich 7 dni i kamieniami milowymi,
- **Zeszyt** na zapisane karty i notatki oraz poziomy od ikry do smoka (legenda o karpiu i Smoczej Bramie).

Każda osoba ma własny profil, postępy i powtórki na swoim telefonie. Wydania są wspólne.

## Jak to działa

```
Codzienna rutyna Claude Code (ok. 5:00)
  → szuka wiadomości z ostatniej doby i pisze wydanie wg CONTENT_GUIDE.md
  → zapisuje content/editions/RRRR-MM-DD.json, sprawdza je (scripts/validate.mjs)
  → commit i push na main
GitHub Pages
  → publikuje stronę z gałęzi main
Telefon
  → aplikacja pobiera nowe wydanie; postępy trzyma lokalnie, działa też offline
```

Nie ma serwera ani bazy danych. Treści to pliki JSON w repozytorium.

## Uruchomienie na komputerze

```bash
npm start            # http://localhost:8080
npm run check        # odbudowuje content/index.json i sprawdza wszystkie wydania
```

Wystarczy Node.js 18 lub nowszy, bez instalowania zależności.

## Publikacja (jednorazowo)

1. W repozytorium: **Settings → Pages → Build and deployment**.
2. **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, potem **Save**.
3. Po 1–2 minutach strona działa pod adresem `https://marekmaro.github.io/SelfLearn/`.

Każdy kolejny commit na `main` (np. nowe wydanie) publikuje się sam. Plik `.nojekyll` wyłącza przetwarzanie Jekyll, więc pliki trafiają na stronę bez zmian.

### Instalacja na telefonie

- **Android (Chrome):** otwórz stronę, menu ⋮ → **Zainstaluj aplikację** (albo **Dodaj do ekranu głównego**).
- **iPhone (Safari):** otwórz stronę, **Udostępnij** → **Do ekranu początkowego**.

Przypomnienie o wybranej godzinie dodaje się w zakładce **Profil** (Kalendarz Google albo plik .ics dla iPhone'a).

## Codzienne treści

Są dwa sposoby. Oba korzystają z tych samych zasad (`src/prompt.js`).

### Sposób 1: z czatu AI, w aplikacji (bez konfiguracji)

W aplikacji: **Dziś → Przygotuj dzisiejsze wydanie** (albo **Profil → Publikowanie wydań**).

1. **Skopiuj polecenie.** Aplikacja sama wpisze w nie datę, działy, książkę tygodnia z dniem i tematem, tematy do pominięcia i materiał do rozgrzewki.
   - **Projekt w Claude (polecane):** raz utwórz w Claude projekt „SelfLearn” i wklej do jego instrukcji „instrukcje projektu”. Potem codziennie w tym projekcie zaczynasz nowy czat i wklejasz krótkie „polecenie dnia”.
   - **Całość:** jedno długie polecenie do dowolnego czatu (Claude, ChatGPT, Gemini, Perplexity).
   - Czat musi mieć **włączone wyszukiwanie w internecie**. Bez niego odpowie `BRAK_WYSZUKIWANIA`, a aplikacja to wychwyci.
2. **Wklej odpowiedź** (cały blok JSON) i naciśnij **Sprawdź**. Aplikacja wypisze, co poprawić, i da gotową listę poprawek do odesłania czatowi.
3. **Opublikuj:**
   - **Opublikuj dla obojga**: jednym przyciskiem przez API GitHuba. Wymaga tokenu (Profil → Publikowanie wydań): fine-grained token tylko do tego repozytorium, z uprawnieniem *Contents: Read and write*. Token zostaje na telefonie.
   - **Skopiuj plik i otwórz GitHub**: bez tokenu. Wklejasz plik na stronie GitHuba i klikasz *Commit changes*.
   - **Tylko na tym telefonie**: od razu, ale druga osoba go nie zobaczy.

Wydanie możesz przygotować też wieczorem na następny dzień (pole „Na dzień”). To samo polecenie wypisze `node scripts/prompt.mjs RRRR-MM-DD`.

### Sposób 2: automatycznie, rutyną Claude Code

Wydanie przygotowuje **rutyna Claude Code** (claude.ai/code/routines), która działa w ramach subskrypcji Claude, bez dodatkowych opłat za API. Liczy się do limitów użycia konta.

- Harmonogram: codziennie ok. 5:00 czasu polskiego.
- Repozytorium: `marekmaro/SelfLearn`.
- Środowisko: najlepiej osobne, z dostępem sieciowym **Full** albo z listą domen serwisów informacyjnych. Przy domyślnym dostępie **Trusted** działa tylko wyszukiwarka, bez otwierania artykułów.
- Prompt:

  > Przygotuj dzisiejsze wydanie SelfLearn zgodnie z instrukcją w pliku CONTENT_GUIDE.md w tym repozytorium. Zapisz plik wydania, uruchom `node scripts/build-index.mjs && node scripts/validate.mjs`, popraw ewentualne błędy, zrób commit „Wydanie RRRR-MM-DD” i wypchnij go bezpośrednio na gałąź main.

Alternatywa: GitHub Actions + API Claude (płatne osobno, kilka dolarów miesięcznie zależnie od modelu).

## Struktura

| Ścieżka | Co zawiera |
|---|---|
| `index.html`, `src/` | Aplikacja (czysty JavaScript, moduły ES, bez kroku budowania) |
| `src/views/` | Widoki: ankieta, wydanie, powtórki, zeszyt, profil, przygotowanie wydania |
| `src/prompt.js`, `src/edition.js` | Polecenie dla czatu AI oraz sprawdzanie wydań (wspólne dla aplikacji i skryptów) |
| `sw.js`, `manifest.webmanifest`, `assets/` | Tryb offline, instalacja na telefonie, ikony |
| `content/editions/` | Wydania, jeden plik JSON na dzień |
| `content/index.json` | Lista wydań (generowana przez `scripts/build-index.mjs`) |
| `content/books.json` | Kolejka książek tygodnia (zmiana co 7 dni od `startDate`) |
| `CONTENT_GUIDE.md` | Instrukcja pisania wydań (dla rutyny) |
| `scripts/` | Walidacja, indeks, polecenie dnia (`prompt.mjs`), lokalny serwer |

## Pomysły na kolejne kroki

- Prawdziwe powiadomienia push o wybranej godzinie (np. darmowy Cloudflare Worker z Web Push).
- Tryb audio: wydanie czytane na głos.
- Wspólne statystyki pary i wspólna seria.
- Przycisk „pogłęb” przy karcie: prostsze wyjaśnienie, więcej kontekstu, pytanie do AI.
- Niedzielne podsumowanie tygodnia z quizem z całego tygodnia.
- Wątki: śledzenie długich tematów z osią czasu.
