#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const uiBytes = await readFile('analysis/ui-data-package/ui-data-package.json');
const ui = JSON.parse(uiBytes);
let commit = null;
let sourceDirty = null;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  sourceDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0;
} catch { /* A source export can still be built; it cannot claim a Git identity. */ }
const release = {
  schemaVersion: 'brycecast-release.v1',
  commit,
  sourceDirty,
  builtAt: new Date().toISOString(),
  dataAsOf: ui.asOfDate,
  uiPackageSha256: createHash('sha256').update(uiBytes).digest('hex')
};
await writeFile('dist/release.json', `${JSON.stringify(release, null, 2)}\n`);
console.log(`Release identity: ${commit ?? 'source export'}${sourceDirty ? ' (uncommitted changes)' : ''}; data ${ui.asOfDate}`);
