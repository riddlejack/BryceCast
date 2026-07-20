/** Small-series stories QA: capture the three Career-chapter modules —
 *  F1600 (depth), FR Oceania (depth), and the origin timeline (prologue card).
 *  Usage: node scripts/qa-small-series.mjs [--base=http://127.0.0.1:5299] [--out=$HOME/.brycecast/reports/small-series]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://127.0.0.1:5299');
const outDir = arg('out', path.join(process.env.HOME, '.brycecast/reports/small-series'));

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
    await page.goto(`${base}/career`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    // Expand both chapter depth layers up front.
    for (const label of [/The F1600 season, in depth/i, /The FR Oceania campaign, in depth/i]) {
      const btn = page.getByRole('button', { name: label }).first();
      if ((await btn.count()) > 0) {
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForTimeout(400);
      }
    }
    await page.waitForTimeout(400);

    // The origin timeline: the "Before the record" card.
    const origin = page
      .locator('.card')
      .filter({ has: page.locator('.card__title, h2, h3', { hasText: 'Before the record' }) })
      .first();
    await origin.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const originFile = path.join(outDir, `origin--${viewportName}.png`);
    await origin.screenshot({ path: originFile });
    console.log(originFile);

    // The F1600 chapter card (expanded), located by its h2 short name.
    const f1600Card = page
      .locator('.journey__chapter')
      .filter({ has: page.locator('h2', { hasText: 'F1600' }) })
      .first();
    await f1600Card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const f1600File = path.join(outDir, `f1600--${viewportName}.png`);
    await f1600Card.screenshot({ path: f1600File });
    console.log(f1600File);

    // The FR Oceania chapter card (expanded).
    const frocCard = page
      .locator('.journey__chapter')
      .filter({ has: page.locator('h2', { hasText: 'FR Oceania' }) })
      .first();
    await frocCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const frocFile = path.join(outDir, `froc--${viewportName}.png`);
    await frocCard.screenshot({ path: frocFile });
    console.log(frocFile);

    // Full career page for composition context.
    const fullFile = path.join(outDir, `career-full--${viewportName}.png`);
    await page.screenshot({ path: fullFile, fullPage: true });
    console.log(fullFile);

    await context.close();
  }
} finally {
  await browser.close();
}
