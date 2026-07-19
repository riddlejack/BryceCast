/** Brief H (Section Intelligence, first slice) QA capture.
 *  Screenshots: the four-oval anchor debug overlay, the Nashville heat map on
 *  the race page at 1440 and 390 (full page + heat-card close-up), the hover
 *  state with the ChartTipCard, and a road-course page (no curated anchors) as
 *  the honest no-section fallback. Playwright channel chrome, headless,
 *  reducedMotion 'reduce' for full-page captures (FABLE_LESSONS QA gotcha).
 *
 *  Usage: node scripts/qa-brief-h.mjs   (dev server must be on :5274)
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const base = process.env.BRYCECAST_URL ?? 'http://localhost:5274';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(os.homedir(), '.brycecast/reports/brief-h');
const debugFile = `file://${join(outDir, 'section-anchor-debug.html')}`;
const NASHVILLE = 'session_indy_nxt_2024_6323';
const ROAD = 'session_indy_nxt_2024_6321'; // 2024 Grand Prix of Portland (road, no oval anchors)

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const notes = [];

const settle = (page, ms = 400) => page.waitForTimeout(ms);

try {
  /* ---- 1. anchor debug overlay (all four ovals) ---- */
  const debug = await browser.newContext({ viewport: { width: 900, height: 1400 }, reducedMotion: 'reduce' });
  const dp = await debug.newPage();
  await dp.goto(debugFile, { waitUntil: 'load' });
  await settle(dp);
  await dp.screenshot({ path: join(outDir, 'section-anchor-debug.png'), fullPage: true });
  const ovals = await dp.locator('.oval').all();
  const ovalNames = ['nashville', 'wwt', 'iowa', 'milwaukee'];
  for (let i = 0; i < ovals.length; i += 1) {
    await ovals[i].screenshot({ path: join(outDir, `debug-${ovalNames[i] ?? i}.png`) });
  }
  await debug.close();

  /* ---- 2. Nashville race page, desktop ---- */
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  const issues = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) issues.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`${base}/races/${NASHVILLE}`, { waitUntil: 'load' });
  await page.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(page, 700);
  await page.screenshot({ path: join(outDir, 'nashville-race-1440.png'), fullPage: true });
  const card = page.locator('.card', { hasText: 'The track, section by section' });
  await card.scrollIntoViewIfNeeded();
  await settle(page, 300);
  await card.screenshot({ path: join(outDir, 'nashville-heatcard-1440.png') });

  /* ---- 3. hover state → ChartTipCard ---- */
  const svg = card.locator('svg[aria-label*="track outline"]').first();
  await svg.scrollIntoViewIfNeeded();
  await settle(page, 200);
  const boxRaw = await svg.boundingBox();
  let hovered = false;
  if (boxRaw) {
    // Sweep a grid over the top half (the back straight / compound span runs
    // along the top edge) until the ChartTipCard appears.
    outer: for (let fy = 0.04; fy <= 0.5 && !hovered; fy += 0.03) {
      for (let fx = 0.2; fx <= 0.85; fx += 0.05) {
        await page.mouse.move(boxRaw.x + boxRaw.width * fx, boxRaw.y + boxRaw.height * fy);
        await settle(page, 60);
        if ((await card.locator('text=/% of the field/').count()) > 0) {
          hovered = true;
          break outer;
        }
      }
    }
  }
  await settle(page, 250);
  await card.screenshot({ path: join(outDir, 'nashville-hover-1440.png') });
  if (!hovered) notes.push('hover: tooltip not detected by text sweep — inspect nashville-hover-1440.png');
  await page.mouse.move(10, 10);
  await settle(page, 200);

  /* ---- 3b. the "why" drawer open (median, then average) ---- */
  await card.locator('text=The numbers behind the shades').click();
  await settle(page, 300);
  const drawerRows = await card.locator('text=/clean laps|laps$/').count();
  notes.push(`drawer visible rows signal: ${drawerRows}`);
  await card.screenshot({ path: join(outDir, 'nashville-drawer-1440.png') });
  await card.locator('.segmented__option', { hasText: 'Average lap' }).click();
  await settle(page, 300);
  await card.screenshot({ path: join(outDir, 'nashville-drawer-average-1440.png') });
  await card.locator('.segmented__option', { hasText: 'Median lap' }).click();
  await settle(page, 200);

  /* ---- 3c. lap scopes: closing third, then the one-lap scrubber ---- */
  await card.locator('.segmented__option', { hasText: 'Closing third' }).click();
  await settle(page, 300);
  await card.screenshot({ path: join(outDir, 'nashville-scope-closing-1440.png') });
  await card.locator('.segmented__option', { hasText: 'One lap' }).click();
  await settle(page, 300);
  // drive the scrubber to a caution lap if one exists (Nashville 2024 cautions ~L52+)
  const slider = card.locator('input[type="range"]');
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '55');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle(page, 300);
  await card.screenshot({ path: join(outDir, 'nashville-scrubber-lap55-1440.png') });
  await card.locator('.segmented__option', { hasText: 'Full race' }).click();
  await settle(page, 200);

  /* ---- 3d. YoY: this place, other years ---- */
  const yoy = page.locator('.card', { hasText: 'This place, other years' });
  const yoyCount = await yoy.count();
  notes.push(`YoY card present: ${yoyCount > 0 ? 'yes' : 'NO'}`);
  if (yoyCount > 0) {
    await yoy.scrollIntoViewIfNeeded();
    await settle(page, 300);
    await yoy.screenshot({ path: join(outDir, 'nashville-yoy-1440.png') });
  }

  /* ---- 4. road course fallback (no curated anchors → no heat card) ---- */
  await page.goto(`${base}/races/${ROAD}`, { waitUntil: 'load' });
  await settle(page, 700);
  const roadHasCard = await page.locator('text=The track, section by section').count();
  notes.push(`road-course heat card present: ${roadHasCard > 0 ? 'YES (unexpected)' : 'no (expected)'}`);
  await page.screenshot({ path: join(outDir, 'roadcourse-plain-1440.png'), fullPage: true });
  await desktop.close();

  /* ---- 5. Nashville race page, phone ---- */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mp = await phone.newPage();
  await mp.goto(`${base}/races/${NASHVILLE}`, { waitUntil: 'load' });
  await mp.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(mp, 700);
  const overflow = await mp.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) notes.push(`PHONE OVERFLOW ${overflow.scrollWidth}>${overflow.clientWidth}`);
  await mp.screenshot({ path: join(outDir, 'nashville-race-390.png'), fullPage: true });
  const mcard = mp.locator('.card', { hasText: 'The track, section by section' });
  await mcard.scrollIntoViewIfNeeded();
  await settle(mp, 300);
  await mcard.screenshot({ path: join(outDir, 'nashville-heatcard-390.png') });
  await mcard.locator('text=The numbers behind the shades').click();
  await settle(mp, 300);
  await mcard.screenshot({ path: join(outDir, 'nashville-drawer-390.png') });
  const myoy = mp.locator('.card', { hasText: 'This place, other years' });
  if ((await myoy.count()) > 0) {
    await myoy.scrollIntoViewIfNeeded();
    await settle(mp, 300);
    await myoy.screenshot({ path: join(outDir, 'nashville-yoy-390.png') });
  }
  const overflowAfter = await mp.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  if (overflowAfter.scrollWidth > overflowAfter.clientWidth + 1) {
    notes.push(`PHONE OVERFLOW after drawer/yoy ${overflowAfter.scrollWidth}>${overflowAfter.clientWidth}`);
  }
  await phone.close();

  console.log(JSON.stringify({ ok: true, hovered, overflow, consoleIssues: issues, notes, outDir }, null, 2));
} finally {
  await browser.close();
}
