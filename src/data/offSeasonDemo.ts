/* ---------- off-season auto-demo policy ----------
 *
 * With nothing on the calendar, tapping Live starts a replay of the season's
 * featured race rather than showing an empty schedule (see LiveScreen's
 * OffSeasonLive). This module owns the one question that decides it: is the
 * demo still the default experience in this tab?
 *
 * It used to record "offered" at the moment auto-start was DECIDED, so the demo
 * ran exactly once per tab — tapping Live a second time landed on "No session on
 * the calendar" and the feature read as unshipped. The record now means
 * DECLINED: the demo is the default every time Live opens with nothing
 * scheduled, and only an explicit choice in that tab — "Exit replay" or "Pick
 * another race" — turns it off and shows the list instead. The storage key is
 * new so a tab still holding the old "offered" flag is not silently opted out.
 *
 * sessionStorage (per tab, cleared when the tab closes), so the choice never
 * follows anyone into a new tab or a new day. Every access is guarded: with
 * storage blocked the demo simply stays the default, which is the behaviour we
 * want anyway.
 */

export const OFFSEASON_DEMO_PARAM = 'demo';
export const OFFSEASON_DEMO_VALUE = 'offseason';
export const OFFSEASON_DEMO_DECLINED_KEY = 'bc:offseason-demo-declined';

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): SessionStorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null; // storage blocked (private mode, etc.)
  }
};

export const hasDeclinedOffSeasonDemo = (storage: SessionStorageLike | null = defaultStorage()): boolean => {
  try {
    return storage?.getItem(OFFSEASON_DEMO_DECLINED_KEY) === '1';
  } catch {
    return false;
  }
};

/** Called only from a control the visitor pressed: "Exit replay" on the demo, or
 *  "Pick another race" in its banner. Never from the auto-start path. */
export const declineOffSeasonDemo = (storage: SessionStorageLike | null = defaultStorage()): void => {
  try {
    storage?.setItem(OFFSEASON_DEMO_DECLINED_KEY, '1');
  } catch {
    /* see defaultStorage */
  }
};

/** Auto-start when this tab has not opted out, a watchable featured race
 *  resolved, and this mount has not already navigated. A null `featured` means
 *  the replay catalog has not resolved yet — not a refusal — so the caller keeps
 *  its attempt latch closed and tries again when the catalog changes. */
export const shouldAutoStartOffSeasonDemo = ({
  declined,
  hasFeaturedRace,
  alreadyAttempted
}: {
  declined: boolean;
  hasFeaturedRace: boolean;
  alreadyAttempted: boolean;
}): boolean => !alreadyAttempted && !declined && hasFeaturedRace;

/** How far past the green flag the auto-demo joins, in seconds of SOURCE time.
 *  Six minutes is one minute more than the charts' five-minute window, so the
 *  bounded seed fills the running order and the battle completely on the demo's
 *  first paint. */
export const OFFSEASON_DEMO_JOIN_SECONDS = 360;
/** …but never more than this share of the capture, so a short or part-captured
 *  race is not skipped halfway through to reach a fixed offset. */
export const OFFSEASON_DEMO_MAX_JOIN_FRACTION = 0.4;

interface DemoCaptureSpan {
  firstCheckedAt?: string | null;
  lastCheckedAt?: string | null;
  firstGreenAt?: string | null;
  durationSeconds?: number | null;
}

/**
 * The virtual instant the auto-demo starts at: the green flag plus a few
 * minutes, as an ISO string, or `null` to start at the green flag.
 *
 * Why not the green flag. The demo exists to show what race day looks like, and
 * at the green flag the archive has nothing behind it to seed from — the running
 * order has to clear its two-sample gate from scratch and the battle has to wait
 * for Race Control to publish real intervals, a lap or two in. Joining a few
 * minutes later costs nothing (the race is archived either way) and the seed
 * arrives with both charts already full.
 *
 * This is the AUTO-DEMO only. A replay someone picked — a race page, Home, the
 * "Relive a race" list — still starts at the green flag, and Restart always
 * returns there whichever way the replay was opened.
 *
 * Every input is treated as untrustworthy: a capture with no green flag, no
 * usable span, or a nonsensical one falls back to `null` (the green flag) rather
 * than guessing a timestamp.
 */
export const offSeasonDemoStartAt = (capture: DemoCaptureSpan | null | undefined): string | null => {
  const greenMs = Date.parse(capture?.firstGreenAt ?? '');
  if (!Number.isFinite(greenMs)) return null;
  const firstMs = Date.parse(capture?.firstCheckedAt ?? '');
  const lastMs = Date.parse(capture?.lastCheckedAt ?? '');
  const spannedSeconds = Number.isFinite(firstMs) && Number.isFinite(lastMs) ? (lastMs - firstMs) / 1000 : NaN;
  const durationSeconds = Number(capture?.durationSeconds);
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : Number.isFinite(spannedSeconds) && spannedSeconds > 0
      ? spannedSeconds
      : NaN;
  if (!Number.isFinite(duration)) return null;
  const offsetSeconds = Math.min(OFFSEASON_DEMO_JOIN_SECONDS, duration * OFFSEASON_DEMO_MAX_JOIN_FRACTION);
  if (!(offsetSeconds > 0)) return null;
  const startMs = greenMs + offsetSeconds * 1000;
  // Belt and braces: a capture whose green flag sits near its end can never be
  // pushed past the last archived sample. (useReplaySession clamps to the span
  // as well; this keeps the URL itself honest.)
  if (Number.isFinite(lastMs) && startMs >= lastMs) return null;
  return new Date(startMs).toISOString();
};
