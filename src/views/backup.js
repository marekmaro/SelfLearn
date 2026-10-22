// Kopia danych do pliku i przypomnienie o niej na ekranie wydania.
import { todayISO } from '../dates.js';
import { exportJSON, markBackedUp, snoozeBackup, backupFileName } from '../store.js';
import { h, icon, toast } from '../ui.js';

// Zapisuje kopię jako plik .json (Android: Pobrane, iPhone: aplikacja Pliki).
export function downloadBackup() {
  const date = todayISO();
  const url = URL.createObjectURL(new Blob([exportJSON(date)], { type: 'application/json' }));
  const a = h('a', { href: url, download: backupFileName(date) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  markBackedUp(date);
}

export function backupBanner() {
  const banner = h(
    'div',
    { class: 'banner backup-banner' },
    h('p', { style: 'margin:0' }, 'Seria, powtórki i ulubione są tylko na tym telefonie. Zapisz kopię do pliku, żeby ich nie stracić.'),
    h(
      'div',
      { class: 'inline-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: () => {
            downloadBackup();
            banner.remove();
            toast('Kopia zapisana. Następne przypomnienie za tydzień.');
          },
        },
        icon('check'),
        'Zapisz kopię',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn secondary',
          onclick: () => {
            snoozeBackup();
            banner.remove();
          },
        },
        'Później',
      ),
    ),
  );
  return banner;
}
