// Działy wiadomości. Kolejność = kolejność w wydaniu.
export const SECTIONS = [
  { id: 'polska', label: 'Polska', hint: 'Najważniejsze sprawy w kraju' },
  { id: 'swiat', label: 'Świat', hint: 'Co dzieje się poza Polską' },
  { id: 'technologia', label: 'Technologia', hint: 'Sprzęt, internet, energia' },
  { id: 'nauka', label: 'Nauka', hint: 'Odkrycia i badania' },
  { id: 'ai', label: 'Sztuczna inteligencja', hint: 'Modele, firmy, regulacje' },
  { id: 'zdrowie', label: 'Zdrowie', hint: 'Medycyna i styl życia' },
  { id: 'kultura', label: 'Kultura', hint: 'Film, książki, muzyka' },
  { id: 'pokemon', label: 'Pokémon TCG', hint: 'Dodatki, turnieje, TCG Pocket' },
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
