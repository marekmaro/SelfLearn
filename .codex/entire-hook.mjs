import { spawnSync } from 'node:child_process';

const hook = process.argv[2];
const hooks = new Set(['post-tool-use', 'session-end', 'session-start', 'stop', 'subagent-start', 'subagent-stop', 'user-prompt-submit']);

if (!hooks.has(hook)) {
  console.error('Nieznany hook Entire.');
  process.exit(2);
}

// `where.exe` jest dostępne w Windows, a /bin/sh i `command -v` w macOS/Linux.
const lookup = process.platform === 'win32'
  ? spawnSync('where.exe', ['entire'], { stdio: 'ignore' })
  : spawnSync('/bin/sh', ['-c', 'command -v entire'], { stdio: 'ignore' });

if (lookup.status !== 0) {
  if (hook === 'session-start') {
    process.stdout.write(JSON.stringify({ systemMessage: 'Entire CLI is enabled but not installed or not on PATH. Installation guide: https://docs.entire.io/cli/installation#installation-methods' }));
  }
  process.exit(0);
}

const result = spawnSync('entire', ['hooks', 'codex', hook], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`Nie udało się uruchomić hooka Entire: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
