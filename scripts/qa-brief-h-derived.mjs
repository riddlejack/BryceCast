/** Brief H derived-remainder slice QA capture.
 *  Nashville race page: the updated key line + dotted derived stretches, the
 *  drawer with field distributions, the derived-stretch hover tooltip, and the
 *  YoY shapes with derived stretches — at 1440 and 390. Playwright channel
 *  chrome, headless, reducedMotion 'reduce'. Dev server on :5274.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const base = 'http://localhost:5274';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(os.homedir(), '.brycecast/reports/brief-h');
const NASHVILLE = 'session_indy_nxt_2024_6323';

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const notes = [];

try {
  /* ---- desktop 1440 ---- */
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  const issues = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) issues.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(`${base}/races/${NASHVILLE}`, { waitUntil: 'load' });
  await page.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(page, 700);

  const card = page.locator('.card', { hasText: 'The track, section by section' });
  await card.scrollIntoViewIfNeeded();
  await settle(page, 300);
  // Key line text (coverage) for the report.
  const keyLine = await card.locator('text=/timed sections/').first().textContent().catch(() => null);
  notes.push(`key line: ${keyLine}`);
  await card.screenshot({ path: join(outDir, 'derived-heatcard-1440.png') });

  /* ---- derived-stretch hover → tooltip (sweep the whole outline) ---- */
  const svg = card.locator('svg[aria-label*="track outline"]').first();
  const box = await svg.boundingBox();
  let hovered = false;
  if (box) {
    outer: for (let fy = 0.05; fy <= 0.95 && !hovered; fy += 0.025) {
      for (let fx = 0.05; fx <= 0.95; fx += 0.025) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
        await settle(page, 30);
        // The tooltip title is unique to the derived stretch (the key line does
        // not contain it), so this matches the tooltip only.
        if ((await card.locator('text=The rest of the lap, together').count()) > 0) {
          hovered = true;
          break outer;
        }
      }
    }
  }
  await settle(page, 250);
  await card.screenshot({ path: join(outDir, 'derived-hover-tooltip-1440.png') });
  const tipText = await card.locator('text=The rest of the lap, together').locator('xpath=..').first().textContent().catch(() => null);
  notes.push(`derived tooltip found: ${hovered} ${tipText ? `(“${tipText}”)` : ''}`);
  await page.mouse.move(5, 5);
  await settle(page, 200);

  /* ---- drawer with field distributions ---- */
  await card.locator('text=The numbers behind the shades').click();
  await settle(page, 350);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: join(outDir, 'derived-drawer-1440.png') });
  const vsCars = await card.locator('text=/vs \\d+ cars/').count();
  notes.push(`drawer "vs N cars" denominators: ${vsCars}`);

  /* ---- YoY with derived stretches ---- */
  const yoy = page.locator('.card', { hasText: 'This place, other years' });
  if ((await yoy.count()) > 0) {
    await yoy.scrollIntoViewIfNeeded();
    await settle(page, 300);
    await yoy.screenshot({ path: join(outDir, 'derived-yoy-1440.png') });
    const yoyKey = await yoy.locator('text=/timed sections/').first().textContent().catch(() => null);
    notes.push(`YoY key line: ${yoyKey}`);
  } else {
    notes.push('YoY card MISSING');
  }
  await desktop.close();

  /* ---- phone 390 ---- */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mp = await phone.newPage();
  await mp.goto(`${base}/races/${NASHVILLE}`, { waitUntil: 'load' });
  await mp.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(mp, 700);
  const overflow = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (overflow.sw > overflow.cw + 1) notes.push(`PHONE OVERFLOW ${overflow.sw}>${overflow.cw}`);
  const mcard = mp.locator('.card', { hasText: 'The track, section by section' });
  await mcard.scrollIntoViewIfNeeded();
  await settle(mp, 300);
  await mcard.screenshot({ path: join(outDir, 'derived-heatcard-390.png') });
  await mcard.locator('text=The numbers behind the shades').click();
  await settle(mp, 350);
  await mcard.screenshot({ path: join(outDir, 'derived-drawer-390.png') });
  const myoy = mp.locator('.card', { hasText: 'This place, other years' });
  if ((await myoy.count()) > 0) {
    await myoy.scrollIntoViewIfNeeded();
    await settle(mp, 300);
    await myoy.screenshot({ path: join(outDir, 'derived-yoy-390.png') });
  }
  const overflowAfter = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (overflowAfter.sw > overflowAfter.cw + 1) notes.push(`PHONE OVERFLOW after drawer ${overflowAfter.sw}>${overflowAfter.cw}`);
  await phone.close();

  console.log(JSON.stringify({ ok: true, hovered, consoleIssues: issues, notes, outDir }, null, 2));
} finally {
  await browser.close();
}
