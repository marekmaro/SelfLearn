// Instalacja na ekranie telefonu. Android (Chrome) pokazuje własne okno „Zainstaluj”, a na iPhonie
// Safari takiego okna nie ma, więc pokazujemy instrukcję. Zainstalowana aplikacja otwiera się na pełnym
// ekranie, może wysyłać powiadomienia (iPhone: tylko wtedy), a Safari nie czyści jej danych po tygodniu bez użycia.
import { todayISO, addDays } from './dates.js';
import { getState, update } from './store.js';
import { h, icon, toast } from './ui.js';

let deferred = null;

// Wywołać raz na starcie, zanim przeglądarka zgłosi gotowość do instalacji.
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    toast('Aplikacja jest na ekranie telefonu');
  });
}

export function isIOS(nav = navigator) {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

export function isInstalled() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function installState() {
  return { ios: isIOS(), installed: isInstalled(), canPrompt: Boolean(deferred) };
}

// Baner na ekranie wydania: gdy aplikacja nie jest zainstalowana i da się ją zainstalować, nie częściej niż co 2 tygodnie.
export function installBannerDue(state = installState(), settings = getState().settings || {}, today = todayISO()) {
  if (state.installed || !(state.ios || state.canPrompt)) return false;
  return !(settings.installSnooze && settings.installSnooze > today);
}

function snooze(days = 14) {
  update((s) => {
    s.settings ||= {};
    s.settings.installSnooze = addDays(todayISO(), days);
  });
}

async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  return outcome === 'accepted';
}

// Kroki dla iPhone'a: Safari (od iOS 16.4 także Chrome i inne) → Udostępnij → Do ekranu początkowego.
export function iosSteps() {
  return h(
    'ol',
    { class: 'install-steps' },
    h('li', null, 'Otwórz tę stronę w Safari i stuknij ', h('strong', null, 'Udostępnij'), ' ', icon('iosShare'), ' na dolnym pasku.'),
    h('li', null, 'Przewiń listę i wybierz ', h('strong', null, '„Do ekranu początkowego”'), '.'),
    h('li', null, 'Stuknij ', h('strong', null, '„Dodaj”'), '. Od teraz otwieraj SelfLearn ikoną z ekranu.'),
  );
}

export function installBanner({ onDone } = {}) {
  const state = installState();
  const close = (days) => {
    snooze(days);
    banner.remove();
    onDone?.();
  };
  const banner = h(
    'div',
    { class: 'banner install-banner' },
    h('p', { class: 'install-title' }, icon('download'), state.ios ? 'Dodaj SelfLearn do ekranu iPhone’a' : 'Zainstaluj SelfLearn na telefonie'),
    h(
      'p',
      { class: 'small', style: 'margin:0' },
      state.ios
        ? 'Aplikacja otworzy się na pełnym ekranie, będzie mogła przypominać o wydaniu, a Safari nie usunie Twoich postępów po tygodniu przerwy.'
        : 'Aplikacja otworzy się z ikony na pełnym ekranie, jak każda inna, i może przypominać o nowym wydaniu.',
    ),
    state.ios ? iosSteps() : null,
    h(
      'div',
      { class: 'inline-actions' },
      state.ios
        ? h('button', { type: 'button', class: 'btn secondary', onclick: () => close(3650) }, 'Gotowe')
        : h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: async () => {
                if (await promptInstall()) close(3650);
              },
            },
            icon('download'),
            'Zainstaluj',
          ),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => close(14) }, 'Później'),
    ),
  );
  return banner;
}

// Sekcja w profilu: stan instalacji i instrukcja dla obu systemów.
export function installSection() {
  const state = installState();
  return h(
    'section',
    { class: 'section', id: 'instalacja' },
    h('h2', null, 'Na ekranie telefonu'),
    state.installed
      ? h('p', { class: 'muted', style: 'margin:0' }, 'SelfLearn jest zainstalowany i otwiera się z ikony na ekranie telefonu.')
      : h(
          'div',
          { class: 'card install-card' },
          h('h3', null, 'iPhone i iPad'),
          iosSteps(),
          h('h3', null, 'Android'),
          state.canPrompt
            ? h('button', { type: 'button', class: 'btn', style: 'justify-self:start', onclick: () => promptInstall() }, icon('download'), 'Zainstaluj')
            : h('p', { class: 'small', style: 'margin:0' }, 'W Chrome otwórz menu ⋮ i wybierz „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”.'),
          h('p', { class: 'small muted', style: 'margin:0' }, 'Zainstalowana aplikacja działa na pełnym ekranie i bez internetu, może przypominać o wydaniu, a jej dane są bezpieczniejsze. Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego (iOS 16.4 lub nowszy).'),
        ),
  );
}
