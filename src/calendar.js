// Przypomnienia w kalendarzu telefonu: działają bez serwera, także na iPhonie i przy zamkniętej aplikacji.
// Dwa wydarzenia cykliczne: rano „wydanie dnia”, wieczorem „minuta dla serii” (opcjonalnie).

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const EVENTS = {
  rano: {
    title: 'SelfLearn: wydanie dnia',
    details: '10–20 minut: Polska, świat, Twoje tematy, ciekawostki, książka tygodnia i quiz.',
    alarm: 'Czas na wydanie dnia',
    minutes: 15,
  },
  wieczor: {
    title: 'SelfLearn: minuta dla serii',
    details: 'Jeśli dziś jeszcze nie było nauki: rozgrzewka z wczoraj (3 pytania) wystarczy, żeby seria trwała.',
    alarm: 'Seria czeka: rozgrzewka zajmie minutę',
    minutes: 5,
  },
};

function appUrl() {
  return `${location.href.split('#')[0]}#dzis`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function stamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

// Najbliższy termin o podanej godzinie w jeden z wybranych dni tygodnia.
function nextStart(time, days) {
  const [hh, mm] = time.split(':').map(Number);
  const allowed = days?.length ? days : [0, 1, 2, 3, 4, 5, 6];
  const start = new Date();
  start.setHours(hh, mm, 0, 0);
  if (start < new Date()) start.setDate(start.getDate() + 1);
  for (let i = 0; i < 7 && !allowed.includes(start.getDay()); i++) start.setDate(start.getDate() + 1);
  return start;
}

export function recurrence(days) {
  const set = new Set(days?.length ? days : [0, 1, 2, 3, 4, 5, 6]);
  if (set.size === 7) return 'RRULE:FREQ=DAILY';
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => set.has(d));
  return `RRULE:FREQ=WEEKLY;BYDAY=${order.map((d) => BYDAY[d]).join(',')}`;
}

function escapeText(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// Linie dłuższe niż 75 bajtów łamiemy zgodnie z RFC 5545 (spacja na początku kontynuacji).
function fold(line) {
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > 73) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

function vevent(kind, time, days) {
  const ev = EVENTS[kind];
  const start = nextStart(time, days);
  const end = new Date(start.getTime() + ev.minutes * 60000);
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VEVENT',
    // Stały identyfikator: ponowny import aktualizuje wydarzenie zamiast dodawać drugie.
    `UID:selflearn-${kind}@selflearn.app`,
    `SEQUENCE:${Math.floor(Date.now() / 60000)}`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    recurrence(days),
    `SUMMARY:${escapeText(ev.title)}`,
    `DESCRIPTION:${escapeText(`${ev.details} ${appUrl()}`)}`,
    `URL:${appUrl()}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(ev.alarm)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
  ];
}

// Plik .ics: iPhone i Outlook dodają go jednym dotknięciem. Zawiera poranne i (opcjonalnie) wieczorne wydarzenie.
export function icsFile(notify) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SelfLearn//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vevent('rano', notify.morning, notify.days),
    ...(notify.eveningOn ? vevent('wieczor', notify.evening, notify.days) : []),
    'END:VCALENDAR',
  ];
  return new Blob([`${lines.map(fold).join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
}

// Link do Kalendarza Google (Android): jedno wydarzenie na link.
export function googleCalendarUrl(kind, notify) {
  const ev = EVENTS[kind];
  const time = kind === 'rano' ? notify.morning : notify.evening;
  const start = nextStart(time, notify.days);
  const end = new Date(start.getTime() + ev.minutes * 60000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    recur: recurrence(notify.days),
    details: `${ev.details} ${appUrl()}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
