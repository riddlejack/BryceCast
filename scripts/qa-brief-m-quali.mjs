/** Brief M QA: capture the "His qualifying, run by run" surface (Race Detail).
 *  Usage: node scripts/qa-brief-m-quali.mjs [--base=http://localhost:5188] [--out=$HOME/.brycecast/reports/quali-lab]
 *
 *  Captures, per route: the focused module + the full page. Plus two proofs the
 *  review asked for: an OPEN source-drawer on a 2026 session (the crosswalk +
 *  coverage provenance), and a TAP-driven tooltip on a real coarse-pointer
 *  (touch) mobile context — the mobile affordance the copy promises. Also
 *  captures a Race-2 doubleheader page so the quiet paired note is on record.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://localhost:5188');
const outDir = arg('out', path.join(process.env.HOME, '.brycecast/reports/quali-lab'));

const routes = [
  ['stpete-2024-road', '/races/session_indy_nxt_2024_6324'],
  ['stpete-2026-road-timing71', '/races/session_indy_nxt_2026_6751'],
  ['iowa-2024-oval', '/races/session_indy_nxt_2024_6319'],
  ['nashville-2026-oval', '/races/session_indy_nxt_2026_6755'],
  // Race-2 leg of the 2024 IMS doubleheader: only Race 1's qualifying was
  // captured, so this page must render the quiet paired note (never Race-1 ranks).
  ['ims-2024-road-race2-note', '/races/session_indy_nxt_2024_6325']
];

// The 2026 session whose source drawer we open (crosswalk GO + coverage entry).
const DRAWER_ROUTE = 'stpete-2026-road-timing71';
// The covered session we tap a lap on, in the mobile (touch) context.
const TAP_ROUTE = 'stpete-2024-road';

const viewports = [
  ['1440', { width: 1440, height: 1000 }, {}],
  // A real coarse-pointer context: hasTouch + isMobile make `(hover: none) and
  // (pointer: coarse)` match, so the module renders its "Tap" affordance and the
  // tap handler is exercised exactly as a phone would.
  ['390', { width: 390, height: 844 }, { hasTouch: true, isMobile: true }]
];

await mkdir(outDir, { recursive: true });

const cardFor = (page) => page.locator('section.card', { hasText: 'His qualifying, run by run' }).first();

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [viewportName, viewport, extra] of viewports) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      ...extra
    });
    /* Chromium's headless emulation does not flip the `pointer`/`hover` media
     * features from isMobile alone, so a touch context force-matches the coarse,
     * hoverless query a real phone reports — the exact state the "Tap" copy and
     * tap handler are built for. Non-pointer queries (reduced-motion, dark) still
     * delegate to the real implementation. */
    if (extra.hasTouch) {
      await context.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          if (/pointer:\s*coarse|hover:\s*none/.test(query)) {
            return {
              matches: true,
              media: query,
              onchange: null,
              addEventListener() {},
              removeEventListener() {},
              addListener() {},
              removeListener() {},
              dispatchEvent() {
                return false;
              }
            };
          }
          return original(query);
        };
      });
    }
    const page = await context.newPage();
    for (const [routeName, route] of routes) {
      await page.goto(`${base}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      const card = cardFor(page);
      if (await card.count()) {
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const moduleFile = path.join(outDir, `${routeName}--module--${viewportName}.png`);
        await card.screenshot({ path: moduleFile });
        console.log(moduleFile);
      } else {
        console.log(`(no qualifying module on ${route})`);
      }
      // full-page context capture
      const fullFile = path.join(outDir, `${routeName}--full--${viewportName}.png`);
      await page.screenshot({ path: fullFile, fullPage: true });
      console.log(fullFile);

      // open-drawer proof on the 2026 session (desktop)
      if (routeName === DRAWER_ROUTE && viewportName === '1440' && (await card.count())) {
        const pill = card.locator('button.source-pill').first();
        if (await pill.count()) {
          await pill.click();
          await page.waitForSelector('aside.drawer', { timeout: 3000 });
          await page.waitForTimeout(400);
          const drawerFile = path.join(outDir, `${routeName}--drawer--${viewportName}.png`);
          await page.screenshot({ path: drawerFile });
          console.log(drawerFile);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }
      }

      // tap-driven tooltip proof on the mobile (touch) context
      if (routeName === TAP_ROUTE && viewportName === '390' && (await card.count())) {
        const marks = card.locator('circle[role="button"]');
        const count = await marks.count();
        if (count > 0) {
          await marks.nth(Math.floor(count / 2)).dispatchEvent('click');
          await page.waitForTimeout(300);
          const tapFile = path.join(outDir, `${routeName}--tap--${viewportName}.png`);
          await card.screenshot({ path: tapFile });
          console.log(tapFile);
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
