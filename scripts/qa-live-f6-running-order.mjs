/** F6 replay visual proof. Requires an isolated replay API and Vite dev server. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
};

const base = arg('base', 'http://127.0.0.1:5173');
const api = arg('api', 'http://127.0.0.1:8795');
const outDir = arg('out', 'analysis/live-f6-audit/screenshots');
const reportPath = arg('report', 'analysis/live-f6-audit/replay-visual-proof.json');
const primarySession = '5544-6761';
const stateFixtures = [
  ['green', '2026-07-04T17:10:30.000Z', true],
  ['caution', '2026-07-04T17:39:31.336Z', true],
  ['cold', '2026-07-04T17:56:10.169Z', false]
];
const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }]
];
const bannedModuleCopy = [
  'broadcast camera',
  '12-second frame',
  'approved corridor',
  'contiguous interval chain',
  'cumulative',
  'DriverID'
];

await mkdir(outDir, { recursive: true });

const control = async (t0, speed = '1', session = primarySession) => {
  const url = new URL('/api/replay/control', api);
  url.searchParams.set('session', session);
  url.searchParams.set('t0', t0);
  url.searchParams.set('speed', speed);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Replay control failed ${response.status}: ${await response.text()}`);
  return response.json();
};

const errors = [];
const captures = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const newPage = async (viewport, reducedMotion = 'reduce') => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ type: 'console', text: message.text() });
  });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', text: error.message }));
  return { context, page };
};

const chartData = async (page) => {
  const chart = page.locator('[data-running-order-chart="true"]');
  const count = await chart.count();
  if (!count) return null;
  return chart.evaluate((element) => ({ ...element.dataset }));
};

const inspectRenderedChart = async (page) => {
  const chart = page.locator('[data-running-order-chart="true"]');
  const data = await chartData(page);
  if (!data) return null;
  const geometry = await chart.evaluate((svg) => {
    const svgBox = svg.getBoundingClientRect();
    const circles = [...svg.querySelectorAll('[data-ladder-dot]')].map((circle) => {
      const box = circle.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        withinSvg: box.left >= svgBox.left - 0.5 && box.right <= svgBox.right + 0.5 && box.top >= svgBox.top - 0.5 && box.bottom <= svgBox.bottom + 0.5,
        round: Math.abs(box.width - box.height) <= 0.5
      };
    });
    const ladderRows = [...svg.querySelectorAll('[data-ladder-row]')].map((row) => {
      const box = row.getBoundingClientRect();
      return { id: row.getAttribute('data-driver-id'), top: box.top, bottom: box.bottom, left: box.left, right: box.right, tabIndex: row.getAttribute('tabindex'), ariaLabel: row.getAttribute('aria-label') };
    });
    const endpoints = [...svg.querySelectorAll('[data-live-endpoint-x]')].map((path) => Number(path.getAttribute('data-live-endpoint-x')));
    const brycePath = svg.querySelector('[data-series-role="bryce"]');
    const roleRows = [...svg.querySelectorAll('[data-ladder-row][data-role]')].filter((row) => row.getAttribute('data-role')).map((row) => ({
      id: row.getAttribute('data-driver-id'),
      role: row.getAttribute('data-role'),
      text: row.textContent?.replace(/\s+/g, ' ').trim(),
      dotFill: row.querySelector('[data-ladder-dot]')?.getAttribute('fill')
    }));
    return {
      svg: { left: svgBox.left, right: svgBox.right, top: svgBox.top, bottom: svgBox.bottom, width: svgBox.width, height: svgBox.height },
      circles,
      ladderRows,
      endpoints,
      bryceStrokeWidth: brycePath?.getAttribute('stroke-width') ?? brycePath?.getAttribute('strokeWidth'),
      roleRows
    };
  });
  const moduleText = await page.locator('.live-battle').innerText();
  const pageText = await page.locator('body').innerText();
  const corridorLabels = await page.locator('.live-battle__corridor circle[tabindex="0"]').evaluateAll((circles) => circles.map((circle) => circle.getAttribute('aria-label')));
  const intro = (await page.locator('.live-battle__intro').innerText()).trim();
  const nearestRoles = Object.fromEntries(geometry.roleRows.map((row) => [row.role, row]));
  const nowX = Number(data.nowX);
  const rowOverlap = geometry.ladderRows.some((row, index, rows) => rows.some((other, otherIndex) =>
    otherIndex > index && row.id !== other.id && row.left < other.right && row.right > other.left && row.top < other.bottom && row.bottom > other.top
  ));
  return {
    data,
    geometry,
    intro,
    corridorLabels,
    moduleText,
    assertions: {
      exactIntro: intro === "The pack around Bryce — every line a car's running position, gold is Bryce.",
      noBannedModuleCopy: bannedModuleCopy.every((term) => !pageText.includes(term)),
      sevenWholeLanes: Number(data.laneUpper) - Number(data.laneLower) === 6 && Number.isInteger(Number(data.laneLower)) && Number.isInteger(Number(data.laneUpper)),
      fixedGutter130: data.ladderGutterPx === '130',
      historyTouchesNow: data.historyTouchesNow === 'true' && Math.abs(Number(data.latestSampleX) - nowX) < 0.01,
      everyLiveEndpointTouchesNow: geometry.endpoints.length > 0 && geometry.endpoints.every((value) => Math.abs(value - nowX) < 0.01),
      wholeUnclippedDots: geometry.circles.length > 0 && geometry.circles.every((circle) => circle.withinSvg && circle.round),
      focusableAccessibleLadder: geometry.ladderRows.length > 0 && geometry.ladderRows.every((row) => row.tabIndex === '0' && row.ariaLabel),
      noPermanentLadderOverlap: !rowOverlap,
      bryceStroke25: Number(geometry.bryceStrokeWidth) === 2.5,
      nearestAheadColorAndCopy: nearestRoles.ahead?.dotFill === '#5581c2' && nearestRoles.ahead?.text.includes('ahead now'),
      nearestBehindColorAndCopy: nearestRoles.behind?.dotFill === '#2f9377' && nearestRoles.behind?.text.includes('behind now'),
      corridorDotsAreLabeled: corridorLabels.length > 0 && corridorLabels.every((label) => /seconds (ahead of|behind) Bryce/.test(label ?? ''))
    }
  };
};

const waitForChart = async (page, minimumSamples = 2) => {
  await page.waitForSelector('[data-running-order-chart="true"]', { timeout: 15_000 });
  await page.waitForFunction((minimum) => Number(document.querySelector('[data-running-order-chart="true"]')?.getAttribute('data-source-sample-count')) >= minimum, minimumSamples, { timeout: 15_000, polling: 50 });
};

const waitForSourceAtLeast = (page, checkedAt, timeout = 20_000) => page.waitForFunction(
  (expected) => {
    const value = document.querySelector('[data-running-order-chart="true"]')?.getAttribute('data-source-checked-at');
    return value && Date.parse(value) >= Date.parse(expected);
  },
  checkedAt,
  { timeout, polling: 50 }
);

try {
  for (const [viewportName, viewport] of viewports) {
    for (const [stateName, t0, expectChart] of stateFixtures) {
      await control(t0);
      const { context, page } = await newPage(viewport);
      await page.goto(`${base}/live`, { waitUntil: 'load' });
      await page.waitForSelector('.live-trust');
      if (expectChart) await waitForChart(page);
      else await page.waitForTimeout(1_500);
      const fullFile = path.join(outDir, `${stateName}--${viewportName}.png`);
      await page.screenshot({ path: fullFile, fullPage: true });
      let moduleFile = null;
      let rendered = null;
      if (await page.locator('.live-battle').count()) {
        moduleFile = path.join(outDir, `${stateName}-running-order--${viewportName}.png`);
        await page.locator('.live-battle').screenshot({ path: moduleFile });
        rendered = await inspectRenderedChart(page);
      }
      const capture = {
        stateName,
        viewportName,
        fullFile,
        moduleFile,
        rendered,
        cautionSpans: await page.locator('[data-caution-span]').count(),
        overflow: await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })),
        trustText: (await page.locator('.live-trust').innerText()).replace(/\s+/g, ' ').trim()
      };
      captures.push(capture);
      await context.close();
    }
  }

  const startupProof = [];
  for (const [viewportName, viewport] of viewports) {
    const first = '2026-07-04T17:07:25.061Z';
    await control(first, '4');
    const { context, page } = await newPage(viewport);
    await page.goto(`${base}/live`, { waitUntil: 'load' });
    await waitForChart(page);
    const firstMs = Date.parse(first);
    for (const [stateName, elapsedMs] of [['t+10s', 10_000], ['t+60s', 60_000]]) {
      await waitForSourceAtLeast(page, new Date(firstMs + elapsedMs).toISOString(), 30_000);
      const rendered = await inspectRenderedChart(page);
      const file = path.join(outDir, `startup-${stateName.replace('+', 'plus')}--${viewportName}.png`);
      await page.locator('.live-battle').screenshot({ path: file });
      startupProof.push({
        stateName,
        viewportName,
        file,
        rendered,
        observedSpanMs: Number(rendered.data.timeDomainSpanMs),
        assertions: {
          chartIsGrowing: rendered.data.windowGrowing === 'true',
          elapsedNotReservedWindow: Number(rendered.data.timeDomainSpanMs) < 300_000,
          observedAtOrAfterTarget: Number(rendered.data.timeDomainSpanMs) >= elapsedMs,
          newestLineAtRealNow: rendered.assertions.historyTouchesNow && rendered.assertions.everyLiveEndpointTouchesNow
        }
      });
    }
    await context.close();
  }

  await control('2026-07-04T17:21:44.390Z', '1');
  const lappedPage = await newPage({ width: 1440, height: 900 });
  await lappedPage.page.goto(`${base}/live`, { waitUntil: 'load' });
  await waitForChart(lappedPage.page);
  await lappedPage.page.waitForFunction(() => Number(document.querySelector('[data-running-order-chart="true"]')?.getAttribute('data-lapped-upstream-count')) > 0, undefined, { timeout: 8_000, polling: 50 });
  const lappedStart = await inspectRenderedChart(lappedPage.page);
  const lappedStartCount = Number(lappedStart.data.sourceSampleCount);
  await lappedPage.page.locator('.live-battle').screenshot({ path: path.join(outDir, 'lapped-upstream-start--desktop.png') });
  await lappedPage.page.waitForFunction((startCount) => {
    const chart = document.querySelector('[data-running-order-chart="true"]');
    return Number(chart?.getAttribute('data-source-sample-count')) >= startCount + 2 && Number(chart?.getAttribute('data-lapped-upstream-count')) > 0;
  }, lappedStartCount, { timeout: 8_000, polling: 50 });
  const lappedEnd = await inspectRenderedChart(lappedPage.page);
  await lappedPage.page.locator('.live-battle').screenshot({ path: path.join(outDir, 'lapped-upstream-end--desktop.png') });
  const lappedProof = {
    start: lappedStart,
    end: lappedEnd,
    files: ['lapped-upstream-start--desktop.png', 'lapped-upstream-end--desktop.png'],
    assertions: {
      lappedCarWasUpstreamThroughout: Number(lappedStart.data.lappedUpstreamCount) > 0 && Number(lappedEnd.data.lappedUpstreamCount) > 0,
      historyContinuedAppending: Number(lappedEnd.data.sourceSampleCount) >= lappedStartCount + 2,
      sourceClockAdvanced: Date.parse(lappedEnd.data.sourceCheckedAt) > Date.parse(lappedStart.data.sourceCheckedAt),
      endpointsStillTouchNow: lappedEnd.assertions.historyTouchesNow && lappedEnd.assertions.everyLiveEndpointTouchesNow
    }
  };
  await lappedPage.context.close();

  await control('2026-07-04T17:22:02.000Z', '1');
  const overtakePage = await newPage({ width: 1440, height: 900 });
  await overtakePage.page.goto(`${base}/live`, { waitUntil: 'load' });
  await waitForChart(overtakePage.page);
  const collectPhase = async (phase, checkedAt, fileName) => {
    await overtakePage.page.waitForFunction(
      ({ expected, exact }) => {
        const observed = document.querySelector('[data-running-order-chart="true"]')?.getAttribute('data-source-checked-at');
        return observed && (exact ? observed === expected : Date.parse(observed) >= Date.parse(expected));
      },
      { expected: checkedAt, exact: phase !== 'after' },
      { timeout: 12_000, polling: 25 }
    );
    const marker = overtakePage.page.locator('[data-bryce-crossing][data-rival-id="2147"][data-crossing-lap="10"]');
    if (phase === 'during') {
      await marker.waitFor({ state: 'visible' });
      await marker.focus();
    }
    const rendered = await inspectRenderedChart(overtakePage.page);
    const fieldRank = await overtakePage.page.locator('.live-field__row[data-driver-id="2143"]').getAttribute('data-live-rank');
    const markerData = await marker.evaluateAll((elements) => elements.map((element) => ({ ...element.dataset, ariaLabel: element.getAttribute('aria-label') })));
    await overtakePage.page.locator('.live-battle').screenshot({ path: path.join(outDir, fileName) });
    if (phase === 'during') await overtakePage.page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    return { phase, checkedAt, rendered, fieldRank, markerData, file: fileName };
  };
  const before = await collectPhase('before', '2026-07-04T17:22:04.423Z', 'overtake-before--desktop.png');
  const during = await collectPhase('during', '2026-07-04T17:22:05.680Z', 'overtake-during--desktop.png');
  const after = await collectPhase('after', '2026-07-04T17:22:06.431Z', 'overtake-after--desktop.png');
  const overtakeProof = {
    before,
    during,
    after,
    assertions: {
      sourceAdvancedInOrder: Date.parse(before.checkedAt) < Date.parse(during.checkedAt) && Date.parse(during.checkedAt) < Date.parse(after.checkedAt),
      bryceRankChanged18To17: before.fieldRank === '18' && during.fieldRank === '17' && after.fieldRank === '17',
      exactOpenMarker: during.markerData.some((marker) => marker.rivalId === '2147' && marker.crossingDirection === 'ahead_of' && marker.crossingLap === '10' && marker.ariaLabel === 'ahead of Allaer, lap 10'),
      rankChartAndFieldAgree: [before, during, after].every((phase) => phase.rendered.data.cameraTargetCenter === phase.fieldRank)
    }
  };

  const chart = overtakePage.page.locator('[data-running-order-chart="true"]');
  const chartBox = await chart.boundingBox();
  const emptyCandidates = [];
  if (chartBox) {
    for (const xFraction of [0.22, 0.38, 0.54, 0.7, 0.84]) {
      for (const yOffset of [49.5, 90.5, 131.5, 172.5, 213.5]) {
        const x = chartBox.x + 44 + (chartBox.width - 174) * xFraction;
        const y = chartBox.y + yOffset;
        await overtakePage.page.mouse.move(x, y);
        await overtakePage.page.waitForTimeout(30);
        const focused = await chart.getAttribute('data-focused-driver-id');
        emptyCandidates.push({ x, y, focused });
        if (!focused) break;
      }
      if (emptyCandidates.at(-1)?.focused === '') break;
    }
  }
  const empty = emptyCandidates.find((candidate) => candidate.focused === '') ?? null;
  if (empty) {
    await overtakePage.page.evaluate(({ x, y }) => {
      const cursor = document.createElement('div');
      cursor.dataset.qaCursor = 'empty-hover';
      cursor.setAttribute('aria-hidden', 'true');
      Object.assign(cursor.style, {
        position: 'fixed', left: `${x - 9}px`, top: `${y - 9}px`, width: '18px', height: '18px',
        border: '2px solid #c43a31', borderRadius: '50%', zIndex: '9999', pointerEvents: 'none', boxSizing: 'border-box'
      });
      const vertical = document.createElement('span');
      Object.assign(vertical.style, { position: 'absolute', left: '7px', top: '-5px', width: '1px', height: '24px', background: '#c43a31' });
      const horizontal = document.createElement('span');
      Object.assign(horizontal.style, { position: 'absolute', left: '-5px', top: '7px', width: '24px', height: '1px', background: '#c43a31' });
      cursor.append(vertical, horizontal);
      document.body.append(cursor);
    }, empty);
  }
  await overtakePage.page.locator('.live-battle').screenshot({ path: path.join(outDir, 'empty-hover-visible-cursor--desktop.png') });
  const emptyHoverProof = {
    cursor: empty,
    file: 'empty-hover-visible-cursor--desktop.png',
    focusedDriverId: await chart.getAttribute('data-focused-driver-id'),
    visibleCursorCount: await overtakePage.page.locator('[data-qa-cursor="empty-hover"]').count(),
    assertions: {
      foundEmptyPlotSpace: Boolean(empty),
      emptySpaceHasNoFocus: (await chart.getAttribute('data-focused-driver-id')) === '',
      cursorIsVisibleInScreenshot: await overtakePage.page.locator('[data-qa-cursor="empty-hover"]').count() === 1
    }
  };

  const closedCardText = await overtakePage.page.locator('.live-battle').innerText();
  await overtakePage.page.locator('.live-battle .source-pill').click();
  const drawer = overtakePage.page.getByRole('dialog', { name: 'Sources for The battle' });
  await drawer.waitFor({ state: 'visible' });
  const drawerText = (await drawer.innerText()).replace(/\s+/g, ' ').trim();
  await overtakePage.page.screenshot({ path: path.join(outDir, 'source-method--desktop.png'), fullPage: true });
  const sourceDrawerProof = {
    file: 'source-method--desktop.png',
    text: drawerText,
    assertions: {
      officialRankMethodPresent: drawerText.includes('Every lower-chart lane is an official running position.'),
      lappedPersistencePresent: drawerText.includes('A lapped car keeps its position lane.'),
      sharedClockPresent: drawerText.includes('source clock sets both each sample’s horizontal position and the right edge'),
      methodSentencesAbsentFromCard: !closedCardText.includes('Every lower-chart lane is an official running position.')
    }
  };
  await overtakePage.context.close();

  await control('2026-07-04T17:22:03.000Z', '1');
  const motionPage = await newPage({ width: 1440, height: 900 }, 'no-preference');
  await motionPage.page.goto(`${base}/live`, { waitUntil: 'load' });
  await waitForChart(motionPage.page);
  await motionPage.page.waitForFunction(() => document.querySelector('.live-running-order__scene')?.style.transition.includes('400ms'), undefined, { timeout: 10_000, polling: 10 });
  const motionProof = await motionPage.page.locator('.live-running-order__scene').evaluate((scene) => ({
    transition: scene.style.transition,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }));
  motionProof.assertions = {
    normalMotionEnabled: motionProof.reducedMotion === false,
    wholeLaneEase400ms: motionProof.transition.includes('400ms') && motionProof.transition.includes('cubic-bezier')
  };
  await motionPage.context.close();

  const allRendered = captures.filter((capture) => capture.rendered).map((capture) => capture.rendered);
  const stateAssertions = {
    greenAndCautionAtBothWidths: ['desktop', 'mobile'].every((viewportName) => ['green', 'caution'].every((stateName) => captures.some((capture) => capture.viewportName === viewportName && capture.stateName === stateName && capture.rendered))),
    coldAtBothWidths: ['desktop', 'mobile'].every((viewportName) => captures.some((capture) => capture.viewportName === viewportName && capture.stateName === 'cold')),
    cautionShadeVisible: captures.filter((capture) => capture.stateName === 'caution').every((capture) => capture.cautionSpans > 0),
    greenShadeAbsent: captures.filter((capture) => capture.stateName === 'green').every((capture) => capture.cautionSpans === 0),
    noHorizontalOverflow: captures.every((capture) => capture.overflow.scrollWidth <= capture.overflow.innerWidth),
    renderedContractPassed: allRendered.every((rendered) => Object.values(rendered.assertions).every(Boolean))
  };
  const startupPassed = startupProof.every((proof) => Object.values(proof.assertions).every(Boolean));
  const report = {
    schemaVersion: 'brycecast.liveF6ReplayVisualProof.v1',
    generatedAt: new Date().toISOString(),
    base,
    api,
    browser: 'Google Chrome via playwright-core channel chrome',
    fullPageReducedMotion: true,
    captures,
    stateAssertions,
    startupProof,
    lappedProof,
    overtakeProof,
    emptyHoverProof,
    sourceDrawerProof,
    motionProof,
    consoleErrors: errors,
    ok: errors.length === 0
      && Object.values(stateAssertions).every(Boolean)
      && startupPassed
      && Object.values(lappedProof.assertions).every(Boolean)
      && Object.values(overtakeProof.assertions).every(Boolean)
      && Object.values(emptyHoverProof.assertions).every(Boolean)
      && Object.values(sourceDrawerProof.assertions).every(Boolean)
      && Object.values(motionProof.assertions).every(Boolean)
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: report.ok,
    captures: captures.length,
    startupCaptures: startupProof.length,
    lappedProof: lappedProof.assertions,
    overtakeProof: overtakeProof.assertions,
    emptyHoverProof: emptyHoverProof.assertions,
    stateAssertions,
    motionProof,
    consoleErrors: errors
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
