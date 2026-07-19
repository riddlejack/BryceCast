import { loadApiJson } from './api';

/** One archived capture the replay overlay can play back (see
 *  scripts/lib/replay-overlay.mjs → available()). Race pages match on
 *  `eventSessionId`; the Live page plays back by `sessionKey`. */
export interface ReplaySessionInfo {
  sessionKey: string;
  eventId: string | null;
  eventSessionId: string | null;
  canonicalSessionId: string | null;
  eventName: string | null;
  sessionName: string | null;
  seasonYear: number | null;
  isRace: boolean;
  samples: number;
  /** Samples that carried a Bryce timing row (wrong-series / identity guard). */
  bryceSamples?: number;
  firstCheckedAt: string | null;
  lastCheckedAt: string | null;
  firstGreenAt: string | null;
  durationSeconds: number | null;
  totalLaps: number | null;
  watchable: boolean;
  /** Provenance tier of the feed: our own 1s capture, or a lake-fed replay. */
  sourceTier?: ReplaySourceTier;
  /** Human label for the tier — never reads "official" or masks a lake source. */
  tierLabel?: string;
  /** Set on a lake session when the as-raced order diverges from canonical
   *  (a post-race DQ); carries the honesty line at the checker. */
  asRaced?: string | null;
  /** A lake session suppressed because our own watchable capture covers it. */
  supersededByCapture?: boolean;
}

export type ReplaySourceTier = 'brycecast_capture' | 'racetools_capture' | 'timing71_normalized';

export interface ReplayProvenance {
  tier: ReplaySourceTier;
  label: string;
  detail: string;
  caveat: string | null;
}

/** The trust-rail descriptor for a replay session's source tier. Keeps the honest
 *  distinction: our own Race Control capture vs a third-party normalized replay —
 *  never "official", never confusable with live. */
export const replayProvenance = (session: ReplaySessionInfo | null): ReplayProvenance => {
  const tier = session?.sourceTier ?? 'brycecast_capture';
  const label =
    session?.tierLabel ??
    (tier === 'racetools_capture'
      ? 'RaceTools race-weekend capture'
      : tier === 'timing71_normalized'
        ? 'third-party normalized (Timing71)'
        : 'BryceCast 1-second Race Control capture');
  if (tier === 'racetools_capture') {
    return {
      tier,
      label,
      detail: 'Reconstructed from a RaceTools race-weekend timing capture — a third-party capture of the series timing feed, normalized into a second-by-second replay.',
      caveat: session?.asRaced ? 'Shown as-raced; the official result is the reference.' : 'A third-party capture; not official timing, and not our own live capture.'
    };
  }
  if (tier === 'timing71_normalized') {
    return {
      tier,
      label,
      detail: 'Reconstructed from Timing71 normalized timing states — third-party normalized observations of the 2026 season, replayed second by second.',
      caveat: session?.asRaced ? 'Shown as-raced; a post-race change means the official result differs.' : 'Third-party normalized data; not official timing, and not our own live capture.'
    };
  }
  return {
    tier,
    label,
    detail: 'BryceCast recorded the official Race Control timing feed once per second during the session. This replays that archive — never live.',
    caveat: null
  };
};

export interface ReplayAvailable {
  schemaVersion?: string;
  enabled: boolean;
  checkedAt?: string;
  active: string | null;
  sessions: ReplaySessionInfo[];
  error?: string;
}

/** Returns null when replay is disabled (production 404) or unreachable — the
 *  callers treat null as "no replay here" and stay silent. */
export const loadReplayAvailable = async (): Promise<ReplayAvailable | null> => {
  const payload = await loadApiJson<ReplayAvailable>('/api/replay/available');
  if (!payload || payload.enabled !== true || !Array.isArray(payload.sessions)) return null;
  return payload;
};

/** Canonical race sessionIds are `session_indy_nxt_<year>_<eventSessionId>`. */
export const eventSessionIdFromCanonical = (sessionId: string): string | null =>
  sessionId.match(/_(\d+)$/)?.[1] ?? null;

/** The watchable capture for a race page, matched by eventSessionId. */
export const watchableCaptureForRace = (
  available: ReplayAvailable | null,
  sessionId: string
): ReplaySessionInfo | null => {
  if (!available) return null;
  const eventSessionId = eventSessionIdFromCanonical(sessionId);
  if (!eventSessionId) return null;
  return (
    available.sessions.find((session) => session.watchable && session.eventSessionId === eventSessionId) ?? null
  );
};

/** Lookup by archive sessionKey (the Live page's replay target). */
export const captureBySessionKey = (
  available: ReplayAvailable | null,
  sessionKey: string
): ReplaySessionInfo | null => available?.sessions.find((session) => session.sessionKey === sessionKey) ?? null;

/** Short venue label for the replay chip, preferring the live payload's track
 *  name and falling back to the event name with known series chrome stripped. */
export const shortVenueFromEventName = (eventName: string | null | undefined): string | null => {
  if (!eventName) return null;
  const atMatch = eventName.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].trim();
  return eventName
    .replace(/INDY NXT( by Firestone)?/i, '')
    .replace(/Grand Prix/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || eventName;
};
