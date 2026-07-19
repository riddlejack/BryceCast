import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Playback speeds. The Time Machine UI offers 1×/4×/16×; 2× stays valid for the
// replay test harness and the live:replay convenience. Speed only changes which
// archived row the virtual clock selects — never the payload shape.
const SPEEDS = new Set([1, 2, 4, 16]);

// A capture is "watchable" (worth a race-page module) only when it went green in
// our own capture and carries a real second-by-second span — not a 6-sample
// pre-capture-maturity fragment. The module is silent everywhere else.
const MIN_WATCHABLE_SAMPLES = 120;

const parseTime = (value) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

/** Session names that represent an actual race (Race / Race 1 / Race 2). */
export const isRaceSessionName = (sessionName) => /(^|\s)race(\s+\d+)?\s*$/i.test(String(sessionName ?? '').trim());

/** Race-page routes key on canonical `session_indy_nxt_<seasonYear>_<eventSessionId>`. */
export const canonicalSessionIdFor = (seasonYear, eventSessionId) =>
  seasonYear && eventSessionId ? `session_indy_nxt_${seasonYear}_${eventSessionId}` : null;

const seasonYearFrom = (isoTimestamp) => {
  const ms = parseTime(isoTimestamp);
  return ms === null ? null : new Date(ms).getUTCFullYear();
};

const readJson = (path) => {
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

export const runnerReportsLiveSession = (status) => {
  if (!status || typeof status !== 'object') return false;
  if (String(status.phase ?? '').toUpperCase() === 'LIVE') return true;
  const sourceState = String(status.latestBryce?.sourceState ?? '').toLowerCase();
  const flag = String(status.latestBryce?.flag ?? '').toUpperCase();
  return sourceState === 'live' && ['GREEN', 'YELLOW', 'CAUTION', 'RED'].includes(flag);
};

const parseSnapshot = (row) => {
  if (!row?.payload_json) return null;
  const payload = JSON.parse(row.payload_json);
  return {
    id: Number(row.id),
    archiveCheckedAt: row.checked_at,
    sessionKey: row.session_key,
    summary: payload.summary ?? null,
    raw: payload.raw ?? null
  };
};

/** Read-only, request-time overlay over the runner archive. It never mutates
 * SQLite and owns no ingestion process; it only selects the latest archived
 * snapshot at the virtual clock. */
export const createReplayOverlay = ({
  enabled = false,
  sqlitePath,
  runnerStatusPath,
  now = () => Date.now()
} = {}) => {
  let playback = null;
  let availableCache = null;

  const openDb = () => new DatabaseSync(sqlitePath, { readOnly: true });

  const sessions = () => {
    if (!enabled) return [];
    const db = openDb();
    try {
      return db
        .prepare(
          `SELECT session_key AS sessionKey,
                  COUNT(*) AS samples,
                  MIN(checked_at) AS firstCheckedAt,
                  MAX(checked_at) AS lastCheckedAt,
                  MIN(event_name) AS eventName,
                  MIN(session_name) AS sessionName
             FROM race_snapshots
            GROUP BY session_key
            ORDER BY MIN(checked_at) ASC`
        )
        .all()
        .map((row) => ({ ...row, samples: Number(row.samples ?? 0) }));
    } finally {
      db.close();
    }
  };

  /** The captured-race index: which archived sessions exist and which map to a
   *  race page. One ~1s GROUP BY over the archive, cached briefly so live polling
   *  stays cheap while a freshly captured race still appears within the TTL. */
  const available = ({ ttlMs = 30_000 } = {}) => {
    if (!enabled) return { enabled: false, checkedAt: new Date(now()).toISOString(), active: null, sessions: [] };
    if (availableCache && now() - availableCache.computedAtMs < ttlMs) {
      return { ...availableCache.value, active: playback?.sessionKey ?? null };
    }
    let rows = [];
    let error = null;
    try {
      const db = openDb();
      try {
        rows = db
          .prepare(
            `SELECT session_key AS sessionKey,
                    COUNT(*) AS samples,
                    MIN(checked_at) AS firstCheckedAt,
                    MAX(checked_at) AS lastCheckedAt,
                    MIN(event_id) AS eventId,
                    MIN(event_session_id) AS eventSessionId,
                    MIN(event_name) AS eventName,
                    MIN(session_name) AS sessionName,
                    MAX(total_laps) AS totalLaps,
                    MIN(CASE WHEN UPPER(flag) = 'GREEN' THEN checked_at END) AS firstGreenAt
               FROM race_snapshots
              GROUP BY session_key`
          )
          .all();
      } finally {
        db.close();
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const sessionsList = rows
      .map((row) => {
        const samples = Number(row.samples ?? 0);
        const eventSessionId = row.eventSessionId ? String(row.eventSessionId) : null;
        const seasonYear = seasonYearFrom(row.firstCheckedAt);
        const firstMs = parseTime(row.firstCheckedAt);
        const lastMs = parseTime(row.lastCheckedAt);
        const totalLaps = Number.parseInt(row.totalLaps ?? '', 10);
        const isRace = isRaceSessionName(row.sessionName);
        return {
          sessionKey: row.sessionKey,
          eventId: row.eventId ? String(row.eventId) : null,
          eventSessionId,
          canonicalSessionId: isRace ? canonicalSessionIdFor(seasonYear, eventSessionId) : null,
          eventName: row.eventName || null,
          sessionName: row.sessionName || null,
          seasonYear,
          isRace,
          samples,
          firstCheckedAt: row.firstCheckedAt ?? null,
          lastCheckedAt: row.lastCheckedAt ?? null,
          firstGreenAt: row.firstGreenAt ?? null,
          durationSeconds: firstMs !== null && lastMs !== null ? Math.round((lastMs - firstMs) / 1000) : null,
          totalLaps: Number.isFinite(totalLaps) ? totalLaps : null,
          watchable: isRace && Boolean(row.firstGreenAt) && samples >= MIN_WATCHABLE_SAMPLES && Boolean(eventSessionId)
        };
      })
      .sort((left, right) => (parseTime(right.firstCheckedAt) ?? 0) - (parseTime(left.firstCheckedAt) ?? 0));
    const value = { enabled: true, checkedAt: new Date(now()).toISOString(), sessions: sessionsList, ...(error ? { error } : {}) };
    availableCache = { computedAtMs: now(), value };
    return { ...value, active: playback?.sessionKey ?? null };
  };

  const controlState = () => {
    if (!enabled) return { enabled: false, active: false };
    if (!playback) return { enabled: true, active: false, sqlitePath, sessions: sessions() };
    const elapsedRealMs = Math.max(0, now() - playback.startedAtRealMs);
    const virtualNowMs = playback.t0Ms + elapsedRealMs * playback.speed;
    return {
      enabled: true,
      active: true,
      sessionKey: playback.sessionKey,
      speed: playback.speed,
      t0: new Date(playback.t0Ms).toISOString(),
      virtualNow: new Date(virtualNowMs).toISOString(),
      firstCheckedAt: playback.firstCheckedAt,
      lastCheckedAt: playback.lastCheckedAt,
      complete: virtualNowMs >= playback.lastCheckedAtMs,
      sqlitePath
    };
  };

  const start = ({ session, t0, speed = 1 }) => {
    if (!enabled) throw Object.assign(new Error('Replay mode is disabled. Set BRYCECAST_REPLAY=1 for this debug-only route.'), { statusCode: 404 });
    const runnerStatus = readJson(runnerStatusPath);
    if (runnerReportsLiveSession(runnerStatus)) {
      throw Object.assign(new Error('Replay refused: the real live runner reports an active session.'), { statusCode: 409 });
    }

    const numericSpeed = Number(speed);
    if (!SPEEDS.has(numericSpeed)) {
      throw Object.assign(new Error('Replay speed must be 1, 2, or 4.'), { statusCode: 400 });
    }
    const selected = sessions().find((candidate) => candidate.sessionKey === session);
    if (!selected) throw Object.assign(new Error(`Replay session ${session ?? '(missing)'} was not found.`), { statusCode: 404 });
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
      speed: numericSpeed,
      t0Ms: requestedMs,
      startedAtRealMs: now(),
      firstCheckedAt: selected.firstCheckedAt,
      lastCheckedAt: selected.lastCheckedAt,
      lastCheckedAtMs: lastMs
    };
    return controlState();
  };

  const stop = () => {
    playback = null;
    return controlState();
  };

  const currentRecord = () => {
    if (!enabled || !playback) return null;
    const state = controlState();
    const db = openDb();
    try {
      const row = db
        .prepare(
          `SELECT id, checked_at, session_key, payload_json
             FROM race_snapshots
            WHERE session_key = ? AND checked_at <= ?
            ORDER BY checked_at DESC
            LIMIT 1`
        )
        .get(playback.sessionKey, state.virtualNow);
      const parsed = parseSnapshot(row);
      if (!parsed) return null;
      const archiveMs = parseTime(parsed.archiveCheckedAt);
      const virtualMs = parseTime(state.virtualNow);
      const sourceLagVirtualMs = archiveMs !== null && virtualMs !== null ? Math.max(0, virtualMs - archiveMs) : 0;
      return {
        ...parsed,
        // Shift archive age into the current wall clock. Payload values and
        // object shapes stay live-compatible; freshness reducers see the same
        // sub-second cadence they would during a real session.
        checkedAt: new Date(now() - sourceLagVirtualMs / playback.speed).toISOString(),
        replay: state
      };
    } finally {
      db.close();
    }
  };

  return { enabled, sessions, available, start, stop, status: controlState, currentRecord };
};

