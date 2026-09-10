import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';

import { isBryceTimingRow, isIndyNxtTimingHeartbeat, raceSnapshotEndpoints } from '../live-source-endpoints.mjs';
import {
  buildSummary,
  defaultRoot,
  fetchEndpoint as defaultFetchEndpoint,
  liveStoragePaths,
  pendingEndpointResult,
  snapshotDedupKey,
  sourceState,
  writeStorage
} from './race-poller-core.mjs';

const endpointById = new Map(raceSnapshotEndpoints.map((endpoint) => [endpoint.id, endpoint]));
const scheduleEndpointIds = ['schedule_nxt', 'trackactivity_nxt'];
const enrichmentEndpointIds = ['drivers_nxt', 'config', 'schedule_nxt', 'trackactivity_nxt'];

export const PHASES = {
  IDLE: 'IDLE',
  ARMED: 'ARMED',
  LIVE: 'LIVE',
  COOLDOWN: 'COOLDOWN'
};

export const liveRunnerPaths = (root = defaultRoot) => {
  const storage = liveStoragePaths(root);
  return {
    ...storage,
    rawDir: join(storage.dataDir, 'raw'),
    lockPath: join(storage.dataDir, 'live-runner.lock'),
    statusPath: join(storage.dataDir, 'live-runner-status.json'),
    eventsPath: join(storage.dataDir, 'live-runner-events.jsonl')
  };
};

const iso = (ms = Date.now()) => new Date(ms).toISOString();
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitize = (value) =>
  String(value ?? 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';

export const writeAtomicJson = async (path, payload, { dryRun = false } = {}) => {
  if (dryRun) return;
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(tmpPath, path);
};

const readJsonIfExists = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
};

export const acquireLiveRunnerLock = async ({ lockPath, pid = process.pid, nowMs = Date.now, staleMs = 60_000, dryRun = false }) => {
  if (dryRun) return { acquired: true, takeover: false, dryRun: true };
  await mkdir(dirname(lockPath), { recursive: true });
  const now = nowMs();
  const existing = await readJsonIfExists(lockPath);
  if (existing?.pid) {
    const heartbeatMs = Date.parse(existing.heartbeatAt ?? existing.updatedAt ?? existing.startedAt ?? '');
    const heartbeatAgeMs = Number.isFinite(heartbeatMs) ? now - heartbeatMs : Infinity;
    if (heartbeatAgeMs <= staleMs) {
      throw new Error(`live-runner lock is fresh for pid ${existing.pid}; heartbeat age ${heartbeatAgeMs} ms`);
    }
  }
  await writeAtomicJson(lockPath, { pid, startedAt: iso(now), heartbeatAt: iso(now), staleAfterMs: staleMs });
  return { acquired: true, takeover: Boolean(existing), previous: existing };
};

export const heartbeatLiveRunnerLock = async ({ lockPath, pid = process.pid, nowMs = Date.now, staleMs = 60_000, dryRun = false }) => {
  if (dryRun) return;
  const now = nowMs();
  const current = (await readJsonIfExists(lockPath)) ?? {};
  if (current.pid && Number(current.pid) !== Number(pid)) {
    throw new Error(`live-runner lock ownership changed to pid ${current.pid}`);
  }
  await writeAtomicJson(lockPath, {
    ...current,
    pid,
    startedAt: current.startedAt ?? iso(now),
    heartbeatAt: iso(now),
    staleAfterMs: staleMs
  });
};

export const releaseLiveRunnerLock = async ({ lockPath, pid = process.pid, dryRun = false }) => {
  if (dryRun) return;
  const current = await readJsonIfExists(lockPath);
  if (!current || Number(current.pid) !== Number(pid)) return;
  await rm(lockPath, { force: true });
};

const parseSourceUtcMs = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = Date.parse(withZone);
  return Number.isFinite(parsed) ? parsed : null;
};

const sessionRecord = ({ eventId, eventSessionId, eventName, sessionName, sessionType, startMs, endMs, estimatedGreenMs, source }) => ({
  eventId: eventId ? String(eventId) : null,
  eventSessionId: eventSessionId ? String(eventSessionId) : null,
  name: sessionName || eventName || 'INDY NXT session',
  eventName: eventName || null,
  sessionName: sessionName || null,
  sessionType: sessionType || null,
  startsAt: startMs ? iso(startMs) : null,
  endsAt: endMs ? iso(endMs) : null,
  estimatedGreenFlag: estimatedGreenMs ? iso(estimatedGreenMs) : null,
  startMs,
  endMs,
  estimatedGreenMs,
  source
});

const sessionsFromTrackActivity = (payload) => {
  const records = [];
  for (const event of asArray(payload?.trackactivity?.event)) {
    for (const session of asArray(event?.sessions?.session)) {
      const startMs = parseSourceUtcMs(session.startdatetime ?? session.startDateTime ?? session.start);
      records.push(
        sessionRecord({
          eventId: event.eventid ?? event.EventID,
          eventSessionId: session.sessionid ?? session.EventSessionID,
          eventName: event.eventname ?? event.name,
          sessionName: session.sessionlabel ?? session.name ?? session.sessionname,
          sessionType: session.sessiontype,
          startMs,
          endMs: parseSourceUtcMs(session.enddatetime ?? session.endDateTime ?? session.end),
          estimatedGreenMs: parseSourceUtcMs(session.estimatedgreenflag ?? session.estimatedGreenFlag),
          source: 'trackactivity_nxt'
        })
      );
    }
  }
  return records;
};

const sessionsFromSchedule = (payload) => {
  const records = [];
  for (const race of asArray(payload?.schedule?.race)) {
    const broadcasts = asArray(race?.broadcasts?.broadcast);
    const listing = race?.tv?.listing;
    const candidates = [
      listing?.datetime,
      listing?.start,
      ...broadcasts.map((broadcast) => broadcast.start)
    ].filter(Boolean);
    const startMs = parseSourceUtcMs(candidates[0]);
    records.push(
      sessionRecord({
        eventId: race.eventid ?? race.EventID,
        eventSessionId: race.sessionid ?? null,
        eventName: race.name ?? race.eventname,
        sessionName: listing?.programname ?? broadcasts[0]?.name ?? race.name,
        sessionType: broadcasts[0]?.type ?? null,
        startMs,
        endMs: parseSourceUtcMs(broadcasts[0]?.end),
        estimatedGreenMs: null,
        source: 'schedule_nxt'
      })
    );
  }
  return records;
};

export const extractUpcomingSessions = (results, nowMs = Date.now()) => {
  const sessions = [];
  for (const result of results) {
    if (!result?.ok) continue;
    if (result.id === 'trackactivity_nxt') sessions.push(...sessionsFromTrackActivity(result.payload));
    if (result.id === 'schedule_nxt') sessions.push(...sessionsFromSchedule(result.payload));
  }

  const seen = new Set();
  return sessions
    .filter((session) => session.startMs === null || session.endMs === null || session.endMs >= nowMs - 2 * 60 * 60 * 1000)
    .filter((session) => {
      const key = `${session.eventId ?? ''}:${session.eventSessionId ?? ''}:${session.startsAt ?? ''}:${session.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => (left.startMs ?? Infinity) - (right.startMs ?? Infinity));
};

const nextSessionFromSessions = (sessions, nowMs, currentSession = null) =>
  sessions.find((session) => {
    if (currentSession?.eventSessionId && session.eventSessionId === currentSession.eventSessionId) return false;
    return session.startMs === null || session.startMs >= nowMs - 2 * 60 * 1000;
  }) ?? null;

const isWithinArmWindow = (session, nowMs, armWindowMs) => {
  if (!session) return false;
  if (session.startMs === null) return true;
  return session.startMs - nowMs <= armWindowMs;
};

const sameUtcDay = (leftMs, rightMs) => {
  const left = new Date(leftMs);
  const right = new Date(rightMs);
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth() && left.getUTCDate() === right.getUTCDate();
};

const sessionFromHeartbeat = (heartbeat = null) => {
  if (!heartbeat) return null;
  return sessionRecord({
    eventId: heartbeat.EventID,
    eventSessionId: heartbeat.EventSessionID,
    eventName: heartbeat.eventName,
    sessionName: heartbeat.SessionName,
    sessionType: heartbeat.SessionType,
    startMs: null,
    endMs: null,
    estimatedGreenMs: null,
    source: 'timing'
  });
};

const heartbeatLooksLive = (heartbeat) => {
  if (!heartbeat) return false;
  if (sourceState(heartbeat) !== 'live') return false;
  return isIndyNxtTimingHeartbeat(heartbeat);
};

const runBuffered = (command, args, timeoutMs = 5000) =>
  new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ status: null, signal: null, error: String(error.message || error), stdout: '', stderr: '' });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: null, signal: null, error: String(error.message || error), stdout, stderr });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, signal, error: null, stdout, stderr });
    });
  });

const parseLaunchctlLimit = (text) => {
  const match = text.match(/^\s*\S+\s+(\S+)\s+(\S+)/m);
  if (!match) return null;
  const normalize = (value) => (value === 'unlimited' ? Infinity : Number(value));
  return { soft: normalize(match[1]), hard: normalize(match[2]) };
};

const parseSysctl = (text) => {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(kern\.[^:=\s]+)\s*[:=]\s*(\d+)/);
    if (match) values[match[1]] = Number(match[2]);
  }
  return values;
};

export const collectProcessBudget = async ({ nowMs = Date.now, user = process.env.USER || '' } = {}) => {
  const [launchMaxproc, sysctl, userProcesses, allProcesses] = await Promise.all([
    runBuffered('/bin/launchctl', ['limit', 'maxproc']),
    runBuffered('/usr/sbin/sysctl', ['kern.maxproc', 'kern.maxprocperuid']),
    runBuffered('/bin/ps', ['-u', user, '-o', 'pid=']),
    runBuffered('/bin/ps', ['-axo', 'pid='])
  ]);
  const launch = parseLaunchctlLimit(launchMaxproc.stdout);
  const sysctlValues = parseSysctl(sysctl.stdout);
  const userProcessCount = userProcesses.status === 0 ? userProcesses.stdout.split(/\r?\n/).filter(Boolean).length : null;
  const totalProcessCount = allProcesses.status === 0 ? allProcesses.stdout.split(/\r?\n/).filter(Boolean).length : null;
  const limitCandidates = [launch?.soft, sysctlValues['kern.maxprocperuid']]
    .filter((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const effectiveProcessLimit = limitCandidates.length ? Math.min(...limitCandidates) : null;
  const spareProcessSlots = effectiveProcessLimit !== null && userProcessCount !== null ? effectiveProcessLimit - userProcessCount : null;
  return {
    checkedAt: iso(nowMs()),
    launchctlMaxproc: launch,
    kernMaxproc: sysctlValues['kern.maxproc'] ?? null,
    kernMaxprocperuid: sysctlValues['kern.maxprocperuid'] ?? null,
    totalProcessCount,
    userProcessCount,
    effectiveProcessLimit,
    spareProcessSlots,
    critical: spareProcessSlots !== null && spareProcessSlots < 150,
    rawErrors: {
      launchctl: launchMaxproc.error || launchMaxproc.stderr || null,
      sysctl: sysctl.error || sysctl.stderr || null,
      userProcesses: userProcesses.error || userProcesses.stderr || null,
      allProcesses: allProcesses.error || allProcesses.stderr || null
    }
  };
};

export const createLiveRunner = (options = {}) => {
  const root = options.root ?? defaultRoot;
  const paths = liveRunnerPaths(root);
  const config = {
    fetchTimeoutMs: options.fetchTimeoutMs ?? 5000,
    idlePollMs: options.idlePollMs ?? 5 * 60 * 1000,
    armedPollMs: options.armedPollMs ?? 15_000,
    livePollMs: options.livePollMs ?? 1000,
    cooldownPollMs: options.cooldownPollMs ?? 15_000,
    enrichmentPollMs: options.enrichmentPollMs ?? 15_000,
    armWindowMs: options.armWindowMs ?? 45 * 60 * 1000,
    cooldownMs: options.cooldownMs ?? 10 * 60 * 1000,
    processBudgetPollMs: options.processBudgetPollMs ?? 60 * 60 * 1000,
    staleLockMs: options.staleLockMs ?? 60_000,
    raw: options.raw ?? true,
    dryRun: options.dryRun ?? false,
    // Snapshot dedup (LIVE phase only): when the upstream timing blob returns a
    // byte-identical payload, record the poll for cadence/heartbeat continuity but
    // do not re-store the duplicate raw bytes. Default ON; `BRYCECAST_SNAPSHOT_DEDUP=0`
    // (or an explicit `snapshotDedup: false`) is the kill switch.
    snapshotDedup: options.snapshotDedup ?? process.env.BRYCECAST_SNAPSHOT_DEDUP !== '0',
    sleepCapMs: options.sleepCapMs ?? Infinity,
    pid: options.pid ?? process.pid
  };
  const nowMs = options.nowMs ?? Date.now;
  const sleep = options.sleep ?? sleepDefault;
  const fetcher = options.fetchEndpoint ?? ((endpoint) => defaultFetchEndpoint(endpoint, { timeoutMs: config.fetchTimeoutMs, cacheBust: true }));
  const processBudgetProvider = options.processBudgetProvider ?? (() => collectProcessBudget({ nowMs }));

  const state = {
    phase: PHASES.IDLE,
    startedAt: iso(nowMs()),
    iteration: 0,
    stopped: false,
    currentSession: null,
    nextSession: null,
    scheduleSessions: [],
    lastEnrichmentFetchMs: 0,
    enrichmentCache: new Map(),
    cooldownUntilMs: null,
    lastProcessBudgetMs: 0,
    processBudget: null,
    rowCounts: {
      snapshots: 0,
      bryceSamples: 0,
      rawTimingPayloads: 0,
      dedupedSnapshots: 0
    },
    // Baseline for the LIVE-phase snapshot dedup: the key + row id of the last
    // FULL timing snapshot stored this run. Cleared when leaving LIVE and whenever
    // a non-dedupable (degraded/error) frame is stored, so a marker is only ever
    // emitted between two byte-identical good frames in the same session.
    lastTimingDedup: null,
    // Sticky early-warning for INDYCAR enabling a live track map / GPS socket for
    // INDY NXT. Populated from tsconfig `track_map.wss_uri` during ARMED/LIVE.
    trackMapWatch: null,
    endpointFailureCounts: {},
    lastSuccessfulWriteAt: null,
    latestBryce: {
      rank: null,
      lap: null,
      flag: null,
      sourceState: null
    }
  };

  const logEvent = async (event) => {
    if (config.dryRun) return;
    await mkdir(paths.dataDir, { recursive: true });
    await appendFile(paths.eventsPath, `${JSON.stringify({ at: iso(nowMs()), ...event })}\n`);
  };

  const transition = async (to, extra = {}) => {
    if (state.phase === to) return;
    const from = state.phase;
    state.phase = to;
    // Dedup only runs inside a single LIVE phase; drop the baseline on the way out
    // so a later session can never dedup against a stale key.
    if (from === PHASES.LIVE && to !== PHASES.LIVE) state.lastTimingDedup = null;
    await logEvent({ type: 'phase_transition', from, to, ...extra });
  };

  const fetchOne = async (endpointId) => {
    const endpoint = endpointById.get(endpointId);
    if (!endpoint) throw new Error(`Unknown live endpoint ${endpointId}`);
    try {
      const result = await fetcher(endpoint);
      if (!result?.ok) {
        state.endpointFailureCounts[endpoint.id] = (state.endpointFailureCounts[endpoint.id] ?? 0) + 1;
      }
      return result;
    } catch (error) {
      state.endpointFailureCounts[endpoint.id] = (state.endpointFailureCounts[endpoint.id] ?? 0) + 1;
      await logEvent({ type: 'endpoint_error', endpointId, error: error instanceof Error ? error.message : String(error) });
      return pendingEndpointResult(endpoint, error instanceof Error ? error.message : String(error), iso(nowMs()));
    }
  };

  const fetchMany = async (ids) => Promise.all(ids.map((id) => fetchOne(id)));

  const updateProcessBudgetIfNeeded = async () => {
    const now = nowMs();
    if (state.processBudget && now - state.lastProcessBudgetMs < config.processBudgetPollMs) return;
    try {
      state.processBudget = await processBudgetProvider();
      state.lastProcessBudgetMs = now;
      if (state.processBudget?.critical) {
        await logEvent({ type: 'process_budget_critical', processBudget: state.processBudget });
      }
    } catch (error) {
      await logEvent({ type: 'process_budget_error', error: error instanceof Error ? error.message : String(error) });
      state.processBudget = {
        checkedAt: iso(now),
        critical: false,
        error: error instanceof Error ? error.message : String(error)
      };
      state.lastProcessBudgetMs = now;
    }
  };

  const updateScheduleState = (results) => {
    state.scheduleSessions = extractUpcomingSessions(results, nowMs());
    state.nextSession = nextSessionFromSessions(state.scheduleSessions, nowMs(), state.currentSession);
  };

  const cachedEnrichmentResults = async (force = false) => {
    const now = nowMs();
    const shouldFetch = force || state.enrichmentCache.size < enrichmentEndpointIds.length || now - state.lastEnrichmentFetchMs >= config.enrichmentPollMs;
    if (shouldFetch) {
      const results = await fetchMany(enrichmentEndpointIds);
      for (const result of results) state.enrichmentCache.set(result.id, result);
      state.lastEnrichmentFetchMs = now;
      updateScheduleState(results.filter((result) => scheduleEndpointIds.includes(result.id)));
    }
    return enrichmentEndpointIds.map((id) => state.enrichmentCache.get(id) ?? pendingEndpointResult(endpointById.get(id), 'Enrichment feed has not been fetched yet.', iso(nowMs())));
  };

  const buildTimingSummary = async (timingResult, { forceEnrichment = false } = {}) => {
    const enrichments = await cachedEnrichmentResults(forceEnrichment);
    return {
      results: [timingResult, ...enrichments],
      summary: buildSummary([timingResult, ...enrichments], { root })
    };
  };

  const writeRawTiming = async (summary, timingResult) => {
    if (!config.raw || config.dryRun || !timingResult?.payload) return;
    const sessionPart = `${sanitize(summary.eventId)}-${sanitize(summary.eventSessionId || summary.sessionName)}`;
    const rawPath = join(paths.rawDir, `timing-${sessionPart}.jsonl`);
    await mkdir(paths.rawDir, { recursive: true });
    await appendFile(
      rawPath,
      `${JSON.stringify({
        capturedAt: iso(nowMs()),
        eventId: summary.eventId,
        eventSessionId: summary.eventSessionId,
        sessionKey: summary.sessionKey,
        payload: timingResult.payload
      })}\n`
    );
    state.rowCounts.rawTimingPayloads += 1;
  };

  // A timing frame can be deduped only if it actually carries a resolvable running
  // order — the same condition the archive readers use to turn a payload into a
  // frame. A degraded/error poll (no heartbeat or empty Item) is never deduped, so
  // markers only ever stand between two byte-identical good frames.
  const timingFrameIsDedupable = (timingResult) => {
    const timing = timingResult?.payload?.timing_results;
    return Boolean(timingResult?.ok && timing?.heartbeat && Array.isArray(timing?.Item) && timing.Item.length > 0);
  };

  const resolveDedup = (timingResult, sessionKey) => {
    const dedupable = timingFrameIsDedupable(timingResult);
    // Dedup is a LIVE-phase optimization only: COOLDOWN must keep full-fidelity
    // final-state captures, and IDLE/ARMED never store a duplicate flood.
    const enabled = config.snapshotDedup && state.phase === PHASES.LIVE;
    if (!dedupable) return { enabled, dedupable: false, deduped: false, key: null, ofSnapshotId: null };
    const key = snapshotDedupKey(timingResult);
    const prev = state.lastTimingDedup;
    const deduped = enabled && Boolean(prev && prev.key === key && prev.sessionKey === sessionKey);
    return { enabled, dedupable: true, deduped, key, ofSnapshotId: deduped ? prev.snapshotId : null };
  };

  const updateDedupBaseline = (dedup, snapshotId, sessionKey) => {
    if (!dedup.dedupable || !dedup.key) {
      state.lastTimingDedup = null;
      return;
    }
    if (dedup.deduped) {
      // Keep pointing markers at the original full snapshot of this run.
      state.lastTimingDedup = { key: dedup.key, snapshotId: dedup.ofSnapshotId ?? state.lastTimingDedup?.snapshotId ?? snapshotId, sessionKey };
    } else {
      state.lastTimingDedup = { key: dedup.key, snapshotId, sessionKey };
    }
  };

  const persistSummary = async (summary, results, timingResult, { raw = false } = {}) => {
    const dedup = resolveDedup(timingResult, summary.sessionKey);
    const { snapshotId } = await writeStorage(summary, results, {
      root,
      dryRun: config.dryRun,
      dedup: dedup.deduped ? { ofSnapshotId: dedup.ofSnapshotId, key: dedup.key } : null
    });
    state.rowCounts.snapshots += 1;
    if (dedup.deduped) state.rowCounts.dedupedSnapshots += 1;
    if (summary.bryce) state.rowCounts.bryceSamples += 1;
    state.lastSuccessfulWriteAt = summary.checkedAt;
    // A deduped poll's raw capture would be a byte-identical duplicate of the
    // prior one, so it is skipped too (the other half of the byte win).
    if (raw && !dedup.deduped) await writeRawTiming(summary, timingResult);
    updateDedupBaseline(dedup, snapshotId, summary.sessionKey);
  };

  const updateLatestBryce = (summary) => {
    state.latestBryce = {
      rank: summary.bryce?.rank ?? null,
      lap: summary.bryce?.laps ?? summary.lap ?? null,
      flag: summary.flag || null,
      sourceState: summary.sourceState ?? null
    };
  };

  // tsconfig track_map watcher (ARMED/LIVE only). INDYCAR ships a live GPS track
  // map over a WebSocket for its own top series; for INDY NXT the `config`
  // (tsconfig.json) feed carries `track_map.show=false` and an EMPTY
  // `track_map.wss_uri` today (verified by probe). If that URI ever goes
  // non-empty while an NXT session is armed or live, it is the earliest signal
  // INDYCAR has enabled a live map / GPS socket for NXT. This LOGS LOUDLY (event
  // + stderr + a sticky runner-status field) so an operator sees it immediately.
  // It implements NO WebSocket client and adds NO poller — it only reads the
  // tsconfig payload the runner already fetches each enrichment cycle. Building
  // the actual GPS client is the M-tier follow-on, INDYCAR-only today.
  const checkTrackMapWatch = async () => {
    const configResult = state.enrichmentCache.get('config');
    if (!configResult?.ok) return;
    const trackMap = configResult.payload?.track_map ?? null;
    const wssUri = String(trackMap?.wss_uri ?? '').trim();
    const wssKey = String(trackMap?.wss_key ?? '').trim();
    const show = trackMap?.show === true;
    const active = wssUri.length > 0;
    const previouslyActive = state.trackMapWatch?.active === true;
    const at = iso(nowMs());
    if (active) {
      const session = state.currentSession
        ? { eventId: state.currentSession.eventId, eventSessionId: state.currentSession.eventSessionId, name: state.currentSession.name }
        : null;
      if (!previouslyActive) {
        // LOW→HIGH edge: fire the loud alert exactly once per edge.
        await logEvent({
          type: 'track_map_wss_enabled',
          level: 'alert',
          phase: state.phase,
          wssUri,
          wssKey: wssKey ? 'present' : '',
          show,
          session
        });
        console.error(
          JSON.stringify({
            level: 'ALERT',
            at,
            event: 'track_map_wss_enabled',
            phase: state.phase,
            message:
              'INDYCAR tsconfig track_map.wss_uri is NON-EMPTY during an INDY NXT ARMED/LIVE session — a live GPS/track-map socket may now be available for NXT. BryceCast implements NO WebSocket client (that is the M-tier follow-on); this is the S-tier early-warning only.',
            wssUri,
            wssKeyPresent: wssKey.length > 0,
            show,
            session
          })
        );
      }
      state.trackMapWatch = {
        active: true,
        wssUri,
        wssKeyPresent: wssKey.length > 0,
        show,
        firstSeenAt: state.trackMapWatch?.firstSeenAt ?? at,
        lastSeenAt: at
      };
    } else {
      state.trackMapWatch = {
        active: false,
        wssUri: '',
        wssKeyPresent: false,
        show,
        firstSeenAt: state.trackMapWatch?.firstSeenAt ?? null,
        lastCheckedAt: at
      };
    }
  };

  const writeStatus = async () => {
    const payload = {
      pid: config.pid,
      startedAt: state.startedAt,
      updatedAt: iso(nowMs()),
      phase: state.phase,
      iteration: state.iteration,
      currentSession: state.currentSession
        ? {
            eventId: state.currentSession.eventId,
            eventSessionId: state.currentSession.eventSessionId,
            name: state.currentSession.name,
            eventName: state.currentSession.eventName,
            sessionName: state.currentSession.sessionName
          }
        : null,
      nextSession: state.nextSession
        ? {
            eventId: state.nextSession.eventId,
            eventSessionId: state.nextSession.eventSessionId,
            name: state.nextSession.name,
            eventName: state.nextSession.eventName,
            sessionName: state.nextSession.sessionName,
            startsAt: state.nextSession.startsAt,
            source: state.nextSession.source
          }
        : null,
      rowCounts: { ...state.rowCounts },
      endpointFailureCounts: { ...state.endpointFailureCounts },
      lastSuccessfulWriteAt: state.lastSuccessfulWriteAt,
      latestBryce: { ...state.latestBryce },
      trackMapWatch: state.trackMapWatch,
      processBudget: state.processBudget
    };
    await writeAtomicJson(paths.statusPath, payload, { dryRun: config.dryRun });
    return payload;
  };

  const handleIdle = async () => {
    const [results, timingResult] = await Promise.all([fetchMany(scheduleEndpointIds), fetchOne('timing')]);
    updateScheduleState(results);
    const timing = timingResult.payload?.timing_results;
    const heartbeat = timing?.heartbeat ?? null;
    if (heartbeat) state.currentSession = sessionFromHeartbeat(heartbeat);
    if (heartbeatLooksLive(heartbeat)) {
      const { results: summaryResults, summary } = await buildTimingSummary(timingResult, { forceEnrichment: true });
      updateLatestBryce(summary);
      state.currentSession = sessionFromHeartbeat(heartbeat);
      await transition(PHASES.LIVE, { reason: 'live_indy_nxt_heartbeat', currentSession: state.currentSession });
      await logEvent({ type: 'session_boundary', action: 'live_started', session: state.currentSession });
      await persistSummary(summary, summaryResults, timingResult, { raw: true });
      return;
    }
    if (isWithinArmWindow(state.nextSession, nowMs(), config.armWindowMs)) {
      await transition(PHASES.ARMED, { reason: 'next_session_within_arm_window', nextSession: state.nextSession });
    }
  };

  const handleArmed = async () => {
    const timingResult = await fetchOne('timing');
    const timing = timingResult.payload?.timing_results;
    const heartbeat = timing?.heartbeat ?? null;
    if (heartbeat) state.currentSession = sessionFromHeartbeat(heartbeat);
    if (heartbeatLooksLive(heartbeat)) {
      const { results, summary } = await buildTimingSummary(timingResult, { forceEnrichment: true });
      updateLatestBryce(summary);
      state.currentSession = sessionFromHeartbeat(heartbeat);
      await transition(PHASES.LIVE, { reason: 'guarded_indy_nxt_heartbeat', currentSession: state.currentSession });
      await logEvent({ type: 'session_boundary', action: 'live_started', session: state.currentSession });
      await persistSummary(summary, results, timingResult, { raw: true });
      return;
    }
    const { summary } = await buildTimingSummary(timingResult, { forceEnrichment: false });
    updateLatestBryce(summary);
  };

  const handleLive = async () => {
    const timingResult = await fetchOne('timing');
    const timing = timingResult.payload?.timing_results;
    const heartbeat = timing?.heartbeat ?? null;
    const { results, summary } = await buildTimingSummary(timingResult, { forceEnrichment: false });
    updateLatestBryce(summary);
    if (heartbeat) state.currentSession = sessionFromHeartbeat(heartbeat);
    await persistSummary(summary, results, timingResult, { raw: true });
    if (heartbeat && (!heartbeatLooksLive(heartbeat) || sourceState(heartbeat) === 'cold')) {
      state.cooldownUntilMs = nowMs() + config.cooldownMs;
      await transition(PHASES.COOLDOWN, { reason: 'timing_cold_or_checkered', cooldownUntil: iso(state.cooldownUntilMs), currentSession: state.currentSession });
      await logEvent({ type: 'session_boundary', action: 'cooldown_started', session: state.currentSession });
    }
  };

  const handleCooldown = async () => {
    const now = nowMs();
    if (state.cooldownUntilMs !== null && now >= state.cooldownUntilMs) {
      const nextSameDay = state.scheduleSessions.find(
        (session) =>
          session.startMs &&
          session.startMs >= now &&
          sameUtcDay(session.startMs, now) &&
          (!state.currentSession?.eventSessionId || session.eventSessionId !== state.currentSession.eventSessionId) &&
          (!state.currentSession?.eventId || session.eventId !== state.currentSession.eventId)
      );
      if (nextSameDay) {
        state.nextSession = nextSameDay;
        await transition(PHASES.ARMED, { reason: 'same_day_session_pending', nextSession: state.nextSession });
      } else {
        await transition(PHASES.IDLE, { reason: 'cooldown_complete' });
      }
      return;
    }
    const timingResult = await fetchOne('timing');
    const timing = timingResult.payload?.timing_results;
    const heartbeat = timing?.heartbeat ?? null;
    const incomingSession = sessionFromHeartbeat(heartbeat);
    const changedEventSession = Boolean(
      incomingSession?.eventSessionId &&
      state.currentSession?.eventSessionId &&
      incomingSession.eventSessionId !== state.currentSession.eventSessionId
    );
    const resumedForNewSession = changedEventSession && heartbeatLooksLive(heartbeat);
    const { results, summary } = await buildTimingSummary(timingResult, { forceEnrichment: resumedForNewSession });
    updateLatestBryce(summary);
    if (heartbeat) state.currentSession = incomingSession;
    await persistSummary(summary, results, timingResult, { raw: resumedForNewSession });
    // Qualifying groups and other back-to-back sessions can share an event ID.
    // A live heartbeat with a new EventSessionID is authoritative and must end
    // cooldown immediately; otherwise the next group is sampled at 15 seconds
    // until the fixed cooldown expires.
    if (resumedForNewSession) {
      state.cooldownUntilMs = null;
      await transition(PHASES.LIVE, {
        reason: 'new_live_event_session_during_cooldown',
        currentSession: state.currentSession,
      });
      await logEvent({type: 'session_boundary', action: 'live_started', session: state.currentSession});
    }
  };

  const tick = async () => {
    await heartbeatLiveRunnerLock({ lockPath: paths.lockPath, pid: config.pid, nowMs, staleMs: config.staleLockMs, dryRun: config.dryRun });
    await updateProcessBudgetIfNeeded();
    if (state.phase === PHASES.IDLE) await handleIdle();
    else if (state.phase === PHASES.ARMED) await handleArmed();
    else if (state.phase === PHASES.LIVE) await handleLive();
    else if (state.phase === PHASES.COOLDOWN) await handleCooldown();
    // The tsconfig track_map early-warning reads the config the enrichment cycle
    // already fetched — ARMED/LIVE only, no extra request. Phase is read after the
    // handler so a fresh IDLE→LIVE or ARMED→LIVE transition is covered this tick.
    if (state.phase === PHASES.ARMED || state.phase === PHASES.LIVE) await checkTrackMapWatch();
    state.iteration += 1;
    return writeStatus();
  };

  const intervalForPhase = () => {
    if (state.phase === PHASES.LIVE) return config.livePollMs;
    if (state.phase === PHASES.ARMED) return config.armedPollMs;
    if (state.phase === PHASES.COOLDOWN) return config.cooldownPollMs;
    return config.idlePollMs;
  };

  const run = async ({ maxIterations = 0 } = {}) => {
    const lock = await acquireLiveRunnerLock({ lockPath: paths.lockPath, pid: config.pid, nowMs, staleMs: config.staleLockMs, dryRun: config.dryRun });
    if (lock.takeover) await logEvent({ type: 'lock_takeover', previous: lock.previous });
    await logEvent({ type: 'runner_started', pid: config.pid, maxIterations, raw: config.raw, dryRun: config.dryRun });
    let count = 0;
    try {
      while (!state.stopped && (maxIterations === 0 || count < maxIterations)) {
        const started = nowMs();
        try {
          await tick();
        } catch (error) {
          await logEvent({ type: 'tick_error', error: error instanceof Error ? error.stack ?? error.message : String(error) });
          await writeStatus();
        }
        count += 1;
        const elapsed = Math.max(0, nowMs() - started);
        const waitMs = Math.min(config.sleepCapMs, Math.max(0, intervalForPhase() - elapsed));
        if (!state.stopped && (maxIterations === 0 || count < maxIterations) && waitMs > 0) {
          await sleep(waitMs);
        }
      }
      return await writeStatus();
    } finally {
      await logEvent({ type: 'runner_stopped', pid: config.pid, iterations: count, phase: state.phase });
      await releaseLiveRunnerLock({ lockPath: paths.lockPath, pid: config.pid, dryRun: config.dryRun });
    }
  };

  return {
    paths,
    config,
    state,
    tick,
    run,
    stop: () => {
      state.stopped = true;
    }
  };
};
