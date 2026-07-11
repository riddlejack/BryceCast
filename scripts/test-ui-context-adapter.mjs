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
    entryPoints: ['tests/uiContextAdapter.test.ts'],
    format: 'esm',
    loader: { '.json': 'json' },
    logLevel: 'silent',
    outfile,
    platform: 'node',
    plugins: [
      {
        // Vite-only import.meta.glob lives in src/data/packModules.ts; tests
        // substitute a Node fs walker that produces the same loader maps.
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
              export const packModules = {};
              export const packRawModules = {};
              for (const abs of found) {
                const key = '../../' + path.relative(repoRoot, abs).split(path.sep).join('/');
                packModules[key] = async () => ({ default: JSON.parse(await readFile(abs, 'utf8')) });
                packRawModules[key] = async () => readFile(abs, 'utf8');
              }
              const manifestSuffix = 'predictive-race-intelligence/output/context-packs/context-pack-manifest.json';
              export const manifestModules = Object.fromEntries(Object.entries(packModules).filter(([key]) => key.endsWith(manifestSuffix)));
              export const manifestRawModules = Object.fromEntries(Object.entries(packRawModules).filter(([key]) => key.endsWith(manifestSuffix)));
            `,
            loader: 'js'
          }));
        }
      },
      {
        name: 'raw-json-imports',
        setup(buildApi) {
          buildApi.onResolve({ filter: /\.json\?raw$/ }, (args) => ({
            namespace: 'raw-json',
            path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, ''))
          }));
          buildApi.onLoad({ filter: /.*/, namespace: 'raw-json' }, async (args) => ({
            contents: await readFile(args.path, 'utf8'),
            loader: 'text'
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
