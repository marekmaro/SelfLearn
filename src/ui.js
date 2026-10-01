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
};

export function icon(name) {
  return h('span', { class: 'icon', 'aria-hidden': 'true', svg: ICONS[name] || '' });
}

// Znak aplikacji: karp skaczący nad falą (ten sam motyw co ikona na ekranie telefonu).
export function koiMark(cls = 'koi-mark') {
  return h('span', {
    class: cls,
    'aria-hidden': 'true',
    svg: `<svg viewBox="0 0 512 512" width="100%" height="100%">
      <rect width="512" height="512" rx="112" fill="var(--nurt)"/>
      <g fill="none" stroke="var(--nurt-soft)" stroke-width="18" stroke-linecap="round" opacity=".55">
        <path d="M72 392c37-26 74-26 111 0s74 26 111 0 74-26 111 0"/>
        <path d="M110 438c30-20 60-20 90 0s60 20 90 0 60-20 90 0"/>
      </g>
      <g transform="rotate(-36 256 240)">
        <path d="M150 240 L84 184 L110 240 L84 296 Z" fill="#F2B544"/>
        <path d="M232 190 Q262 140 306 186 Z" fill="#F2B544"/>
        <ellipse cx="262" cy="240" rx="122" ry="56" fill="#F07A45"/>
        <path d="M306 210 q-16 30 0 60" fill="none" stroke="#F2B544" stroke-width="10" stroke-linecap="round"/>
        <circle cx="340" cy="226" r="10" fill="#10302F"/>
      </g>
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
export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2400);
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
