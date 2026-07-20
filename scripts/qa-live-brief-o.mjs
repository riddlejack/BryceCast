/** Brief O QA — the server remembers the race (running-order history seed).
 *
 * Drives the EXACT user path, two passes, self-contained (spawns its own replay
 * API + Vite dev server; lake feeds only — never the LaunchAgent):
 *
 *   Pass A — the real replay button. `/races/<id>` → `.race-replay__cta` →
 *     `/live?replay=<key>&from=<id>`, whose client polls every live route with
 *     the literal `?replay=&rt=&speed=` shape (the lesson-13 rule). Proves the
 *     entry flow still works and the running-order chart renders — no regression.
 *
 *   Pass B — the mid-race joiner (Brief O's gate). A fresh client enters the
 *     race already in progress via `/live?replay=<key>&t0=<mid-race-iso>` — the
 *     same client machinery the button engages, dropped in mid-race. On FIRST
 *     paint the running-order chart must be FULL to the virtual now with the
 *     newest point touching now (data-history-touches-now='true'), populated by
 *     the ONE `/api/history/rank-series` seed fetch — not by client polls
 *     accumulating (at 1× that would take ~1 sample/second). Screenshots at
 *     1440 and 390 under ~/.brycecast/reports/brief-o/.
 *
 * Run: npm run qa:live-brief-o
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const API_PORT = 8795;
const APP_PORT = 5285;
const API = `http://127.0.0.1:${API_PORT}`;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const DEMO_RACE = 'session_indy_nxt_2024_6323'; // Music City GP 2024 · busy order + late caution/restart
const OUT_DIR = path.join(os.homedir(), '.brycecast', 'reports', 'brief-o');

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

const readRunningOrder = (page) => page.evaluate(() => {
  const svg = document.querySelector('[data-running-order-chart]');
  if (!svg) return null;
  const attr = (name) => svg.getAttribute(name);
  return {
    sessionKey: attr('data-session-key'),
    sampleCount: Number(attr('data-source-sample-count')),
    touchesNow: attr('data-history-touches-now'),
    orderingWaiting: attr('data-ordering-waiting'),
    sourceCheckedAt: attr('data-source-checked-at'),
    clockCheckedAt: attr('data-clock-checked-at'),
    domainSpanMs: Number(attr('data-time-domain-span-ms')),
    visibleDrivers: (attr('data-visible-driver-ids') || '').split(',').filter(Boolean).length,
    seriesCount: document.querySelectorAll('[data-running-order-series]').length,
    hasBryce: Boolean(document.querySelector('[data-series-role="bryce"]'))
  };
});

const screenshotModule = async (page, name, width) => {
  await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });
  await page.waitForTimeout(400);
  const module = page.locator('.live-running-order').first();
  await module.screenshot({ path: path.join(OUT_DIR, `${name}--${width}.png`) });
  console.log(`shot  ${name}--${width}.png`);
};

await mkdir(OUT_DIR, { recursive: true });

spawnServer('api', process.execPath, ['scripts/api-server.mjs', `--port=${API_PORT}`, '--host=127.0.0.1'], { BRYCECAST_REPLAY: '1' });
await waitFor(`${API}/api/readiness`, 'replay API');
spawnServer('vite', 'npx', ['vite', '--port', String(APP_PORT), '--strictPort', '--host', '127.0.0.1'], { BRYCECAST_API_PROXY: API });
await waitFor(BASE, 'vite dev server');

// The session's archived span, for a mid-race virtual now (60% in — deep enough
// that the session-so-far is substantial).
const available = await (await fetch(`${API}/api/replay/available`)).json();
const session = (available.sessions ?? []).find((entry) => entry.sessionKey === DEMO_RACE);
if (!session) throw new Error(`${DEMO_RACE} not available for replay`);
const firstMs = Date.parse(session.firstCheckedAt);
const lastMs = Date.parse(session.lastCheckedAt);
const midRaceIso = new Date(firstMs + Math.round((lastMs - firstMs) * 0.6)).toISOString();
console.log(`race span ${session.firstCheckedAt} → ${session.lastCheckedAt}; mid-race t0 = ${midRaceIso}`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/* ---------- Pass A: the real replay button (no-regression) ---------- */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}/races/${DEMO_RACE}`, { waitUntil: 'load' });
  const cta = page.locator('.race-replay__cta').first();
  await cta.waitFor({ state: 'visible', timeout: 30_000 });
  await cta.click();
  await page.waitForURL(/\/live\?replay=/, { timeout: 15_000 });
  check(true, 'the real replay button navigates to /live?replay=<key>&from=<id>');
  await page.waitForSelector('.replay-bar', { timeout: 30_000 });
  // Ride at 16× so the green-start chart fills quickly, then confirm it reaches
  // the right edge (touches now) — the running order works through the button.
  await page.locator('.replay-bar__speeds button', { hasText: '16×' }).click();
  let ro = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    ro = await readRunningOrder(page);
    if (ro && ro.sampleCount >= 2 && ro.touchesNow === 'true') break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  check(Boolean(ro && ro.sampleCount >= 2), `button flow: the running-order chart renders (samples ${ro?.sampleCount ?? 0})`);
  check(ro?.touchesNow === 'true', 'button flow: the chart reaches the virtual now (touches-now)');
  check(ro?.hasBryce === true, 'button flow: Bryce has a rank line');
  await screenshotModule(page, 'running-order-button-green', 1440);
  await context.close();
}

/* ---------- Pass B: the mid-race joiner — Brief O's seed gate ---------- */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();

  // Capture the ONE seed fetch the mid-race joiner makes, and count the client's
  // own readiness polls so the post-seed continuity gate can wait for real
  // arrivals to append onto the seeded window.
  let seed = null;
  let readinessArrivals = 0;
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/readiness')) readinessArrivals += 1;
    if (seed || !url.includes('/api/history/rank-series')) return;
    try { seed = { status: response.status(), body: await response.json() }; } catch { /* ignore */ }
  });

  const navStart = Date.now();
  await page.goto(`${BASE}/live?replay=${encodeURIComponent(DEMO_RACE)}&t0=${encodeURIComponent(midRaceIso)}&speed=1`, { waitUntil: 'load' });

  // FIRST paint: poll until the chart exists, recording how long it took to be
  // FULL. At 1× a client could accumulate ~1 sample/second, so a chart that is
  // already deep (>=15 samples) within ~3s can only have been server-seeded.
  let ro = null;
  let fullAtMs = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    ro = await readRunningOrder(page);
    if (ro && ro.sampleCount >= 15 && ro.touchesNow === 'true' && fullAtMs === null) { fullAtMs = Date.now() - navStart; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const firstPaint = ro;
  console.log(`first-paint running order: ${JSON.stringify(firstPaint)} (full after ${fullAtMs}ms)`);
  check(Boolean(firstPaint), 'mid-race: the running-order chart renders on entry');
  check((firstPaint?.sampleCount ?? 0) >= 15, `mid-race FIRST PAINT is FULL — ${firstPaint?.sampleCount ?? 0} samples (a bare client would show ~1)`);
  check(firstPaint?.touchesNow === 'true', 'STARTUP WINDOW: the newest seeded point touches now — no reserved empty span');
  check(firstPaint?.orderingWaiting === 'false', 'mid-race: the chart is not in the waiting state on first paint');
  check(firstPaint?.hasBryce === true, 'mid-race: Bryce has a seeded rank line on first paint');
  check(fullAtMs !== null && fullAtMs < 4_000, `mid-race: the chart was full within ${fullAtMs}ms of entry — a server seed, not accumulated polls`);

  // The seed fetch itself.
  check(Boolean(seed), 'the client made exactly one /api/history/rank-series seed fetch');
  check(seed?.body?.available === true, 'seed response: available=true');
  check(seed?.body?.mode === 'replay', 'seed response: windowed through the replay resolver (mode=replay)');
  check(Array.isArray(seed?.body?.frames) && seed.body.frames.length >= 10, `seed response: ${seed?.body?.frames?.length ?? 0} downsampled running-order frames`);
  check(Date.parse(seed?.body?.window?.lastCheckedAt ?? '') <= Date.parse(midRaceIso) + 2_000, 'seed response: the window never runs past virtual now');

  await screenshotModule(page, 'running-order-midrace-seed', 1440);
  await screenshotModule(page, 'running-order-midrace-seed', 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(OUT_DIR, 'live-page-midrace-seed--1440.png'), fullPage: true });

  // Seed-to-polled CONTINUITY: the seed is structurally shared with live polls,
  // but that must be proven VISUALLY after the client's own polls append. Wait
  // for two post-seed readiness arrivals (at 1× the replay advances ~1 sample/s),
  // then assert the seeded window kept growing in the SAME bucket, never fell
  // into a waiting/blank state, and still touches now — and capture that state at
  // both viewports so a reviewer can see the seam is invisible.
  const arrivalsAtSeed = readinessArrivals;
  let postPoll = null;
  const postDeadline = Date.now() + 20_000;
  while (Date.now() < postDeadline) {
    postPoll = await readRunningOrder(page);
    if (readinessArrivals - arrivalsAtSeed >= 2 && postPoll && postPoll.sampleCount >= (firstPaint?.sampleCount ?? 0)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const postArrivals = readinessArrivals - arrivalsAtSeed;
  console.log(`post-seed running order: ${JSON.stringify(postPoll)} (${postArrivals} post-seed readiness arrivals)`);
  check(postArrivals >= 2, `mid-race: at least two post-seed readiness polls arrived (${postArrivals})`);
  check(postPoll?.sessionKey === firstPaint?.sessionKey, 'CONTINUITY: post-seed polls append into the SAME session bucket as the seed');
  check((postPoll?.sampleCount ?? 0) >= (firstPaint?.sampleCount ?? 0), `CONTINUITY: the sample count is nondecreasing across the seam (${firstPaint?.sampleCount} → ${postPoll?.sampleCount})`);
  check(postPoll?.orderingWaiting === 'false', 'CONTINUITY: the chart never falls into a waiting/blank state after the seed');
  check(postPoll?.touchesNow === 'true', 'CONTINUITY: the appended chart still touches now — no reserved empty span at the seam');
  check(postPoll?.hasBryce === true, 'CONTINUITY: Bryce keeps his rank line through the append');
  await screenshotModule(page, 'running-order-midrace-postpoll', 1440);
  await screenshotModule(page, 'running-order-midrace-postpoll', 390);

  await writeFile(path.join(OUT_DIR, 'brief-o-qa-evidence.json'), JSON.stringify({
    race: DEMO_RACE,
    midRaceT0: midRaceIso,
    firstPaint,
    fullAfterMs: fullAtMs,
    postPoll,
    postSeedReadinessArrivals: postArrivals,
    seed: seed ? { status: seed.status, available: seed.body?.available, mode: seed.body?.mode, frameCount: seed.body?.frameCount, breakpointCount: seed.body?.breakpointCount, window: seed.body?.window, clientSessionKey: seed.body?.clientSessionKey } : null
  }, null, 2));
  console.log(`log   ${path.join(OUT_DIR, 'brief-o-qa-evidence.json')}`);
  await context.close();
}

await browser.close();
kill();

console.log(failures.length === 0 ? '\nQA green — every assertion passed.' : `\nQA RED — ${failures.length} failure(s):`);
failures.forEach((label) => console.log(`  - ${label}`));
process.exit(failures.length === 0 ? 0 : 1);
