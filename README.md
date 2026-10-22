# SelfLearn

Codzienne wydanie do nauki i poszerzania horyzontów, w formie aplikacji na telefon (PWA). Codziennie 10–20 minut:

- **Rozgrzewka**: 3 pytania a/b/c z poprzedniego wydania,
- **Polska: top 5** i **Świat: top 5**: streszczenie, „dlaczego to ważne” i link do pełnego artykułu,
- **Twoje tematy**: 22 działy w 7 grupach, m.in. bezpieczeństwo, gospodarka, mieszkania, prawo, technologia, AI, nauka, kosmos, historia, zdrowie, psychologia, edukacja, klimat, zwierzęta, kultura, filmy, muzyka, gry, sport, motoryzacja, podróże, Pokémon TCG,
- **Ciekawostki**: nauka, przyroda, historia, kosmos, psychologia,
- **Ten dzień w historii**,
- **Pojęcie dnia**: model myślowy albo błąd poznawczy,
- **Książka tygodnia**: jedna idea dziennie, morał i „zastosuj dziś”,
- **Quiz** z ciekawostek, pojęcia i książki (bez pytań z wiadomości), a potem **powtórki** w odstępach 1, 3, 7, 16 i 35 dni (pierwsza zawsze następnego dnia, błędna odpowiedź wraca na jutro),
- **Pytanie na wieczór** do rozmowy we dwoje,
- **Seria dni** jak w Duolingo: dzień się liczy po rozgrzewce albo całym wydaniu, z paskiem ostatnich 7 dni i kamieniami milowymi,
- **Ulubione**: serce przy wiadomości, ciekawostce, historii, pojęciu albo książce zapisuje ją w osobnej zakładce. Są tam też filtry, wyszukiwanie (także bez polskich znaków), własne notatki przy wpisach, otwieranie wpisu w jego wydaniu i wysyłanie drugiej osobie. Trafiają tam również notatki z pytań na wieczór,
- **Oś czasu**: strzałki „poprzedni / następny dzień” nad wydaniem i widok wszystkich dni od dziś wstecz, ze skrótem każdego dnia do szybkiego przypomnienia. Podczas przewijania linia wypełnia się nurtem, karp płynie razem z Tobą, a dzień na środku ekranu jest podświetlony,
- **Poziomy** od ikry do smoka (legenda o karpiu i Smoczej Bramie),
- **Posłuchaj**: telefon czyta wydanie na głos (offline, bez kosztów), przewija za lektorem i podświetla czytaną kartę; tempo 0,9–1,5×,
- **Wyzwanie we dwoje**: po quizie wysyłasz link z wynikiem, druga osoba rozwiązuje ten sam quiz i widzicie porównanie,
- **Wygląd**: motyw jasny, sepia, ciemny albo jak w telefonie, 5 kolorów, 4 wielkości tekstu, krój gazetowy lub prosty, widok pełny albo same nagłówki,
- **Przypomnienia**: rano o wydaniu, wieczorem o serii (tylko gdy dzień jeszcze nie zaliczony), w wybrane dni tygodnia; kalendarz, powiadomienia z aplikacji i liczba na ikonie.

Każda osoba ma własny profil, postępy i powtórki na swoim telefonie. Wydania są wspólne.

## Jak to działa

```
Codzienna rutyna Claude Code (ok. 5:00)
  → szuka wiadomości z ostatniej doby i pisze wydanie wg CONTENT_GUIDE.md
  → zapisuje content/editions/RRRR-MM-DD.json, sprawdza je (scripts/validate.mjs)
  → commit i push na main
Vercel (albo GitHub Pages)
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

Wystarczy Node.js 18 lub nowszy, bez instalowania zależności. Działa na Linuksie, macOS i Windowsie.

Serwer podglądu słucha tylko na tym komputerze i wydaje wyłącznie pliki aplikacji (te same, które trafiają na stronę), więc `.git` i skrypty zostają niedostępne. Żeby otworzyć podgląd na telefonie w tej samej sieci Wi-Fi, uruchom go z `HOST=0.0.0.0 npm start` i wejdź na adres komputera, np. `http://192.168.1.20:8080`.

## Publikacja (jednorazowo)

Aplikacja to zwykłe pliki statyczne, więc działa na Vercelu albo na GitHub Pages. Wystarczy jedno z nich.

### Vercel (polecane)

1. Zaloguj się na [vercel.com](https://vercel.com) kontem GitHub (plan Hobby jest darmowy).
2. **Add New… → Project**, wybierz repozytorium `SelfLearn` i kliknij **Import**. Jeśli go nie widać: **Adjust GitHub App Permissions** i dodaj dostęp do `SelfLearn`.
3. **Framework Preset: Other**, Root Directory `./`, reszta bez zmian. Kliknij **Deploy**.
4. Po kilkudziesięciu sekundach aplikacja działa pod adresem `https://<nazwa-projektu>.vercel.app`.

`vercel.json` przed każdą publikacją uruchamia `npm run build`: sprawdza wydania (`scripts/validate.mjs`) i składa stronę w katalogu `public/` (`scripts/build-site.mjs`). Wydanie z błędem nie trafi na stronę, a działać będzie poprzednia wersja. Każdy commit na `main` publikuje się sam. Każda inna gałąź dostaje własny adres podglądu.

### GitHub Pages

1. W repozytorium: **Settings → Pages → Build and deployment**.
2. **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, potem **Save**.
3. Po 1–2 minutach strona działa pod adresem `https://marekmaro.github.io/SelfLearn/`.

Plik `.nojekyll` wyłącza przetwarzanie Jekyll, więc pliki trafiają na stronę bez zmian.

Postępy są zapisane osobno dla każdego adresu. Przy przenosinach z jednego adresu na drugi (albo na nowy telefon) użyj **Profil → Skopiuj kopię danych** i **Wczytaj kopię danych**. Kopia obejmuje profil, postępy, powtórki, ulubione i wydania przygotowane tylko na tym telefonie. Token GitHuba nie trafia do kopii: na nowym telefonie trzeba go wkleić ponownie, a wczytanie kopii nie kasuje tokenu, który już jest zapisany.

### Instalacja na telefonie

- **Android (Chrome):** otwórz stronę, menu ⋮ → **Zainstaluj aplikację** (albo **Dodaj do ekranu głównego**).
- **iPhone (Safari):** otwórz stronę, **Udostępnij** → **Do ekranu początkowego**.

### Przypomnienia

W **Profil → Przypomnienia** ustawiasz godzinę poranną (wydanie dnia), wieczorną (minuta dla serii) i dni tygodnia. Są trzy kanały:

- **Kalendarz telefonu** (najpewniejszy, działa wszędzie, także na iPhonie): Kalendarz Google albo plik .ics z oboma wydarzeniami. Po zmianie godzin dodaj je jeszcze raz (plik .ics aktualizuje istniejące wydarzenia).
- **Powiadomienia z aplikacji**: w Chrome na Androidzie, w aplikacji dodanej do ekranu głównego, service worker co kilka godzin sprawdza w tle, czy jest nowe wydanie i czy seria jest zagrożona. Moment sprawdzenia wybiera telefon, więc przypomnienie może przyjść trochę po czasie. iPhone nie pozwala na to bez serwera push.
- **Liczba na ikonie**: ile rzeczy czeka dziś (nauka dnia i powtórki), tam gdzie telefon to obsługuje.

## Codzienne treści

Są dwa sposoby. Oba korzystają z tych samych zasad (`src/prompt.js`).

### Sposób 1: z czatu AI, w aplikacji (bez konfiguracji)

W aplikacji: **Dziś → Przygotuj dzisiejsze wydanie** (albo **Profil → Publikowanie wydań**).

1. **Wybierz czat i skopiuj polecenie.** Do wyboru: Claude, ChatGPT, Gemini, Perplexity, Copilot albo inny; aplikacja pokaże wskazówki do wybranego. Polecenie ma już datę, działy, książkę tygodnia z dniem i tematem, tematy do pominięcia i materiał do rozgrzewki.
   - **Projekt (polecane):** stałe zasady wklejasz raz do instrukcji projektu (Claude, ChatGPT), Gema (Gemini) albo Space (Perplexity). Potem codziennie nowy czat i krótkie „polecenie dnia”.
   - **Całość:** jedno długie polecenie do dowolnego czatu.
   - **Dwie części:** dla czatów, które ucinają długie odpowiedzi (domyślnie ChatGPT, Perplexity, Copilot). Najpierw przychodzą wiadomości, a po słowie „dalej” reszta wydania.
   - Czat musi mieć **włączone wyszukiwanie w internecie**. Bez niego odpowie `BRAK_WYSZUKIWANIA`, a aplikacja to wychwyci.
2. **Wklej odpowiedź** (blok JSON albo oba bloki, jeden pod drugim) i naciśnij **Sprawdź**. Aplikacja sama usuwa typowe naleciałości czatów (znaczniki cytowań ChatGPT, przypisy [1] z Perplexity, `utm_source` w linkach, liczby zapisane jako tekst), wykrywa linki przekierowujące (np. z Gemini) i ucięte odpowiedzi, a resztę wypisze jako gotową listę poprawek do odesłania czatowi.
3. **Opublikuj:**
   - **Opublikuj dla obojga**: jednym przyciskiem przez API GitHuba. Wymaga tokenu (Profil → Publikowanie wydań): fine-grained token tylko do tego repozytorium, z uprawnieniem *Contents: Read and write* i z datą ważności (np. 90 dni). Token zostaje w przeglądarce na tym telefonie, więc nie dawaj mu szerszych uprawnień.
   - **Skopiuj plik i otwórz GitHub**: bez tokenu. Wklejasz plik na stronie GitHuba i klikasz *Commit changes*.
   - **Tylko na tym telefonie**: od razu, ale druga osoba go nie zobaczy.

   Jeśli w wydaniu brakuje jakiejś części (np. quizu albo książki), aplikacja to pokaże i opublikuje je dopiero po zaznaczeniu „Wiem, publikuję mimo braków”.

Wydanie możesz przygotować też wieczorem na następny dzień (pole „Na dzień”). To samo polecenie wypisze `node scripts/prompt.mjs RRRR-MM-DD` (z `--dwie-czesci` w wersji na dwie części). `npm test` sprawdza, czy aplikacja radzi sobie z odpowiedziami różnych czatów.

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
| `src/views/` | Widoki: ankieta, wydanie, oś czasu, powtórki, ulubione, profil, przygotowanie wydania |
| `src/favorites.js` | Ulubione: filtry, wyszukiwanie i tekst do wysłania (bez DOM, testowane w `scripts/selftest.mjs`) |
| `src/prompt.js`, `src/edition.js` | Polecenie dla czatu AI, wskazówki dla czatów, sprawdzanie i czyszczenie wydań (wspólne dla aplikacji i skryptów) |
| `src/look.js`, `src/notify.js` | Wygląd (motywy, kolory, tekst) i przypomnienia (kalendarz, powiadomienia, liczba na ikonie) |
| `src/listen.js`, `src/challenge.js` | Wydanie czytane na głos i wyzwanie quizowe we dwoje |
| `sw.js`, `manifest.webmanifest`, `assets/` | Tryb offline, instalacja na telefonie, ikony |
| `content/editions/` | Wydania, jeden plik JSON na dzień |
| `content/index.json` | Lista wydań (generowana przez `scripts/build-index.mjs`) |
| `content/books.json` | Kolejka książek tygodnia (zmiana co 7 dni od `startDate`) |
| `CONTENT_GUIDE.md` | Instrukcja pisania wydań (dla rutyny) |
| `scripts/` | Walidacja, indeks, polecenie dnia (`prompt.mjs`), testy odpowiedzi czatów (`selftest.mjs`), lokalny serwer |

## Pomysły na kolejne kroki

- Powiadomienia push dokładnie o wybranej godzinie, także na iPhonie (wymaga małego serwera, np. darmowy Cloudflare Worker z Web Push).
- Wspólne statystyki pary i wspólna seria.
- Przycisk „pogłęb” przy karcie: prostsze wyjaśnienie, więcej kontekstu, pytanie do AI.
- Niedzielne podsumowanie tygodnia z quizem z całego tygodnia.
- Wątki: śledzenie długich tematów z osią czasu.
