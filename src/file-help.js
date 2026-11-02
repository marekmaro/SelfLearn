// Moduły ES i fetch nie działają poprawnie, gdy strona jest otwarta bezpośrednio jako file://.
if (location.protocol === 'file:') {
  const root = document.getElementById('app');
  if (root) {
    const panel = document.createElement('section');
    panel.className = 'startup-help';
    panel.setAttribute('role', 'alert');

    const title = document.createElement('h1');
    title.textContent = 'Uruchom SelfLearn przez serwer';

    const explanation = document.createElement('p');
    explanation.textContent = 'Przeglądarka nie uruchamia aplikacji otwartej bezpośrednio z pliku. W folderze projektu otwórz PowerShell i wpisz:';

    const command = document.createElement('code');
    command.textContent = 'npm start';

    const next = document.createElement('p');
    next.append('Zostaw okno PowerShell otwarte, a potem przejdź pod adres ');
    const link = document.createElement('a');
    link.href = 'http://localhost:8080';
    link.textContent = 'http://localhost:8080';
    next.append(link, '.');

    panel.append(title, explanation, command, next);
    root.replaceChildren(panel);
    document.body.classList.add('is-onboarding');
  }
}
