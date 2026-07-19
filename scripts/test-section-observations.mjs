/** Bundle + run the Section Intelligence contract test (Brief H). Mirrors
 *  scripts/test-ui-context-adapter.mjs's esbuild approach so a .ts test with
 *  type-only imports and the curated anchor modules runs under Node without a
 *  bundler. No packModules shim is needed — the contract transform and the
 *  geometry join are pure. */
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const repoRoot = process.cwd();
const outfile = path.join(tmpdir(), `brycecast-section-observations-${process.pid}.mjs`);

try {
  await build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: ['tests/sectionObservations.test.ts'],
    format: 'esm',
    loader: { '.json': 'json' },
    logLevel: 'silent',
    outfile,
    platform: 'node'
  });
  const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} finally {
  await rm(outfile, { force: true });
}
