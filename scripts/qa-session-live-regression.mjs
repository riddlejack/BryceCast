// Paired race-mode regression proof for the session-aware Live work (Task #23
// + review rework). The session-aware branch reshapes ONLY practice and
// qualifying; a race must render exactly as it did before. This captures the
// race Live page (the deterministic `?fixture=ready` race fixture) at 1440 and
// 390, serializes its DOM, and hashes both — so a baseline build and an after
// build can be proven byte-identical the same way lane D proved its shell.
//
// Usage:
//   BRYCECAST_URL=http://localhost:4173 REGRESSION_LABEL=after \
//     node scripts/qa-session-live-regression.mjs
//
// Writes <label>-race-<width>.png, <label>-race.dom.html and a
// <label>.manifest.json (sha256 of every artifact) into REGRESSION_OUT.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const url = (process.env.BRYCECAST_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const label = process.env.REGRESSION_LABEL ?? 'after';
const outDir = process.env.REGRESSION_OUT
  ?? join(process.env.HOME ?? '.', '.brycecast/reports/session-live');
const chromePath = process.env.BRYCECAST_CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const widths = [1440, 390];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

// Strip the only DOM values that legitimately move between two runs of the same
// build: the wall-clock "checked at" stamps the fixture inherits from now(), and
// React's per-mount ids. Everything else is fixture-static, so any surviving
// difference is a real race-mode regression.
const normalizeDom = (html) => html
  .replace(/data-source-checked-at="[^"]*"/g, 'data-source-checked-at="<ts>"')
  .replace(/data-live-source-checked-at="[^"]*"/g, 'data-live-source-checked-at="<ts>"')
  .replace(/data-live-arrival-checked-at="[^"]*"/g, 'data-live-arrival-checked-at="<ts>"')
  .replace(/data-clock-checked-at="[^"]*"/g, 'data-clock-checked-at="<ts>"')
  .replace(/data-source-checked-at-ms="[^"]*"/g, 'data-source-checked-at-ms="<ts>"')
  .replace(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z)/g, '<iso>')
  .replace(/id="[^"]*:r[0-9a-z]+:[^"]*"/gi, 'id="<react-id>"')
  .replace(/aria-labelledby="[^"]*:r[0-9a-z]+:[^"]*"/gi, 'aria-labelledby="<react-id>"');

const browser = await chromium.launch({ executablePath: chromePath });
await mkdir(outDir, { recursive: true });

const manifest = { label, url, capturedFor: 'race-mode (?fixture=ready)', widths: {} };
let referenceDomHash = null;

for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  await page.goto(`${url}/live?fixture=ready`, { waitUntil: 'load' });
  await page.waitForSelector('.live-page', { timeout: 15_000 });
  // Confirm the race shape actually rendered — the whole proof is void otherwise.
  const kind = await page.getAttribute('.live-page', 'data-live-session-kind');
  if (kind && kind !== 'race') throw new Error(`fixture=ready did not render race mode (got ${kind})`);
  await page.waitForTimeout(700);

  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const pngName = `${label}-race-${width}.png`;
  await writeFile(join(outDir, pngName), png);

  const rawDom = await page.$eval('.live-page', (node) => node.outerHTML);
  const dom = normalizeDom(rawDom);
  const domHash = sha256(dom);
  // The DOM is width-independent apart from measured chart widths; capture the
  // 1440 serialization as the canonical DOM artifact.
  if (width === 1440) {
    await writeFile(join(outDir, `${label}-race.dom.html`), dom);
    referenceDomHash = domHash;
  }

  manifest.widths[width] = { screenshot: pngName, screenshotSha256: sha256(png), domSha256: domHash };
  await context.close();
}

manifest.canonicalDomSha256 = referenceDomHash;
await writeFile(join(outDir, `${label}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();

console.log(JSON.stringify(manifest, null, 2));
