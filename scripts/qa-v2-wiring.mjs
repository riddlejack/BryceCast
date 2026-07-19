/** Heat-map v2 wiring QA capture.
 *  - Nashville 2025 heat card: 8 measured spans + source drawer (tier label +
 *    PDF-vs-measured note) + the numbers drawer (pass concordance line).
 *  - Nashville 2024 YoY (both years at 8-section grain) + pass-mark hover.
 *  - A GO race with pass marks (Milwaukee 2025) heat card.
 *  - 1440 and 390. Playwright channel chrome, headless, reducedMotion 'reduce'.
 *
 *  Usage: node scripts/qa-v2-wiring.mjs   (dev server on :5278)
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

const base = process.env.BRYCECAST_URL ?? 'http://localhost:5278';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(os.homedir(), '.brycecast/reports/v2-wiring');
const NASH25 = 'session_indy_nxt_2025_6447';
const NASH24 = 'session_indy_nxt_2024_6323';
const MILW25 = 'session_indy_nxt_2025_6448';

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const notes = [];
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const heatCard = (page) => page.locator('.card', { hasText: 'The track, section by section' });

try {
  /* ---------- Desktop 1440 ---------- */
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  const issues = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) issues.push(`${m.type()}: ${m.text()}`);
  });

  /* Nashville 2025 — measured 8-section heat card */
  await page.goto(`${base}/races/${NASH25}`, { waitUntil: 'load' });
  await page.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(page, 700);
  await page.screenshot({ path: join(outDir, 'nashville2025-race-1440.png'), fullPage: true });
  const card25 = heatCard(page);
  await card25.scrollIntoViewIfNeeded();
  await settle(page, 300);
  const coverage = await card25.locator('text=/timed sections/').first().innerText().catch(() => '(none)');
  notes.push(`Nashville 2025 coverage line: ${coverage}`);
  await card25.screenshot({ path: join(outDir, 'nashville2025-heatcard-1440.png') });

  /* source drawer: tier label + PDF-vs-measured sanity note */
  await card25.locator('button.source-pill').click();
  await settle(page, 300);
  const drawer = page.locator('.drawer');
  const tierSeen = (await drawer.locator('text=/RaceTools race-weekend capture/').count()) > 0;
  const sanitySeen = (await drawer.locator('text=/agree with these measured spans/').count()) > 0;
  const noOfficialTiming = (await drawer.locator('text=/official timing/i').count());
  notes.push(`Nashville 2025 source drawer — tier label: ${tierSeen ? 'yes' : 'NO'}, PDF-vs-measured note: ${sanitySeen ? 'yes' : 'NO'}, "official timing" mentions: ${noOfficialTiming}`);
  await page.screenshot({ path: join(outDir, 'nashville2025-source-drawer-1440.png') });
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('.drawer button[aria-label="Close sources"]').click().catch(() => {});
  await settle(page, 200);

  /* numbers drawer: the pass concordance line */
  await card25.locator('text=The numbers behind the shades').click();
  await settle(page, 300);
  const concordanceSeen = (await card25.locator('text=/validated .* against the official lap chart/').count()) > 0;
  notes.push(`Nashville 2025 numbers drawer — pass concordance line: ${concordanceSeen ? 'yes' : 'NO'}`);
  await card25.screenshot({ path: join(outDir, 'nashville2025-drawer-1440.png') });

  /* Nashville 2024 — 12 pass marks + YoY at 8-section grain */
  await page.goto(`${base}/races/${NASH24}`, { waitUntil: 'load' });
  await page.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(page, 700);
  const card24 = heatCard(page);
  await card24.scrollIntoViewIfNeeded();
  await settle(page, 300);
  const markKey = (await card24.locator('text=/a pass involving Bryce/').count()) > 0;
  notes.push(`Nashville 2024 pass-mark key line present: ${markKey ? 'yes' : 'NO'}`);
  await card24.screenshot({ path: join(outDir, 'nashville2024-heatcard-1440.png') });

  /* hover a pass mark → the "past X / X by him" tip (targets the accessible
     hit circle directly, so the transient tip is captured reliably) */
  const marks = card24.locator('[data-pass-mark]');
  const markCount = await marks.count();
  notes.push(`Nashville 2024 pass marks in DOM: ${markCount}`);
  let passHover = false;
  for (let i = 0; i < markCount && !passHover; i += 1) {
    const target = marks.nth(i);
    const b = await target.boundingBox();
    if (!b) continue;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await settle(page, 120);
    if ((await card24.locator('text=/placed between timing loops/').count()) > 0) passHover = true;
  }
  notes.push(`Nashville 2024 pass-mark hover tip: ${passHover ? 'captured' : 'NOT detected'}`);
  await settle(page, 200);
  await card24.screenshot({ path: join(outDir, 'nashville2024-passhover-1440.png') });
  await page.mouse.move(5, 5);
  await settle(page, 200);

  const yoy = page.locator('.card', { hasText: 'This place, other years' });
  if ((await yoy.count()) > 0) {
    await yoy.scrollIntoViewIfNeeded();
    await settle(page, 300);
    const yoyCoverage = await yoy.locator('text=/timed sections/').first().innerText().catch(() => '(none)');
    notes.push(`Nashville YoY coverage line: ${yoyCoverage}`);
    await yoy.screenshot({ path: join(outDir, 'nashville2024-yoy-1440.png') });
  } else {
    notes.push('Nashville YoY card MISSING');
  }

  /* Milwaukee 2025 — a GO race with a PDF heat map + pass marks */
  await page.goto(`${base}/races/${MILW25}`, { waitUntil: 'load' });
  await page.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(page, 700);
  const cardM = heatCard(page);
  await cardM.scrollIntoViewIfNeeded();
  await settle(page, 300);
  const milMarks = (await cardM.locator('text=/a pass involving Bryce/').count()) > 0;
  notes.push(`Milwaukee 2025 pass-mark key line present: ${milMarks ? 'yes' : 'NO'}`);
  await cardM.screenshot({ path: join(outDir, 'milwaukee2025-heatcard-1440.png') });
  await desktop.close();

  /* ---------- Phone 390 ---------- */
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mp = await phone.newPage();
  await mp.goto(`${base}/races/${NASH25}`, { waitUntil: 'load' });
  await mp.waitForSelector('text=The track, section by section', { timeout: 15000 });
  await settle(mp, 700);
  const overflow = await mp.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  if (overflow.scrollWidth > overflow.clientWidth + 1) notes.push(`PHONE OVERFLOW ${overflow.scrollWidth}>${overflow.clientWidth}`);
  await mp.screenshot({ path: join(outDir, 'nashville2025-race-390.png'), fullPage: true });
  const mcard = heatCard(mp);
  await mcard.scrollIntoViewIfNeeded();
  await settle(mp, 300);
  await mcard.screenshot({ path: join(outDir, 'nashville2025-heatcard-390.png') });
  await phone.close();

  console.log(JSON.stringify({ ok: true, consoleIssues: issues, notes, outDir }, null, 2));
} finally {
  await browser.close();
}
