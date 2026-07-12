import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const firstExisting = async (paths) => {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {}
  }
  return null;
};

const sqlitePath =
  process.env.BRYCECAST_SQLITE_PATH ??
  (await firstExisting([
    join(root, 'data/live/brycecast.sqlite'),
    resolve(root, '../Bryce POV access/data/live/brycecast.sqlite')
  ]));

if (!sqlitePath) {
  throw new Error('No BryceCast replay archive found. Set BRYCECAST_SQLITE_PATH to a read-only brycecast.sqlite archive.');
}

process.env.BRYCECAST_REPLAY = '1';
process.env.BRYCECAST_SQLITE_PATH = sqlitePath;
process.env.BRYCECAST_RUNNER_STATUS_PATH ??= join(dirname(sqlitePath), 'live-runner-status.json');
process.env.BRYCECAST_REPLAY_SESSION ??= '5537-6754';
process.env.BRYCECAST_REPLAY_T0 ??= '2026-06-21T16:08:20.437Z';
process.env.BRYCECAST_REPLAY_SPEED ??= '1';

if (!process.argv.some((argument) => argument.startsWith('--port'))) process.argv.push('--port=8788');
if (!process.argv.some((argument) => argument.startsWith('--host'))) process.argv.push('--host=127.0.0.1');

const { startServer } = await import('./api-server.mjs');
startServer();

