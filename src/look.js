// Wygląd aplikacji: motyw, kolor przewodni, wielkość tekstu, krój pisma i układ wiadomości.
// Ustawienia są zapisane na tym telefonie, więc każde z Was ma swój wygląd.
import { getState, update } from './store.js';
import { h } from './ui.js';
import { segmented } from './views/onboarding.js';

export const THEMES = [
  { value: 'system', label: 'Auto', sub: 'jak telefon' },
  { value: 'light', label: 'Jasny', sub: 'dzień' },
  { value: 'sepia', label: 'Sepia', sub: 'papier' },
  { value: 'dark', label: 'Ciemny', sub: 'noc' },
];

export const ACCENTS = [
  { value: 'morski', label: 'Morski', swatch: '#0E6464' },
  { value: 'granat', label: 'Granat', swatch: '#2C4F94' },
  { value: 'sliwka', label: 'Śliwka', swatch: '#7B3F72' },
  { value: 'las', label: 'Las', swatch: '#2E6B3C' },
  { value: 'koi', label: 'Koi', swatch: '#B4501C' },
];

export const TEXT_SIZES = [
  { value: 0.9, label: 'A', sub: 'mniejszy' },
  { value: 1, label: 'A', sub: 'standard' },
  { value: 1.12, label: 'A', sub: 'większy' },
  { value: 1.25, label: 'A', sub: 'duży' },
];

export const FONTS = [
  { value: 'szeryf', label: 'Gazetowy', sub: 'szeryfowy' },
  { value: 'bez', label: 'Prosty', sub: 'bezszeryfowy' },
];

export const LAYOUTS = [
  { value: 'pelny', label: 'Pełny', sub: 'całe streszczenia' },
  { value: 'skrot', label: 'Nagłówki', sub: 'rozwijane dotknięciem' },
];

export const DEFAULT_LOOK = { theme: 'system', accent: 'morski', textSize: 1, font: 'szeryf', layout: 'pelny', hideBars: true };

export function getLook() {
  return { ...DEFAULT_LOOK, ...(getState().settings?.look || {}) };
}

export function setLook(patch) {
  update((s) => {
    s.settings ||= {};
    s.settings.look = { ...getLook(), ...patch };
  });
  applyLook();
}

export function applyLook(look = getLook()) {
  const root = document.documentElement;
  if (look.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = look.theme;
  root.dataset.accent = look.accent;
  root.dataset.font = look.font;
  root.dataset.layout = look.layout;
  root.style.setProperty('--text-scale', String(look.textSize));
  syncThemeColor();
}

// Pasek stanu telefonu w kolorze tła, żeby aplikacja wyglądała jak jedna całość.
function syncThemeColor() {
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const meta = metas.shift() || document.head.appendChild(h('meta', { name: 'theme-color' }));
  for (const extra of metas) extra.remove();
  meta.removeAttribute('media');
  meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#EDF2F1');
}

// Motyw „Auto” śledzi zmianę trybu w telefonie bez przeładowania.
try {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => syncThemeColor());
} catch {
  // Starsze przeglądarki: kolor paska odświeży się przy następnym uruchomieniu.
}

// Panel wyglądu: ten sam w profilu i w szybkim arkuszu „Aa” nad wydaniem.
export function appearancePanel({ onChange } = {}) {
  const look = getLook();
  const set = (patch) => {
    setLook(patch);
    onChange?.(patch);
  };

  const swatches = h(
    'div',
    { class: 'swatches', role: 'radiogroup', 'aria-label': 'Kolor przewodni' },
    ACCENTS.map((a) =>
      h(
        'button',
        {
          type: 'button',
          class: 'swatch',
          role: 'radio',
          'aria-checked': a.value === look.accent ? 'true' : 'false',
          'aria-label': a.label,
          title: a.label,
          style: `--swatch:${a.swatch}`,
          onclick: (e) => {
            for (const b of swatches.children) b.setAttribute('aria-checked', 'false');
            e.currentTarget.setAttribute('aria-checked', 'true');
            set({ accent: a.value });
          },
        },
        h('span', { class: 'swatch-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'swatch-label' }, a.label),
      ),
    ),
  );

  const sizes = segmented(TEXT_SIZES, look.textSize, (v) => set({ textSize: v }));
  sizes.classList.add('sizes');
  [...sizes.children].forEach((b, i) => b.querySelector('strong')?.style.setProperty('font-size', `${0.85 + i * 0.18}rem`));

  return h(
    'div',
    { class: 'look-panel' },
    h('p', { class: 'eyebrow' }, 'Motyw'),
    withClass(segmented(THEMES, look.theme, (v) => set({ theme: v })), 'four'),
    h('p', { class: 'eyebrow' }, 'Kolor'),
    swatches,
    h('p', { class: 'eyebrow' }, 'Wielkość tekstu'),
    withClass(sizes, 'four'),
    h('p', { class: 'eyebrow' }, 'Krój do czytania'),
    withClass(segmented(FONTS, look.font, (v) => set({ font: v })), 'two'),
    h('p', { class: 'eyebrow' }, 'Wiadomości'),
    withClass(segmented(LAYOUTS, look.layout, (v) => set({ layout: v })), 'two'),
    h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', checked: look.hideBars, onchange: (e) => set({ hideBars: e.target.checked }) }),
      'Chowaj dolny pasek podczas przewijania w dół',
    ),
  );
}

function withClass(el, cls) {
  el.classList.add(cls);
  return el;
}

// Szybki arkusz „Aa” otwierany nad wydaniem.
export function openAppearanceSheet({ onChange } = {}) {
  document.querySelector('dialog.sheet')?.remove();
  const dialog = h(
    'dialog',
    { class: 'sheet', 'aria-label': 'Wygląd' },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', null, 'Wygląd'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Gotowe'),
    ),
    appearancePanel({ onChange }),
  );
  dialog.addEventListener('close', () => dialog.remove());
  // Dotknięcie poza arkuszem zamyka go.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}
