// Ocena pewności w quizach: przed odpowiedzią można zaznaczyć „Zgaduję”.
// Zgadnięta dobra odpowiedź nie przesuwa pytania dalej w powtórkach (zob. srs.js),
// a w podsumowaniu widać, jak często pewne odpowiedzi są naprawdę dobre.
import { h } from './ui.js';

export function guessToggle(on, onToggle) {
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'chip guess-toggle',
      'aria-pressed': String(Boolean(on)),
      title: 'Zaznacz przed odpowiedzią, jeśli nie wiesz na pewno',
      onclick: () => {
        const next = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(next));
        onToggle(next);
      },
    },
    'Zgaduję',
  );
  return btn;
}

export function verdictText(ok, guessed) {
  if (ok && guessed) return 'Dobrze, choć na wyczucie. Zgadnięte odpowiedzi nie awansują w powtórkach.';
  if (ok) return 'Dobrze!';
  return 'Tym razem nie.';
}

// „Pewne: 8 z 9 dobrze · na wyczucie: 2 z 4” – tylko gdy choć raz było zgadywanie.
export function calibration(answers) {
  const sure = answers.filter((a) => !a.guessed);
  const guessed = answers.filter((a) => a.guessed);
  if (!guessed.length) return null;
  const right = (list) => list.filter((a) => a.ok).length;
  const parts = [];
  if (sure.length) parts.push(`pewne: ${right(sure)} z ${sure.length} dobrze`);
  parts.push(`na wyczucie: ${right(guessed)} z ${guessed.length}`);
  const text = parts.join(' · ');
  return text[0].toUpperCase() + text.slice(1);
}
