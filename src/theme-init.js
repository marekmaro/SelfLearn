// Wybrany wygląd przed pierwszym rysowaniem, bez mignięcia domyślnego motywu.
try {
  const look = ((JSON.parse(localStorage.getItem('selflearn:v1')) || {}).settings || {}).look || {};
  const root = document.documentElement;
  if (look.theme && look.theme !== 'system') root.dataset.theme = look.theme;
  if (look.accent) root.dataset.accent = look.accent;
  if (look.font) root.dataset.font = look.font;
  if (look.textSize) root.style.setProperty('--text-scale', String(look.textSize));
} catch {
  // Pierwsze uruchomienie lub niedostępna pamięć: użyj motywu domyślnego.
}
