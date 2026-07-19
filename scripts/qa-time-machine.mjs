/** Brief L "The Time Machine" visual QA — the real product flow (race-page
 *  module -> replay-mode Live page -> chip/speed/restart/exit + post-checkered
 *  honesty note). Requires the replay API and the app dev server:
 *    BRYCECAST_REPLAY=1 BRYCECAST_SQLITE_PATH=<archive> node scripts/api-server.mjs --port=8899
 *    BRYCECAST_API_PROXY=http://127.0.0.1:8899 npx vite --port 5277
 *  Override for a different capture, e.g. Nashville:
 *    node scripts/qa-time-machine.mjs --session=5538-6755 --race=session_indy_nxt_2026_6755 \
 *      --mid=<isoGreenMoment> --post=<isoColdEnd>
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://127.0.0.1:5277');
const api = arg('api', 'http://127.0.0.1:8899');
const out = arg('out', `${process.env.HOME}/.brycecast/reports/time-machine`);
const session = arg('session', '5537-6754');
const raceId = arg('race', 'session_indy_nxt_2026_6754');
const midT0 = arg('mid', '2026-06-21T16:30:00.000Z');
const postT0 = arg('post', '2026-06-21T17:06:18.000Z');

await mkdir(out, { recursive: true });

const control = async (params) => {
  const url = new URL('/api/replay/control', api);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`control ${r.status}: ${await r.text()}`);
  return r.json();
};
const stop = () => fetch(new URL('/api/replay/control?stop=1', api));

const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }]
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(out, name), fullPage: true, ...opts });
try {
  for (const [vp, viewport] of viewports) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [pageerror ${vp}]`, e.message));

    // 1. Race-page module (silent-unless-real).
    await stop();
    await page.goto(`${base}/races/${raceId}`, { waitUntil: 'load' });
    await page.waitForSelector('.race-replay', { timeout: 20000 });
    await page.waitForTimeout(1200);
    await shot(page, `01-race-module-full--${vp}.png`);
    await page.locator('.race-replay').screenshot({ path: path.join(out, `02-race-module--${vp}.png`) });
    console.log(`[${vp}] race module captured`);

    // 2. Click the play affordance -> Live page in replay mode (real flow).
    await page.locator('.race-replay__cta').click();
    await page.waitForSelector('.replay-bar', { timeout: 20000 });
    await page.waitForSelector('[data-replay-active="true"] .live-hero', { timeout: 25000 });
    await page.waitForTimeout(2800);
    await shot(page, `03-replay-green--${vp}.png`);
    await page.locator('.replay-bar').screenshot({ path: path.join(out, `04-replay-bar--${vp}.png`) });
    console.log(`[${vp}] replay green + bar captured`);

    // 3. Mid-race. Steer at 16x (archive gaps stay fresh at speed, so the state
    //    holds at ready/1s-cadence) into a dense green stretch, capture quickly.
    await control({ session, t0: midT0, speed: '16' });
    await page.waitForTimeout(2400);
    await shot(page, `05-replay-mid-race--${vp}.png`);
    console.log(`[${vp}] mid-race captured`);

    // 4. Post-checkered COLD + the as-raced vs classification honesty note.
    await control({ session, t0: postT0, speed: '16' });
    const note = page.locator('.replay-classification');
    // The note only exists when the as-raced leader differs from the canonical
    // classification (e.g. Road America 2026 R2's post-race DQ). Absence is fine.
    await note.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, `06-replay-post-checkered--${vp}.png`);
    if (await note.count()) {
      await note.screenshot({ path: path.join(out, `07-replay-classification-note--${vp}.png`) });
      console.log(`[${vp}] classification note PRESENT: "${(await note.innerText()).trim()}"`);
    } else {
      console.log(`[${vp}] classification note absent (on-road order matched the classification)`);
    }

    // 5. Speed control: fresh green load, click 16x, capture the bar.
    await page.goto(`${base}/live?replay=${session}&from=${raceId}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-replay-active="true"] .live-hero', { timeout: 25000 });
    await page.waitForTimeout(1500);
    await page.locator('.replay-bar__speeds .segmented__option').filter({ hasText: '16' }).click();
    await page.waitForTimeout(1500);
    await page.locator('.replay-bar').screenshot({ path: path.join(out, `08-replay-bar-16x--${vp}.png`) });
    console.log(`[${vp}] 16x speed control captured`);

    // 6. Existing fixture states still render with the replay changes in place.
    await stop();
    for (const fixture of ['ready', 'wrong_series']) {
      await page.goto(`${base}/live?fixture=${fixture}`, { waitUntil: 'load' });
      await page.waitForSelector('.live-trust', { timeout: 15000 });
      await page.waitForTimeout(700);
      await shot(page, `09-fixture-${fixture}--${vp}.png`);
    }
    console.log(`[${vp}] fixtures captured`);

    await ctx.close();
  }
} finally {
  await stop();
  await browser.close();
}
console.log('QA complete ->', out);
