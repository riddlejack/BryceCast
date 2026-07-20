/** Season-arcs QA: capture "The campaigns" surface on the Career page.
 *  Usage: node scripts/qa-season-arcs.mjs [--base=http://127.0.0.1:5295] [--out=$HOME/.brycecast/reports/season-arcs]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://127.0.0.1:5295');
const outDir = arg('out', path.join(process.env.HOME, '.brycecast/reports/season-arcs'));

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

    // Full page.
    const fullFile = path.join(outDir, `career-full--${viewportName}.png`);
    await page.screenshot({ path: fullFile, fullPage: true });
    console.log(fullFile);

    // The campaigns card close-up: the Card whose header text is "The campaigns".
    const card = page
      .locator('.card')
      .filter({ has: page.locator('.card__title, h2, h3', { hasText: 'The campaigns' }) })
      .first();
    let handle = card;
    if ((await card.count()) === 0) {
      // Fall back to any element containing the title, then its nearest card.
      handle = page.getByText('The campaigns', { exact: true }).first();
    }
    await handle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const cardFile = path.join(outDir, `campaigns-card--${viewportName}.png`);
    await handle.screenshot({ path: cardFile });
    console.log(cardFile);

    // Hover the F1600 arc to prove the tooltip + focus fade (desktop only).
    if (viewportName === '1440') {
      const arc = page.locator('.campaign-panel svg[aria-label*="F1600"]').first();
      if ((await arc.count()) > 0) {
        const box = await arc.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
          await page.waitForTimeout(350);
          const hoverFile = path.join(outDir, `campaigns-hover--${viewportName}.png`);
          await handle.screenshot({ path: hoverFile });
          console.log(hoverFile);
        }
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
}
