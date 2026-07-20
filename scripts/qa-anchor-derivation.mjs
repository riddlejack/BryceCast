/** Anchor-derivation QA capture: screenshot the Mid-Ohio + Milwaukee pinned
 *  section-anchor overlays (emitted by scripts/derive-section-anchors.mjs) at
 *  1440 so the feed-pinned boundaries can be verified against the outline —
 *  the gold S/F tick on the S/F straight, each numbered span over its named
 *  turn(s) with the red corner-apex dots inside, boundaries on straights.
 *  Playwright channel chrome, headless (FABLE_LESSONS QA pattern).
 *
 *  Run `node scripts/derive-section-anchors.mjs` first, then this.
 *  Usage: node scripts/qa-anchor-derivation.mjs
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(os.homedir(), '.brycecast/reports/anchor-derivation');
const targets = [
  { slug: 'mid-ohio-sports-car-course', file: 'mid-ohio-sports-car-course-section-debug.html' },
  { slug: 'the-milwaukee-mile', file: 'the-milwaukee-mile-section-debug.html' }
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const notes = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const t of targets) {
    await page.goto(`file://${join(outDir, t.file)}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(outDir, `${t.slug}-1440.png`), fullPage: true });
    const spanCount = await page.locator('svg path[stroke-dasharray]').count();
    const svgBox = await page.locator('svg').first().screenshot({ path: join(outDir, `${t.slug}-svg-1440.png`) }).then(() => true).catch(() => false);
    notes.push(`${t.slug}: ${spanCount} span strokes, svg capture ${svgBox ? 'ok' : 'FAILED'}`);
  }
  await ctx.close();
  console.log(JSON.stringify({ ok: true, viewport: 1440, notes, outDir }, null, 2));
} finally {
  await browser.close();
}
