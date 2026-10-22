// Czytanie wydania: pasek postępu rozdziału i zapamiętane miejsce, w którym skończyłeś.

const POS_KEY = 'selflearn:pozycja';
let scrollWatched = false;
let saveTimer = null;

export function smoothScroll() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

// Cienka linia pod paskiem rozdziałów: ile z bieżącego rozdziału już przeczytane.
export function updateReadProgress() {
  const bar = document.querySelector('.read-progress > span');
  const chapter = document.getElementById('rozdzial');
  if (!bar || !chapter) return;
  const stripH = document.querySelector('.chapters')?.offsetHeight || 0;
  const top = chapter.getBoundingClientRect().top + window.scrollY - stripH;
  const span = chapter.offsetHeight - (window.innerHeight - stripH);
  const ratio = span <= 0 ? 1 : (window.scrollY - top) / span;
  bar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
}

// Zapamiętuje miejsce w rozdziale, żeby po powrocie do aplikacji czytać dalej.
function savePosition() {
  const chapter = document.getElementById('rozdzial');
  if (!chapter) return;
  const offset = Math.round(window.scrollY - (chapter.getBoundingClientRect().top + window.scrollY));
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ date: chapter.dataset.date, chapter: chapter.dataset.chapter, offset }));
  } catch {
    // Brak pamięci – trudno, zaczniemy od początku rozdziału.
  }
}

export function restorePosition(date) {
  let pos = null;
  try {
    pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
  } catch {
    pos = null;
  }
  const chapter = document.getElementById('rozdzial');
  if (!pos || !chapter || pos.date !== date || pos.chapter !== chapter.dataset.chapter || pos.offset < 160) return;
  requestAnimationFrame(() => {
    const top = chapter.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + pos.offset, behavior: 'instant' });
    updateReadProgress();
  });
}

export function watchScroll() {
  if (scrollWatched) return;
  scrollWatched = true;
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateReadProgress();
      });
      clearTimeout(saveTimer);
      saveTimer = setTimeout(savePosition, 400);
    },
    { passive: true },
  );
  window.addEventListener('resize', updateReadProgress, { passive: true });
}
