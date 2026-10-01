# SelfLearn

Codzienne wydanie do nauki i poszerzania horyzontów, w formie aplikacji na telefon (PWA). Codziennie 10–20 minut:

- **Polska: top 5** i **Świat: top 5**: streszczenie, „dlaczego to ważne” i link do pełnego artykułu,
- **Twoje tematy**: technologia, nauka, AI, zdrowie, kultura, Pokémon TCG (wybierane w ankiecie),
- **Ciekawostki**: nauka, przyroda, historia, kosmos, psychologia,
- **Ten dzień w historii**,
- **Pojęcie dnia**: model myślowy albo błąd poznawczy,
- **Książka tygodnia**: jedna idea dziennie, morał i „zastosuj dziś”,
- **Quiz** z ciekawostek, pojęcia i książki (bez pytań z wiadomości), a potem **powtórki** w odstępach 1, 3, 7, 16 i 35 dni,
- **Pytanie na wieczór** do rozmowy we dwoje,
- **Zeszyt** na zapisane karty i notatki, **seria dni** i poziomy od ikry do smoka (legenda o karpiu i Smoczej Bramie).

Każda osoba ma własny profil, postępy i powtórki na swoim telefonie. Wydania są wspólne.

## Jak to działa

```
Codzienna rutyna Claude Code (ok. 5:00)
  → szuka wiadomości z ostatniej doby i pisze wydanie wg CONTENT_GUIDE.md
  → zapisuje content/editions/RRRR-MM-DD.json, sprawdza je (scripts/validate.mjs)
  → commit i push na main
GitHub Actions
  → publikuje stronę na GitHub Pages
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

1. Scal tę gałąź z `main`.
2. W repozytorium: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Po kilku minutach strona będzie pod adresem `https://marekmaro.github.io/SelfLearn/`.

### Instalacja na telefonie

- **Android (Chrome):** otwórz stronę, menu ⋮ → **Zainstaluj aplikację** (albo **Dodaj do ekranu głównego**).
- **iPhone (Safari):** otwórz stronę, **Udostępnij** → **Do ekranu początkowego**.

Przypomnienie o wybranej godzinie dodaje się w zakładce **Profil** (Kalendarz Google albo plik .ics dla iPhone'a).

## Codzienne treści

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
| `src/views/` | Widoki: ankieta, wydanie, powtórki, zeszyt, profil |
| `sw.js`, `manifest.webmanifest`, `assets/` | Tryb offline, instalacja na telefonie, ikony |
| `content/editions/` | Wydania, jeden plik JSON na dzień |
| `content/index.json` | Lista wydań (generowana przez `scripts/build-index.mjs`) |
| `content/books.json` | Kolejka książek tygodnia |
| `CONTENT_GUIDE.md` | Instrukcja pisania wydań (dla rutyny) |
| `scripts/` | Walidacja, indeks, lokalny serwer |

## Pomysły na kolejne kroki

- Prawdziwe powiadomienia push o wybranej godzinie (np. darmowy Cloudflare Worker z Web Push).
- Tryb audio: wydanie czytane na głos.
- Wspólne statystyki pary i wspólna seria.
- Przycisk „pogłęb” przy karcie: prostsze wyjaśnienie, więcej kontekstu, pytanie do AI.
- Niedzielne podsumowanie tygodnia z quizem z całego tygodnia.
