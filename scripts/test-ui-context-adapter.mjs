import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const repoRoot = process.cwd();
const outfile = path.join(tmpdir(), `brycecast-ui-context-adapter-${process.pid}.mjs`);

try {
  await build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [process.argv.includes('--publication') ? 'tests/publicationAdapters.test.ts' : 'tests/uiContextAdapter.test.ts'],
    format: 'esm',
    loader: { '.json': 'json' },
    logLevel: 'silent',
    outfile,
    platform: 'node',
    plugins: [
      {
        // Vite-only import.meta.glob lives in src/data/packModules.ts; tests
        // substitute a Node fs walker that produces the same `?url` loader
        // maps. Each loader resolves to a `data:` URL (not a file path) so
        // the real runtime code path — `packLoader.ts`'s `fetch(url).then(r
        // => r.text())` — runs unchanged in this Node harness; Node's global
        // `fetch` supports `data:` URLs, matching the browser at runtime.
        name: 'pack-modules-shim',
        setup(buildApi) {
          buildApi.onResolve({ filter: /[/.]packModules$/ }, () => ({ namespace: 'pack-modules-shim', path: 'packModules' }));
          buildApi.onLoad({ filter: /.*/, namespace: 'pack-modules-shim' }, () => ({
            resolveDir: repoRoot,
            contents: `
              import { readFile } from 'node:fs/promises';
              import { readdirSync, statSync } from 'node:fs';
              import path from 'node:path';
              const repoRoot = ${JSON.stringify(repoRoot)};
              const found = [];
              const walk = (dir) => {
                for (const entry of readdirSync(dir)) {
                  const full = path.join(dir, entry);
                  const stats = statSync(full);
                  if (stats.isDirectory()) walk(full);
                  else if (/output\\/context-packs\\/.*\\.json$/.test(full.split(path.sep).join('/'))) found.push(full);
                }
              };
              walk(path.join(repoRoot, 'analysis'));
              export const packUrls = {};
              for (const abs of found) {
                const key = '../../' + path.relative(repoRoot, abs).split(path.sep).join('/');
                packUrls[key] = async () => 'data:application/json,' + encodeURIComponent(await readFile(abs, 'utf8'));
              }
              const manifestSuffix = 'predictive-race-intelligence/output/context-packs/context-pack-manifest.json';
              export const manifestUrls = Object.fromEntries(Object.entries(packUrls).filter(([key]) => key.endsWith(manifestSuffix)));
            `,
            loader: 'js'
          }));
        }
      }
    ],
    target: 'es2022'
  });

  const result = spawnSync(process.execPath, [outfile], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  await rm(outfile, { force: true });
}
