/** Brief K QA: capture the Restart Report Card surfaces.
 *  Usage: node scripts/qa-brief-k-restarts.mjs [--base=http://localhost:5275] [--out=$HOME/.brycecast/reports/brief-k]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://localhost:5275');
const outDir = arg('out', path.join(process.env.HOME, '.brycecast/reports/brief-k'));

const routes = [
  ['race-multi-restart', '/races/session_indy_nxt_2024_6315'],
  ['race-no-caution-empty', '/races/session_indy_nxt_2025_6453'],
  ['career-through-line', '/career'],
  ['race-week-prior', '/race-week']
];

const viewports = [
  ['1440', { width: 1440, height: 900 }],
  ['390', { width: 390, height: 844 }]
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [viewportName, viewport] of viewports) {
    // Light color scheme (the designed default) + reduced motion so scroll-linked
    // reveals never photograph at opacity 0 on a full-page capture.
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    for (const [routeName, route] of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(1400);
      const file = path.join(outDir, `${routeName}--${viewportName}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
