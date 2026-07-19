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
}

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
