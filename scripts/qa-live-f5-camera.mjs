/** F5 replay visual proof. Requires an isolated replay API and Vite preview. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://127.0.0.1:5185');
const api = arg('api', 'http://127.0.0.1:8795');
const outDir = arg('out', 'analysis/live-f5-audit/screenshots');
const reportPath = arg('report', 'analysis/live-f5-audit/replay-visual-proof.json');
const session = '5544-6761';
const states = [
  ['green', '2026-07-04T17:10:30.000Z'],
  ['mid-race', '2026-07-04T17:36:40.000Z'],
  ['caution', '2026-07-04T17:39:31.336Z'],
  ['cold', '2026-07-04T17:56:10.169Z']
];
const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }]
];

await mkdir(outDir, { recursive: true });

const control = async (t0, speed = '1', sessionKey = session) => {
  const url = new URL('/api/replay/control', api);
  url.searchParams.set('session', sessionKey);
  url.searchParams.set('t0', t0);
  url.searchParams.set('speed', speed);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Replay control failed ${response.status}: ${await response.text()}`);
  return response.json();
};

const errors = [];
const captures = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const newPage = async (viewport) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', text: message.text() }); });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', text: error.message }));
  return { context, page };
};

try {
  for (const [viewportName, viewport] of viewports) {
    for (const [stateName, t0] of states) {
      await control(t0);
      const { context, page } = await newPage(viewport);
      await page.goto(`${base}/live`, { waitUntil: 'load' });
      await page.waitForSelector('.live-trust');
      await page.waitForTimeout(2_200);
      const file = path.join(outDir, `${stateName}--${viewportName}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const cameraCount = await page.locator('[data-camera-chart="battle-camera"]').count();
      captures.push({
        stateName,
        viewportName,
        file,
        cameraCount,
        overflow: await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })),
        camera: cameraCount ? await page.locator('[data-camera-chart="battle-camera"]').evaluate((element) => ({ ...element.dataset })) : null,
        cautionSpans: cameraCount ? await page.locator('[data-caution-span]').count() : 0
      });
      await context.close();
    }
  }

  await control('2026-07-04T17:17:00.000Z', '4');
  const { context, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(`${base}/live`, { waitUntil: 'load' });
  await page.waitForSelector('[data-camera-chart="battle-camera"]');
  const camera = page.locator('[data-camera-chart="battle-camera"]');
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-camera-chart="battle-camera"]')?.getAttribute('data-source-checked-at');
    return value && Date.parse(value) >= Date.parse('2026-07-04T17:22:00.000Z');
  }, undefined, { timeout: 90_000, polling: 100 });
  await control('2026-07-04T17:22:02.000Z', '1');
  const waitForSource = async (checkedAt) => page.waitForFunction(
    (expected) => document.querySelector('[data-camera-chart="battle-camera"]')?.getAttribute('data-source-checked-at') === expected,
    checkedAt,
    { timeout: 12_000, polling: 50 }
  );
  const collectAgreement = async (phase) => {
    const cameraData = await camera.evaluate((element) => ({ ...element.dataset }));
    const ladder = await page.locator('[data-ladder-label]').evaluateAll((elements) => elements.map((element) => ({ ...element.dataset, text: element.textContent?.trim() })));
    const corridor = await page.locator('.live-battle__corridor [data-driver-id]').evaluateAll((elements) => elements.map((element) => ({ ...element.dataset })));
    const field = await page.locator('.live-field__row[data-driver-id]').evaluateAll((elements) => elements.map((element) => ({ ...element.dataset, text: element.textContent?.replace(/\s+/g, ' ').trim() })));
    const crossing = await page.locator('[data-bryce-crossing]').evaluateAll((elements) => elements.map((element) => ({ ...element.dataset })));
    const labels = await page.locator('[data-ladder-label-content]').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { id: element.closest('[data-ladder-label]')?.getAttribute('data-driver-id'), top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    }));
    return { phase, camera: cameraData, ladder, corridor, field, crossing, labels };
  };

  await waitForSource('2026-07-04T17:22:04.423Z');
  const before = await collectAgreement('before');
  await page.locator('.live-battle').screenshot({ path: path.join(outDir, 'overtake-before--desktop.png') });

  await waitForSource('2026-07-04T17:22:05.680Z');
  const marker = page.locator('[data-bryce-crossing][data-rival-id="2147"][data-crossing-lap="10"]');
  await marker.waitFor({ state: 'visible' });
  await marker.focus();
  const during = await collectAgreement('during');
  await page.locator('.live-battle').screenshot({ path: path.join(outDir, 'overtake-during--desktop.png') });
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));

  await page.waitForFunction(() => {
    const value = document.querySelector('[data-camera-chart="battle-camera"]')?.getAttribute('data-source-checked-at');
    return value && Date.parse(value) >= Date.parse('2026-07-04T17:22:06.431Z');
  }, undefined, { timeout: 8_000, polling: 50 });
  const after = await collectAgreement('after');
  await page.locator('.live-battle').screenshot({ path: path.join(outDir, 'overtake-after--desktop.png') });
  await page.screenshot({ path: path.join(outDir, 'overtake-during-full--desktop.png'), fullPage: true });
  await control('2026-07-05T14:20:00.000Z', '1', '5543-6760');
  await page.waitForFunction(() => document.querySelector('[data-camera-chart="battle-camera"]')?.getAttribute('data-session-key') === '5543-6760', undefined, { timeout: 8_000, polling: 50 });
  await page.waitForFunction(() => Number(document.querySelector('[data-camera-chart="battle-camera"]')?.getAttribute('data-source-sample-count')) >= 2, undefined, { timeout: 8_000, polling: 50 });
  const sessionChangeCamera = await camera.evaluate((element) => ({ ...element.dataset }));
  const sessionChangeProof = {
    camera: sessionChangeCamera,
    assertions: {
      activeSessionChanged: sessionChangeCamera.sessionKey === '5543-6760',
      newSessionStartsBounded: Number(sessionChangeCamera.sourceSampleCount) <= 5,
      noCrossSessionCameraEase: sessionChangeCamera.cameraRenderedCenter === sessionChangeCamera.cameraTargetCenter,
      noRace1TimestampLeak: String(sessionChangeCamera.sourceCheckedAt).startsWith('2026-07-05')
    }
  };
  await context.close();

  const permanentCollision = [before, during, after].some((phase) => phase.labels.some((label, index, labels) =>
    labels.some((other, otherIndex) => otherIndex > index && label.id !== other.id && label.left < other.right && label.right > other.left && label.top < other.bottom && label.bottom > other.top)
  ));
  const bryceFieldRank = (phase) => phase.field.find((entry) => entry.driverId === '2143')?.liveRank ?? null;
  const immediateCorridor = (phase) => phase.corridor
    .map((entry) => ({ id: entry.driverId, offset: Number(entry.offsetSeconds) }))
    .sort((left, right) => Math.abs(left.offset) - Math.abs(right.offset));
  const overtakeProof = {
    before,
    during,
    after,
    assertions: {
      sourceAdvancedInOrder: Date.parse(before.camera.sourceCheckedAt) < Date.parse(during.camera.sourceCheckedAt) && Date.parse(during.camera.sourceCheckedAt) < Date.parse(after.camera.sourceCheckedAt),
      bryceRankChanged18To17: bryceFieldRank(before) === '18' && bryceFieldRank(during) === '17',
      crossingMarkerAllaerLap10: during.crossing.some((entry) => entry.rivalId === '2147' && entry.crossingDirection === 'ahead_of' && entry.crossingLap === '10'),
      cameraAndFieldRankAgree: [before, during, after].every((phase) => phase.camera.bryceRank === bryceFieldRank(phase)),
      ladderAndFieldIdentityAgree: [before, during, after].every((phase) => phase.ladder.every((entry) => phase.field.some((row) => row.driverId === entry.driverId))),
      upperCorridorAndFieldIdentityAgree: [before, during, after].every((phase) => immediateCorridor(phase).slice(0, 2).every((entry) => phase.field.some((row) => row.driverId === entry.id))),
      noLabelCollision: !permanentCollision,
      cameraCenterDeltaAcrossPass: Math.abs(Number(after.camera.cameraRenderedCenter) - Number(before.camera.cameraRenderedCenter)),
      noCameraLurch: Math.abs(Number(after.camera.cameraRenderedCenter) - Number(before.camera.cameraRenderedCenter)) < 0.75
    }
  };
  const report = {
    schemaVersion: 'brycecast.liveF5ReplayVisualProof.v1',
    generatedAt: new Date().toISOString(),
    base,
    api,
    browser: 'Google Chrome via playwright-core channel chrome',
    fullPageReducedMotion: true,
    captures,
    overtakeProof,
    sessionChangeProof,
    consoleErrors: errors,
    ok: errors.length === 0 && captures.every((capture) => capture.overflow.scrollWidth <= capture.overflow.innerWidth) && Object.entries(overtakeProof.assertions).every(([key, value]) => key === 'cameraCenterDeltaAcrossPass' || value === true) && Object.values(sessionChangeProof.assertions).every(Boolean)
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
