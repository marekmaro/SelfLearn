// Codzienne przypomnienie bez serwera: wydarzenie cykliczne w kalendarzu telefonu.

const TITLE = 'SelfLearn: Twoje wydanie dnia';

function appUrl() {
  return location.href.split('#')[0];
}

function stamp(date, hh, mm) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function nextStart(time) {
  const [hh, mm] = time.split(':');
  const start = new Date();
  start.setHours(Number(hh), Number(mm), 0, 0);
  if (start < new Date()) start.setDate(start.getDate() + 1);
  return { start, hh, mm };
}

function endStamp(start) {
  const end = new Date(start.getTime() + 15 * 60000);
  return stamp(end, String(end.getHours()).padStart(2, '0'), String(end.getMinutes()).padStart(2, '0'));
}

// Plik .ics: iPhone i Outlook dodają go jednym dotknięciem.
export function icsFile(time) {
  const { start, hh, mm } = nextStart(time);
  const utc = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SelfLearn//PL',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:selflearn-${Date.now()}@selflearn`,
    `DTSTAMP:${utc}`,
    `DTSTART:${stamp(start, hh, mm)}`,
    `DTEND:${endStamp(start)}`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${TITLE}`,
    `DESCRIPTION:10–20 minut: Polska\\, świat\\, Twoje tematy\\, ciekawostki i książka tygodnia. ${appUrl()}`,
    `URL:${appUrl()}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Czas na wydanie dnia',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
}

// Link do Kalendarza Google (Android).
export function googleCalendarUrl(time) {
  const { start, hh, mm } = nextStart(time);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: TITLE,
    dates: `${stamp(start, hh, mm)}/${endStamp(start)}`,
    recur: 'RRULE:FREQ=DAILY',
    details: `10–20 minut nauki dziennie. ${appUrl()}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
