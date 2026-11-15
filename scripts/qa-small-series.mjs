/** Small-series stories QA: capture the three Career-chapter modules:
 *  F1600 (depth), FR Oceania (depth), and the origin timeline (prologue card).
 *  The career page shows its chapters as a timeline of tabs (`.chapter-rail`),
 *  one chapter open at a time in `#chapter-panel`, with that chapter's depth
 *  layer rendered once under its summary. This opens each chapter by its tab.
 *  Usage: node scripts/qa-small-series.mjs [--base=http://127.0.0.1:5299]
 *    [--out=$HOME/.brycecast/reports/small-series] [--chrome=/path/to/chrome]
 *  Without --chrome it uses the installed Chrome channel.
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

/* The career page is ~10k CSS px (1440) to ~14k (390). At deviceScaleFactor 2
 * that is ~20k–27k device px, past Chromium's ~16384 tall-surface texture limit,
 * so a single fullPage screenshot silently repeats the top of the page. Capture
 * it as contiguous vertical tiles whose device height stays under the limit
 * (6000 CSS px × 2 = 12000 device px) so every pixel is a real, once-only
 * render. */
const TILE_CSS_HEIGHT = 6000;

const captureFullPageTiled = async (page, viewport, outDir, viewportName) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const tileCount = Math.max(1, Math.ceil(fullHeight / TILE_CSS_HEIGHT));
  // Clear any stale single-shot or prior-run tiles for this width.
  for (let index = 0; index <= 12; index += 1) {
    await rm(path.join(outDir, index === 0 ? `career-full--${viewportName}.png` : `career-full--${viewportName}-tile${index}.png`), { force: true });
  }
  const written = [];
  for (let index = 0; index < tileCount; index += 1) {
    const top = index * TILE_CSS_HEIGHT;
    const tileHeight = Math.min(TILE_CSS_HEIGHT, fullHeight - top);
    await page.setViewportSize({ width: viewport.width, height: tileHeight });
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(200);
    const file = path.join(outDir, tileCount === 1 ? `career-full--${viewportName}.png` : `career-full--${viewportName}-tile${index + 1}.png`);
    await page.screenshot({ path: file }); // viewport-only: exactly [top, top+tileHeight]
    written.push(file);
  }
  return written;
};

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://127.0.0.1:5299');
const chromePath = arg('chrome', null);
const outDir = arg('out', path.join(process.env.HOME, '.brycecast/reports/small-series'));

const viewports = [
  ['1440', { width: 1440, height: 900 }],
  ['390', { width: 390, height: 844 }]
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(chromePath ? { executablePath: chromePath, headless: true } : { channel: 'chrome', headless: true });

/** Open one chapter by its tab and return the open panel, after checking that
 *  the panel shows that chapter and its depth layer. */
const openChapter = async (page, key, name, depthTitle) => {
  const tab = page.locator(`#chapter-tab-${key}`);
  if ((await tab.count()) === 0) throw new Error(`No chapter tab for ${key}`);
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
  await page.waitForTimeout(400);
  if ((await tab.getAttribute('aria-selected')) !== 'true') throw new Error(`Chapter tab ${key} did not open`);
  const panel = page.locator('#chapter-panel');
  const heading = (await panel.locator('.chapter-panel__name').first().textContent())?.trim() ?? '';
  if (!heading.includes(name)) throw new Error(`Open panel shows "${heading}", expected ${name}`);
  const depth = panel.locator('.chapter-panel__depth-title');
  if ((await depth.count()) !== 1) throw new Error(`${name}: expected one depth layer, found ${await depth.count()}`);
  const depthText = (await depth.textContent())?.trim() ?? '';
  if (depthText !== depthTitle) throw new Error(`${name}: depth title "${depthText}", expected "${depthTitle}"`);
  return panel;
};
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

    // The F1600 chapter, opened from the timeline, with its depth layer.
    const f1600Card = await openChapter(page, 'f1600', 'F1600', 'The F1600 season, in depth');
    await f1600Card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const f1600File = path.join(outDir, `f1600--${viewportName}.png`);
    await f1600Card.screenshot({ path: f1600File });
    console.log(f1600File);

    // The FR Oceania chapter, opened from the timeline, with its depth layer.
    const frocCard = await openChapter(page, 'fr-oceania', 'FR Oceania', 'The FR Oceania campaign, in depth');
    await frocCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const frocFile = path.join(outDir, `froc--${viewportName}.png`);
    await frocCard.screenshot({ path: frocFile });
    console.log(frocFile);

    // Full career page for composition context, tiled to stay under Chromium's
    // tall-surface limit (a single fullPage shot repeats the page otherwise).
    const fullTiles = await captureFullPageTiled(page, viewport, outDir, viewportName);
    for (const file of fullTiles) console.log(file);

    await context.close();
  }
} finally {
  await browser.close();
}
