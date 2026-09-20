#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const runtime = join(homedir(), '.brycecast/runtime/analytics');
// A durable interpreter first: the pinned wheels (pandas 2.2.3) exist for 3.12,
// and a tool cache can be pruned out from under an unattended job.
const durable = ['/opt/homebrew/opt/python@3.12/bin/python3.12', '/usr/local/opt/python@3.12/bin/python3.12'].find(existsSync);
const bundled = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
const base = process.env.BRYCECAST_BASE_PYTHON || durable || (existsSync(bundled) ? bundled : 'python3');
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.status}`);
};
run(base, ['-c', 'import sys; assert sys.version_info >= (3, 10), "Python 3.10 or newer is required"']);
mkdirSync(join(homedir(), '.brycecast/runtime'), { recursive: true });
run(base, ['-m', 'venv', '--clear', runtime]);
run(join(runtime, 'bin/python'), ['-m', 'pip', 'install', '-r', 'analysis/requirements.txt']);
console.log(`Analytics runtime ready: ${runtime}`);
