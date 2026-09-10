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

export type ReplaySourceTier =
  | 'brycecast_capture'
  | 'race_control_capture'
  | 'racetools_capture'
  | 'timing71_normalized';

export interface ReplayProvenance {
  tier: ReplaySourceTier;
  label: string;
  detail: string;
  caveat: string | null;
}

/** Both names identify timing snapshots retained directly by BryceCast. The
 * newer ledger uses `race_control_capture`; the legacy overlay still emits
 * `brycecast_capture` for older archives. */
export const isBryceCastCaptureTier = (tier: ReplaySourceTier): boolean =>
  tier === 'brycecast_capture' || tier === 'race_control_capture';

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
    detail: 'BryceCast retained snapshots from INDYCAR Race Control timing during the session. This replays that archive — never live.',
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

/** Lookup by archive sessionKey (the Live page's replay target). A canonical
 * race id can appear twice after native-capture promotion: once as the old lake
 * sessionKey, now explicitly unwatchable/superseded, and once as the native
 * capture's canonicalSessionId. Resolve that exact canonical identity to its
 * watchable row before considering the superseded exact-key row. Raw capture
 * keys keep exact-only lookup; no event-id or name fallback is allowed. */
export const captureBySessionKey = (
  available: ReplayAvailable | null,
  sessionKey: string
): ReplaySessionInfo | null => {
  if (!available) return null;
  const isCanonicalIndyNxtRace = /^session_indy_nxt_\d{4}_\d+$/.test(sessionKey);
  if (isCanonicalIndyNxtRace) {
    const preferred = available.sessions.find(
      (session) => session.watchable && session.canonicalSessionId === sessionKey
    );
    if (preferred) return preferred;
  }
  return available.sessions.find((session) => session.sessionKey === sessionKey) ?? null;
};

/** A candidate venue visit for the prior-year join — the minimum a venue-dossier
 *  visit carries. Kept structural so both the race page and Race Week can pass
 *  their `UiVenueDossierVisit` rows without importing the package type here. */
export interface VenueVisitRef {
  sessionId: string;
  seasonYear: number;
  raceLabel: string;
}

/** A watchable replay of a DIFFERENT year at the same venue, ready to link. */
export interface PriorYearReplay {
  seasonYear: number;
  sessionId: string;
  raceLabel: string;
  capture: ReplaySessionInfo;
}

/** Prior-year replays at a venue, joined STRICTLY by venue identity: each
 *  candidate visit's own canonical sessionId is resolved through
 *  {@link watchableCaptureForRace}. This never matches on event name — event
 *  names drift year to year ("Music City" ⇄ "at Milwaukee Mile"), and
 *  RaceTools-derived feeds carry empty-string ids, so a name join is unsafe.
 *  Visits whose sessionId is empty or whitespace are dropped before resolving
 *  (empty string is not a present id); only visits strictly BEFORE `beforeYear`
 *  qualify, so a race page never offers its own year or the same weekend's other
 *  race. Returns most-recent year first. */
export const priorYearReplaysAtVenue = (
  available: ReplayAvailable | null,
  visits: VenueVisitRef[],
  beforeYear: number | null | undefined
): PriorYearReplay[] => {
  if (!available || !Number.isFinite(beforeYear)) return [];
  const cutoff = beforeYear as number;
  return visits
    .filter((visit) => typeof visit.sessionId === 'string' && visit.sessionId.trim() !== '')
    .filter((visit) => Number.isFinite(visit.seasonYear) && visit.seasonYear < cutoff)
    .map((visit): PriorYearReplay | null => {
      const capture = watchableCaptureForRace(available, visit.sessionId);
      return capture && capture.watchable
        ? { seasonYear: visit.seasonYear, sessionId: visit.sessionId, raceLabel: visit.raceLabel, capture }
        : null;
    })
    .filter((entry): entry is PriorYearReplay => entry !== null)
    .sort((left, right) => right.seasonYear - left.seasonYear);
};

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
