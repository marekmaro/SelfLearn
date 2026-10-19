// Publikacja wydania prosto z telefonu przez API GitHuba (token z dostępem tylko do tego repozytorium).
import { indexEntry } from './edition.js';

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function client({ owner, repo, branch, token }) {
  const base = `https://api.github.com/repos/${owner}/${repo}/contents/`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function explain(res) {
    if (res.status === 401) return 'GitHub nie przyjął tokenu. Sprawdź, czy jest wklejony w całości i nie wygasł.';
    if (res.status === 403) return 'Token nie ma prawa zapisu. Nadaj mu uprawnienie „Contents: Read and write” do tego repozytorium.';
    if (res.status === 404) return `Nie widzę repozytorium ${owner}/${repo}. Sprawdź nazwę i to, czy token ma do niego dostęp.`;
    if (res.status === 409) return 'Ktoś właśnie zmienił ten plik. Spróbuj jeszcze raz.';
    const body = await res.json().catch(() => ({}));
    return `GitHub zwrócił błąd ${res.status}${body.message ? `: ${body.message}` : ''}.`;
  }

  async function read(path) {
    const res = await fetch(`${base}${path}?ref=${encodeURIComponent(branch)}`, { headers, cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await explain(res));
    const data = await res.json();
    return { sha: data.sha, text: fromBase64(data.content || '') };
  }

  async function write(path, text, message, sha) {
    const res = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message, content: toBase64(text), branch, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) throw new Error(await explain(res));
  }

  return { read, write };
}

// Zapisuje content/editions/<data>.json i dopisuje wydanie do content/index.json.
export async function publishEdition(settings, edition) {
  if (!settings.token) throw new Error('Najpierw wklej token GitHuba w profilu.');
  const gh = client(settings);
  const path = `content/editions/${edition.date}.json`;
  const existing = await gh.read(path);
  await gh.write(path, `${JSON.stringify(edition, null, 2)}\n`, `Wydanie ${edition.date}`, existing?.sha);

  const index = await gh.read('content/index.json');
  const data = index ? JSON.parse(index.text) : { editions: [] };
  const entries = (data.editions || []).filter((e) => e.date !== edition.date);
  entries.push(indexEntry(edition));
  entries.sort((a, b) => b.date.localeCompare(a.date));
  await gh.write('content/index.json', `${JSON.stringify({ editions: entries }, null, 2)}\n`, `Indeks: wydanie ${edition.date}`, index?.sha);
  return { replaced: Boolean(existing) };
}

// Sprawdza token bez zapisywania czegokolwiek.
export async function checkAccess(settings) {
  const res = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${settings.token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'GitHub nie przyjął tokenu.' : `Brak dostępu do ${settings.owner}/${settings.repo} (${res.status}).`);
  const repo = await res.json();
  if (repo.permissions && !repo.permissions.push) throw new Error('Token działa, ale nie ma prawa zapisu do repozytorium.');
  return true;
}

// Adres strony GitHuba z formularzem nowego pliku (gdy nie ma tokenu).
export function newFileUrl({ owner, repo, branch }, date) {
  return `https://github.com/${owner}/${repo}/new/${branch}?filename=${encodeURIComponent(`content/editions/${date}.json`)}`;
}
