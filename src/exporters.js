// Eksport do innych aplikacji: powtórki jako talia Anki, ulubione jako notatki w Markdownie
// (Obsidian, Notion, zwykły edytor). Tu tylko tekst plików, przyciski są w profilu i w Ulubionych.
import { formatLong, todayISO } from './dates.js';
import { h } from './ui.js';
import { TYPE_LABELS, groupByDate } from './favorites.js';

const LETTERS = 'ABCDEFGH';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Pole TSV nie może zawierać tabulatora ani końca wiersza; przejście do nowej linii robi <br>.
function field(html) {
  return html.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
}

// Talia Anki w formacie tekstowym (Plik → Importuj): przód, tył i tagi.
// Nagłówki z „#” Anki odczytuje sam, więc nie trzeba niczego ustawiać przy imporcie.
export function ankiTSV(deck) {
  const cards = Object.values(deck || {})
    .filter((c) => c?.q?.question && Array.isArray(c.q.options))
    .sort((a, b) => (a.added || '').localeCompare(b.added || '') || a.q.id.localeCompare(b.q.id));
  const rows = cards.map((c) => {
    const { q } = c;
    const options = q.options.map((o, i) => `${LETTERS[i]}. ${escapeHtml(o)}`).join('<br>');
    const front = `${escapeHtml(q.question)}<br><br>${options}`;
    const right = q.options[q.answer];
    const from = c.from?.date ? `Z wydania ${formatLong(c.from.date)}${c.from.title ? `: ${escapeHtml(c.from.title)}` : ''}` : '';
    const back = [
      `<b>${LETTERS[q.answer] || '?'}. ${escapeHtml(right)}</b>`,
      q.explanation ? escapeHtml(q.explanation) : '',
      from ? `<small>${from}</small>` : '',
    ]
      .filter(Boolean)
      .join('<br><br>');
    const tags = ['SelfLearn', c.from?.date ? `SelfLearn::${c.from.date.slice(0, 7)}` : null].filter(Boolean).join(' ');
    return [field(front), field(back), tags].join('\t');
  });
  return ['#separator:tab', '#html:true', '#tags column:3', ...rows].join('\n') + '\n';
}

// Ulubione jako jeden plik Markdown, pogrupowane po dniach, z notatkami i linkami do źródeł.
export function favoritesMarkdown(entries, { today = todayISO() } = {}) {
  const lines = ['# SelfLearn: ulubione', '', `Wyeksportowano: ${formatLong(today)}.`, ''];
  for (const group of groupByDate(entries)) {
    lines.push(`## ${formatLong(group.date)}`, '');
    for (const e of group.items) {
      lines.push(`### ${md(e.title || TYPE_LABELS[e.type] || 'Wpis')}`, '');
      lines.push(`*${TYPE_LABELS[e.type] || 'Wpis'}*`, '');
      if (e.text) lines.push(md(e.text), '');
      if (e.note) lines.push(`> **Moja notatka:** ${md(e.note).replace(/\n/g, '\n> ')}`, '');
      const sources = (Array.isArray(e.sources) ? e.sources : [e.sources]).filter((s) => s?.url);
      if (sources.length) {
        lines.push(...sources.map((s) => `- [${md(s.name || 'Źródło')}](${linkTarget(s.url)})`), '');
      }
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// Znaki, które Markdown wziąłby za formatowanie na początku wiersza albo w tekście.
function md(text) {
  return String(text ?? '')
    .replace(/([\\`*_[\]<>])/g, '\\$1')
    .replace(/^([#+-])(\s)/gm, '\\$1$2')
    .replace(/^(\d+)\.(\s)/gm, '$1\\.$2');
}

// Nawiasy i spacje w adresie zamknęłyby link w Markdownie za wcześnie.
function linkTarget(url) {
  return String(url).replace(/[()\s]/g, (c) => ({ '(': '%28', ')': '%29' })[c] || '%20');
}

// Zapisuje tekst jako plik (Android: Pobrane, iPhone: aplikacja Pliki).
export function downloadFile(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
