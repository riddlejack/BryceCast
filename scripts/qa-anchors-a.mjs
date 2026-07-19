/** Phase-3 Group-A section-anchor QA capture (Road America + Barber).
 *  Debug overlays (the director's gate) + one race page per venue at desktop
 *  and phone, reducedMotion + headless. Writes to ~/.brycecast/reports/anchors-a/.
 *
 *  Prereqs: `python3 -m http.server 5399` in the reports dir (debug overlays)
 *  and `npm run dev -- --port 5283` (the app).
 *  Usage: node scripts/qa-anchors-a.mjs
 */
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = path.join(os.homedir(), '.brycecast/reports/anchors-a');
const DEBUG = 'http://localhost:5399';
const APP = 'http://localhost:5283';
const races = [
  ['road-america', 'session_indy_nxt_2024_6316'],
  ['barber-motorsports-park', 'session_indy_nxt_2024_6314']
];
const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }]
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // 1) debug overlays (light, full page)
  {
    const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: 'light' });
    const page = await context.newPage();
    for (const [slug] of races) {
      await page.goto(`${DEBUG}/${slug}-anchor-lab.html`, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const file = path.join(outDir, `${slug}--debug-overlay.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
  // 2) race pages — heat card element + full page, both viewports
  for (const [vpName, viewport] of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: 'light' });
    const page = await context.newPage();
    for (const [slug, sessionId] of races) {
      await page.goto(`${APP}/races/${sessionId}`, { waitUntil: 'load' });
      await page.waitForTimeout(1400);
      const card = page.locator('section', { hasText: 'The track, section by section' }).first();
      try {
        await card.scrollIntoViewIfNeeded({ timeout: 4000 });
        await page.waitForTimeout(500);
        await card.screenshot({ path: path.join(outDir, `${slug}--heatcard--${vpName}.png`) });
        console.log(path.join(outDir, `${slug}--heatcard--${vpName}.png`));
      } catch (e) {
        console.log(`  (heatcard element shot skipped for ${slug} ${vpName}: ${e.message})`);
      }
      await page.screenshot({ path: path.join(outDir, `${slug}--racepage--${vpName}.png`), fullPage: true });
      console.log(path.join(outDir, `${slug}--racepage--${vpName}.png`));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
