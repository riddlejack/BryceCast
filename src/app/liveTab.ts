import { useEffect, useRef, useState } from 'react';
import { switchValue } from '../review/switches';
import { useNextSession } from './useNextSession';

/** How long before a scheduled INDY NXT session the Live tab comes up. */
export const LIVE_TAB_LEAD_MS = 30 * 60_000;
/** A late start keeps it up this long past the scheduled time. */
const LIVE_TAB_LATE_MS = 2 * 60 * 60_000;

/** The schedule feed gives some sessions a date but no time yet, as midnight
 *  Eastern (production, November 17: St. Petersburg at 2027-03-07T05:00Z).
 *  A start like that is not a start time, so it never opens the window. */
const isDayOnly = (iso: string): boolean => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return true;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  return hour === '00' && minute === '00';
};

/**
 * Whether the nav shows Live (Jack, November 17: "only … when there is a race
 * live, otherwise we're not using the tab anyway").
 *
 * - Timing is live for an INDY NXT session (practice, qualifying or race):
 *   readiness `ready` or `degraded`, the same states as the green dot.
 * - The half hour before a scheduled session with a real start time, while
 *   the feed waits for it (`pre_session`, or another series still on track),
 *   so the tab is there when people come to watch the start. Off-season the
 *   feed also reads `pre_session`, which alone never shows it.
 * - Timing paused mid-session (`stale`, e.g. a red flag) keeps it up once it
 *   has shown, so it never blinks out during a stoppage.
 * - A visitor's replay never counts. `/live` itself always works.
 * - Review switch `livetab=always`: shown as before.
 */
export const useLiveTabShown = (liveState: string | undefined, replayActive: boolean, search: URLSearchParams): boolean => {
  const always = switchValue('livetab', search) === 'always';
  const live = !replayActive && (liveState === 'ready' || liveState === 'degraded');
  const waiting = !replayActive && (liveState === 'pre_session' || liveState === 'wrong_series');
  const next = useNextSession(waiting && !always);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [waiting]);
  const startsMs = next?.startsAt && !isDayOnly(next.startsAt) ? Date.parse(next.startsAt) : NaN;
  const soon = waiting && Number.isFinite(startsMs) && startsMs - now <= LIVE_TAB_LEAD_MS && now - startsMs <= LIVE_TAB_LATE_MS;
  const shownRef = useRef(false);
  const paused = !replayActive && liveState === 'stale' && shownRef.current;
  const shown = live || soon || paused;
  shownRef.current = shown;
  return always || shown;
};
