import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for the SPA-route ⇄ asset-directory collision.
//
// `/data` is a client-side screen (DataScreen) AND `dist/data/` is a real asset
// directory (Vite copies `public/data/*.json` there). A browser hard-navigation
// to `/data` used to 404 because the static handler tried `dist/data/index.html`
// — which doesn't exist — instead of the app shell. The fix: when a request path
// resolves to a DIRECTORY and the client accepts text/html, serve the SPA shell;
// real files under the directory keep streaming as files. This test drives the
// LITERAL user URLs (the "user's bytes" lesson) against a hermetic static fixture.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] ?? '8791');
const baseUrl = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// A recognizable app-shell marker: a served body containing this string is the
// SPA index.html, not a directory listing or an asset.
const SHELL_MARKER = '__BRYCECAST_SPA_SHELL__';
const HISTORY_MARKER = 'history-bryce-fixture';

const waitForHealth = async () => {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { headers: { accept: 'application/json' } });
      if (response.ok) {
        const json = await response.json();
        if (json?.ok) return json;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('static-routing test server did not become healthy');
};

// Build a minimal static tree that reproduces the collision: an app shell at the
// root and a `data/` asset directory holding a JSON file, so `/data` (the route)
// and `/data/history-bryce.json` (the asset) share the `/data` prefix.
const staticDir = await mkdtemp(join(tmpdir(), 'brycecast-static-routing-'));
await writeFile(
  join(staticDir, 'index.html'),
  `<!doctype html><html><head><title>BryceCast</title></head><body><div id="root"></div><!-- ${SHELL_MARKER} --></body></html>`
);
await mkdir(join(staticDir, 'data'), { recursive: true });
await writeFile(
  join(staticDir, 'data', 'history-bryce.json'),
  JSON.stringify({ marker: HISTORY_MARKER, meta: { schemaVersion: 'history-bryce.v1' }, points: [] })
);
// A content-hashed build asset, the way Vite names dist/assets/*.js — cache
// headers key off this "assets/" prefix, not the extension.
await mkdir(join(staticDir, 'assets'), { recursive: true });
await writeFile(join(staticDir, 'assets', 'index-abc12345.js'), 'export const marker = "index-fixture";');

const child = spawn(
  process.execPath,
  ['scripts/api-server.mjs', '--host=127.0.0.1', `--port=${port}`, `--static=${staticDir}`],
  {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Runner-only keeps the server off upstream Race Control: this test only
    // exercises static routing + /api/health, so no live-feed loop is wanted.
    env: { ...process.env, BRYCECAST_API_RUNNER_ONLY: '1' }
  }
);

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

const checks = [];
const record = (name) => checks.push(name);

try {
  await waitForHealth();

  // 1. /data hard-navigation (browser accepts text/html) → the SPA shell, 200.
  //    This is the production bug: it used to 404.
  const dataHtml = await fetch(`${baseUrl}/data`, { headers: { accept: 'text/html,application/xhtml+xml' } });
  const dataHtmlBody = await dataHtml.text();
  assert(dataHtml.status === 200, `/data hard-nav returned ${dataHtml.status}, expected 200`);
  assert((dataHtml.headers.get('content-type') ?? '').includes('text/html'), '/data hard-nav did not serve text/html');
  assert(dataHtmlBody.includes(SHELL_MARKER), '/data hard-nav did not serve the SPA shell');
  record('/data → index.html 200');

  // 2. /data/history-bryce.json → the real asset, served as JSON (unchanged).
  const historyJson = await fetch(`${baseUrl}/data/history-bryce.json`, { headers: { accept: 'application/json' } });
  const historyBody = await historyJson.text();
  assert(historyJson.status === 200, `/data/history-bryce.json returned ${historyJson.status}, expected 200`);
  assert(
    (historyJson.headers.get('content-type') ?? '').includes('application/json'),
    '/data/history-bryce.json did not serve application/json'
  );
  assert(historyBody.includes(HISTORY_MARKER), '/data/history-bryce.json did not serve the asset file contents');
  assert(!historyBody.includes(SHELL_MARKER), '/data/history-bryce.json wrongly served the SPA shell instead of the asset');
  record('/data/history-bryce.json → JSON 200');

  // 3. /race-week (no such directory) → the SPA shell, 200 (existing SPA
  //    fallback; guard that the directory fix did not regress it).
  const raceWeek = await fetch(`${baseUrl}/race-week`, { headers: { accept: 'text/html' } });
  const raceWeekBody = await raceWeek.text();
  assert(raceWeek.status === 200, `/race-week returned ${raceWeek.status}, expected 200`);
  assert((raceWeek.headers.get('content-type') ?? '').includes('text/html'), '/race-week did not serve text/html');
  assert(raceWeekBody.includes(SHELL_MARKER), '/race-week did not serve the SPA shell');
  record('/race-week → index.html 200');

  // 4. /api/health → unaffected by the static change.
  const health = await fetch(`${baseUrl}/api/health`, { headers: { accept: 'application/json' } });
  const healthJson = await health.json();
  assert(health.status === 200 && healthJson?.ok === true, '/api/health did not return ok:200');
  assert(healthJson?.service === 'brycecast-api', '/api/health missing service identity');
  record('/api/health → ok 200 (unaffected)');

  // 5. Hardening: a NON-html request to the bare `/data` directory (e.g. a fetch
  //    expecting a listing) must NOT get the shell and must NOT get a listing —
  //    it 404s. This proves the html-accept gate and the "no directory listing"
  //    guarantee: only browsers navigating get the shell; data clients don't.
  const dataJsonReq = await fetch(`${baseUrl}/data`, { headers: { accept: 'application/json' } });
  assert(dataJsonReq.status === 404, `/data with accept:json returned ${dataJsonReq.status}, expected 404 (no listing)`);
  const dataJsonBody = await dataJsonReq.text();
  assert(!dataJsonBody.includes(SHELL_MARKER), '/data with accept:json wrongly served the SPA shell');
  record('/data (accept:json) → 404, no listing');

  // 6. Root path still serves the shell (baseline unaffected).
  const rootReq = await fetch(`${baseUrl}/`, { headers: { accept: 'text/html' } });
  const rootBody = await rootReq.text();
  assert(rootReq.status === 200 && rootBody.includes(SHELL_MARKER), 'root path did not serve the SPA shell');
  record('/ → index.html 200');

  // 7. Cache-control: a content-hashed dist/assets/* file caches for a year,
  //    immutable — its URL changes whenever its content does, so a browser or
  //    Cloudflare edge can hold it indefinitely without ever revalidating.
  const asset = await fetch(`${baseUrl}/assets/index-abc12345.js`, { headers: { accept: '*/*' } });
  assert(asset.status === 200, `/assets/index-abc12345.js returned ${asset.status}, expected 200`);
  assert(
    asset.headers.get('cache-control') === 'public, max-age=31536000, immutable',
    `/assets/index-abc12345.js cache-control was "${asset.headers.get('cache-control')}", expected long-lived immutable`
  );
  record('/assets/*.js → immutable, 1-year cache');

  // 8. Cache-control: the SPA shell must always revalidate — a fresh deploy
  //    has to be visible on the very next load, not held for a cache window.
  const shellHeaders = await fetch(`${baseUrl}/`, { headers: { accept: 'text/html' } });
  assert(shellHeaders.headers.get('cache-control') === 'no-cache', `/ cache-control was "${shellHeaders.headers.get('cache-control')}", expected no-cache`);
  record('/ (index.html) → no-cache');

  // 9. Cache-control: unhashed /data/*.json (copied verbatim from public/data/)
  //    must also always revalidate — a data refresh must be visible immediately.
  const dataHeaders = await fetch(`${baseUrl}/data/history-bryce.json`, { headers: { accept: 'application/json' } });
  assert(
    dataHeaders.headers.get('cache-control') === 'no-cache',
    `/data/history-bryce.json cache-control was "${dataHeaders.headers.get('cache-control')}", expected no-cache`
  );
  record('/data/*.json → no-cache');

  console.log(JSON.stringify({ ok: true, baseUrl, checks }, null, 2));
} finally {
  child.kill('SIGTERM');
  await sleep(250);
  if (child.exitCode === null) child.kill('SIGKILL');
  await rm(staticDir, { recursive: true, force: true }).catch(() => {});
  if (stderr.trim()) process.stderr.write(stderr);
}
