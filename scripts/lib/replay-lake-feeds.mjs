import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerReportsLiveSession } from './replay-overlay.mjs';

// Serving adapter for the lake-fed replay feeds produced by
// analysis/replay-feeds/build-replay-feeds.mjs. It exposes the SAME interface as
// the sqlite replay overlay (available / start / stop / status / currentRecord)
// but reads pre-reduced gzipped NDJSON feeds instead of the runner archive, and
// never touches the live sqlite. Every session it lists is source-tiered
// ("RaceTools race-weekend capture" / "third-party normalized (Timing71)" /
// "Race Control capture") so the Live page's trust rail can never confuse a
// lake replay with a live feed. Source gaps withheld by the reducer stay gaps at
// request time: this adapter never carries an old row across one indefinitely.

const SPEEDS = new Set([1, 2, 4, 16]);
const MIN_WATCHABLE_SAMPLES = 120; // mirrors replay-overlay.mjs

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultManifestPath = resolve(__dirname, '..', '..', 'analysis', 'replay-feeds', 'output', 'replay-feeds-manifest.json');

const parseTime = (value) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

export const createLakeReplayFeeds = ({
  enabled = false,
  manifestPath = process.env.BRYCECAST_REPLAY_FEEDS_MANIFEST ?? defaultManifestPath,
  runnerStatusPath,
  now = () => Date.now(),
  guardTtlMs = Number(process.env.BRYCECAST_REPLAY_GUARD_TTL_MS ?? 1000),
  rowsCacheMaxSessions = Number(process.env.BRYCECAST_REPLAY_ROWS_CACHE_SESSIONS ?? 3)
} = {}) => {
  const feedsDir = manifestPath ? join(dirname(manifestPath), 'feeds') : null;
  let manifest = null;
  let sessionIndex = new Map(); // sessionKey -> manifest session entry
  let loaded = false;

  let playback = null; // { sessionKey, speed, t0Ms, startedAtRealMs, firstCheckedAt, lastCheckedAt, lastCheckedAtMs, rows }
  let runnerStatusGuard = null;
  let liveGuardTrip = null;

  const load = () => {
    if (loaded) return;
    loaded = true;
    if (!enabled || !manifestPath || !existsSync(manifestPath)) return;
    manifest = readJson(manifestPath);
    if (!manifest || !Array.isArray(manifest.sessions)) return;
    sessionIndex = new Map(manifest.sessions.map((s) => [s.sessionKey, s]));
  };

  const runnerReportsLiveNow = () => {
    const nowMs = now();
    if (runnerStatusGuard && nowMs - runnerStatusGuard.checkedAtMs < guardTtlMs) return runnerStatusGuard.live;
    const live = runnerReportsLiveSession(readJson(runnerStatusPath));
    runnerStatusGuard = { checkedAtMs: nowMs, live };
    return live;
  };

  const enforceRunnerLiveGuard = () => {
    if (!playback) return false;
    if (!runnerReportsLiveNow()) return false;
    liveGuardTrip = {
      at: new Date(now()).toISOString(),
      reason: 'Replay ended — a live session is on. Serving the real Race Control feed.'
    };
    playback = null;
    return true;
  };

  /** Whether this adapter owns the given replay session key. */
  const has = (sessionKey) => {
    load();
    return sessionIndex.has(sessionKey);
  };

  /** Session entries in the sqlite overlay's shape, plus source-tier fields. */
  const sessions = () => {
    load();
    if (!manifest) return [];
    return manifest.sessions.map((s) => ({
      sessionKey: s.sessionKey,
      eventId: s.validation?.eventId ?? null,
      eventSessionId: s.eventSessionId ?? null,
      canonicalSessionId: s.canonicalSessionId,
      eventName: s.eventName ?? null,
      sessionName: s.sessionName ?? 'Race',
      seasonYear: s.seasonYear ?? null,
      isRace: true,
      samples: s.samples ?? 0,
      bryceSamples: s.bryceSamples ?? 0,
      firstCheckedAt: s.firstCheckedAt ?? null,
      lastCheckedAt: s.lastCheckedAt ?? null,
      firstGreenAt: s.firstGreenAt ?? null,
      durationSeconds: s.durationSeconds ?? null,
      totalLaps: s.totalLaps ?? null,
      watchable: Boolean(s.watchable),
      sourceTier: s.sourceTier,
      tierLabel: s.tierLabel,
      observationBasis: s.observationBasis ?? null,
      replayInterpolated: Boolean(s.replayInterpolated),
      noGps: s.noGps !== false,
      interpolationCoverage: s.interpolationCoverage ?? null,
      // Surfaced honestly so the UI can carry the as-raced caveat at the checker.
      asRaced: s.validation?.asRacedVsCanonical === 'match' ? null : (s.verdict ?? 'as-raced')
    }));
  };

  const available = () => {
    load();
    if (!enabled) return [];
    return sessions();
  };

  const loadRows = (session) => {
    const path = session.feedArtifact
      ? resolve(dirname(manifestPath), session.feedArtifact)
      : join(feedsDir, `${session.canonicalSessionId}.ndjson.gz`);
    const text = gunzipSync(readFileSync(path)).toString('utf8').trim();
    const rows = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      const row = JSON.parse(line);
      rows.push({ ms: parseTime(row.checkedAt), checkedAt: row.checkedAt, summary: row.summary, raw: row.raw });
    }
    rows.sort((a, b) => a.ms - b.ms);
    return rows;
  };

  // Parsed direct-capture feeds can be tens of MB each, so retaining every race
  // visited can exhaust a small deployment host. Keep only the most recently
  // used sessions; three avoids re-parsing normal page navigation while putting
  // a hard bound on lifetime growth. A positive option/env override is useful
  // for differently sized hosts.
  const cacheLimit = Number.isFinite(rowsCacheMaxSessions) && rowsCacheMaxSessions >= 1
    ? Math.floor(rowsCacheMaxSessions)
    : 3;
  const rowsCache = new Map();
  const rowsFor = (session) => {
    const cached = rowsCache.get(session.sessionKey);
    if (cached) {
      rowsCache.delete(session.sessionKey);
      rowsCache.set(session.sessionKey, cached);
      return cached;
    }
    const rows = loadRows(session);
    rowsCache.set(session.sessionKey, rows);
    while (rowsCache.size > cacheLimit) {
      rowsCache.delete(rowsCache.keys().next().value);
    }
    return rows;
  };
  const cacheInfo = () => ({
    maxSessions: cacheLimit,
    size: rowsCache.size,
    sessionKeys: [...rowsCache.keys()]
  });

  /** Read-only accessor: the full chronologically-sorted rows for a session
   *  (`[{ ms, checkedAt, summary, raw }]`, or `[]` if unknown), from the same
   *  per-session cache the replay path uses. Lets the running-order history
   *  endpoint (Brief O) build its rank-change breakpoints for the 40 lake-fed
   *  replays the sqlite archive never held — without re-gunzipping per request. */
  const seriesRowsFor = (sessionKey) => {
    load();
    const selected = sessionIndex.get(sessionKey);
    return selected ? rowsFor(selected) : [];
  };

  /** Binary search: index of the last row at or before `virtualMs`. */
  const rowIndexAt = (rows, virtualMs) => {
    let lo = 0;
    let hi = rows.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].ms <= virtualMs) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx;
  };

  /** Resolve a manifest-declared withheld interval. The reducer emits rows for
   * the bounded step-hold (normally five seconds), then emits no rows until the
   * next real observation. This check prevents the runtime binary search from
   * defeating that policy by returning the last emitted row for the whole gap. */
  const sourceGapAt = (session, requestedMs) => {
    if (!Number.isFinite(requestedMs)) return null;
    const coverage = session?.interpolationCoverage ?? null;
    const maximumHoldSeconds = Number(coverage?.maximumHoldSeconds);
    for (const declared of coverage?.sourceGaps ?? []) {
      const lastObservedMs = parseTime(declared.lastObservedAt);
      const nextObservedMs = parseTime(declared.nextObservedAt);
      const holdSeconds = Number.isFinite(Number(declared.withheldAfterSeconds))
        ? Number(declared.withheldAfterSeconds)
        : (Number.isFinite(maximumHoldSeconds) ? maximumHoldSeconds : 0);
      const heldThroughMs = lastObservedMs === null ? null : lastObservedMs + Math.max(0, holdSeconds) * 1000;
      if (heldThroughMs === null || nextObservedMs === null) continue;
      if (requestedMs <= heldThroughMs || requestedMs >= nextObservedMs) continue;
      const requestedAt = new Date(requestedMs).toISOString();
      const nextObservedAt = new Date(nextObservedMs).toISOString();
      return {
        code: 'source_gap',
        sessionKey: session.sessionKey,
        requestedAt,
        lastObservedAt: new Date(lastObservedMs).toISOString(),
        heldThroughAt: new Date(heldThroughMs).toISOString(),
        nextObservedAt,
        resumeAt: nextObservedAt,
        sourceGapSeconds: Number(declared.sourceGapSeconds) || Math.round((nextObservedMs - lastObservedMs) / 1000),
        maximumHoldSeconds: Math.max(0, holdSeconds),
        message: `No source observation covers ${requestedAt}; replay resumes at ${nextObservedAt}.`
      };
    }
    return null;
  };

  /** Stateless, per-request row resolve — the per-client replay path. Mirrors
   *  the sqlite overlay's `recordAt`: owns no global playback, so concurrent
   *  clients at different `rt` values never interfere. Watchable gating and the
   *  live-guard run in the router before this is called. */
  const recordAt = ({ session, rt, speed = 1 }) => {
    load();
    if (!enabled) return null;
    const selected = sessionIndex.get(session);
    if (!selected) return null;
    const requestedMs = parseTime(rt);
    if (requestedMs === null) return { outOfRange: true };
    const numericSpeed = SPEEDS.has(Number(speed)) ? Number(speed) : 1;
    const rows = rowsFor(selected);
    if (!rows.length) return { outOfRange: true };
    if (requestedMs < rows[0].ms || requestedMs > rows[rows.length - 1].ms) return { outOfRange: true };
    const sourceGap = sourceGapAt(selected, requestedMs);
    if (sourceGap) return { sourceGap };
    const idx = rowIndexAt(rows, requestedMs);
    if (idx < 0) return { outOfRange: true };
    const row = rows[idx];
    const sourceLagVirtualMs = row.ms !== null ? Math.max(0, requestedMs - row.ms) : 0;
    return {
      record: {
        id: idx,
        archiveCheckedAt: row.checkedAt,
        sessionKey: session,
        summary: row.summary ?? null,
        raw: row.raw ?? null,
        checkedAt: new Date(now() - sourceLagVirtualMs / numericSpeed).toISOString(),
        replay: {
          active: true,
          mode: 'per_request',
          source: 'lake_feeds',
          sessionKey: session,
          sourceTier: selected.sourceTier,
          tierLabel: selected.tierLabel,
          speed: numericSpeed,
          virtualNow: new Date(requestedMs).toISOString()
        }
      }
    };
  };

  const controlState = () => {
    load();
    if (!enabled) return { enabled: false, active: false };
    if (!playback) {
      return {
        enabled: true,
        active: false,
        ...(liveGuardTrip ? { stoppedByLive: true, stoppedByLiveAt: liveGuardTrip.at, reason: liveGuardTrip.reason } : {}),
        source: 'lake_feeds'
      };
    }
    const elapsedRealMs = Math.max(0, now() - playback.startedAtRealMs);
    const virtualNowMs = playback.t0Ms + elapsedRealMs * playback.speed;
    const sourceGap = sourceGapAt(playback.session, virtualNowMs);
    return {
      enabled: true,
      active: true,
      source: 'lake_feeds',
      sessionKey: playback.sessionKey,
      sourceTier: playback.sourceTier,
      tierLabel: playback.tierLabel,
      speed: playback.speed,
      t0: new Date(playback.t0Ms).toISOString(),
      virtualNow: new Date(virtualNowMs).toISOString(),
      firstCheckedAt: playback.firstCheckedAt,
      lastCheckedAt: playback.lastCheckedAt,
      complete: virtualNowMs >= playback.lastCheckedAtMs,
      ...(sourceGap ? { sourceGap } : {})
    };
  };

  const start = ({ session, t0, speed = 1 }) => {
    load();
    if (!enabled) throw Object.assign(new Error('Replay mode is disabled.'), { statusCode: 404 });
    if (runnerReportsLiveSession(readJson(runnerStatusPath))) {
      throw Object.assign(new Error('Replay refused: the real live runner reports an active session.'), { statusCode: 409 });
    }
    runnerStatusGuard = { checkedAtMs: now(), live: false };
    liveGuardTrip = null;

    const numericSpeed = Number(speed);
    if (!SPEEDS.has(numericSpeed)) {
      throw Object.assign(new Error('Replay speed must be 1, 2, or 4.'), { statusCode: 400 });
    }
    const selected = sessionIndex.get(session);
    if (!selected) throw Object.assign(new Error(`Replay session ${session ?? '(missing)'} was not found.`), { statusCode: 404 });
    if (!selected.watchable) {
      throw Object.assign(
        new Error(`Replay refused: ${session} is not a watchable lake replay (${selected.excludeReason ?? 'fails the watchable criteria'}).`),
        { statusCode: 422 }
      );
    }
    const firstMs = parseTime(selected.firstCheckedAt);
    const lastMs = parseTime(selected.lastCheckedAt);
    const requestedMs = t0 ? parseTime(t0) : firstMs;
    if (firstMs === null || lastMs === null || requestedMs === null) {
      throw Object.assign(new Error('Replay timestamps are invalid.'), { statusCode: 400 });
    }
    if (requestedMs < firstMs || requestedMs > lastMs) {
      throw Object.assign(
        new Error(`Replay t0 must fall between ${selected.firstCheckedAt} and ${selected.lastCheckedAt}.`),
        { statusCode: 400 }
      );
    }
    playback = {
      sessionKey: selected.sessionKey,
      sourceTier: selected.sourceTier,
      tierLabel: selected.tierLabel,
      speed: numericSpeed,
      t0Ms: requestedMs,
      startedAtRealMs: now(),
      firstCheckedAt: selected.firstCheckedAt,
      lastCheckedAt: selected.lastCheckedAt,
      lastCheckedAtMs: lastMs,
      session: selected,
      rows: rowsFor(selected)
    };
    return controlState();
  };

  const stop = () => {
    playback = null;
    liveGuardTrip = null;
    return controlState();
  };

  const currentRecord = () => {
    load();
    if (!enabled || !playback) return null;
    if (enforceRunnerLiveGuard()) return null;
    const state = controlState();
    if (state.sourceGap) return null;
    const virtualMs = parseTime(state.virtualNow);
    const rows = playback.rows;
    const idx = rowIndexAt(rows, virtualMs);
    if (idx < 0) return null;
    const row = rows[idx];
    const sourceLagVirtualMs = row.ms !== null && virtualMs !== null ? Math.max(0, virtualMs - row.ms) : 0;
    return {
      id: idx,
      archiveCheckedAt: row.checkedAt,
      sessionKey: playback.sessionKey,
      summary: row.summary ?? null,
      raw: row.raw ?? null,
      checkedAt: new Date(now() - sourceLagVirtualMs / playback.speed).toISOString(),
      replay: state
    };
  };

  return { enabled, has, available, sessions, seriesRowsFor, cacheInfo, start, stop, status: controlState, currentRecord, recordAt, isActive: () => Boolean(playback) };
};
