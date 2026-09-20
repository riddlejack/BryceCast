/**
 * postrace-auto core — the pure, unit-testable half of the unattended post-race
 * pipeline. Everything here is a function of its arguments: no network, no
 * spawning, no clock reads it wasn't given. `scripts/postrace-auto.mjs` is the
 * thin shell that reads files, runs steps and writes state.
 *
 * ## Why this shape
 *
 * The owner's requirement is "next season I don't want to touch the website".
 * The hazard is the opposite one: an unattended job that fires during a race
 * weekend and competes with the live runner for processes and upstream quota.
 * The process-exhaustion RCA (LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md)
 * is the reason this file leads with a gate rather than a scheduler.
 *
 * So the design is: **one cheap local read, then usually exit 0.**
 *
 *   launchd (hourly StartInterval)
 *     → read 3 local files (runner status, runner events, our own state)
 *     → gate: runner IDLE and fresh? no lock? no session imminent? work due?
 *     → almost always: no. exit 0, having touched nothing and polled nothing.
 *     → occasionally: yes. take the pipeline lock, run `postrace:roll`
 *       (which owns ALL upstream refresh), compare the package by CONTENT, and
 *       only if it actually moved: run the gate set, then publish.
 *
 * There is deliberately no poller, no watcher and no daemon. The runner remains
 * the single owner of upstream polling; this job's only upstream contact happens
 * inside the roll, and only when the gate has already proved the runner is idle.
 *
 * ## The per-session state machine
 *
 * Official results, section-timing PDFs and Timing71 replays land hours to days
 * after the checkered flag, and sometimes never. Modelling that explicitly is
 * the difference between "the site updates itself" and "the site updates itself
 * once and then silently misses the section heat maps".
 *
 *   awaiting_results ──results land──▶ partial ──sections+replay land──▶ complete
 *          │                              │
 *          └──────── 7 days, no luck ─────┴──▶ abandoned (flagged, loud in status)
 *
 * Retries are scheduled from the session's end, not from the last attempt, so a
 * missed hour (laptop asleep) doesn't push the whole ladder back.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATE_SCHEMA_VERSION = 'brycecast.postraceAuto.state.v1';
export const STATUS_SCHEMA_VERSION = 'brycecast.postraceAuto.status.v1';

export const SESSION_STATES = {
  AWAITING_RESULTS: 'awaiting_results',
  PARTIAL: 'partial',
  COMPLETE: 'complete',
  ABANDONED: 'abandoned'
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Retry ladder, measured from the session's end. +1h, +3h, +6h, +12h, then
 *  daily out to 7 days. Official PDFs typically land within hours; Timing71
 *  replays have taken two days (Music City 2026: July 19 race, July 21 replay).
 *  After the last rung the session is abandoned and flagged — silence is the
 *  failure mode this ladder exists to prevent. */
export const RETRY_OFFSETS_MS = [
  1 * HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  1 * DAY_MS,
  2 * DAY_MS,
  3 * DAY_MS,
  4 * DAY_MS,
  5 * DAY_MS,
  6 * DAY_MS,
  7 * DAY_MS
];

/** The runner writes its status every tick; IDLE ticks are ~5 minutes apart.
 *  Three missed ticks means we can no longer prove the runner is not mid-session,
 *  so we refuse rather than guess. */
export const RUNNER_STATUS_MAX_AGE_MS = 15 * 60 * 1000;

/** Refuse if the runner's own schedule says a session starts within this window.
 *  This is the honest way to satisfy the UI package's fail-closed race-window
 *  guard (`unpinnedOnRaceWindow` in build-ui-data-package.mjs): rather than
 *  relying on an unpinned as-of date to trip that guard, we never roll at all
 *  when a session is imminent. */
export const SESSION_PROXIMITY_MS = 6 * HOUR_MS;

/** How far back a cold state file looks for sessions it has never seen. One
 *  race weekend fits comfortably; a whole off-season does not. */
export const SCHEDULE_LOOKBACK_MS = 14 * DAY_MS;

/**
 * Keys whose values change on every build without the package's content
 * changing. Stripping them anywhere in the tree is what makes "did anything
 * actually change?" answerable — otherwise every run looks like a change and
 * the site would be rebuilt and republished daily for nothing.
 */
export const VOLATILE_PACKAGE_KEYS = new Set([
  'generatedAt',
  'sourceHash',
  'baselineCommit',
  'metricManifestBaselineCommit',
  'predictiveRaceIntelligenceRepoHead',
  'repoHead',
  'retrievedAt',
  'checkedAt',
  'updatedAt',
  'builtAt',
  // Provenance for referenced context packs. `modifiedAt` is a file mtime.
  // `sha256` looks like a content fingerprint but is a hash of a file that
  // embeds its OWN `generatedAt`, so it churns on every build — keeping it would
  // make every run report "changed" and defeat the whole comparison.
  //
  // This is safe because a pack's real content is not hidden behind its hash:
  // the first live rehearsal was a genuine change (twenty newly archived NWS
  // observations for the Monterey weekend landed nine days after the race), and
  // it showed up in `screens.venueDossier`, `screens.careerLab.resultConversion`
  // and `screens.raceDebrief` regardless of the hashes. The sibling `bytes` is
  // deliberately kept: a fixed-width timestamp does not move it, so it is a
  // churn-free size check on the same packs.
  'modifiedAt',
  'sha256',
  // When the standings snapshot was fetched, not what it said. The second live
  // rehearsal came down to this one field: everything else in the package was
  // identical across two full refreshes nine minutes apart.
  'capturedAt'
]);

/**
 * The only paths an unattended run may stage. Everything here is generated or
 * acquired data. Source, config and ops files are deliberately absent: if the
 * working tree is dirty outside this list, a human was mid-edit and the run must
 * not sweep their work into a commit.
 */
export const PUBLISHABLE_PATHS = [
  // Exact file, not the directory: analysis/ui-data-package/ also holds the
  // builder's own scripts and README, which are source.
  'analysis/ui-data-package/ui-data-package.json',
  'analysis/postrace-roll-reports/',
  'data/career/career.dataset.json',
  'data/career/raw/',
  'data/career/reports/',
  'data/historical-data-lake/catalog/',
  'data/historical-data-lake/manifests/',
  'public/data/',
  // Generated by `career:coverage`, committed as a report rather than a doc.
  'docs/CAREER_ANALYTICS_COVERAGE_MATRIX.md'
];

export const PUBLISHABLE_PATH_PATTERNS = [
  // Generated analytics output lives under analysis/<lane>/output/.
  /^analysis\/[^/]+\/output\//,
  // The audited canonical Timing71 list, rewritten by the lake-sync promotion
  // gate. Season-named, so matched by pattern rather than listed by year.
  /^analysis\/historical-high-frequency-data-audit\/timing71-\d{4}-coverage\.json$/
];

export const GATE_STEPS = [
  { id: 'ui-data-package-validate', npmScript: 'analytics:ui-data-package:validate' },
  { id: 'view-models-validate', npmScript: 'analytics:view-models:validate' },
  { id: 'ui-context-adapter', npmScript: 'test:ui-context-adapter' },
  { id: 'section-observations', npmScript: 'test:section-observations' },
  { id: 'live-readiness', npmScript: 'test:live-readiness' },
  { id: 'build', npmScript: 'build' }
];

export const PUBLISH_MODES = ['none', 'deploy-mini', 'local'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const iso = (ms) => new Date(ms).toISOString();
const parseMs = (value) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Canonical session id used everywhere downstream. */
export const canonicalSessionId = (seasonYear, eventSessionId) =>
  `session_indy_nxt_${seasonYear}_${String(eventSessionId)}`;

/** Track outline/section asset slug for a dataset track id. */
export const trackAssetSlug = (trackId) => String(trackId ?? '').replace(/^track_/, '').replace(/_/g, '-');

// ---------------------------------------------------------------------------
// Content diff
// ---------------------------------------------------------------------------

/** Deep copy with every volatile key removed, at any depth. */
export const stripVolatile = (value, volatileKeys = VOLATILE_PACKAGE_KEYS) => {
  if (Array.isArray(value)) return value.map((entry) => stripVolatile(entry, volatileKeys));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (volatileKeys.has(key)) continue;
      out[key] = stripVolatile(value[key], volatileKeys);
    }
    return out;
  }
  return value;
};

/** Stable content fingerprint: key order and volatile fields cannot affect it. */
export const contentSignature = (value, volatileKeys = VOLATILE_PACKAGE_KEYS) =>
  createHash('sha256').update(JSON.stringify(stripVolatile(value, volatileKeys))).digest('hex');

const collectPathDiffs = (before, after, path, out, limit) => {
  if (out.length >= limit) return;
  const bothObjects =
    before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after);
  if (!bothObjects) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push({
        path: path || '(root)',
        before: summarize(before),
        after: summarize(after)
      });
    }
    return;
  }
  if (Array.isArray(before)) {
    if (before.length !== after.length) {
      out.push({ path: `${path}.length`, before: before.length, after: after.length });
      if (out.length >= limit) return;
    }
    for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
      collectPathDiffs(before[index], after[index], `${path}[${index}]`, out, limit);
      if (out.length >= limit) return;
    }
    return;
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    collectPathDiffs(before[key], after[key], path ? `${path}.${key}` : key, out, limit);
    if (out.length >= limit) return;
  }
};

const summarize = (value) => {
  if (value === undefined) return '(absent)';
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

/**
 * Did the package's CONTENT change? Volatile keys are stripped from both sides
 * first, so a rebuild that only moved `generatedAt` and `sourceHash` reports
 * `changed: false` — and nothing gets rebuilt, committed or published.
 */
export const diffPackageContent = (before, after, { volatileKeys = VOLATILE_PACKAGE_KEYS, maxPaths = 40 } = {}) => {
  const beforeSignature = before === null || before === undefined ? null : contentSignature(before, volatileKeys);
  const afterSignature = after === null || after === undefined ? null : contentSignature(after, volatileKeys);
  const changed = beforeSignature !== afterSignature;
  const changedPaths = [];
  if (changed && before && after) {
    collectPathDiffs(stripVolatile(before, volatileKeys), stripVolatile(after, volatileKeys), '', changedPaths, maxPaths);
  }
  return {
    changed,
    beforeSignature,
    afterSignature,
    changedPaths,
    truncated: changedPaths.length >= maxPaths,
    ignoredKeys: [...volatileKeys].sort()
  };
};

// ---------------------------------------------------------------------------
// Staging allowlist
// ---------------------------------------------------------------------------

export const isPublishablePath = (path) => {
  const normalized = String(path ?? '').replace(/^"+|"+$/g, '');
  if (!normalized) return false;
  if (PUBLISHABLE_PATHS.some((prefix) => (prefix.endsWith('/') ? normalized.startsWith(prefix) : normalized === prefix))) return true;
  return PUBLISHABLE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
};

/**
 * Parse `git status --porcelain` and split it into what an unattended run may
 * stage and what it may not. Anything in `refused` stops the publish: a dirty
 * source file means a human is mid-edit in this checkout.
 */
export const classifyWorkingTree = (porcelainLines) => {
  const entries = asArray(porcelainLines)
    .map((line) => String(line))
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const status = line.slice(0, 2);
      let path = line.slice(3).trim();
      // Renames: "R  old -> new" — the new path is what would be staged.
      const arrow = path.indexOf(' -> ');
      if (arrow >= 0) path = path.slice(arrow + 4);
      if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
      return { status, path };
    });
  const allowed = entries.filter((entry) => isPublishablePath(entry.path));
  const refused = entries.filter((entry) => !isPublishablePath(entry.path));
  return { entries, allowed, refused, ok: refused.length === 0 };
};

// ---------------------------------------------------------------------------
// Session discovery from local runner artifacts
// ---------------------------------------------------------------------------

/**
 * Sessions the live runner saw end, read from its own JSONL event log.
 *
 * The runner writes `session_boundary {action: 'cooldown_started'}` when a
 * session goes COLD/checkered, and a `phase_transition` out of COOLDOWN when the
 * ten-minute tail finishes. Either is proof a session ended, on this machine,
 * with no upstream call: exactly the signal we want.
 */
export const endedSessionsFromRunnerEvents = (events, { now = Date.now(), lookbackMs = SCHEDULE_LOOKBACK_MS } = {}) => {
  const found = new Map();
  for (const event of asArray(events)) {
    const at = parseMs(event?.at);
    if (at === null || now - at > lookbackMs) continue;
    const isCooldown = event?.type === 'session_boundary' && event?.action === 'cooldown_started';
    const leftCooldown = event?.type === 'phase_transition' && event?.from === 'COOLDOWN' && event?.to === 'IDLE';
    if (!isCooldown && !leftCooldown) continue;
    const session = event?.session ?? event?.currentSession ?? null;
    if (!session?.eventSessionId) continue;
    const seasonYear = new Date(at).getUTCFullYear();
    const id = canonicalSessionId(seasonYear, session.eventSessionId);
    // Last boundary wins: a restarted runner can log the same session twice.
    found.set(id, {
      sessionId: id,
      eventId: session.eventId ?? null,
      eventSessionId: String(session.eventSessionId),
      eventName: session.eventName ?? null,
      sessionName: session.sessionName ?? session.name ?? null,
      seasonYear,
      endedAt: iso(at),
      discoveredVia: 'runner-events'
    });
  }
  return [...found.values()].sort((left, right) => left.endedAt.localeCompare(right.endedAt));
};

/**
 * Sessions the local career dataset says have already happened, used as the
 * backstop for weekends the runner missed (asleep laptop, LaunchAgent unloaded,
 * network out). Still zero upstream calls — this reads the committed dataset.
 *
 * Event end dates are clean date-only strings; a session is treated as ended at
 * the end of its event's final day.
 */
export const endedSessionsFromSchedule = (dataset, { now = Date.now(), lookbackMs = SCHEDULE_LOOKBACK_MS } = {}) => {
  const events = new Map(
    asArray(dataset?.events)
      .filter((event) => event?.seriesId === 'series_indy_nxt')
      .map((event) => [event.id, event])
  );
  const out = [];
  for (const session of asArray(dataset?.sessions)) {
    const event = events.get(session?.eventId);
    if (!event) continue;
    const endDate = event.eventEndDate ?? event.eventStartDate ?? null;
    if (!endDate) continue;
    // End of the event's final day, UTC. Venue-local midnight would be more
    // precise, but this only decides *when we first look*, and the retry ladder
    // absorbs the error.
    const endedMs = Date.parse(`${endDate}T23:59:59Z`);
    if (!Number.isFinite(endedMs) || endedMs > now || now - endedMs > lookbackMs) continue;
    out.push({
      sessionId: session.id,
      eventId: event.id,
      eventSessionId: String(session.id).split('_').at(-1),
      eventName: event.name ?? null,
      sessionName: session.name ?? session.sessionType ?? null,
      sessionType: session.sessionType ?? null,
      seasonYear: event.seasonYear ?? null,
      trackId: event.trackId ?? null,
      endedAt: iso(endedMs),
      discoveredVia: 'schedule-backlog'
    });
  }
  return out.sort((left, right) => left.endedAt.localeCompare(right.endedAt));
};

/** Merge both discovery lanes; the runner's own boundary wins on conflict,
 *  because it is an observation rather than a schedule inference. */
export const mergeDiscoveredSessions = (fromRunner, fromSchedule) => {
  const merged = new Map();
  for (const session of asArray(fromSchedule)) merged.set(session.sessionId, session);
  for (const session of asArray(fromRunner)) {
    merged.set(session.sessionId, { ...(merged.get(session.sessionId) ?? {}), ...session });
  }
  return [...merged.values()].sort((left, right) => String(left.endedAt).localeCompare(String(right.endedAt)));
};

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * What a session of this kind is expected to yield once everything has landed.
 *
 * These are deliberately claims about what the series actually publishes, not a
 * wish list. Over-expecting is not harmless: a session that can never satisfy
 * its expectation retries for seven days and then raises a false "gave up" flag,
 * which is exactly the kind of noise that gets an unattended pipeline ignored.
 *
 *   - A "Combined Qualifying" session is the official ROLLUP of the two group
 *     runs. It has no report family of its own — the section PDFs belong to the
 *     group sessions — so it expects results only. (Learned from the Monterey
 *     rehearsal, where 6951 and 6954 sat `partial` for a PDF that does not
 *     exist.)
 *   - Practice expects results only. Section PDFs are often posted for practice
 *     too, but not dependably enough to treat their absence as a gap.
 */
export const expectedArtifactsFor = (sessionType, sessionName = '') => {
  const type = String(sessionType ?? '').toLowerCase();
  const name = String(sessionName ?? '').toLowerCase();
  if (/combined|aggregate|overall/.test(name)) return ['results'];
  if (type === 'practice') return ['results'];
  if (type === 'qualifying') return ['results', 'sections'];
  return ['results', 'laps', 'sections', 'replay'];
};

/**
 * Derive a session's state from what is actually on disk. `probe` is supplied by
 * the shell (it stats files and indexes the dataset) so this stays pure.
 *
 * @param {{results:boolean, laps:boolean, sections:boolean, replay:boolean}} probe
 */
export const deriveSessionState = (probe, sessionType, sessionName = '') => {
  const expected = expectedArtifactsFor(sessionType, sessionName);
  const missing = expected.filter((artifact) => !probe?.[artifact]);
  if (!probe?.results) return { state: SESSION_STATES.AWAITING_RESULTS, missing };
  if (missing.length) return { state: SESSION_STATES.PARTIAL, missing };
  return { state: SESSION_STATES.COMPLETE, missing: [] };
};

/**
 * The last season whose hand-curated, per-season inputs exist in this repo.
 *
 * Season *discovery* is automatic now (scripts/lib/indy-nxt-seasons.mjs), but a
 * handful of surfaces still need a human when a new season starts:
 *   - scripts/backfill-indy-nxt-session-windows.mjs — the weekend-schedule PDF
 *     catalogue and the Race-Control event→track map;
 *   - scripts/postrace-lake-sync.mjs + analysis/semantic-layer/build-timing71-2026.mjs
 *     — the season filter and the season-named semantic-layer module;
 *   - analysis/semantic-layer/validate-crosswalk.mjs and
 *     analysis/replay-feeds/build-replay-feeds.mjs — the season-pinned crosswalk
 *     and pack directory;
 *   - analysis/semantic-layer/nashville-loop-inventory.mjs — Bryce's car number
 *     for the season.
 *
 * Bump this only together with those. Until then a session from a later season
 * is flagged rather than silently half-processed.
 */
export const CURATED_THROUGH_SEASON = 2026;

export const seasonCurationFlag = (seasonYear, { curatedThrough = CURATED_THROUGH_SEASON } = {}) => {
  const year = Number(seasonYear);
  if (!Number.isInteger(year) || year <= curatedThrough) return null;
  return {
    type: 'needs_curation',
    scope: 'season',
    season: year,
    detail: `Season ${year} is imported automatically, but the per-season curated inputs (weekend-schedule catalogue, Race-Control track map, Timing71 semantic-layer module, identity crosswalk, replay-feed pack, car number) only reach ${curatedThrough}. Results and standings publish; lap/section/replay lanes for ${year} need those updated first. See CURATED_THROUGH_SEASON in scripts/lib/postrace-auto-core.mjs.`
  };
};

/**
 * A venue with no curated outline/section anchors cannot render heat maps even
 * with perfect section data. Results still publish; the gap is named, not
 * silently dropped.
 */
export const venueCurationFlag = ({ trackId, trackName, hasOutline, hasSectionAnchors }) => {
  if (hasOutline && hasSectionAnchors) return null;
  return {
    type: 'needs_curation',
    trackId: trackId ?? null,
    venue: trackName ?? trackId ?? 'unknown venue',
    slug: trackAssetSlug(trackId),
    missing: [!hasOutline ? 'src/assets/tracks outline' : null, !hasSectionAnchors ? 'src/assets/tracks/sections anchors' : null].filter(
      Boolean
    ),
    detail: 'Results publish without heat maps until the track outline and section anchors are hand-curated for this venue.'
  };
};

// ---------------------------------------------------------------------------
// Retry schedule
// ---------------------------------------------------------------------------

/**
 * When should attempt number `attempts` happen, measured from the session's end?
 * Returns null once the ladder is exhausted (the caller abandons and flags).
 */
export const nextAttemptAt = (endedAtMs, attempts, offsets = RETRY_OFFSETS_MS) => {
  if (!Number.isFinite(endedAtMs)) return null;
  if (attempts >= offsets.length) return null;
  return endedAtMs + offsets[attempts];
};

/**
 * Due = we still owe this session a refresh.
 *
 * Note the `verified` condition. A session can look complete purely because the
 * artifacts from a *previous* human-run refresh are already on disk — that is
 * not proof that the automated pipeline has run since the session ended. So a
 * session is only finished once at least one successful automated attempt has
 * confirmed it. The cost of being wrong here is one cheap roll that finds
 * nothing new and publishes nothing; the cost of the opposite error is a race
 * that never appears on the site.
 */
export const isSessionDue = (entry, now) => {
  if (!entry) return false;
  if (entry.state === SESSION_STATES.ABANDONED) return false;
  if (entry.state === SESSION_STATES.COMPLETE && entry.verified) return false;
  if (!entry.nextAttemptAt) return true;
  const due = parseMs(entry.nextAttemptAt);
  return due === null ? true : due <= now;
};

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export const emptyState = (now = Date.now()) => ({
  schemaVersion: STATE_SCHEMA_VERSION,
  createdAt: iso(now),
  updatedAt: iso(now),
  lastRunAt: null,
  lastSuccessAt: null,
  lastPublishAt: null,
  sessions: {},
  flags: []
});

/**
 * Fold discovered sessions into the state file.
 *
 * A session we have never seen enters at the state its on-disk artifacts imply.
 * That is what makes a cold start cheap: on a fresh install every past weekend
 * is already `complete`, so nothing is "due" and the first run exits at the gate.
 */
export const reconcileState = (state, discovered, probes, { now = Date.now() } = {}) => {
  const next = { ...emptyState(now), ...state, sessions: { ...(state?.sessions ?? {}) } };
  next.updatedAt = iso(now);
  for (const session of asArray(discovered)) {
    const probe = probes?.[session.sessionId] ?? null;
    const sessionType = session.sessionType ?? probe?.sessionType ?? null;
    const sessionName = session.sessionName ?? next.sessions[session.sessionId]?.sessionName ?? '';
    const derived = deriveSessionState(probe ?? {}, sessionType, sessionName);
    const existing = next.sessions[session.sessionId] ?? null;
    const endedMs = parseMs(session.endedAt) ?? parseMs(existing?.endedAt) ?? now;
    const attempts = existing?.attempts ?? 0;
    const verified = Boolean(existing?.verified);
    const wasTerminal =
      (existing?.state === SESSION_STATES.COMPLETE && verified) || existing?.state === SESSION_STATES.ABANDONED;
    // A completed session never re-opens: late upstream edits to a finished race
    // are a human decision, not an unattended one.
    const state_ = wasTerminal ? existing.state : derived.state;
    const missing = wasTerminal ? (existing.missing ?? []) : derived.missing;
    const exhausted = attempts >= RETRY_OFFSETS_MS.length;
    const resolvedState =
      state_ === SESSION_STATES.COMPLETE || state_ === SESSION_STATES.ABANDONED
        ? state_
        : exhausted
          ? SESSION_STATES.ABANDONED
          : state_;
    next.sessions[session.sessionId] = {
      ...(existing ?? {}),
      ...session,
      sessionType,
      endedAt: iso(endedMs),
      state: resolvedState,
      missing,
      attempts,
      verified,
      firstSeenAt: existing?.firstSeenAt ?? iso(now),
      completedAt:
        resolvedState === SESSION_STATES.COMPLETE ? (existing?.completedAt ?? iso(now)) : (existing?.completedAt ?? null),
      abandonedAt: resolvedState === SESSION_STATES.ABANDONED ? (existing?.abandonedAt ?? iso(now)) : null,
      nextAttemptAt:
        (resolvedState === SESSION_STATES.COMPLETE && verified) || resolvedState === SESSION_STATES.ABANDONED
          ? null
          : (() => {
              const at = nextAttemptAt(endedMs, attempts);
              return at === null ? null : iso(at);
            })()
    };
  }
  return next;
};

/** Record the outcome of one attempt against every session the run covered. */
export const recordAttempt = (state, sessionIds, { now = Date.now(), ok, detail = null } = {}) => {
  const next = { ...state, sessions: { ...state.sessions }, updatedAt: iso(now) };
  for (const sessionId of asArray(sessionIds)) {
    const entry = next.sessions[sessionId];
    if (!entry) continue;
    const attempts = (entry.attempts ?? 0) + 1;
    const endedMs = parseMs(entry.endedAt) ?? now;
    const at = nextAttemptAt(endedMs, attempts);
    const exhausted = at === null;
    const verified = Boolean(entry.verified) || Boolean(ok);
    // A run that succeeded is what turns a derived-complete session into a
    // finished one. A failed run leaves it open for the next rung of the ladder.
    const terminal = entry.state === SESSION_STATES.COMPLETE && verified;
    next.sessions[sessionId] = {
      ...entry,
      attempts,
      verified,
      lastAttemptAt: iso(now),
      lastOutcome: ok ? 'ok' : 'failed',
      lastOutcomeDetail: detail,
      state: terminal ? entry.state : exhausted ? SESSION_STATES.ABANDONED : entry.state,
      abandonedAt: !terminal && exhausted ? (entry.abandonedAt ?? iso(now)) : entry.abandonedAt ?? null,
      nextAttemptAt: terminal || exhausted ? null : iso(at)
    };
  }
  return next;
};

export const dueSessions = (state, now = Date.now()) =>
  Object.values(state?.sessions ?? {})
    .filter((entry) => isSessionDue(entry, now))
    .sort((left, right) => String(left.endedAt).localeCompare(String(right.endedAt)));

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * The cheap gate. Local reads only; returns a decision, never acts.
 *
 * Ordering matters: the runner checks come first so that a race weekend short-
 * circuits before we even think about work.
 */
export const evaluateGate = ({
  now = Date.now(),
  runnerStatus = null,
  runnerStatusPresent = true,
  deployLockHeld = false,
  pipelineLock = null,
  pid = process.pid,
  due = [],
  allowMissingRunnerStatus = false,
  maxStatusAgeMs = RUNNER_STATUS_MAX_AGE_MS,
  sessionProximityMs = SESSION_PROXIMITY_MS,
  force = false
} = {}) => {
  const checks = [];
  const refuse = (reason, detail) => {
    checks.push({ name: reason, ok: false, detail });
    return { proceed: false, reason, detail, checks, due };
  };
  const pass = (name, detail) => checks.push({ name, ok: true, detail });

  if (!runnerStatusPresent || !runnerStatus) {
    if (!allowMissingRunnerStatus) {
      return refuse(
        'runner_status_unavailable',
        'No live-runner status file. Point BRYCECAST_RUNNER_STATUS_PATH at the operational checkout, or set BRYCECAST_POSTRACE_AUTO_ALLOW_NO_RUNNER=1 on a host that never runs the recorder.'
      );
    }
    pass('runner-status', 'absent, explicitly allowed on this host');
  } else {
    const updatedMs = parseMs(runnerStatus.updatedAt);
    const ageMs = updatedMs === null ? null : now - updatedMs;
    if (ageMs === null || ageMs > maxStatusAgeMs || ageMs < -maxStatusAgeMs) {
      return refuse(
        'runner_status_stale',
        `Live-runner status is ${ageMs === null ? 'undated' : `${Math.round(ageMs / 1000)}s old`} (limit ${Math.round(maxStatusAgeMs / 1000)}s). A stale status cannot prove the runner is not mid-session.`
      );
    }
    pass('runner-status-fresh', `${Math.round(ageMs / 1000)}s old`);

    if (runnerStatus.phase !== 'IDLE') {
      return refuse('runner_not_idle', `Live runner is ${runnerStatus.phase}. One ingestor owns upstream polling during a session.`);
    }
    pass('runner-idle', 'phase IDLE');

    const nextStart = parseMs(runnerStatus?.nextSession?.startsAt);
    if (nextStart !== null && nextStart - now <= sessionProximityMs && nextStart >= now) {
      return refuse(
        'session_imminent',
        `Next session (${runnerStatus.nextSession?.eventName ?? 'unknown'}) starts in ${Math.round((nextStart - now) / 60000)} min; refusing to roll the event set inside the race window.`
      );
    }
    pass('no-session-imminent', nextStart === null ? 'no scheduled next session' : `next session ${runnerStatus.nextSession?.startsAt}`);
  }

  if (deployLockHeld) return refuse('deploy_lock_held', 'A deployment owns the release lock.');
  pass('deploy-lock', 'free');

  if (pipelineLock?.pid && Number(pipelineLock.pid) !== Number(pid)) {
    const heartbeatMs = parseMs(pipelineLock.heartbeatAt ?? pipelineLock.startedAt);
    const staleAfterMs = Number(pipelineLock.staleAfterMs) || 60_000;
    const fresh = heartbeatMs !== null && now - heartbeatMs <= staleAfterMs;
    if (fresh) {
      return refuse('pipeline_lock_held', `postrace pipeline lock is fresh for pid ${pipelineLock.pid}.`);
    }
    pass('pipeline-lock', `stale lock from pid ${pipelineLock.pid}; takeover allowed`);
  } else {
    pass('pipeline-lock', 'free');
  }

  if (!due.length && !force) return refuse('no_work_due', 'No session has ended since the last successful run, and no retry is pending.');
  pass('work-due', force && !due.length ? 'forced run with nothing due' : `${due.length} session(s) due`);

  return { proceed: true, reason: 'work_due', detail: `${due.length} session(s) due`, checks, due };
};

// ---------------------------------------------------------------------------
// Status rendering
// ---------------------------------------------------------------------------

/** The read-only summary written to disk and served by /api/postrace-status. */
export const buildStatus = ({ state, run, now = Date.now() }) => {
  const sessions = Object.values(state?.sessions ?? {});
  const counts = sessions.reduce((acc, entry) => {
    acc[entry.state] = (acc[entry.state] ?? 0) + 1;
    return acc;
  }, {});
  const flags = [
    ...asArray(state?.flags),
    ...sessions.flatMap((entry) => asArray(entry.flags).map((flag) => ({ ...flag, sessionId: entry.sessionId })))
  ];
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    updatedAt: iso(now),
    lastRunAt: state?.lastRunAt ?? null,
    lastSuccessAt: state?.lastSuccessAt ?? null,
    lastPublishAt: state?.lastPublishAt ?? null,
    lastRun: run ?? null,
    sessionCounts: counts,
    pendingRetries: sessions
      .filter((entry) => entry.state !== SESSION_STATES.ABANDONED && !(entry.state === SESSION_STATES.COMPLETE && entry.verified))
      .map((entry) => ({
        sessionId: entry.sessionId,
        eventName: entry.eventName ?? null,
        state: entry.state,
        missing: entry.missing ?? [],
        attempts: entry.attempts ?? 0,
        nextAttemptAt: entry.nextAttemptAt ?? null
      }))
      .sort((left, right) => String(left.nextAttemptAt).localeCompare(String(right.nextAttemptAt))),
    abandoned: sessions
      .filter((entry) => entry.state === SESSION_STATES.ABANDONED)
      .map((entry) => ({ sessionId: entry.sessionId, eventName: entry.eventName ?? null, missing: entry.missing ?? [], abandonedAt: entry.abandonedAt })),
    flags,
    sessions: Object.fromEntries(
      sessions.map((entry) => [
        entry.sessionId,
        {
          state: entry.state,
          eventName: entry.eventName ?? null,
          sessionName: entry.sessionName ?? null,
          endedAt: entry.endedAt ?? null,
          missing: entry.missing ?? [],
          attempts: entry.attempts ?? 0,
          nextAttemptAt: entry.nextAttemptAt ?? null,
          lastOutcome: entry.lastOutcome ?? null
        }
      ])
    )
  };
};

// ---------------------------------------------------------------------------
// Publication plans
// ---------------------------------------------------------------------------

/**
 * Publication is a plan, not an action. Each mode returns an ordered command
 * list; the shell executes it only when the flag asked for that mode. Keeping it
 * declarative is what lets the tests assert the exact sequence — including that
 * `none` never contains a command at all — without running anything.
 *
 * The host is expected to change (MacBook today, Mac mini next season), which is
 * the whole reason this is pluggable rather than inlined.
 */
export const planPublish = ({
  mode,
  repoRoot,
  branch,
  commitMessage,
  stagePaths = null,
  miniHost = null,
  appServerLabel = 'com.brycecast.app-server',
  uid = null
}) => {
  if (!PUBLISH_MODES.includes(mode)) throw new Error(`Unknown publish mode "${mode}". Expected one of: ${PUBLISH_MODES.join(', ')}.`);

  if (mode === 'none') {
    return {
      mode,
      commands: [],
      note: 'Build-only. The verified package stays in the working tree for a human to review and publish.'
    };
  }

  // Both real modes start with the same commit of generated data.
  //
  // `git add` names the exact dirty paths that classifyWorkingTree already
  // allowed, never `-A` and never a broad directory. A directory pathspec would
  // be wrong in both directions here: `analysis/` would sweep in the builders'
  // own source, while the literal prefix list would MISS the generated
  // `analysis/<lane>/output/` trees, which are matched by pattern rather than by
  // prefix. Enumerating what is actually dirty is the only version that is
  // provably neither too wide nor too narrow.
  const paths = (stagePaths ?? PUBLISHABLE_PATHS).filter((path) => isPublishablePath(path) || PUBLISHABLE_PATHS.includes(path));
  if (!paths.length) throw new Error('Refusing to publish: nothing allowlisted to stage.');
  const commit = [
    { id: 'stage', argv: ['git', 'add', '--', ...paths], cwd: repoRoot },
    { id: 'commit', argv: ['git', 'commit', '-m', commitMessage], cwd: repoRoot }
  ];

  if (mode === 'deploy-mini') {
    return {
      mode,
      commands: [
        ...commit,
        // Fast-forward only: if master has diverged, a human reconciles it.
        { id: 'fast-forward-master', argv: ['git', 'branch', '--force', 'master', branch], cwd: repoRoot, requiresAncestor: { of: 'master', to: branch } },
        { id: 'deploy', argv: ['npm', 'run', 'deploy:mini'], cwd: repoRoot }
      ],
      note: `Commits generated data on ${branch}, fast-forwards master and runs the guarded deploy to ${miniHost ?? 'the mini'}.`
    };
  }

  // mode === 'local' — the future mini-resident mode: no SSH, no bundle. Build
  // in place, swap dist the way ops/macos/update-mini.sh does, restart and
  // health-check the app server.
  const domain = uid === null ? 'gui/$(id -u)' : `gui/${uid}`;
  return {
    mode,
    commands: [
      ...commit,
      // `npm run build` has already produced dist/ during the gate set; it is
      // rebuilt here so the published bundle is the committed tree exactly.
      { id: 'build', argv: ['npm', 'run', 'build'], cwd: repoRoot },
      // Internal steps are functions in the shell, not sub-processes: the dist
      // swap has to be atomic and its rollback has to survive a failure, which a
      // spawned child cannot guarantee.
      { id: 'swap-dist', internal: 'swap-dist' },
      { id: 'restart-app-server', argv: ['launchctl', 'kickstart', '-k', `${domain}/${appServerLabel}`], cwd: repoRoot },
      { id: 'health-check', internal: 'health-check' }
    ],
    note: 'Mini-resident mode: build, atomic dist swap, app-server restart, /api/health release check with rollback on failure.'
  };
};
