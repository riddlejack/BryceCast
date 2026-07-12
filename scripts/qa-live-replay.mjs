/** Brief F visual QA. Requires replay API plus Vite:
 *   npm run live:replay
 *   BRYCECAST_API_PROXY=http://127.0.0.1:8788 npm run dev
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://127.0.0.1:5173');
const api = arg('api', 'http://127.0.0.1:8788');
const outDir = arg('out', 'artifacts/live-replay-qa');
const quick = arg('quick', '0') === '1';
const session = '5537-6754';

const replayStates = [
  ['green-flag', '2026-06-21T16:15:02.760Z'],
  ['mid-race', '2026-06-21T16:15:02.760Z'],
  ['caution', '2026-06-21T16:20:30.000Z'],
  ['post-checkered-cold', '2026-06-21T17:00:28.958Z']
].filter(([state]) => !quick || state !== 'mid-race');
const fixtures = quick ? [] : ['wrong_series', 'pre_session', 'ready', 'degraded', 'stale', 'blocked'];
const viewports = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }]
];

await mkdir(outDir, { recursive: true });

const control = async (t0) => {
  const url = new URL('/api/replay/control', api);
  url.searchParams.set('session', session);
  url.searchParams.set('t0', t0);
  url.searchParams.set('speed', '1');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Replay control failed ${response.status}: ${await response.text()}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [viewportName, viewport] of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const [stateName, t0] of replayStates) {
      await control(t0);
      await page.goto(`${base}/live`, { waitUntil: 'load' });
      await page.waitForSelector('.live-trust');
      await page.waitForTimeout(2_500);
      const file = path.join(outDir, `replay-${stateName}--${viewportName}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      if (stateName === 'mid-race' || (quick && stateName === 'green-flag')) {
        for (const [moduleName, selector] of [['hero', '.live-hero'], ['battle', '.live-battle'], ['points', '.live-points']]) {
          const moduleFile = path.join(outDir, `replay-${stateName}-${moduleName}--${viewportName}.png`);
          await page.locator(selector).screenshot({ path: moduleFile });
          console.log(moduleFile);
        }
        if (viewportName === 'desktop') {
          await page.locator('.live-field__row').filter({ hasText: 'Koolen' }).focus();
          await page.waitForTimeout(180);
          const hoverFile = path.join(outDir, 'replay-mid-race-field-hover--desktop.png');
          await page.screenshot({ path: hoverFile, fullPage: true });
          console.log(hoverFile);
        }
      }
    }
    for (const fixture of fixtures) {
      await page.goto(`${base}/live?fixture=${fixture}`, { waitUntil: 'load' });
      await page.waitForSelector('.live-trust');
      await page.waitForTimeout(900);
      const file = path.join(outDir, `fixture-${fixture}--${viewportName}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
