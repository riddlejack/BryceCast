#!/usr/bin/env node

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const packagePath = join(projectRoot, 'analysis', 'ui-data-package', 'ui-data-package.json');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const uiPackage = readJson(packagePath);
const dataAsOf = String(uiPackage.asOfDate ?? 'unknown');
const packageGeneratedAt = String(uiPackage.generatedAt ?? `${dataAsOf}T00:00:00.000Z`);
const fixture = uiPackage.screens?.liveCompanionFixtures?.fixtures?.find(
  (candidate) => candidate.state === 'pre_session' && (candidate.variant ?? 'base') === 'base'
);

if (!fixture) {
  throw new Error(`No base pre_session fixture found in ${packagePath}`);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const unavailableReason = 'Historical portfolio snapshot. Live capture and source polling are disabled.';

const buildReadiness = () => {
  const payload = clone(fixture);
  payload.checkedAt = packageGeneratedAt;
  payload.demo = true;
  payload.state = 'pre_session';
  payload.severity = 'amber';
  payload.reason = unavailableReason;
  payload.dataAsOf = dataAsOf;

  payload.raceWeekend = {
    ...payload.raceWeekend,
    checkedAt: packageGeneratedAt,
    eventId: null,
    eventSessionId: null,
    eventName: null,
    sessionName: null,
    sessionType: null,
    sessionStatus: 'Unavailable in historical demo',
    trackName: null,
    trackType: null,
    trackLength: null,
    flag: 'COLD',
    lap: 0,
    totalLaps: null,
    startsAt: null,
    estimatedGreenFlag: null,
    endsAt: null,
    broadcastRoute: { source: 'disabled_in_demo', alternates: [], audio: [], international: [] },
    sourceState: 'cold',
    readiness: 'pre_session'
  };

  const heartbeat = {
    eventName: null,
    eventId: null,
    eventSessionId: null,
    sessionName: null,
    sessionType: null,
    sessionStatus: 'Unavailable in historical demo',
    series: null,
    flag: 'COLD',
    lap: 0,
    totalLaps: null,
    trackName: null,
    trackType: null
  };

  payload.liveTiming = {
    checkedAt: packageGeneratedAt,
    sourceState: 'cold',
    rowCount: 0,
    bryceNo: null,
    heartbeat,
    rows: [],
    warnings: [unavailableReason]
  };

  payload.bryce = {
    checkedAt: packageGeneratedAt,
    sourceState: 'cold',
    readiness: 'pre_session',
    heartbeat,
    bryce: null,
    profile: payload.bryce?.profile ?? null,
    identityGuard: {
      carNumber: payload.bryce?.identityGuard?.carNumber ?? null,
      rcDriverId: payload.bryce?.identityGuard?.rcDriverId ?? null,
      matchedBy: null,
      seriesOk: false
    },
    broadcastRoute: { source: 'disabled_in_demo', alternates: [], audio: [], international: [] },
    warnings: [unavailableReason]
  };

  payload.points = {
    ...payload.points,
    checkedAt: packageGeneratedAt,
    mode: 'historical_fallback',
    source: 'published_derived_package',
    label: `Historical package baseline · data as of ${dataAsOf}`,
    bryce: {
      ...payload.points?.bryce,
      runningDriverPoints: null,
      totalDriverPoints: null,
      totalEntrantPoints: null
    },
    fieldCoverage: {
      rows: 0,
      runningDriverPointsRows: 0,
      totalDriverPointsRows: 0,
      totalEntrantPointsRows: 0
    },
    officialModelAvailable: false,
    reconciliationRequired: false,
    warnings: [unavailableReason]
  };

  payload.weather = {
    schemaVersion: 'live-weather.v1',
    checkedAt: packageGeneratedAt,
    available: false,
    sourceState: 'unavailable',
    source: 'disabled_in_historical_demo',
    track: null,
    point: null,
    grid: null,
    station: null,
    observation: null,
    forecastHourly: [],
    forecast: [],
    alerts: [],
    probes: [],
    cache: { status: 'disabled', ttlSeconds: null },
    warnings: [unavailableReason]
  };

  payload.replay = {
    available: false,
    generatedAt: packageGeneratedAt,
    archiveState: 'withheld_permission_pending',
    count: 0,
    returned: 0,
    selectedCount: 0,
    sessionKey: null,
    sessions: [],
    summary: null,
    rows: [],
    warnings: ['Timing replay data is withheld pending source redistribution permission.']
  };

  payload.sources = {
    checkedAt: packageGeneratedAt,
    endpoints: (Array.isArray(payload.sources?.endpoints) ? payload.sources.endpoints : []).map((endpoint) => ({
      ...endpoint,
      ok: false,
      status: null,
      sourceState: 'unavailable',
      readinessState: 'unavailable',
      checkedAgeSeconds: null,
      modifiedAgeSeconds: null,
      freshnessLabel: 'disabled in historical demo',
      sourceSummary: {},
      note: unavailableReason
    })),
    local: payload.sources?.local ?? {}
  };

  payload.gates = (Array.isArray(payload.gates) ? payload.gates : []).map((gate) => ({
    ...gate,
    state: 'warn',
    summary: unavailableReason
  }));

  return payload;
};

const readiness = buildReadiness();
const unavailableWeather = {
  schemaVersion: 'live-weather.v1',
  checkedAt: packageGeneratedAt,
  available: false,
  sourceState: 'unavailable',
  source: 'disabled_in_historical_demo',
  observation: null,
  forecastHourly: [],
  forecast: [],
  alerts: [],
  warnings: [unavailableReason],
  dataAsOf
};

const historyPath = join(distRoot, 'data', 'history-bryce.json');
const history = statSync(historyPath).isFile() ? readJson(historyPath) : null;

const parsePort = (argv) => {
  let port = DEFAULT_PORT;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argument === '--port' ? argv[index + 1] : argument.startsWith('--port=') ? argument.slice(7) : null;
    if (value === null) continue;
    if (argument === '--port') index += 1;
    if (!/^\d+$/.test(value)) throw new Error(`Invalid --port value: ${value}`);
    port = Number(value);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid --port value: ${value}`);
  }
  return port;
};

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

const securityHeaders = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
};

const jsonBody = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

const sendBuffer = (request, response, status, body, headers = {}) => {
  response.writeHead(status, {
    ...securityHeaders,
    'content-length': body.length,
    ...headers
  });
  if (request.method === 'HEAD') response.end();
  else response.end(body);
};

const sendJson = (request, response, status, value, headers = {}) =>
  sendBuffer(request, response, status, jsonBody(value), {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    ...headers
  });

const escapeHtml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const injectBanner = (html) => {
  const label = `Historical portfolio snapshot — live capture is disabled — data as of ${dataAsOf}`;
  const style = `<style id="publication-demo-style">#publication-demo-banner{box-sizing:border-box;position:sticky;top:0;z-index:2147483647;width:100%;padding:9px 16px;background:#f7c948;color:#211a00;border-bottom:1px solid #8a6d00;font:600 13px/1.35 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;letter-spacing:.01em}</style>`;
  const banner = `<div id="publication-demo-banner" role="status">${escapeHtml(label)}</div>`;
  return html.replace('</head>', `${style}</head>`).replace(/<body([^>]*)>/, `<body$1>${banner}`);
};

const unsafePath = (rawPathname, decodedPathname) => {
  const loweredRaw = rawPathname.toLowerCase();
  return (
    rawPathname.includes('\\') ||
    decodedPathname.includes('\\') ||
    decodedPathname.includes('\0') ||
    loweredRaw.includes('%00') ||
    /(^|\/)\.\.?($|\/)/.test(decodedPathname) ||
    /%2e|%2f|%5c/i.test(rawPathname)
  );
};

const staticFileFor = (rawPathname) => {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return { error: 'Malformed URL path.' };
  }
  if (unsafePath(rawPathname, pathname)) return { error: 'Unsafe URL path.' };

  const requestPath = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = normalize(requestPath).replace(/^[/\\]+/, '');
  if (isAbsolute(normalizedPath)) return { error: 'Unsafe URL path.' };
  const candidate = resolve(distRoot, normalizedPath);
  const insideDist = candidate === distRoot || (!relative(distRoot, candidate).startsWith(`..${sep}`) && relative(distRoot, candidate) !== '..');
  if (!insideDist) return { error: 'Unsafe URL path.' };

  try {
    if (statSync(candidate).isFile()) return { path: candidate, index: candidate === join(distRoot, 'index.html') };
  } catch {
    // The SPA fallback below handles client routes. Missing static assets remain 404.
  }

  if (!extname(pathname)) return { path: join(distRoot, 'index.html'), index: true };
  return { path: null, index: false };
};

const routeApi = (request, response, pathname) => {
  if (pathname.startsWith('/api/timing-archive/') && pathname.endsWith('/observations')) {
    sendJson(request, response, 403, {
      error: 'permission_pending',
      message: 'Timing observation downloads are withheld pending source redistribution permission.',
      dataAsOf
    });
    return true;
  }

  const routes = new Map([
    ['/api/health', {
      status: 'ok',
      mode: 'historical_portfolio_snapshot',
      liveCapture: false,
      upstreamPolling: false,
      databaseAccess: false,
      dataAsOf
    }],
    ['/api/readiness', readiness],
    ['/api/snapshot', readiness],
    ['/api/session', readiness.raceWeekend],
    ['/api/timing', readiness.liveTiming],
    ['/api/bryce', readiness.bryce],
    ['/api/points', readiness.points],
    ['/api/sources', readiness.sources],
    ['/api/next-session', {
      available: false,
      nextSession: null,
      reason: 'Schedule service is disabled in the historical portfolio snapshot.',
      dataAsOf
    }],
    ['/api/weather/upcoming', {
      schemaVersion: 'upcoming-weather.v1',
      available: false,
      events: [],
      reason: unavailableReason,
      dataAsOf
    }],
    ['/api/weather/live', unavailableWeather],
    ['/api/replay/available', {
      schemaVersion: 'live-replay-available.v1',
      enabled: false,
      checkedAt: packageGeneratedAt,
      active: null,
      sessions: [],
      reason: 'Timing replay data is withheld pending source redistribution permission.',
      dataAsOf
    }],
    ['/api/history/rank-series', {
      schemaVersion: 'live-rank-series.v1',
      available: false,
      mode: 'live',
      sessionKey: null,
      clientSessionKey: null,
      bryceId: null,
      frameCount: 0,
      breakpointCount: 0,
      window: null,
      frames: [],
      dataAsOf
    }],
    ['/api/history/bryce', history ?? { available: false, points: [], dataAsOf }],
    ['/api/race-log/latest', { available: false, reason: unavailableReason, dataAsOf }],
    ['/api/onboard-catalog', { available: false, entries: [], reason: unavailableReason, dataAsOf }],
    ['/api/replay/bryce', { available: false, rows: [], reason: 'Timing replay data is withheld pending source redistribution permission.', dataAsOf }],
    ['/api/pov-proof', { available: false, reason: unavailableReason, dataAsOf }],
    ['/api/audio-proof', { available: false, reason: unavailableReason, dataAsOf }]
  ]);

  const payload = routes.get(pathname);
  if (payload !== undefined) {
    sendJson(request, response, 200, payload);
    return true;
  }
  if (pathname.startsWith('/api/')) {
    sendJson(request, response, 404, {
      error: 'unavailable_in_demo',
      message: 'This API route is not part of the historical portfolio snapshot.',
      dataAsOf
    });
    return true;
  }
  return false;
};

export const createDemoServer = () =>
  createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      sendJson(request, response, 405, { error: 'method_not_allowed', allowed: ['GET', 'HEAD'] }, { allow: 'GET, HEAD' });
      return;
    }

    let url;
    try {
      url = new URL(request.url ?? '/', `http://${HOST}`);
    } catch {
      sendJson(request, response, 400, { error: 'bad_request' });
      return;
    }

    if (routeApi(request, response, url.pathname)) return;

    const target = staticFileFor(url.pathname);
    if (target.error) {
      sendJson(request, response, 400, { error: 'bad_path', message: target.error });
      return;
    }
    if (!target.path) {
      sendJson(request, response, 404, { error: 'not_found' });
      return;
    }

    if (target.index) {
      const body = Buffer.from(injectBanner(readFileSync(target.path, 'utf8')));
      sendBuffer(request, response, 200, body, {
        'cache-control': 'no-store',
        'content-type': 'text/html; charset=utf-8'
      });
      return;
    }

    const stat = statSync(target.path);
    response.writeHead(200, {
      ...securityHeaders,
      'cache-control': target.path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-length': stat.size,
      'content-type': contentTypes.get(extname(target.path).toLowerCase()) ?? 'application/octet-stream'
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(target.path).pipe(response);
  });

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = parsePort(process.argv.slice(2));
  const server = createDemoServer();
  server.on('error', (error) => {
    console.error(`BryceCast historical demo failed: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`BryceCast historical demo listening at http://${HOST}:${actualPort} (data as of ${dataAsOf})`);
  });
  const close = () => server.close(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
