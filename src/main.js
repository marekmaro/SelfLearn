// Start aplikacji i prosty router oparty na #kotwicach.
import { getState, requestPersistence } from './store.js';
import { dueCards } from './srs.js';
import { todayISO, isISODate } from './dates.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderToday } from './views/today.js';
import { renderReview } from './views/review.js';
import { renderFavorites } from './views/favorites.js';
import { renderTimeline, leaveTimeline } from './views/timeline.js';
import { renderProfile } from './views/profile.js';
import { renderPrepare } from './views/prepare.js';
import { renderWeek } from './views/week.js';
import { applyLook, getLook } from './look.js';
import { refreshReminders } from './notify.js';
import { parseChallenge, receiveChallenge } from './challenge.js';

const root = document.getElementById('app');
applyLook();

function updateBadge() {
  const badge = document.querySelector('[data-due-badge]');
  if (!badge) return;
  const due = dueCards(getState().deck, todayISO()).length;
  badge.hidden = due === 0;
  badge.textContent = due > 99 ? '99+' : String(due);
  // Plakietka na ikonie aplikacji i stan dla przypomnień w tle.
  refreshReminders();
}

function setTab(tab) {
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function route() {
  const hash = decodeURIComponent(location.hash.slice(1));

  // Link z wyzwaniem od drugiej osoby: zapisz wynik i otwórz to wydanie.
  const challenge = parseChallenge(hash);
  if (challenge) {
    receiveChallenge(challenge);
    location.replace(challenge.date === todayISO() ? '#dzis' : `#wydanie-${challenge.date}`);
    return;
  }

  const hasProfile = Boolean(getState().profile);
  const onboarding = !hasProfile || hash === 'ankieta';
  document.body.classList.toggle('is-onboarding', onboarding);

  if (onboarding) {
    renderOnboarding(root, {
      onDone: () => {
        if (location.hash === '#dzis') route();
        else location.hash = '#dzis';
      },
    });
    return;
  }

  updateBadge();
  leaveTimeline();
  const common = { onChange: updateBadge };

  if (hash === 'powtorki') {
    setTab('powtorki');
    renderReview(root, common);
  } else if (hash === 'ulubione' || hash === 'zeszyt') {
    setTab('ulubione');
    renderFavorites(root);
  } else if (hash === 'dni') {
    setTab('dzis');
    await renderTimeline(root);
  } else if (hash === 'tydzien') {
    setTab('dzis');
    await renderWeek(root, common);
  } else if (hash === 'przygotuj') {
    setTab('dzis');
    await renderPrepare(root, common);
  } else if (['profil', 'ustawienia', 'wyglad', 'przypomnienia', 'publikowanie'].includes(hash)) {
    setTab('profil');
    await renderProfile(root, {
      ...common,
      focus: hash === 'profil' ? null : hash,
      onReset: () => {
        applyLook();
        location.hash = '';
        route();
      },
    });
  } else {
    setTab('dzis');
    // #wydanie-2026-10-20 albo #wydanie-2026-10-20/pl-1 (otwiera wydanie na tej karcie, np. z Ulubionych).
    const m = hash.match(/^wydanie-(\d{4}-\d{2}-\d{2})(?:\/(.+))?$/);
    const requested = m && isISODate(m[1]) ? m[1] : null;
    await renderToday(root, { ...common, date: requested, focus: m?.[2] || null });
  }
}

window.addEventListener('hashchange', () => {
  document.body.classList.remove('bars-hidden');
  route();
  window.scrollTo(0, 0);
});

// Dotknięcie zakładki, na której już jesteś, przewija na górę (jak w aplikacjach w telefonie).
document.querySelector('.tabbar')?.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link || location.hash !== link.getAttribute('href')) return;
  e.preventDefault();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
});

// Podczas czytania (przewijanie w dół) dolny pasek chowa się; wraca przy przewijaniu w górę i na dole strony.
let lastY = window.scrollY;
let barsTicking = false;
window.addEventListener(
  'scroll',
  () => {
    if (barsTicking) return;
    barsTicking = true;
    requestAnimationFrame(() => {
      barsTicking = false;
      const y = window.scrollY;
      const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 24;
      const hide = getLook().hideBars && y > 160 && y > lastY + 6 && !atBottom && !document.body.classList.contains('is-onboarding');
      if (hide) document.body.classList.add('bars-hidden');
      else if (y < lastY - 6 || y <= 160 || atBottom) document.body.classList.remove('bars-hidden');
      lastY = y;
    });
  },
  { passive: true },
);

// Po powrocie do aplikacji następnego dnia odśwież widok, żeby pokazać nowe wydanie.
let lastDay = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') refreshReminders();
  if (document.visibilityState === 'visible' && todayISO() !== lastDay) {
    lastDay = todayISO();
    location.reload();
  }
});

route();

// Prośba, żeby przeglądarka sama nie czyściła postępów (Chrome zgadza się zwykle po instalacji aplikacji).
if (getState().profile) requestPersistence();

// Tryb offline i instalacja na ekranie telefonu.
try {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch {
  // Środowisko bez service workerów (np. podgląd) – aplikacja działa dalej, tylko bez offline.
}
