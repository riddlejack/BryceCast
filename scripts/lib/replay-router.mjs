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
const CAPTURE_TIER_LABEL = 'BryceCast 1-second Race Control capture';

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

  return { enabled, available, start, stop, status, currentRecord };
};
