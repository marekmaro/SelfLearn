// Prosty serwer do podglądu na komputerze: node scripts/serve.mjs, potem http://localhost:8080
// Domyślnie słucha tylko na tym komputerze. Podgląd na telefonie w tej samej sieci: HOST=0.0.0.0 node scripts/serve.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// To samo, co trafia na stronę (scripts/build-site.mjs). Reszta projektu, np. .git i skrypty, zostaje niedostępna.
const PUBLIC = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'assets', 'content'];

// Zamienia adres z przeglądarki na plik w projekcie albo null, gdy pliku nie wolno wydać.
export function safePath(root, rawUrl) {
  let path;
  try {
    path = decodeURIComponent(new URL(rawUrl, 'http://x').pathname);
  } catch {
    return null;
  }
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
  const rel = relative(root, file);
  if (!rel || isAbsolute(rel)) return null;
  const parts = rel.split(sep);
  if (parts.some((part) => part === '..' || part.startsWith('.'))) return null;
  return PUBLIC.includes(parts[0]) ? file : null;
}

export function startServer({ root = process.cwd(), port = Number(process.env.PORT) || 8080, host = process.env.HOST || '127.0.0.1' } = {}) {
  const server = createServer(async (req, res) => {
    const file = safePath(root, req.url);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nie znaleziono');
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nie znaleziono');
    }
  });
  server.listen(port, host, () => {
    const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
    console.log(`SelfLearn: http://${shown}:${port}${host === '127.0.0.1' ? '' : ` (dostępny też w sieci lokalnej: ${host})`}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
