// „Pogłęb”: pytanie do czatu AI o jedną kartę wydania (prościej, więcej kontekstu albo własne pytanie).
// Bez API i bez kosztów: aplikacja składa polecenie, kopiuje je i otwiera wybrany czat. Bez DOM.
import { formatShort } from './dates.js';

export const DEEPEN_MODES = [
  { id: 'prosciej', label: 'Prościej' },
  { id: 'kontekst', label: 'Więcej kontekstu' },
  { id: 'pytanie', label: 'Moje pytanie' },
];

const KIND = {
  news: 'Wiadomość',
  fact: 'Ciekawostka',
  history: 'Ten dzień w historii',
  concept: 'Pojęcie dnia',
  book: 'Książka tygodnia',
};

const MAX_TEXT = 1200;
// Dłuższe adresy bywają ucinane przez przeglądarki i czaty; wtedy zostaje samo skopiowane polecenie.
const MAX_URL = 6000;

// entry: { type, title, text, sources } (ten sam wpis co w Ulubionych).
export function deepenPrompt(entry, mode, { date, question = '' } = {}) {
  const text = (entry.text || '').length > MAX_TEXT ? `${entry.text.slice(0, MAX_TEXT).replace(/\s+\S*$/, '')}…` : entry.text || '';
  const source = [].concat(entry.sources || []).find((s) => s?.url)?.url;
  const lines = [
    `Czytam codzienne wydanie SelfLearn${date ? ` z ${formatShort(date)}` : ''}. ${KIND[entry.type] || 'Fragment'}: „${entry.title}”.`,
    text,
    source ? `Źródło: ${source}` : null,
    '',
  ];
  if (mode === 'prosciej') {
    lines.push('Wyjaśnij mi to prościej, jak komuś, kto nie zna tematu. Użyj jednego przykładu z codziennego życia.');
  } else if (mode === 'kontekst') {
    lines.push(
      entry.type === 'news'
        ? 'Daj mi szerszy kontekst: skąd to się wzięło, jakie są stanowiska stron i co może wydarzyć się dalej. Sprawdź w internecie, co wiadomo dziś.'
        : 'Daj mi szerszy kontekst: skąd to się wzięło, z czym się łączy i jedna rzecz, która mnie zaskoczy.',
    );
  } else {
    lines.push(`Moje pytanie: ${question.trim()}`);
  }
  lines.push('Odpowiedz po polsku, krótko (do 200 słów) i bez żargonu. Jeśli czegoś nie wiesz na pewno albo informacja może być nieaktualna, powiedz to wprost.');
  return lines.filter((l) => l !== null).join('\n');
}

// Adres nowego czatu z gotowym pytaniem albo zwykły adres czatu (wtedy polecenie trzeba wkleić).
export function deepenUrl(chat, prompt) {
  if (chat?.ask) {
    const url = chat.ask + encodeURIComponent(prompt);
    if (url.length <= MAX_URL) return { url, prefilled: true };
  }
  return { url: chat?.url || null, prefilled: false };
}
