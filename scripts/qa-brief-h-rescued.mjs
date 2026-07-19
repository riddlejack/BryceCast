/** Brief H rescued-frontstretch QA capture (the SF classification fix).
 *  Iowa + Milwaukee race pages: heat card with the full measured chain and the
 *  updated key line ("N timed sections · 100% of the lap"), at 1440 and 390.
 *  Playwright channel chrome, headless, reducedMotion 'reduce'. Dev on :5274.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const base = 'http://localhost:5274';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(os.homedir(), '.brycecast/reports/brief-h');
const VENUES = [
  { key: 'iowa', sessionId: 'session_indy_nxt_2024_6319' },
  { key: 'milwaukee', sessionId: 'session_indy_nxt_2024_6322' }
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const notes = [];

try {
  for (const { key, sessionId } of VENUES) {
    /* desktop */
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await desktop.newPage();
    await page.goto(`${base}/races/${sessionId}`, { waitUntil: 'load' });
    await page.waitForSelector('text=The track, section by section', { timeout: 15000 });
    await settle(page, 700);
    const card = page.locator('.card', { hasText: 'The track, section by section' });
    await card.scrollIntoViewIfNeeded();
    await settle(page, 300);
    const keyLine = await card.locator('text=/timed sections/').first().textContent().catch(() => null);
    notes.push(`${key} key line: ${keyLine}`);
    await card.screenshot({ path: join(outDir, `rescued-${key}-heatcard-1440.png`) });
    // drawer with the full chain + field distributions
    await card.locator('text=The numbers behind the shades').click();
    await settle(page, 350);
    await card.screenshot({ path: join(outDir, `rescued-${key}-drawer-1440.png`) });
    const rows = await card.locator('text=/vs \\d+ cars/').count();
    notes.push(`${key} drawer rows with "vs N cars": ${rows}`);
    // no derived treatment anywhere on these venues
    const derivedHits = await page.locator('text=/derived from lap time|rest derived/i').count();
    notes.push(`${key} derived-treatment mentions on page (must be 0): ${derivedHits}`);
    await desktop.close();

    /* phone */
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const mp = await phone.newPage();
    await mp.goto(`${base}/races/${sessionId}`, { waitUntil: 'load' });
    await mp.waitForSelector('text=The track, section by section', { timeout: 15000 });
    await settle(mp, 700);
    const overflow = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (overflow.sw > overflow.cw + 1) notes.push(`${key} PHONE OVERFLOW ${overflow.sw}>${overflow.cw}`);
    const mcard = mp.locator('.card', { hasText: 'The track, section by section' });
    await mcard.scrollIntoViewIfNeeded();
    await settle(mp, 300);
    await mcard.screenshot({ path: join(outDir, `rescued-${key}-heatcard-390.png`) });
    await phone.close();
  }
  console.log(JSON.stringify({ ok: true, notes, outDir }, null, 2));
} finally {
  await browser.close();
}
