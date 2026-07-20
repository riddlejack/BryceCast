/** Brief J stage 2 QA — the live field-compression ticker.
 *
 * Drives the real replay deep-link path (`/live?replay=<key>&t0=<iso>&speed=1`,
 * the same shape the race-page "story so far" cross-link carries) through a
 * green-flag racing window AND a caution window, asserting the module's own
 * state (the `data-field-compression` line and its data-* facts), then saving
 * reduced-motion stills at 1440 and 390 for both states.
 *
 * Self-contained: spawns its own replay API (lake feeds only — never the
 * LaunchAgent's :8787) and its own Vite dev server on 5298.
 *
 * Run: node scripts/qa-live-field-compression.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const API_PORT = 8798;
const APP_PORT = 5298;
const API = `http://127.0.0.1:${API_PORT}`;
const BASE = `http://127.0.0.1:${APP_PORT}`;
// Green pack: WeatherTech Raceway Laguna Seca 2025, Bryce P9 in a tight lead
// pack. Caution: Nashville Superspeedway 2025, mid-race yellow on lap 31.
const GREEN = { race: 'session_indy_nxt_2025_6442', t0: '2025-07-26T13:48:45.000Z', label: 'green-spread' };
const CAUTION = { race: 'session_indy_nxt_2025_6447', t0: '2025-08-31T10:48:18.000Z', label: 'caution' };
const OUT_DIR = path.join(os.homedir(), '.brycecast', 'reports', 'field-compression');

const children = [];
const kill = () => children.forEach((child) => { try { child.kill('SIGTERM'); } catch { /* gone */ } });
process.on('exit', kill);
process.on('SIGINT', () => { kill(); process.exit(130); });

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const waitFor = async (url, label, timeoutMs = 60_000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { await fetch(url); return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not come up at ${url}`);
};

const spawnServer = (label, command, args, env) => {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => console.error(`[${label}] ${String(chunk).trim()}`));
  children.push(child);
  return child;
};

const readCompression = (page) => page.evaluate(() => {
  const line = document.querySelector('[data-field-compression]');
  const corridor = document.querySelector('[data-battle-corridor]');
  return line
    ? {
        state: line.getAttribute('data-field-compression'),
        gapBasis: line.getAttribute('data-gap-basis'),
        packCars: line.getAttribute('data-pack-cars'),
        packCovered: line.getAttribute('data-pack-covered'),
        pairsWithin: line.getAttribute('data-pairs-within'),
        text: (line.textContent || '').replace(/\s+/g, ' ').trim(),
        sessionKind: document.querySelector('.live-page')?.getAttribute('data-live-session-kind') ?? null,
        corridorPresent: Boolean(corridor)
      }
    : { state: null, corridorPresent: Boolean(corridor) };
});

const openReplay = async (page, race, t0) => {
  await page.goto(`${BASE}/live?replay=${race}&t0=${encodeURIComponent(t0)}&speed=1`, { waitUntil: 'load' });
  await page.waitForSelector('[data-battle-corridor]', { timeout: 60_000 });
  // Let the first sourced payload arrive and the ticker resolve.
  await page.waitForSelector('[data-field-compression]', { timeout: 30_000 });
  await page.waitForTimeout(1_200);
};

const screenshotPair = async (page, name) => {
  const module = page.locator('.live-battle');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(400);
  await module.screenshot({ path: path.join(OUT_DIR, `${name}--1440.png`) });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(500);
  await module.screenshot({ path: path.join(OUT_DIR, `${name}--390.png`) });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(300);
  console.log(`shot  ${name} at 1440 and 390`);
};

await mkdir(OUT_DIR, { recursive: true });

spawnServer('api', process.execPath, ['scripts/api-server.mjs', `--port=${API_PORT}`, '--host=127.0.0.1'], { BRYCECAST_REPLAY: '1' });
await waitFor(`${API}/api/readiness`, 'replay API');
spawnServer('vite', 'npx', ['vite', '--port', String(APP_PORT), '--strictPort', '--host', '127.0.0.1'], { BRYCECAST_API_PROXY: API });
await waitFor(BASE, 'vite dev server');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();

/* ---------- green-flag racing window ---------- */
await openReplay(page, GREEN.race, GREEN.t0);
const green = await readCompression(page);
console.log('green:', JSON.stringify(green));
check(green.sessionKind === 'race', 'green window is race-shaped');
check(green.state === 'green', 'the compression ticker shows racing facts under green');
check(green.gapBasis === 'leader-cumulative', "the lake gaps are read as gap-to-leader (normalizer detected the basis)");
check(Number(green.packCars) >= 2, `Bryce anchors a real pack under green (packCars=${green.packCars})`);
check(Number(green.pairsWithin) >= 1, `tight pairs are counted under green (pairsWithin=${green.pairsWithin})`);
check(/around Bryce/.test(green.text) && /within 1\.0s/.test(green.text), `the fact reads as a house ticker sentence ("${green.text}")`);
await screenshotPair(page, GREEN.label);

/* ---------- caution window ---------- */
await openReplay(page, CAUTION.race, CAUTION.t0);
const caution = await readCompression(page);
console.log('caution:', JSON.stringify(caution));
check(caution.sessionKind === 'race', 'caution window is race-shaped');
check(caution.state === 'caution', 'under yellow the ticker states the caution, never racing numbers');
check(caution.text === 'Under caution — field bunched', `the caution copy is the honest bunch line ("${caution.text}")`);
check(caution.packCars === null && caution.pairsWithin === null, 'no compression facts are emitted under caution');
await screenshotPair(page, CAUTION.label);

await context.close();
await browser.close();
kill();

console.log(`\nscreenshots in ${OUT_DIR}`);
console.log(failures.length === 0 ? 'QA green — every assertion passed.' : `QA RED — ${failures.length} failure(s):`);
failures.forEach((label) => console.log(`  - ${label}`));
process.exit(failures.length === 0 ? 0 : 1);
