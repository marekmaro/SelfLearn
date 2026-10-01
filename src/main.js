// Start aplikacji i prosty router oparty na #kotwicach.
import { getState } from './store.js';
import { dueCards } from './srs.js';
import { todayISO, isISODate } from './dates.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderToday } from './views/today.js';
import { renderReview } from './views/review.js';
import { renderSaved } from './views/saved.js';
import { renderProfile } from './views/profile.js';

const root = document.getElementById('app');

function updateBadge() {
  const badge = document.querySelector('[data-due-badge]');
  if (!badge) return;
  const due = dueCards(getState().deck, todayISO()).length;
  badge.hidden = due === 0;
  badge.textContent = due > 99 ? '99+' : String(due);
}

function setTab(tab) {
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
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
  const common = { onChange: updateBadge };

  if (hash === 'powtorki') {
    setTab('powtorki');
    renderReview(root, common);
  } else if (hash === 'zeszyt') {
    setTab('zeszyt');
    renderSaved(root);
  } else if (hash === 'profil') {
    setTab('profil');
    await renderProfile(root, {
      ...common,
      onReset: () => {
        location.hash = '';
        route();
      },
    });
  } else {
    setTab('dzis');
    const requested = hash.startsWith('wydanie-') ? hash.slice('wydanie-'.length) : null;
    await renderToday(root, { ...common, date: isISODate(requested) ? requested : null });
  }
}

window.addEventListener('hashchange', () => {
  route();
  window.scrollTo(0, 0);
});

// Po powrocie do aplikacji następnego dnia odśwież widok, żeby pokazać nowe wydanie.
let lastDay = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayISO() !== lastDay) {
    lastDay = todayISO();
    location.reload();
  }
});

route();

// Tryb offline i instalacja na ekranie telefonu.
try {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch {
  // Środowisko bez service workerów (np. podgląd) – aplikacja działa dalej, tylko bez offline.
}
