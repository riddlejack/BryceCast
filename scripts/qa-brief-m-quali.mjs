/** Brief M QA: capture the "His qualifying, run by run" surface (Race Detail).
 *  Usage: node scripts/qa-brief-m-quali.mjs [--base=http://localhost:5188] [--out=$HOME/.brycecast/reports/quali-lab]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://localhost:5188');
const outDir = arg('out', path.join(process.env.HOME, '.brycecast/reports/quali-lab'));

const routes = [
  ['stpete-2024-road', '/races/session_indy_nxt_2024_6324'],
  ['stpete-2026-road-timing71', '/races/session_indy_nxt_2026_6751'],
  ['iowa-2024-oval', '/races/session_indy_nxt_2024_6319'],
  ['nashville-2026-oval', '/races/session_indy_nxt_2026_6755']
];

const viewports = [
  ['1440', { width: 1440, height: 1000 }],
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
      await page.waitForTimeout(1200);
      // focused module capture (the deliverable's subject)
      const card = page.locator('section.card', { hasText: 'His qualifying, run by run' }).first();
      if (await card.count()) {
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const moduleFile = path.join(outDir, `${routeName}--module--${viewportName}.png`);
        await card.screenshot({ path: moduleFile });
        console.log(moduleFile);
      } else {
        console.log(`(no qualifying module on ${route})`);
      }
      // full-page context capture
      const fullFile = path.join(outDir, `${routeName}--full--${viewportName}.png`);
      await page.screenshot({ path: fullFile, fullPage: true });
      console.log(fullFile);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
