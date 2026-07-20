/** Brief J stage 1 QA: capture the Caution Atlas surfaces.
 *  Usage: node scripts/qa-brief-j-cautions.mjs [--base=http://localhost:5294] [--out=$HOME/.brycecast/reports/caution-atlas]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://localhost:5294');
const outDir = arg('out', path.join(process.env.HOME, '.brycecast/reports/caution-atlas'));

const routes = [
  // Race Week shows the "Cautions here" module for the upcoming venue (Portland).
  ['race-week-cautions', '/race-week'],
  // Nashville 2026: two full-course cautions → the "Full-course cautions" tile in The day.
  ['race-nashville-2026', '/races/session_indy_nxt_2026_6755'],
  // Streets of Detroit 2026: four cautions, a busier day for the tile.
  ['race-detroit-2026', '/races/session_indy_nxt_2026_6749']
];

const viewports = [
  ['1440', { width: 1440, height: 900 }],
  ['390', { width: 390, height: 844 }]
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [viewportName, viewport] of viewports) {
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
