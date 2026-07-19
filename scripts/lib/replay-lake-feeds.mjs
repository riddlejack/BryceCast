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
// ("RaceTools race-weekend capture" / "third-party normalized (Timing71)") so the
// Live page's trust rail can never confuse a lake replay with our own capture.

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
  guardTtlMs = Number(process.env.BRYCECAST_REPLAY_GUARD_TTL_MS ?? 1000)
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
    const path = join(feedsDir, `${session.canonicalSessionId}.ndjson.gz`);
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
      complete: virtualNowMs >= playback.lastCheckedAtMs
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
      rows: loadRows(selected)
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
    const virtualMs = parseTime(state.virtualNow);
    const rows = playback.rows;
    // Binary search: last row at or before the virtual clock.
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
    if (idx < 0) idx = 0;
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

  return { enabled, has, available, sessions, start, stop, status: controlState, currentRecord, isActive: () => Boolean(playback) };
};
