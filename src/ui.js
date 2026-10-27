// Drobne narzędzia do budowania widoków bez frameworka.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'svg') el.innerHTML = value; // tylko dla stałych ikon z tego pliku
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function mount(root, ...children) {
  root.replaceChildren();
  append(root, children);
}

const ICONS = {
  bookmark: '<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-4-5 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 2 1.5 3 2.5 3-1-3 0-6 0-8z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  headphones: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 6l8 6-8 6z" fill="currentColor"/><path d="M18 6v12"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M18 6l-8 6 8 6z" fill="currentColor"/><path d="M6 6v12"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 19h14"/></svg>',
  iosShare: '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M5 19l1-4 10-10 3 3-10 10z"/><path d="M14 7l3 3"/></svg>',
  timeline: '<svg viewBox="0 0 24 24"><path d="M7 3v18"/><circle cx="7" cy="7" r="2"/><circle cx="7" cy="16" r="2"/><path d="M11 7h9M11 16h6"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>',
};

export function icon(name) {
  return h('span', { class: 'icon', 'aria-hidden': 'true', svg: ICONS[name] || '' });
}

// Znak aplikacji: karp w kształcie litery „S” płynący wokół słońca (ta sama grafika co ikona w telefonie).
// Tło bierze kolor przewodni z ustawień wyglądu.
let markId = 0;
export function koiMark(cls = 'koi-mark') {
  markId += 1;
  const id = `mark-${markId}`;
  return h('span', {
    class: cls,
    'aria-hidden': 'true',
    svg: `<svg viewBox="0 0 512 512" width="100%" height="100%">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".42"/>
      </linearGradient></defs>
      <rect width="512" height="512" rx="112" style="fill:var(--accent-l)"/>
      <rect width="512" height="512" rx="112" fill="url(#${id})"/>
      <circle cx="352" cy="300" r="78" fill="#F6B848"/><path d="M86 438c28-17 56-17 84 0s56 17 84 0 56-17 84 0 56 17 84 0" fill="none" stroke="#FFFFFF" stroke-opacity=".16" stroke-width="14" stroke-linecap="round"/><g fill="#F6B848"><path d="M 184.8 365.1 C 177.0 338.4 174.7 303.1 160.1 283.7 C 152.2 309.3 145.5 325.1 143.0 336.4 C 131.8 339.6 116.4 347.0 91.2 356.2 C 111.3 369.8 146.7 370.3 173.7 376.7 Z"/><path d="M 246.5 102.6 Q 180.5 80.0 204.2 114.8 Z"/></g><path d="M 302.6 197.0 Q 329.8 245.6 366.2 222.8 Q 404.7 203.7 377.4 155.0 L 374.3 149.6 L 369.6 142.8 L 364.5 136.6 L 359.1 131.0 L 353.3 125.9 L 347.3 121.3 L 341.1 117.1 L 334.8 113.4 L 328.3 110.1 L 321.7 107.2 L 315.0 104.7 L 308.1 102.5 L 301.3 100.7 L 294.3 99.2 L 287.3 98.1 L 280.2 97.4 L 273.1 97.0 L 266.0 97.0 L 259.0 97.3 L 251.9 98.1 L 244.9 99.2 L 237.9 100.7 L 231.0 102.6 L 224.2 104.9 L 217.6 107.5 L 211.0 110.7 L 204.7 114.2 L 198.5 118.2 L 192.6 122.6 L 187.0 127.5 L 181.7 132.9 L 176.9 138.7 L 172.5 145.1 L 168.6 151.8 L 165.4 158.9 L 162.8 166.4 L 160.9 174.1 L 159.7 181.9 L 159.3 189.9 L 159.6 198.1 L 160.5 205.9 L 162.2 213.6 L 164.7 220.8 L 168.0 227.6 L 171.8 233.7 L 176.1 239.3 L 180.7 244.2 L 185.5 248.6 L 190.6 252.6 L 195.7 256.1 L 200.9 259.2 L 206.2 262.1 L 211.5 264.7 L 216.9 267.2 L 222.2 269.4 L 227.6 271.6 L 233.0 273.7 L 238.3 275.6 L 243.6 277.6 L 248.8 279.5 L 253.9 281.3 L 258.9 283.2 L 263.8 285.1 L 268.5 287.0 L 273.0 288.9 L 277.3 290.9 L 281.4 292.9 L 285.2 295.0 L 288.8 297.1 L 292.0 299.3 L 295.0 301.4 L 297.6 303.7 L 299.9 306.0 L 301.9 308.3 L 303.7 310.7 L 305.2 313.2 L 306.4 316.0 L 307.5 318.9 L 308.2 322.3 L 308.7 326.1 L 308.8 329.9 L 308.7 333.7 L 308.2 337.2 L 307.5 340.5 L 306.5 343.8 L 305.3 346.8 L 303.8 349.8 L 302.0 352.6 L 300.0 355.4 L 297.7 358.1 L 295.2 360.6 L 292.4 363.0 L 289.4 365.3 L 286.1 367.5 L 282.6 369.5 L 278.9 371.4 L 275.1 373.1 L 271.0 374.6 L 266.8 376.0 L 262.5 377.2 L 258.0 378.2 L 253.5 378.9 L 248.9 379.5 L 244.2 379.9 L 239.5 380.1 L 234.8 380.1 L 230.1 379.9 L 225.4 379.5 L 220.8 378.9 L 216.2 378.0 L 211.8 377.0 L 207.4 375.8 L 203.1 374.3 L 198.9 372.7 L 195.0 370.8 L 191.1 368.8 L 187.5 366.5 L 184.1 364.1 L 180.9 361.5 L 177.7 358.4 L 169.7 373.2 L 173.5 376.8 L 177.6 380.2 L 181.9 383.3 L 186.4 386.2 L 191.1 388.9 L 195.9 391.3 L 200.9 393.5 L 206.1 395.4 L 211.3 397.2 L 216.7 398.6 L 222.1 399.9 L 227.6 400.9 L 233.2 401.7 L 238.8 402.2 L 244.5 402.5 L 250.1 402.6 L 255.8 402.4 L 261.4 402.0 L 267.0 401.3 L 272.6 400.4 L 278.1 399.2 L 283.5 397.8 L 288.8 396.1 L 294.1 394.1 L 299.2 391.8 L 304.2 389.2 L 309.0 386.3 L 313.6 383.1 L 318.0 379.5 L 322.1 375.6 L 326.0 371.4 L 329.6 366.8 L 332.9 361.9 L 335.7 356.6 L 338.2 351.1 L 340.2 345.2 L 341.7 339.0 L 342.8 332.6 L 343.3 325.9 L 343.3 319.0 L 342.6 312.1 L 341.2 305.5 L 339.2 299.1 L 336.6 293.1 L 333.6 287.4 L 330.0 282.1 L 326.1 277.1 L 321.9 272.6 L 317.5 268.3 L 312.8 264.3 L 308.0 260.6 L 303.1 257.2 L 298.0 253.9 L 292.9 250.8 L 287.8 247.8 L 282.6 245.0 L 277.4 242.3 L 272.3 239.6 L 267.2 237.0 L 262.2 234.5 L 257.4 232.1 L 252.7 229.6 L 248.1 227.2 L 243.8 224.8 L 239.8 222.4 L 236.0 220.0 L 232.6 217.7 L 229.5 215.4 L 226.8 213.1 L 224.6 211.0 L 222.8 208.9 L 221.4 207.1 L 220.5 205.4 L 219.9 204.0 L 219.7 202.7 L 219.6 201.6 L 219.8 200.6 L 220.0 199.4 L 220.4 197.9 L 221.2 195.2 L 222.1 193.0 L 223.1 191.1 L 224.2 189.6 L 225.4 188.4 L 226.6 187.5 L 227.9 186.6 L 229.3 185.9 L 230.9 185.2 L 232.5 184.5 L 234.4 184.0 L 236.4 183.4 L 238.7 182.9 L 241.1 182.5 L 243.6 182.1 L 246.4 181.8 L 249.3 181.6 L 252.3 181.4 L 255.4 181.4 L 258.6 181.4 L 261.9 181.6 L 265.1 181.8 L 268.4 182.1 L 271.7 182.6 L 274.9 183.1 L 278.1 183.7 L 281.2 184.4 L 284.1 185.2 L 286.9 186.1 L 289.5 187.0 L 291.9 188.0 L 294.0 189.0 L 295.9 190.1 L 297.6 191.1 L 298.9 192.1 L 299.9 193.0 L 300.7 193.7 L 301.2 194.4 L 301.5 194.8 L 302.6 197.0 Z" fill="#F07A45"/><circle cx="330.9" cy="186.8" r="10" fill="#10302F"/>
    </svg>`,
  });
}

export function sourceLinks(sources = []) {
  const list = Array.isArray(sources) ? sources : [sources];
  return h(
    'div',
    { class: 'sources' },
    list
      .filter((s) => s && s.url)
      .map((s) =>
        h('a', { class: 'source-link', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.name || 'Źródło', icon('external')),
      ),
  );
}

let toastTimer = null;
// Krótki komunikat na dole ekranu. Z action pokazuje też przycisk, np. „Cofnij” albo „Zobacz”.
export function toast(message, { action } = {}) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, message));
  if (action) {
    el.append(
      h(
        'button',
        {
          type: 'button',
          class: 'toast-action',
          onclick: () => {
            el.remove();
            action.onClick();
          },
        },
        action.label,
      ),
    );
  }
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), action ? 4500 : 2400);
}

// Udostępnianie z telefonu (np. do Messengera), a gdy się nie da – kopia do schowka.
export async function shareOrCopy({ title, text, url }) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText([text, url].filter(Boolean).join('\n'));
    toast('Skopiowane. Wklej, gdzie chcesz.');
  } catch {
    toast('Nie udało się skopiować.');
  }
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
