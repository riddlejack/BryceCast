/** Brief P QA — the battle axis breathes.
 *
 * Drives the EXACT user path: the race page's own replay button
 * (`.race-replay__cta` → `/live?replay=<key>&from=<id>`), whose client then
 * polls every live route with the literal `?replay=&rt=&speed=` shape. No
 * hand-rolled request params anywhere (the lesson-13 rule).
 *
 * Self-contained: spawns its own replay API (port 8791, lake feeds only —
 * never the LaunchAgent's :8787) and its own Vite dev server (port 5284),
 * then runs two Playwright passes:
 *   1. motion pass (no reduced motion) over Music City 2024 at the replay
 *      bar's own 16× button — asserts the ladder walked DOWN under the late
 *      caution and back UP after the restart, with zero consecutive-poll
 *      oscillation, reading the component's own state (data-axis-*), never
 *      pixel-diffing animation.
 *   2. stills pass (reducedMotion: reduce) — tight/bunched/spread frames at
 *      1440 and 390, saved under ~/.brycecast/reports/brief-p/.
 *
 * Run: npm run qa:live-battle-axis
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const API_PORT = 8791;
const APP_PORT = 5284;
const API = `http://127.0.0.1:${API_PORT}`;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const DEMO_RACE = 'session_indy_nxt_2024_6323'; // Music City GP 2024 · late caution L55–58, restart L59
const TIGHT_RACE = 'session_indy_nxt_2025_6447'; // Music City 2025 · pack within ~1.5s at the start (±2s frame)
/** Ride 16× through the long green run, then take the replay bar's 4× button
 * just before the late caution — the compressed window (~68 virtual seconds
 * between bunching and restart spread) needs live-cadence polls for the
 * ladder's median + persistence guards, exactly as it gets on a real race day. */
const SLOWDOWN_AT_MS = Date.parse('2024-09-15T11:24:00.000Z');
const REVERSAL_PERSISTENCE = 12; // mirrors BATTLE_AXIS_REVERSAL_PERSISTENCE
const OUT_DIR = path.join(os.homedir(), '.brycecast', 'reports', 'brief-p');

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
    try {
      // Any HTTP answer means the server is up. A cold readiness cache 503s
      // honestly while replay clients (params in hand) are served fine.
      await fetch(url);
      return;
    } catch { /* not up yet */ }
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

const readAxis = (page) => page.evaluate(() => {
  const svg = document.querySelector('[data-battle-corridor]');
  if (!svg) return null;
  const attr = (name) => svg.getAttribute(name);
  const protagonist = svg.querySelector('[data-protagonist="bryce"]');
  return {
    step: Number(attr('data-axis-step')),
    ladder: attr('data-axis-ladder'),
    extent: attr('data-axis-extent'),
    occupancy: attr('data-axis-occupancy'),
    evalCount: Number(attr('data-axis-eval-count')),
    breachCount: Number(attr('data-axis-breach-count')),
    transitionCount: Number(attr('data-axis-transition-count')),
    transitions: JSON.parse(attr('data-axis-transitions') || '[]'),
    motion: attr('data-axis-motion'),
    pollCheckedAt: attr('data-axis-poll-checked-at'),
    ticks: [...svg.querySelectorAll('[data-axis-tick]')].map((tick) => Number(tick.getAttribute('data-axis-tick'))),
    frameNote: svg.querySelector('[data-axis-frame-note]')?.textContent ?? '',
    protagonistOpacity: protagonist ? getComputedStyle(protagonist).opacity : null,
    modeText: document.querySelector('.live-battle__mode')?.textContent?.trim() ?? ''
  };
});

const openReplayViaButton = async (page, raceId) => {
  await page.goto(`${BASE}/races/${raceId}`, { waitUntil: 'load' });
  const cta = page.locator('.race-replay__cta').first();
  await cta.waitFor({ state: 'visible', timeout: 30_000 });
  await cta.click();
  await page.waitForURL(/\/live\?replay=/, { timeout: 15_000 });
  await page.waitForSelector('.replay-bar', { timeout: 30_000 });
  await page.waitForSelector('[data-battle-corridor]', { timeout: 60_000 });
};

const setSpeed = async (page, speed) => {
  await page.locator('.replay-bar__speeds button', { hasText: `${speed}×` }).click();
};

const screenshotPair = async (page, name) => {
  const module = page.locator('.live-battle');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(350);
  await module.screenshot({ path: path.join(OUT_DIR, `${name}--1440.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);
  await module.screenshot({ path: path.join(OUT_DIR, `${name}--390.png`) });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(350);
  console.log(`shot  ${name} at 1440 and 390`);
};

await mkdir(OUT_DIR, { recursive: true });

spawnServer('api', process.execPath, ['scripts/api-server.mjs', `--port=${API_PORT}`, '--host=127.0.0.1'], { BRYCECAST_REPLAY: '1' });
await waitFor(`${API}/api/readiness`, 'replay API');
spawnServer('vite', 'npx', ['vite', '--port', String(APP_PORT), '--strictPort', '--host', '127.0.0.1'], { BRYCECAST_API_PROXY: API });
await waitFor(BASE, 'vite dev server');

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/* ---------- pass 1: motion (component-state assertions) ---------- */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await context.newPage();
  await openReplayViaButton(page, DEMO_RACE);
  await setSpeed(page, 16);

  const samples = [];
  const cautionWindows = [];
  let pinnedCount = 0;
  let lastChecked = null;
  let slowedDown = false;
  let settleSamples = 0;
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const axis = await readAxis(page);
    if (axis) {
      samples.push(axis);
      if (!slowedDown && axis.pollCheckedAt && Date.parse(axis.pollCheckedAt) >= SLOWDOWN_AT_MS) {
        await setSpeed(page, 4);
        slowedDown = true;
      }
      const caution = /caution|red flag/i.test(axis.modeText);
      if (caution && axis.pollCheckedAt) {
        const latest = cautionWindows.at(-1);
        if (latest && !latest.closed) latest.end = axis.pollCheckedAt;
        else cautionWindows.push({ start: axis.pollCheckedAt, end: axis.pollCheckedAt, closed: false });
      } else if (cautionWindows.at(-1) && !cautionWindows.at(-1).closed && axis.pollCheckedAt) {
        cautionWindows.at(-1).closed = true;
      }
      // Once a down-step and a later up-step are both on the log, let the
      // attributes settle for a few more seconds and stop.
      const down = axis.transitions.find((entry) => entry.to < entry.from);
      const upAfter = down && axis.transitions.some((entry) => entry.to > entry.from && Date.parse(entry.at) > Date.parse(down.at));
      if (upAfter && ++settleSamples > 30) break;
      if (axis.pollCheckedAt === lastChecked) pinnedCount += 1;
      else { pinnedCount = 0; lastChecked = axis.pollCheckedAt; }
      if (pinnedCount > 120) break; // virtual clock pinned at the checkered frame
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const final = samples.at(-1);
  const transitions = final?.transitions ?? [];
  console.log(`\nobserved caution windows (virtual clock): ${JSON.stringify(cautionWindows)}`);
  console.log('\nladder transition log (component state, Music City 2024, 16× green run · 4× through the caution):');
  transitions.forEach((entry) => console.log(
    `  ${entry.at}  eval ${String(entry.evalIndex).padStart(3)}  ±${entry.from}s → ±${entry.to}s  occupancy ${entry.occupancy?.toFixed(3)}  breach ${entry.breach}`
  ));
  console.log(`evals ${final?.evalCount} · breach polls ${final?.breachCount} · transitions ${final?.transitionCount}\n`);

  check(transitions.length >= 2, `at least two ladder transitions observed (got ${transitions.length})`);
  check(transitions.every((entry) => entry.breach === 'low' || entry.breach === 'high'), 'every ladder change carries its hysteresis breach — no change without a breach');
  check((final?.transitionCount ?? 0) <= (final?.breachCount ?? 0), `no more than one ladder change per hysteresis breach (${final?.transitionCount} changes ≤ ${final?.breachCount} breach polls)`);
  const reversalsTooClose = transitions.filter((entry, index) => {
    if (index === 0) return false;
    const previous = transitions[index - 1];
    return previous.from === entry.to && previous.to === entry.from && entry.evalIndex - previous.evalIndex < REVERSAL_PERSISTENCE;
  });
  check(reversalsTooClose.length === 0, `no oscillation: every reversal is at least ${REVERSAL_PERSISTENCE} evaluations after the move it undoes`);
  const downs = transitions.filter((entry) => entry.to < entry.from);
  const ups = transitions.filter((entry) => entry.to > entry.from);
  check(downs.length >= 1, 'the axis stepped DOWN the ladder as the pack compressed');
  check(ups.length >= 1, 'the axis stepped back UP as the field spread');
  const cautionDown = downs.find((entry) => cautionWindows.some((window) =>
    Date.parse(entry.at) >= Date.parse(window.start) - 5_000 && Date.parse(entry.at) <= Date.parse(window.end) + 30_000));
  check(Boolean(cautionDown), 'a down-step landed inside the observed caution window');
  check(Boolean(cautionDown && ups.some((entry) => Date.parse(entry.at) > Date.parse(cautionDown.at))), 'an up-step followed the caution down-step (the restart spread)');
  check(samples.some((sample) => sample.motion === 'rescale'), "the 250ms eased rescale state was observed in component state (data-axis-motion='rescale')");
  check(samples.every((sample) => sample.protagonistOpacity === '1'), 'the №9 protagonist marker never faded (opacity 1 in every sample)');
  const expectedTicks = [-final.step, -final.step / 2, 0, final.step / 2, final.step];
  check(JSON.stringify([...final.ticks].sort((a, b) => a - b)) === JSON.stringify(expectedTicks.sort((a, b) => a - b)), `axis ticks match the current step (±${final.step}s: ${final.ticks.join(', ')})`);
  check(final.frameNote.includes(`±${final.step}s`), `the on-screen currency line declares the live frame (“${final.frameNote}”)`);
  check(final.ladder === '1,2,4,8', 'the quantized ladder is the spec ladder');

  await writeFile(path.join(OUT_DIR, 'transition-log.json'), JSON.stringify({
    race: DEMO_RACE,
    speed: 16,
    finalState: final,
    transitions,
    cautionWindows,
    sampleCount: samples.length,
    motionStatesSeen: [...new Set(samples.map((sample) => sample.motion))]
  }, null, 2));
  console.log(`log   ${path.join(OUT_DIR, 'transition-log.json')}`);
  await context.close();
}

/* ---------- pass 2: stills (reduced motion) ---------- */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();

  // Tight pack: Music City 2025 opens with the field within ~1.5s — the frame
  // snaps to its fit on arrival (reduced motion renders the step instantly).
  await openReplayViaButton(page, TIGHT_RACE);
  await setSpeed(page, 1);
  await page.waitForTimeout(2_500);
  let axis = await readAxis(page);
  check(axis?.motion === 'off', "reduced motion renders the ladder step instantly (data-axis-motion='off')");
  console.log(`tight frame: ±${axis?.step}s (extent ${axis?.extent}s)`);
  check((axis?.step ?? 99) <= 2, `the start pack pulls the frame tight (±${axis?.step}s)`);
  await screenshotPair(page, 'battle-axis-tight');
  await page.screenshot({ path: path.join(OUT_DIR, 'battle-axis-live-full--1440.png'), fullPage: true });

  // Spread + caution-bunched: Music City 2024, 16× through the green run,
  // the 4× button just before the late caution (same schedule as pass 1).
  await openReplayViaButton(page, DEMO_RACE);
  await setSpeed(page, 16);
  let spreadShot = false;
  let bunchedShot = false;
  let slowedDown = false;
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline && !(spreadShot && bunchedShot)) {
    axis = await readAxis(page);
    if (axis) {
      if (!slowedDown && axis.pollCheckedAt && Date.parse(axis.pollCheckedAt) >= SLOWDOWN_AT_MS) {
        await setSpeed(page, 4);
        slowedDown = true;
      }
      const caution = /caution/i.test(axis.modeText);
      if (!spreadShot && !caution && axis.step === 8 && axis.evalCount > 10) {
        await screenshotPair(page, 'battle-axis-spread');
        spreadShot = true;
      }
      if (!bunchedShot && caution && axis.transitions.some((entry) => entry.to < entry.from)) {
        await screenshotPair(page, 'battle-axis-caution-bunched');
        bunchedShot = true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check(spreadShot, 'spread frame captured at 1440 and 390');
  check(bunchedShot, 'caution-bunched frame captured at 1440 and 390 after a down-step');
  await context.close();
}

await browser.close();
kill();

console.log(failures.length === 0 ? '\nQA green — every assertion passed.' : `\nQA RED — ${failures.length} failure(s):`);
failures.forEach((label) => console.log(`  - ${label}`));
process.exit(failures.length === 0 ? 0 : 1);
