// Composes the two replay sources behind the sqlite overlay's interface:
//  - the runner-archive overlay (our own 1-second Race Control captures), and
//  - the lake-fed feeds (2024-25 RaceTools + 2026 Timing71 normalized replays).
//
// available() merges both, source-tiered; a lake session is suppressed when a
// watchable capture already covers the same event session, so our own capture
// stays authoritative and a race page never shows two "Watch this race unfold"
// modules for the same race. Only one playback is active at a time, and the
// live-guard preempts whichever source is playing.

const CAPTURE_TIER = 'brycecast_capture';
const CAPTURE_TIER_LABEL = 'BryceCast Race Control capture';

export const createReplayRouter = ({ captureOverlay, lakeFeeds, enabled = false }) => {
  let activeSource = null; // 'capture' | 'lake'

  const available = () => {
    const base = captureOverlay.available();
    if (!enabled || base.enabled === false) return base;
    const captureSessions = (base.sessions ?? []).map((s) => ({
      ...s,
      sourceTier: s.sourceTier ?? CAPTURE_TIER,
      tierLabel: s.tierLabel ?? CAPTURE_TIER_LABEL
    }));
    // A watchable capture wins over a lake feed for the same event session.
    const watchableCaptureEventIds = new Set(
      captureSessions.filter((s) => s.watchable && s.eventSessionId).map((s) => String(s.eventSessionId))
    );
    const lakeSessions = lakeFeeds.available().map((s) =>
      watchableCaptureEventIds.has(String(s.eventSessionId))
        ? { ...s, watchable: false, supersededByCapture: true }
        : s
    );
    const active = lakeFeeds.isActive()
      ? lakeFeeds.status().sessionKey ?? null
      : base.active ?? null;
    return { ...base, active, sessions: [...captureSessions, ...lakeSessions] };
  };

  const start = ({ session, t0, speed = 1 }) => {
    if (enabled && lakeFeeds.has(session)) {
      captureOverlay.stop();
      const state = lakeFeeds.start({ session, t0, speed });
      activeSource = 'lake';
      return state;
    }
    lakeFeeds.stop();
    const state = captureOverlay.start({ session, t0, speed });
    activeSource = 'capture';
    return state;
  };

  const stop = () => {
    lakeFeeds.stop();
    const state = captureOverlay.stop();
    activeSource = null;
    return state;
  };

  const status = () => {
    if (activeSource === 'lake') return lakeFeeds.status();
    if (activeSource === 'capture') return captureOverlay.status();
    return captureOverlay.status();
  };

  const currentRecord = () => {
    if (activeSource === 'lake') return lakeFeeds.currentRecord();
    if (activeSource === 'capture') return captureOverlay.currentRecord();
    // No router-tracked source yet (e.g. a session started directly on the
    // capture overlay); fall back to it so nothing regresses.
    return captureOverlay.currentRecord();
  };

  /**
   * Stateless, per-request replay resolution — the heart of per-client replay.
   * Given the replay params a client appended to a live route (`session`, `rt`,
   * `speed`), decide what that ONE request should be served, holding NO global
   * state. Precedence, strictest first:
   *   1. replay disabled            → { kind: 'disabled' } (serve the real feed)
   *   2. the real runner is live    → { kind: 'live' }     (ignore params, real feed)
   *   3. session unknown/not watchable → { kind: 'refused', statusCode, reason }
   *   4. a row resolves at `rt`     → { kind: 'record', record }
   *   5. `rt` falls in a withheld source interval → { kind: 'source_gap', 409, gap }
   *   6. `rt` out of the archived span → { kind: 'refused', 400 }
   *
   * The live-guard here is per-request and stricter than the old mid-playback
   * one: a live runner preempts EVERY replaying client on their very next poll.
   */
  const resolveReplay = ({ session, rt, speed = 1 }) => {
    if (!enabled) return { kind: 'disabled' };
    // Live-guard wins unconditionally: if the real race is on, replay params are
    // ignored and the request falls through to the real Race Control feed.
    if (captureOverlay.runnerIsLive?.()) return { kind: 'live' };
    // Canonical race links survive promotion to a better native capture. The
    // suppressed lake row remains in the index as provenance, while playback
    // resolves the preferred watchable capture for that exact canonical race.
    const entries = available().sessions ?? [];
    const canonical = /^session_indy_nxt_\d{4}_\d+$/.test(String(session ?? ''));
    const entry = (canonical ? entries.find((candidate) => candidate.canonicalSessionId === session && candidate.watchable) : null)
      ?? entries.find((candidate) => candidate.sessionKey === session);
    if (!entry) {
      return { kind: 'refused', statusCode: 404, reason: `Replay session ${session ?? '(missing)'} was not found.` };
    }
    if (!entry.watchable) {
      return {
        kind: 'refused',
        statusCode: 422,
        reason: `Replay refused: ${session} is not a watchable Bryce race capture.`
      };
    }
    const resolvedKey = entry.sessionKey;
    const owner = lakeFeeds.has(resolvedKey) ? lakeFeeds : captureOverlay;
    const resolved = owner.recordAt({ session: resolvedKey, rt, speed });
    if (resolved?.record) return { kind: 'record', record: resolved.record };
    if (resolved?.sourceGap) {
      return {
        kind: 'source_gap',
        statusCode: 409,
        reason: resolved.sourceGap.message,
        gap: resolved.sourceGap
      };
    }
    return {
      kind: 'refused',
      statusCode: 400,
      reason: `Replay timestamp ${rt ?? '(missing)'} is outside the archived span for ${session}.`
    };
  };

  return { enabled, available, start, stop, status, currentRecord, resolveReplay };
};
