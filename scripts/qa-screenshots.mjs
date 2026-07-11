/** Capture BryceCast V3 screens for visual QA.
 *  Usage: node scripts/qa-screenshots.mjs [--base=http://localhost:5173] [--out=analysis/ui-v3-qa]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://localhost:5173');
const outDir = arg('out', 'analysis/ui-v3-qa');

const routes = [
  ['home', '/'],
  ['live-ready', '/live?fixture=ready'],
  ['live-pre', '/live?fixture=pre_session'],
  ['live-wrong-series', '/live?fixture=wrong_series'],
  ['live-degraded', '/live?fixture=degraded'],
  ['live-blocked', '/live?fixture=blocked'],
  ['race-week', '/race-week'],
  ['races', '/races'],
  ['career', '/career'],
  ['data', '/data']
];

const viewports = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }]
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [viewportName, viewport] of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'dark' });
    const page = await context.newPage();
    for (const [routeName, route] of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const file = path.join(outDir, `${routeName}--${viewportName}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
