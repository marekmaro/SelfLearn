// Daty jako napisy RRRR-MM-DD w czasie lokalnym telefonu.

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export function diffDays(from, to) {
  return Math.round((parseISO(to) - parseISO(from)) / 86400000);
}

const longFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });

// „Czwartek, 1 października 2026” – wielka litera tylko na początku.
export function formatLong(iso) {
  const text = longFmt.format(parseISO(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatShort(iso) {
  return shortFmt.format(parseISO(iso));
}

export function isISODate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
