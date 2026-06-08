import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const screenshotDir = join(root, 'artifacts/screenshots');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.env.BRYCECAST_URL ?? 'http://localhost:5173/';
const expectApi = process.env.BRYCECAST_EXPECT_API === '1';
const appOrigin = new URL(url).origin;
const routeSourceLabels = {
  trackactivity: 'Track activity',
  schedule: 'Schedule',
  config: 'Config fallback',
  seed: 'Seed fallback'
};

const mustInclude = (text, needle, label) => {
  if (!text.includes(needle)) {
    throw new Error(`${label} missing "${needle}"`);
  }
};

const mustIncludeFolded = (text, needle, label) => {
  if (!text.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`${label} missing "${needle}"`);
  }
};

await mkdir(screenshotDir, { recursive: true });

const expectedSessionRoute = async () => {
  if (!expectApi) {
    return {
      primaryVideo: 'FS1',
      sourceLabel: 'Track activity'
    };
  }

  const response = await fetch(`${appOrigin}/api/session`);
  if (!response.ok) {
    throw new Error(`Session route probe failed: ${response.status}`);
  }
  const session = await response.json();
  return {
    primaryVideo: session.broadcastRoute?.primaryVideo?.name ?? 'Race Broadcast',
    sourceLabel: routeSourceLabels[session.broadcastRoute?.source] ?? 'Session',
    audioNames: (session.broadcastRoute?.audio ?? []).map((network) => network.name),
    internationalNames: (session.broadcastRoute?.international ?? []).map((network) => network.name)
  };
};

const resetApiProofState = async () => {
  if (!expectApi) return;

  const postReset = async (path, payload) => {
    const response = await fetch(`${appOrigin}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`API proof reset failed for ${path}: ${response.status}`);
    }
  };

  await postReset('/api/pov-proof', {
    status: 'unproven',
    source: 'INDYCAR App',
    device: 'iPhone or iPad',
    session: 'Road America Race 1',
    verifiedAt: '',
    selectorLabel: '',
    latencyNote: '',
    evidenceRef: '',
    liveConfirmedSeconds: 0,
    notes: 'QA reset: live #9 onboard remains unverified until same-race proof is recorded.',
    proofItems: []
  });

  await postReset('/api/audio-proof', {
    status: 'frequency_only',
    source: 'Published frequency',
    device: 'MacBook plus iPhone/iPad',
    session: 'Road America Race 1',
    verifiedAt: '',
    selectorLabel: '',
    frequency: '452.7000',
    frequencySource: 'Driver feed',
    officialRaceAudioAvailable: false,
    permissionBucket: 'Private listening only',
    latencyNote: '',
    evidenceRef: '',
    liveConfirmedSeconds: 0,
    notes: 'QA reset: published #9 frequency is metadata only.',
    proofItems: []
  });
};

await resetApiProofState();
const sessionRoute = await expectedSessionRoute();

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const consoleIssues = [];
  const requests = [];
  page.on('request', (request) => {
    requests.push(request.url());
  });
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      const location = message.location();
      consoleIssues.push(`${message.type()}: ${message.text()}${location.url ? ` @ ${location.url}:${location.lineNumber}` : ''}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      consoleIssues.push(`response ${response.status()}: ${response.url()}`);
    }
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  const tvText = await page.locator('body').innerText();
  mustInclude(tvText, 'Live #9 POV unproven', 'TV mode');
  mustInclude(tvText, 'Same-race live #9 required', 'TV mode POV gate');
  mustInclude(tvText, 'Not a live audio stream', 'TV mode radio truth');
  mustIncludeFolded(tvText, 'Room Status', 'Global readiness strip');
  mustInclude(tvText, 'Race room ready with gates', 'Global readiness strip status');
  mustIncludeFolded(tvText, 'Local archive', 'Global readiness strip archive item');
  mustInclude(tvText, 'TIMING', 'TV header');
  mustInclude(tvText, 'Bryce Aron', 'TV mode Bryce identity');
  if (tvText.includes('Scott Dixon')) {
    throw new Error('TV mode rendered top-series #9 collision Scott Dixon');
  }
  mustIncludeFolded(tvText, sessionRoute.primaryVideo, 'TV session route');
  mustIncludeFolded(tvText, `${sessionRoute.sourceLabel} session route`, 'TV route provenance');
  await page.screenshot({ path: join(screenshotDir, 'qa-tv-pov.png'), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(250);
  const tvRoomFit = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight
  }));
  if (tvRoomFit.scrollHeight > tvRoomFit.clientHeight + 90) {
    throw new Error(`TV room layout too tall: ${tvRoomFit.scrollHeight} > ${tvRoomFit.clientHeight} + 90`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  await page.locator('#mode-tab-tv').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  if ((await page.locator('#mode-tab-engineer').getAttribute('aria-selected')) !== 'true') {
    throw new Error('Mode tab ArrowRight did not select Engineer');
  }
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  if ((await page.locator('#mode-tab-tv').getAttribute('aria-selected')) !== 'true') {
    throw new Error('Mode tab ArrowLeft did not return to TV mode');
  }

  await page.locator('button', { hasText: 'Engineer' }).click();
  await page.waitForTimeout(250);
  const engineerText = await page.locator('body').innerText();
  mustInclude(engineerText, 'Bryce Aron', 'Engineer mode Bryce identity');
  if (engineerText.includes('Scott Dixon')) {
    throw new Error('Engineer mode rendered top-series #9 collision Scott Dixon');
  }
  mustInclude(engineerText, 'REPLAY ANALYTICS', 'Engineer mode replay panel');
  mustInclude(engineerText, 'archive', 'Engineer mode replay archive state');
  mustInclude(engineerText, 'RANK WINDOW', 'Engineer mode replay rank metric');
  mustInclude(engineerText, 'PASS NET', 'Engineer mode replay pass metric');
  mustInclude(engineerText, 'SEASON ANALYTICS', 'Engineer mode season analytics panel');
  mustInclude(engineerText, 'Splits, gains, CGR bench', 'Engineer mode season analytics heading');
  mustIncludeFolded(engineerText, 'Official rows', 'Engineer mode source confidence metric');
  mustIncludeFolded(engineerText, 'CGR average finish', 'Engineer mode teammate benchmark');
  mustInclude(engineerText, 'Street', 'Engineer mode track-type split');
  mustInclude(engineerText, 'Road', 'Engineer mode track-type split');
  mustInclude(engineerText, 'Oval', 'Engineer mode track-type split');
  await page.screenshot({ path: join(screenshotDir, 'qa-engineer-replay.png'), fullPage: true });

  await page.locator('button', { hasText: 'Phone' }).click();
  await page.waitForTimeout(250);
  const companionText = await page.locator('body').innerText();
  mustIncludeFolded(companionText, 'Phone Companion', 'Companion mode heading');
  mustInclude(companionText, 'Pocket race desk', 'Companion mode title');
  mustInclude(companionText, 'Race pulse', 'Companion mode live status');
  mustInclude(companionText, 'Quick Proof', 'Companion mode proof card');
  mustInclude(companionText, 'Mark #9 absent', 'Companion mode POV quick action');
  mustInclude(companionText, 'Record live #9 verified', 'Companion mode POV verified action');
  mustInclude(companionText, 'Record official audio', 'Companion mode official audio action');
  mustInclude(companionText, 'Record Bryce radio', 'Companion mode Bryce radio action');
  mustInclude(companionText, 'Compact Season', 'Companion mode compact history');
  mustInclude(companionText, 'Track-form lens', 'Companion mode season lens');
  mustInclude(companionText, 'Room Checks', 'Companion mode readiness');
  mustInclude(companionText, 'Open Sources proof console', 'Companion mode Sources handoff');
  mustInclude(companionText, 'Open Race Ops', 'Companion mode Ops handoff');
  await page.screenshot({ path: join(screenshotDir, 'qa-companion-phone.png'), fullPage: true });

  const companionProof = page.locator('.companion-proof-card');
  await companionProof.locator('button', { hasText: 'Mark #9 absent' }).click();
  await page.waitForTimeout(150);
  mustInclude(await companionProof.innerText(), '#9 absent in official selector', 'Companion mode POV absent quick log');
  await companionProof.locator('button', { hasText: 'Record live #9 verified' }).click();
  await page.waitForTimeout(150);
  mustInclude(await companionProof.innerText(), 'Live #9 POV verified', 'Companion mode POV verified quick log');
  await companionProof.locator('button', { hasText: 'Record official audio' }).click();
  await page.waitForTimeout(150);
  mustInclude(await companionProof.innerText(), 'Official race audio active', 'Companion mode official audio quick log');
  await resetApiProofState();
  await page.evaluate(() => {
    window.localStorage.removeItem('brycecast:pov-state:v1');
    window.localStorage.removeItem('brycecast:audio-state:v1');
  });
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.locator('button', { hasText: 'Sources' }).click();
  await page.waitForTimeout(250);
  const sourcesText = await page.locator('body').innerText();
  mustIncludeFolded(sourcesText, 'Race-Day Readiness', 'Sources mode readiness panel');
  mustInclude(sourcesText, 'POV and isolated radio remain proof-gated', 'Sources mode readiness gate policy');
  mustIncludeFolded(sourcesText, 'Bryce identity', 'Sources mode readiness identity');
  mustIncludeFolded(sourcesText, 'Live POV gate', 'Sources mode readiness POV row');
  mustIncludeFolded(sourcesText, 'Audio gate', 'Sources mode readiness audio row');
  mustInclude(sourcesText, 'LIVE #9 POV GATE', 'Sources mode');
  mustInclude(sourcesText, 'Acceptance failing', 'Sources mode');
  mustInclude(sourcesText, 'Live #9 during actual race', 'Sources mode POV definition');
  mustInclude(sourcesText, 'Feed opens during the actual live race', 'Sources mode proof checklist');
  mustInclude(sourcesText, 'Delayed AiM, INDYCAR LIVE replay, highlights, and broadcast cutaways', 'Sources mode');
  mustInclude(sourcesText, 'AUDIO / RADIO GATE', 'Sources mode audio gate');
  mustInclude(sourcesText, 'BRYCE ISOLATED RADIO', 'Sources mode audio lane');
  mustInclude(sourcesText, 'OFFICIAL RACE AUDIO', 'Sources mode official audio lane');
  mustInclude(sourcesText, 'FREQUENCY FALLBACK', 'Sources mode frequency lane');
  mustInclude(sourcesText, 'Frequency metadata does not create a no-hardware audio stream', 'Sources mode audio boundary');
  mustInclude(sourcesText, 'POV ACCESS WAR ROOM', 'Sources mode access panel');
  mustInclude(sourcesText, 'INDYCAR App selector', 'Sources mode app lane');
  mustInclude(sourcesText, 'INDYCAR, FOX, IMS Productions', 'Sources mode rights lane');
  mustInclude(sourcesText, 'Delayed replay lane', 'Sources mode replay boundary');
  mustInclude(sourcesText, 'Staylive Onboards Monitor', 'Sources mode catalog monitor');
  mustInclude(sourcesText, 'Catalog monitor evidence required during live windows', 'Sources mode catalog monitor evidence copy');
  mustInclude(sourcesText, 'DATA CAPTURE', 'Sources mode');
  mustInclude(sourcesText, 'The local race logger preserves Race Control', 'Sources mode data capture copy');
  mustInclude(sourcesText, 'checked ', 'Sources mode source freshness');
  mustInclude(sourcesText, 'bytes', 'Sources mode source probe bytes');
  mustInclude(sourcesText, 'SESSION ROUTE', 'Sources mode');
  mustInclude(sourcesText, 'PRIMARY VIDEO', 'Sources mode');
  mustInclude(sourcesText, 'OFFICIAL AUDIO', 'Sources mode');
  if (sessionRoute.audioNames.length > 0) {
    sessionRoute.audioNames.forEach((name) => mustIncludeFolded(sourcesText, name, 'Sources mode audio route'));
  } else {
    mustInclude(sourcesText, 'No audio network listed', 'Sources mode audio route empty state');
  }
  mustInclude(sourcesText, 'INTERNATIONAL OR DELAY-RISK', 'Sources mode');
  sessionRoute.internationalNames.forEach((name) => mustIncludeFolded(sourcesText, name, 'Sources mode international route'));
  await page.screenshot({ path: join(screenshotDir, 'qa-sources-pov.png'), fullPage: true });

  const povVerifier = page.locator('.pov-verifier').filter({ hasText: 'Live #9 POV Gate' });
  await povVerifier.locator('select').first().selectOption('available');
  await povVerifier.locator('input[placeholder="2026-06-20 11:36 CT"]').fill('2026-06-20 11:36 CT');
  await povVerifier.locator('input[placeholder="#9 Bryce Aron"]').fill('#9 Bryce Aron');
  await povVerifier.locator('input[placeholder="screenshot filename or note"]').fill('qa-proof-selector.png');
  await povVerifier.locator('textarea').fill('QA mutation: all live proof criteria are complete in this temporary browser context.');
  await povVerifier.locator('input[type="number"]').fill('60');
  const boxes = await povVerifier.locator('.proof-list.editable input[type="checkbox"]').all();
  for (const box of boxes) {
    await box.check();
  }
  await page.waitForTimeout(250);
  const verifiedText = await povVerifier.innerText();
  mustInclude(verifiedText, 'Live #9 POV verified', 'Sources mode proof mutation');
  mustInclude(verifiedText, '2026-06-20 11:36 CT', 'Sources mode proof timestamp');

  const audioVerifier = page.locator('.audio-verifier');
  await audioVerifier.locator('select').first().selectOption('bryce_radio_available');
  await audioVerifier.locator('select').nth(1).selectOption('INDYCAR App');
  await audioVerifier.locator('input[placeholder="2026-06-20 11:36 CT"]').fill('2026-06-20 11:40 CT');
  await audioVerifier.locator('input[placeholder="#9 Bryce radio or INDYCAR Radio"]').fill('#9 Bryce Aron radio');
  await audioVerifier.locator('input[placeholder="audio-selector-screenshot.png"]').fill('qa-audio-selector.png');
  await audioVerifier.locator('input[type="number"]').fill('60');
  const audioBoxes = await audioVerifier.locator('.proof-list.editable input[type="checkbox"]').all();
  for (const box of audioBoxes) {
    await box.check();
  }
  await page.waitForTimeout(250);
  const audioVerifiedText = await audioVerifier.innerText();
  mustInclude(audioVerifiedText, 'Bryce radio verified', 'Sources mode audio proof mutation');
  mustInclude(audioVerifiedText, 'Bryce radio proof passing', 'Sources mode audio proof status');
  await page.screenshot({ path: join(screenshotDir, 'qa-sources-proof-passing.png'), fullPage: true });

  await page.locator('button', { hasText: 'Race Ops' }).click();
  await page.waitForTimeout(250);
  const opsText = await page.locator('body').innerText();
  mustInclude(opsText, 'Live #9 POV verified', 'Race Ops');
  mustInclude(opsText, 'Road America', 'Race Ops');
  mustInclude(opsText, '60-second live proof', 'Race Ops');
  mustInclude(opsText, 'actual race', 'Race Ops live race gate');
  mustInclude(opsText, 'Monitor onboard catalog', 'Race Ops catalog monitor');
  mustInclude(opsText, 'AUDIO PROOF', 'Race Ops audio proof');
  mustInclude(opsText, 'Bryce radio verified', 'Race Ops audio verified');
  mustInclude(opsText, 'Start race logger', 'Race Ops');
  mustIncludeFolded(opsText, `Open ${sessionRoute.primaryVideo}`, 'Race Ops session route');
  await page.screenshot({ path: join(screenshotDir, 'qa-ops-proof-passing.png'), fullPage: true });

  await resetApiProofState();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('button', { hasText: 'Race Ops' }).click();
  await page.waitForTimeout(250);
  const resetOpsText = await page.locator('body').innerText();
  mustInclude(resetOpsText, 'Live #9 POV unproven', 'Race Ops reset POV state');
  mustInclude(resetOpsText, 'Frequency only', 'Race Ops reset audio state');
  mustInclude(resetOpsText, 'Published frequency metadata is useful, but it is not a no-hardware audio stream.', 'Race Ops reset audio detail');
  await page.screenshot({ path: join(screenshotDir, 'qa-ops-pov.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('button', { hasText: 'Sources' }).click();
  await page.waitForTimeout(250);
  const mobile = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    formColumns: getComputedStyle(document.querySelector('.pov-form')).gridTemplateColumns
  }));
  if (mobile.scrollWidth > mobile.clientWidth) {
    throw new Error(`Mobile horizontal overflow: ${mobile.scrollWidth} > ${mobile.clientWidth}`);
  }
  await page.screenshot({ path: join(screenshotDir, 'qa-mobile-pov.png'), fullPage: true });

  await page.locator('button', { hasText: 'Phone' }).click();
  await page.waitForTimeout(250);
  const mobileCompanionText = await page.locator('body').innerText();
  mustInclude(mobileCompanionText, 'Pocket race desk', 'Mobile companion title');
  mustInclude(mobileCompanionText, 'Quick Proof', 'Mobile companion proof card');
  mustInclude(mobileCompanionText, 'Compact Season', 'Mobile companion season card');
  const mobileCompanion = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  if (mobileCompanion.scrollWidth > mobileCompanion.clientWidth) {
    throw new Error(`Mobile companion horizontal overflow: ${mobileCompanion.scrollWidth} > ${mobileCompanion.clientWidth}`);
  }
  await page.screenshot({ path: join(screenshotDir, 'qa-mobile-companion.png'), fullPage: true });

  if (expectApi) {
    const paths = requests.map((requestUrl) => new URL(requestUrl).pathname);
    const forbidden = paths.filter(
      (path) => path.startsWith('/racecontrol/') || path.startsWith('/ntt-data/') || ['/data/live-snapshot.json', '/data/onboard-catalog.json', '/data/history-bryce.json'].includes(path)
    );
    if (forbidden.length > 0) {
      throw new Error(`API mode made forbidden browser data requests: ${[...new Set(forbidden)].join(', ')}`);
    }
    for (const required of ['/api/snapshot', '/api/race-log/latest', '/api/onboard-catalog', '/api/history/bryce', '/api/replay/bryce']) {
      if (!paths.includes(required)) {
        throw new Error(`API mode missing browser request ${required}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        screenshots: [
          'qa-tv-pov.png',
          'qa-engineer-replay.png',
          'qa-companion-phone.png',
          'qa-sources-pov.png',
          'qa-sources-proof-passing.png',
          'qa-ops-proof-passing.png',
          'qa-ops-pov.png',
          'qa-mobile-pov.png',
          'qa-mobile-companion.png'
        ],
        consoleIssues,
        mobile,
        mobileCompanion,
        tvRoomFit,
        apiMode: expectApi
      },
      null,
      2
    )
  );
} finally {
  await resetApiProofState().catch((error) => {
    process.stderr.write(`Proof reset after QA failed: ${error instanceof Error ? error.message : String(error)}\n`);
  });
  await browser.close();
}
