// Grupy działów (do czytelnego wyboru w ankiecie i ustawieniach).
export const SECTION_GROUPS = [
  { id: 'kraj', label: 'Kraj i świat' },
  { id: 'pieniadze', label: 'Pieniądze i prawo' },
  { id: 'nauka', label: 'Nauka i technologia' },
  { id: 'ludzie', label: 'Zdrowie i ludzie' },
  { id: 'przyroda', label: 'Przyroda' },
  { id: 'rozrywka', label: 'Kultura i rozrywka' },
  { id: 'pasje', label: 'Pasje' },
];

// Działy wiadomości. Kolejność = kolejność w wydaniu.
export const SECTIONS = [
  { id: 'polska', group: 'kraj', label: 'Polska', hint: 'Najważniejsze sprawy w kraju' },
  { id: 'swiat', group: 'kraj', label: 'Świat', hint: 'Co dzieje się poza Polską' },
  { id: 'bezpieczenstwo', group: 'kraj', label: 'Bezpieczeństwo i obronność', hint: 'Wojsko, NATO, wojna w Ukrainie' },
  { id: 'gospodarka', group: 'pieniadze', label: 'Gospodarka i finanse', hint: 'Ceny, praca, rynki, Twoje pieniądze' },
  { id: 'nieruchomosci', group: 'pieniadze', label: 'Mieszkania i nieruchomości', hint: 'Ceny mieszkań, kredyty, najem' },
  { id: 'prawo', group: 'pieniadze', label: 'Prawo i Twoje sprawy', hint: 'Nowe przepisy, urzędy, prawa konsumenta' },
  { id: 'technologia', group: 'nauka', label: 'Technologia', hint: 'Sprzęt, internet, cyberbezpieczeństwo' },
  { id: 'ai', group: 'nauka', label: 'Sztuczna inteligencja', hint: 'Modele, firmy, regulacje' },
  { id: 'nauka', group: 'nauka', label: 'Nauka', hint: 'Odkrycia i badania' },
  { id: 'kosmos', group: 'nauka', label: 'Kosmos', hint: 'Misje, astronomia, odkrycia' },
  { id: 'historia', group: 'nauka', label: 'Historia i archeologia', hint: 'Odkrycia archeologów i historyków' },
  { id: 'zdrowie', group: 'ludzie', label: 'Zdrowie', hint: 'Medycyna i ochrona zdrowia' },
  { id: 'psychologia', group: 'ludzie', label: 'Psychologia i relacje', hint: 'Umysł, emocje, związki' },
  { id: 'edukacja', group: 'ludzie', label: 'Edukacja i szkoła', hint: 'Szkoła, studia, nauka przez całe życie' },
  { id: 'srodowisko', group: 'przyroda', label: 'Klimat i środowisko', hint: 'Klimat, pogoda, energia odnawialna' },
  { id: 'zwierzeta', group: 'przyroda', label: 'Zwierzęta', hint: 'Nowe gatunki, zachowania, ochrona' },
  { id: 'kultura', group: 'rozrywka', label: 'Kultura', hint: 'Książki, teatr, sztuka, festiwale' },
  { id: 'filmy', group: 'rozrywka', label: 'Filmy i seriale', hint: 'Premiery, festiwale, box office' },
  { id: 'muzyka', group: 'rozrywka', label: 'Muzyka', hint: 'Płyty, koncerty, artyści' },
  { id: 'gry', group: 'rozrywka', label: 'Gry', hint: 'Gry wideo i planszowe' },
  { id: 'sport', group: 'rozrywka', label: 'Sport', hint: 'Najważniejsze wyniki i wydarzenia' },
  { id: 'motoryzacja', group: 'pasje', label: 'Motoryzacja', hint: 'Samochody, elektryki, przepisy' },
  { id: 'podroze', group: 'pasje', label: 'Podróże', hint: 'Loty, kierunki, przepisy w podróży' },
  { id: 'pokemon', group: 'pasje', label: 'Pokémon TCG', hint: 'Dodatki, turnieje, TCG Pocket' },
];

export const MAIN_SECTIONS = ['polska', 'swiat'];

export const FACT_KINDS = [
  { id: 'nauka', label: 'Nauka' },
  { id: 'przyroda', label: 'Przyroda' },
  { id: 'historia', label: 'Historia' },
  { id: 'kosmos', label: 'Kosmos' },
  { id: 'psychologia', label: 'Psychologia' },
];

// Ile pozycji pokazać przy danym budżecie czasu. Resztę odsłania „Pokaż więcej”.
export const TIME_BUDGETS = {
  10: { top: 3, topic: 1, facts: 1, otd: 1 },
  15: { top: 5, topic: 2, facts: 2, otd: 2 },
  20: { top: 5, topic: 3, facts: 3, otd: 3 },
};

export const DEFAULT_PROFILE = {
  name: '',
  sections: ['polska', 'swiat'],
  factKinds: ['nauka', 'przyroda', 'historia'],
  minutes: 15,
  reminder: '07:30',
};

// Legenda o karpiu, który przeskakuje Smoczą Bramę i staje się smokiem.
// Próg = liczba ukończonych wydań.
export const LEVELS = [
  { min: 0, name: 'Ikra', text: 'Wszystko przed Tobą. Pierwsze wydanie już czeka.' },
  { min: 1, name: 'Narybek', text: 'Pierwsze wydania za Tobą. Nurt zaczyna nieść.' },
  { min: 5, name: 'Karp', text: 'Regularność zaczyna procentować.' },
  { min: 15, name: 'Złoty karp', text: 'Codzienna nauka to już nawyk.' },
  { min: 40, name: 'Karp u Smoczej Bramy', text: 'Wodospad tuż przed Tobą.' },
  { min: 100, name: 'Smok', text: 'Smocza Brama za Tobą. Teraz już tylko w górę.' },
];

// Powtórki metodą pudełek Leitnera: numer pudełka → po ilu dniach wraca pytanie.
export const LEITNER_DAYS = [0, 1, 3, 7, 16, 35];
export const LEITNER_MAX = LEITNER_DAYS.length - 1;

export const WORDS_PER_MINUTE = 190;

// Kamienie milowe serii, jak w Duolingo.
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

// Repozytorium, do którego aplikacja publikuje wydania (GitHub Pages: <owner>.github.io/<repo>/).
export const DEFAULT_REPO = { owner: 'marekmaro', repo: 'SelfLearn', branch: 'main' };
