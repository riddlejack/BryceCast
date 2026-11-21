import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, loadApiJson } from '../data/api';
import {
  captureBySessionKey,
  loadReplayAvailable,
  shortVenueFromEventName,
  type ReplaySessionInfo
} from '../data/replayAvailable';
import {
  FORMATION_MIN_LEAD_SECONDS,
  OPENING_CAUTION_LAPS,
  SEARCH_BATCH,
  SKIM_SPEED,
  cautionLapSpan,
  findFormationStart,
  findOpeningCaution,
  phasedClockPosition,
  replayPhases,
  type FlagSample,
  type OpeningCaution,
  type ReplayPhase
} from '../data/replayStart';
import { uiDataPackage } from '../data/uiDataPackage';
import { loadSectionLaps, type SectionLapsPack } from '../data/sectionLaps';
import { loadReplayTimeline, openingCautionFromTimeline, type ReplayTimeline } from '../data/replayTimeline';
import { useRouter } from './router';

/** The speeds the Time Machine offers. 1× is "as it happened"; 4× is the lively
 *  default; 16× skims; 32× runs a whole race in about a minute and a half per
 *  ten laps (round 7). The server ages its freshness stamp by at most 16×, so
 *  32× says 16 on the wire; the frames are the archive's own either way. */
export const REPLAY_SPEEDS = [1, 4, 16, 32] as const;
const DEFAULT_REPLAY_SPEED = 4;
export { SKIM_SPEED };

/** What the clock is skimming right now, for the bar to say in plain words. */
export interface ReplaySkim {
  /** `formation`: before the green flag. `caution`: the opening caution the
   *  visitor chose to watch, up to the restart. */
  kind: 'formation' | 'caution';
  /** The rate it plays at now. */
  speed: number;
  /** The visitor's own speed, which comes back at `until`. */
  backTo: number;
  /** Where the visitor's speed comes back. */
  until: 'green' | 'restart';
  /** Leader lap at that restart, when known. */
  restartLap: number | null;
}

/** The caution thrown in the opening laps, which a replay jumps by default
 *  (src/data/replayStart.ts). */
export interface ReplayOpeningCaution {
  kind: 'caution' | 'red';
  thrownAt: string;
  restartAt: string;
  /** The racing laps it covered, in the official summaries' terms; `from` is
   *  null when the feed began with it already out. */
  laps: { from: number | null; to: number } | null;
  /** The lap the race went green again on. */
  restartLap: number | null;
}

export interface ReplaySession {
  /** A resolvable replay is being driven from the URL. */
  engaged: boolean;
  /** Resolving the archive (client-side availability check). */
  starting: boolean;
  /** The virtual clock has been started at least once. */
  started: boolean;
  /** Replay is not possible here (mode disabled, or session not found). */
  unavailable: boolean;
  /** A live session preempted the replay mid-playback (server live-guard). */
  endedByLive: boolean;
  /** Human-readable reason the replay could not start (unwatchable/unknown
   *  capture, or the replay service being unavailable). Set whenever the overlay
   *  could not engage playback, so the page renders an honest "this replay can't
   *  start: <reason>" state instead of an eternal cue-up. */
  refusedReason: string | null;
  session: ReplaySessionInfo | null;
  speed: number;
  speeds: readonly number[];
  venue: string | null;
  seasonYear: number | null;
  returnHref: string;
  skippedSourceGap: { seconds: number; resumeAt: string } | null;
  /** The opening caution, once the search has found one (null while it runs,
   *  and for a start that ran green past the opening laps). */
  openingCaution: ReplayOpeningCaution | null;
  /** Wall-clock ms when the running clock last jumped the opening caution to
   *  its restart; null before the jump and after Restart or "watch it". */
  cautionSkippedAt: number | null;
  /** The capture opens early enough before the start to replay the formation
   *  lap (BryceCast's own captures; lake replays begin at or after the green). */
  formationAvailable: boolean;
  /** The formation lap is being located in the archive (a few reads). */
  formationPending: boolean;
  /** The race start: `firstGreenAt`, or the first frame of a lake feed that
   *  begins after it. Where the clock starts and where Restart returns. */
  greenFlagAt: string | null;
  /** Where the running clock was last started from: the race start, a `t0`
   *  deep link, the formation lap, the opening caution the visitor chose to
   *  watch, or a jump (a source-gap skip). */
  clockFrom: 'raceStart' | 't0' | 'formation' | 'caution' | 'jump' | 'seek' | null;
  /** Set while the clock plays the formation laps or a watched caution faster
   *  than the visitor's speed; null when it plays at the visitor's speed. */
  skim: ReplaySkim | null;
  /** The rate the clock runs at this moment: `speed`, or the skim's rate. */
  playbackSpeed: number;
  /** Bumped whenever the clock jumps (restart, formation, the caution jump or
   *  watching it, a gap skip), so the page can fetch the new moment at once. */
  clockEpoch: number;
  /** The clock is held still (Space, or the pause button). */
  paused: boolean;
  /** The whole race's flag changes and Bryce's running position at each order
   *  change, from one read after the first frame (src/data/replayTimeline.ts);
   *  null until it lands or when it could not be read. */
  timeline: ReplayTimeline | null;
  /** The lap the address asked for (`&lap=N`), read once when the replay opened. */
  startLap: number | null;
  setSpeed: (speed: number) => void;
  /** Hold or release the clock. */
  togglePause: () => void;
  /** Move the clock to a moment the visitor picked (the race bar, its keys,
   *  "Skip the caution"). Clears the chart window and fetches that moment at
   *  once; the opening-caution jump does not re-arm behind it. */
  seekTo: (atMs: number) => void;
  /** Ask for the race timeline now (the page calls it once its first frame is
   *  up, so the read never competes with that frame). */
  requestTimeline: () => void;
  /** Back to the race start (the opening caution is jumped again). */
  restart: () => void;
  /** Go back before the start: the clock runs from just before the field
   *  leaves the grid for the formation lap (session open when that can't be
   *  found). */
  restartFromFormation: () => void;
  /** Start locating the formation lap ahead of a click (hover or focus on the
   *  control), so the click itself is instant. Safe to call repeatedly. */
  prepareFormation: () => void;
  /** Play the opening caution the replay jumped, from the moment it was
   *  thrown, at {@link SKIM_SPEED}, back to the visitor's speed at the restart. */
  watchCaution: () => void;
  /** Move the local clock to the first observation after a withheld source gap. */
  jumpTo: (iso: string, sourceGapSeconds?: number) => void;
  exit: () => void;
  /** The query string this client must append to every live-route poll while
   *  replaying — `?replay=<sessionKey>&rt=<isoVirtualTime>&speed=<n>` — or `''`
   *  when no replay is engaged. Read live off the local virtual clock, so it is
   *  correct at poll time (not render time). This is the ENTIRE server contract:
   *  the client owns the clock, the server stays stateless per request. */
  getReplayParams: () => string;
}

interface ReplayClock {
  sessionKey: string;
  /** Virtual time the clock started from, in ms. */
  virtualStartMs: number;
  /** Wall-clock ms when this segment started (reset on restart / speed change). */
  startedAtWallMs: number;
  speed: number;
  /** Archived span bounds, so the virtual clock never runs past the capture. */
  firstCheckedMs: number;
  lastCheckedMs: number;
  /** Stretches before the visitor's speed takes over (formation skim, the
   *  start up to the opening-caution jump, a watched caution). Empty for a
   *  plain clock. */
  phases: ReplayPhase[];
  /** Held still at `virtualStartMs`. */
  paused?: boolean;
}

const inactive: Omit<
  ReplaySession,
  | 'setSpeed'
  | 'restart'
  | 'restartFromFormation'
  | 'prepareFormation'
  | 'watchCaution'
  | 'jumpTo'
  | 'exit'
  | 'getReplayParams'
  | 'togglePause'
  | 'seekTo'
  | 'requestTimeline'
> = {
  engaged: false,
  starting: false,
  started: false,
  unavailable: false,
  endedByLive: false,
  refusedReason: null,
  session: null,
  speed: DEFAULT_REPLAY_SPEED,
  speeds: REPLAY_SPEEDS,
  venue: null,
  seasonYear: null,
  returnHref: '/races',
  skippedSourceGap: null,
  openingCaution: null,
  cautionSkippedAt: null,
  formationAvailable: false,
  formationPending: false,
  greenFlagAt: null,
  clockFrom: null,
  skim: null,
  playbackSpeed: DEFAULT_REPLAY_SPEED,
  clockEpoch: 0,
  paused: false,
  timeline: null,
  startLap: null
};

/** The longest the opening-caution and formation searches may take before
 *  the replay carries on without them (plays the caution; starts the
 *  formation at session open). */
const SEARCH_TIMEOUT_MS = 8_000;

/** The formation search when it runs by itself in the background, one read
 *  at a time (nine reads of 0.4-0.9 s each on the production host). */
const FORMATION_PROBE_TIMEOUT_MS = 20_000;

/** The race timeline is read once the page's first frame is up (the page asks
 *  for it); this is the latest it waits for that request. */
const TIMELINE_AUTO_START_MS = 1_500;

/** The longest `&lap=N` waits for the race's section pack before it starts the
 *  clock at the race start instead. */
const LAP_LINK_PACK_TIMEOUT_MS = 1_500;

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });

const replayQuery = (sessionKey: string, atMs: number) =>
  `replay=${encodeURIComponent(sessionKey)}&rt=${encodeURIComponent(new Date(atMs).toISOString())}&speed=${DEFAULT_REPLAY_SPEED}`;

/** One archive read, retried once: a single dropped read must not hide the
 *  opening caution. */
const loadWithRetry = async <T,>(path: string): Promise<T | null> =>
  (await loadApiJson<T>(path)) ?? (await loadApiJson<T>(path));

/** The archive's flag and leader lap at one virtual moment, read from the
 *  smallest replay-aware route (`/api/session`, ~2 KB). */
const sessionFlagAt = (sessionKey: string) => async (atMs: number): Promise<FlagSample> => {
  const payload = await loadWithRetry<{ flag?: unknown; lap?: unknown }>(`/api/session?${replayQuery(sessionKey, atMs)}`);
  const flag = typeof payload?.flag === 'string' && payload.flag.trim() ? payload.flag.trim().toUpperCase() : null;
  const lap = Number.parseInt(String(payload?.lap ?? ''), 10);
  return { flag, lap: Number.isFinite(lap) ? lap : null };
};

/** Whether any car has registered on the timing loops at a virtual moment:
 *  a non-zero `liveGap` on any row. Null when the archive has no rows there. */
const timingMovingAt = (sessionKey: string) => async (atMs: number): Promise<boolean | null> => {
  const payload = await loadApiJson<{ rows?: Array<{ liveGap?: unknown }> }>(`/api/timing?${replayQuery(sessionKey, atMs)}`);
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) return null;
  return payload.rows.some((row) => {
    const gap = String(row?.liveGap ?? '').trim();
    return gap !== '' && !/^0+(\.0+)?$/.test(gap);
  });
};

/** The race start as the clock can reach it. Lake replays can carry a green
 *  flag before their first frame; the clock clamps to the first frame there,
 *  so that is where "the start" is for them. */
const greenFlagMsOf = (session: ReplaySessionInfo): number | null => {
  const greenMs = Date.parse(session.firstGreenAt ?? '');
  const firstMs = Date.parse(session.firstCheckedAt ?? '');
  if (!Number.isFinite(greenMs)) return null;
  return Number.isFinite(firstMs) ? Math.max(greenMs, firstMs) : greenMs;
};

/** A Timing71 feed opens with 5-17 s of frames that carry timing rows but no
 *  Bryce row (all 12 of them; the replay-load diagnosis, November 15). The
 *  fixed server answers such a frame 502. Those feeds already open after the
 *  green, so their clock starts this far in, where Bryce is on the page. */
const TIMING71_OPENING_MS = 18_000;

/** Where a replay's clock starts by default and where Restart returns. */
const raceStartMsOf = (session: ReplaySessionInfo): number | null => {
  const green = greenFlagMsOf(session);
  if (green === null || session.sourceTier !== 'timing71_normalized') return green;
  const firstMs = Date.parse(session.firstCheckedAt ?? '');
  const lastMs = Date.parse(session.lastCheckedAt ?? '');
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return green;
  return Math.min(lastMs, Math.max(green, firstMs + TIMING71_OPENING_MS));
};

/** The moment Bryce starts lap `lap`, from the green flag and his official lap
 *  times (the section pack's lap totals): what `&lap=N` resumes at before any
 *  frame has been read. The marker's own model corrects it as frames arrive.
 *  Null when a lap before it has no time. */
export const lapStartFromPack = (
  pack: Pick<SectionLapsPack, 'lapTotals'>,
  greenMs: number,
  startPosition: number | null,
  lap: number
): number | null => {
  const seconds = new Map<number, number>();
  for (const tuple of pack.lapTotals) {
    if (tuple[0] !== null && tuple[6] !== null && tuple[6] > 0) seconds.set(tuple[0], tuple[6]);
  }
  let at = greenMs + Math.max(0, Math.min(10, ((startPosition ?? 1) - 1) * 0.37)) * 1000;
  for (let index = 1; index < lap; index += 1) {
    const value = seconds.get(index);
    if (value === undefined) return null;
    at += value * 1000;
  }
  return at;
};

/** What the official caution summaries (the package's caution atlas) say
 *  about a race's opening laps: `none` when the race is covered and no caution
 *  started on laps 1-3, the first such caution's laps when one did, `unknown`
 *  for a race the atlas does not cover yet (newer than its cut-off). */
type OfficialOpening =
  | { status: 'none' }
  | { status: 'caution'; from: number; to: number; restartLap: number | null }
  | { status: 'unknown' };

const officialOpeningFor = (session: ReplaySessionInfo): OfficialOpening => {
  const atlas = uiDataPackage.screens?.careerLab?.cautionAtlas;
  const sessionId = session.canonicalSessionId;
  const raceMs = Date.parse(session.firstCheckedAt ?? '');
  const asOfMs = Date.parse(`${atlas?.asOfDate ?? ''}T23:59:59Z`);
  if (!atlas || !sessionId || !Number.isFinite(raceMs) || !Number.isFinite(asOfMs) || raceMs > asOfMs) return { status: 'unknown' };
  const opening = (atlas.events ?? [])
    .filter((event) => event.sessionId === sessionId && event.startLap !== null && event.startLap <= OPENING_CAUTION_LAPS)
    .sort((left, right) => (left.startLap ?? 0) - (right.startLap ?? 0))[0];
  if (!opening) return { status: 'none' };
  const from = opening.startLap ?? 1;
  return { status: 'caution', from, to: Math.max(from, opening.endLap ?? from), restartLap: opening.restartLap ?? null };
};

/** At most {@link SEARCH_BATCH} archive reads in flight for this client, so a
 *  click never lands on the replay host as a burst. */
const limitConcurrency = <A extends unknown[], R>(fn: (...args: A) => Promise<R>, limit = SEARCH_BATCH) => {
  let active = 0;
  const queue: Array<() => void> = [];
  return async (...args: A): Promise<R> => {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await fn(...args);
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
};

/** The laps to name an opening caution by, and the lap the race went green
 *  again on, as the bar says it ("back to 4× at the lap 5 restart"): the
 *  official summary's, or the archive's counter plus one (the counter reads
 *  the laps completed; checked against the summaries on every opening caution
 *  in the archive). */
const withOfficialLaps = (
  session: ReplaySessionInfo,
  caution: OpeningCaution
): { caution: OpeningCaution; laps: ReplayOpeningCaution['laps'] } => {
  const official = officialOpeningFor(session);
  return {
    caution: {
      ...caution,
      restartLap:
        official.status === 'caution' && official.restartLap !== null
          ? official.restartLap
          : caution.restartLap !== null
            ? caution.restartLap + 1
            : null
    },
    laps: official.status === 'caution' ? { from: official.from, to: official.to } : cautionLapSpan(caution)
  };
};

/** How long the old search may run when the timeline could not be read. */
const FALLBACK_SEARCH_TIMEOUT_MS = 20_000;

/**
 * The opening caution for a capture. From the race timeline when it was read
 * (exact, no further reads); otherwise the bounded search of the archive, now
 * one read at a time. No answer at all for a race the official summaries show
 * starting clean.
 *
 * Why the change (round 7): the search issued 27 reads three at a time and
 * gave up after 8 s. Production answers one of these reads in 0.35-0.66 s
 * (November 16, measured serially), and the reads queue behind each other and
 * the page's own once-a-second polls on the one server process, so the search
 * ran out of time, returned nothing, and Monterey 2026 Race 2 played its ten
 * minutes of yellow at whatever speed the visitor had picked.
 */
const locateOpeningCaution = async (
  session: ReplaySessionInfo,
  timeline: ReplayTimeline | null
): Promise<{ caution: OpeningCaution; laps: ReplayOpeningCaution['laps'] } | null> => {
  const official = officialOpeningFor(session);
  if (official.status === 'none') return null;
  const greenMs = greenFlagMsOf(session);
  const lastMs = Date.parse(session.lastCheckedAt ?? '');
  if (greenMs === null || !Number.isFinite(lastMs)) return null;
  // The official summary already says the caution came on laps 1-3; the
  // archive's lap counter can tick over at the line as it is thrown
  // (Detroit 2024: official lap 3, counter 3), so allow one more.
  const openingLaps = official.status === 'caution' ? OPENING_CAUTION_LAPS + 1 : OPENING_CAUTION_LAPS;
  if (timeline) {
    const found = openingCautionFromTimeline(timeline, { greenMs, openingLaps });
    return found ? withOfficialLaps(session, found) : null;
  }
  const searched = await withTimeout(
    findOpeningCaution({ greenMs, lastMs, flagAt: limitConcurrency(sessionFlagAt(session.sessionKey), 1), openingLaps, batch: 1 }).catch(() => null),
    FALLBACK_SEARCH_TIMEOUT_MS,
    null
  );
  return searched ? withOfficialLaps(session, searched) : null;
};

const cautionForState = (caution: OpeningCaution, laps: ReplayOpeningCaution['laps']): ReplayOpeningCaution => ({
  kind: caution.kind,
  thrownAt: new Date(caution.thrownMs).toISOString(),
  restartAt: new Date(caution.restartMs).toISOString(),
  laps,
  restartLap: caution.restartLap
});

const formationAvailableFor = (session: ReplaySessionInfo): boolean => {
  const greenMs = Date.parse(session.firstGreenAt ?? '');
  const firstMs = Date.parse(session.firstCheckedAt ?? '');
  return Number.isFinite(greenMs) && Number.isFinite(firstMs) && greenMs - firstMs >= FORMATION_MIN_LEAD_SECONDS * 1000;
};

/** The initial playback rate a deep-link may seed via `?speed=`. "Clamped to the
 *  legal set" means: only the three offered rates (1|4|16) are honored; anything
 *  absent, unparseable, or off-set falls back to the loved default (4×) rather
 *  than snapping to a neighbor — a typo'd rate never surprises the family with a
 *  16× skim. Read ONCE at engage time, exactly like `?t0=`; the client owns the
 *  clock afterward, so every later change goes through {@link ReplaySession.setSpeed}. */
const clampSpeed = (raw: string | null): number => {
  const value = Number(raw);
  return REPLAY_SPEEDS.includes(value as (typeof REPLAY_SPEEDS)[number]) ? value : DEFAULT_REPLAY_SPEED;
};

const lapParamOf = (raw: string | null): number | null => {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isInteger(value) && value >= 2 && value <= 400 ? value : null;
};

const clampT0 = (session: ReplaySessionInfo, iso: string | null): string => {
  const green = session.firstGreenAt ?? session.firstCheckedAt ?? new Date().toISOString();
  if (!iso) return green;
  const at = Date.parse(iso);
  const last = Date.parse(session.lastCheckedAt ?? '');
  if (Number.isFinite(at) && Number.isFinite(last) && at > last) return session.lastCheckedAt ?? green;
  const first = Date.parse(session.firstCheckedAt ?? '');
  if (Number.isFinite(at) && Number.isFinite(first) && at < first) return session.firstCheckedAt ?? green;
  return iso;
};

/** Where a clock is now (src/data/replayStart.ts, `phasedClockPosition`). A
 *  paused clock stays where it was held. */
const clockPosition = (clock: ReplayClock, nowWallMs = Date.now()) =>
  phasedClockPosition({
    virtualStartMs: clock.virtualStartMs,
    elapsedWallMs: clock.paused ? 0 : nowWallMs - clock.startedAtWallMs,
    speed: clock.speed,
    phases: clock.phases
  });

/** The current virtual timestamp of a clock, clamped into the archived span. At
 *  the end of the capture it pins to the last frame — the post-checkered
 *  "Race complete · as raced" state, which stays simulated (never live). */
const virtualNowMsOf = (clock: ReplayClock): number =>
  Math.min(clock.lastCheckedMs, Math.max(clock.firstCheckedMs, clockPosition(clock).atMs));

/** The server accepts speeds 1, 2, 4 and 16, and uses the value only to age
 *  the payload's freshness stamp; a faster formation skim says 16 on the wire. */
const wireSpeed = (rate: number) => (rate > SKIM_SPEED ? SKIM_SPEED : rate);

/**
 * Drives a per-CLIENT replay from `/live?replay=<sessionKey>`. The client owns
 * the virtual clock entirely: it resolves the capture from `/api/replay/available`,
 * starts the clock at the race start at once, and thereafter appends
 * `?replay&rt&speed` to its own live-route polls via
 * {@link ReplaySession.getReplayParams}. There are NO start/stop control calls,
 * so one viewer's replay never touches the server's global state or any other
 * viewer's Live page. Behind the running clock it looks for a caution thrown in
 * the opening laps and, when there is one, jumps it (src/data/replayStart.ts).
 * `onRestart` clears the client-side chart window on every jump, so no chart
 * line joins two moments the replay did not play between.
 */
export const useReplaySession = (replayKey: string | null, onRestart?: () => void): ReplaySession => {
  const { navigate, route } = useRouter();
  const fromParam = route.search.get('from');
  // Optional deep-link into a race already in progress: `/live?replay=<key>&t0=<iso>`
  // starts the virtual clock at that archived moment instead of the race start,
  // so a joiner enters mid-race (the exact "server remembers the race" case Brief
  // O seeds). Absent — the race-page replay button flow — the clock starts at
  // the green. Restart always returns to the green regardless.
  const t0Param = route.search.get('t0');
  // Optional deep-link seed for the initial playback rate: `/live?replay=<key>&t0=<iso>&speed=1`
  // opens the replay at t0 running at 1× ("as it happened"), the shape a
  // "watch the pass" share link uses. Absent — the default 4×. Only `t0` and
  // `speed` are honored as deep-link inputs; the client derives `rt` off its
  // own clock for each poll (see getReplayParams) and never reads it from the URL.
  const speedParam = route.search.get('speed');
  // `&lap=N` (round 7): the race bar keeps the lap in the address, so a reload
  // or a shared link resumes there. Read once at engage, like `t0`.
  const lapParam = route.search.get('lap');
  const [state, setState] = useState(inactive);
  const sessionRef = useRef<ReplaySessionInfo | null>(null);
  const clockRef = useRef<ReplayClock | null>(null);
  /** Where the running clock was last started from (mirrors state.clockFrom
   *  for callbacks that must not wait on a render). */
  const clockFromRef = useRef<ReplaySession['clockFrom']>(null);
  /** The opening-caution search for a session key: in flight, then its answer
   *  (`undefined` until it lands). */
  const cautionRef = useRef<{ sessionKey: string; promise: Promise<OpeningCaution | null>; value: OpeningCaution | null | undefined } | null>(null);
  /** The formation start for a session key: the search in flight, then its
   *  answer. One search per session, shared by hover and click. */
  const formationRef = useRef<{ sessionKey: string; promise: Promise<number> } | null>(null);
  /** The race timeline for a session key: its read (held until `start`). */
  const timelineRef = useRef<{ sessionKey: string; promise: Promise<ReplayTimeline | null>; start: () => void } | null>(null);
  const locateFormationRef = useRef<() => void>(() => {});
  const speedRef = useRef<number>(DEFAULT_REPLAY_SPEED);
  const onRestartRef = useRef(onRestart);
  onRestartRef.current = onRestart;
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getReplayParams = useCallback((): string => {
    const clock = clockRef.current;
    if (!clock) return '';
    const position = clockPosition(clock);
    const rt = new Date(Math.min(clock.lastCheckedMs, Math.max(clock.firstCheckedMs, position.atMs))).toISOString();
    return `?replay=${encodeURIComponent(clock.sessionKey)}&rt=${encodeURIComponent(rt)}&speed=${wireSpeed(position.rate)}`;
  }, []);

  /** The opening caution for the running session, when the search has landed. */
  const knownCaution = (sessionKey: string): OpeningCaution | null =>
    cautionRef.current?.sessionKey === sessionKey ? cautionRef.current.value ?? null : null;

  /** Publish the clock's current phase (skim or not), make the opening-caution
   *  jump official when the clock has made it, and wake again at the next
   *  phase boundary, so the bar says each rate exactly while it is true. */
  const syncPhase = useCallback(() => {
    if (phaseTimerRef.current !== null) clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = null;
    let clock = clockRef.current;
    if (!clock) {
      setState((previous) => (previous.skim === null ? previous : { ...previous, skim: null }));
      return;
    }
    const nowWall = Date.now();
    let position = clockPosition(clock, nowWall);
    if (position.jumped) {
      // The clock has gone from the thrown caution to the restart: settle it
      // there (the jump phase is spent), clear the chart window so no line
      // joins the start to the restart, fetch the restart at once and say
      // what was skipped.
      clock = {
        ...clock,
        virtualStartMs: position.atMs,
        startedAtWallMs: nowWall,
        phases: clock.phases.filter((phase) => phase.untilMs > position.atMs && phase.jumpToMs === undefined)
      };
      clockRef.current = clock;
      position = clockPosition(clock, nowWall);
      onRestartRef.current?.();
      setState((previous) => ({ ...previous, cautionSkippedAt: nowWall, clockEpoch: previous.clockEpoch + 1 }));
    }
    const caution = knownCaution(clock.sessionKey);
    const skim: ReplaySkim | null =
      position.phase && position.phase.kind !== 'start' && position.rate > clock.speed
        ? {
            kind: position.phase.kind,
            speed: position.rate,
            backTo: clock.speed,
            // A watched caution ends at the restart; the formation ends at the
            // green flag, where the visitor's speed returns for the start.
            until: position.phase.kind === 'caution' ? 'restart' : 'green',
            restartLap: caution?.restartLap ?? null
          }
        : null;
    setState((previous) => {
      const same =
        previous.playbackSpeed === position.rate &&
        previous.skim?.kind === skim?.kind &&
        previous.skim?.speed === skim?.speed &&
        previous.skim?.backTo === skim?.backTo &&
        previous.skim?.restartLap === skim?.restartLap;
      return same ? previous : { ...previous, skim, playbackSpeed: position.rate };
    });
    if (!clock.paused && position.wallToNextMs !== null) {
      phaseTimerRef.current = setTimeout(syncPhase, Math.ceil(position.wallToNextMs) + 20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (phaseTimerRef.current !== null) clearTimeout(phaseTimerRef.current);
    },
    []
  );

  /** Start the clock at `fromMs` with the phases the rule gives it there. */
  const startClockAt = useCallback(
    (
      session: ReplaySessionInfo,
      fromMs: number,
      from: NonNullable<ReplaySession['clockFrom']>,
      options: { watchCaution?: boolean; announce?: boolean } = {}
    ) => {
      const clock = clockRef.current;
      if (!clock || clock.sessionKey !== session.sessionKey) return;
      const startMs = Date.parse(clampT0(session, new Date(fromMs).toISOString()));
      const virtualStartMs = Number.isFinite(startMs) ? startMs : clock.firstCheckedMs;
      clockRef.current = {
        ...clock,
        virtualStartMs,
        startedAtWallMs: Date.now(),
        paused: false,
        phases: replayPhases({
          fromMs: virtualStartMs,
          greenMs: greenFlagMsOf(session),
          caution: knownCaution(session.sessionKey),
          speed: clock.speed,
          watchCaution: options.watchCaution
        })
      };
      clockFromRef.current = from;
      if (options.announce !== false) onRestartRef.current?.();
      setState((previous) => ({
        ...previous,
        started: true,
        endedByLive: false,
        skippedSourceGap: null,
        formationPending: false,
        cautionSkippedAt: null,
        paused: false,
        clockFrom: from,
        clockEpoch: previous.clockEpoch + 1
      }));
      syncPhase();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncPhase]
  );

  useEffect(() => {
    if (!replayKey) {
      sessionRef.current = null;
      clockRef.current = null;
      clockFromRef.current = null;
      cautionRef.current = null;
      formationRef.current = null;
      timelineRef.current = null;
      setState(inactive);
      return undefined;
    }

    let cancelled = false;
    let autoTimeline: ReturnType<typeof setTimeout> | null = null;
    // Seed the initial playback rate from `?speed=` (or the default). The client
    // owns the clock after this seed — `setSpeed` drives every later change.
    const seededSpeed = clampSpeed(speedParam);
    speedRef.current = seededSpeed;
    clockRef.current = null;
    setState({ ...inactive, engaged: true, starting: true, speed: seededSpeed });

    void (async () => {
      const available = await loadReplayAvailable();
      if (cancelled) return;
      const session = captureBySessionKey(available, replayKey);
      const returnHref =
        fromParam && /^session_/.test(fromParam)
          ? `/races/${encodeURIComponent(fromParam)}`
          : session?.canonicalSessionId
            ? `/races/${encodeURIComponent(session.canonicalSessionId)}`
            : '/races';
      // Hold a direct /live?replay=<key> URL to the same watchable bar the
      // race-page CTA applies; a non-watchable or wrong-series key stays out.
      if (!available || !session || !session.watchable) {
        clockRef.current = null;
        setState({
          ...inactive,
          engaged: true,
          unavailable: true,
          refusedReason: !available
            ? 'Replay isn’t available here.'
            : !session
              ? 'That race isn’t in the replay archive.'
              : 'That capture isn’t a watchable Bryce race.',
          returnHref
        });
        return;
      }
      sessionRef.current = session;
      const formationAvailable = formationAvailableFor(session);
      const greenMs = greenFlagMsOf(session);
      const startLap = lapParamOf(lapParam);
      // A `&lap=N` link starts at Bryce's lap-N line crossing, from the green
      // and his official lap times (the section pack, already cached when the
      // visitor came from the race page). It wins over `t0`.
      let lapStartMs: number | null = null;
      if (startLap !== null && greenMs !== null && session.canonicalSessionId) {
        const pack = await withTimeout(loadSectionLaps(session.canonicalSessionId).catch(() => null), LAP_LINK_PACK_TIMEOUT_MS, null);
        if (cancelled) return;
        if (pack) {
          const grid = (uiDataPackage.screens.raceDebrief.seasonIndex ?? []).find((row) => row.sessionId === session.canonicalSessionId)?.startPosition ?? null;
          const at = lapStartFromPack(pack, greenMs, grid, Math.min(startLap, pack.totalLaps));
          // A second past the line, so the page reads the lap it was asked for.
          if (at !== null) lapStartMs = at + 1_000;
        }
      }
      // Start the clock at once, at the race start (or the deep link): the
      // visitor sees the start while the race timeline is read behind it.
      const raceStartMs = raceStartMsOf(session);
      const virtualStartMs = Date.parse(
        clampT0(
          session,
          lapStartMs !== null
            ? new Date(lapStartMs).toISOString()
            : t0Param ?? (raceStartMs !== null ? new Date(raceStartMs).toISOString() : session.firstGreenAt)
        )
      );
      const firstCheckedMs = Date.parse(session.firstCheckedAt ?? '');
      const lastCheckedMs = Date.parse(session.lastCheckedAt ?? '');
      const safeStart = Number.isFinite(virtualStartMs) ? virtualStartMs : Date.now();
      clockRef.current = {
        sessionKey: session.sessionKey,
        virtualStartMs: safeStart,
        startedAtWallMs: Date.now(),
        speed: seededSpeed,
        firstCheckedMs: Number.isFinite(firstCheckedMs) ? firstCheckedMs : safeStart,
        lastCheckedMs: Number.isFinite(lastCheckedMs) ? lastCheckedMs : safeStart,
        phases: []
      };
      // A lap link is the visitor's own pick: the opening-caution jump never
      // overrides it (a lap inside the caution offers "Skip the caution").
      clockFromRef.current = lapStartMs !== null ? 'seek' : t0Param ? 't0' : 'raceStart';
      setState({
        ...inactive,
        engaged: true,
        starting: false,
        started: true,
        session,
        speed: seededSpeed,
        venue: shortVenueFromEventName(session.eventName),
        seasonYear: session.seasonYear,
        returnHref,
        formationAvailable,
        playbackSpeed: seededSpeed,
        clockFrom: clockFromRef.current,
        startLap: lapStartMs !== null ? startLap : null,
        greenFlagAt: greenMs === null ? null : new Date(greenMs).toISOString()
      });

      // The race timeline: one read (rarely two or three), held until the page
      // has its first frame so it never competes with it.
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const timelinePromise = gate
        .then(() =>
          loadReplayTimeline({
            sessionKey: session.sessionKey,
            firstCheckedAt: session.firstCheckedAt ?? '',
            lastCheckedAt: session.lastCheckedAt ?? '',
            fetchJson: (path) => loadWithRetry(path)
          })
        )
        .catch(() => null);
      timelineRef.current = { sessionKey: session.sessionKey, promise: timelinePromise, start: release };
      autoTimeline = setTimeout(release, TIMELINE_AUTO_START_MS);

      const search = timelinePromise.then((timeline) => locateOpeningCaution(session, timeline));
      const entry = {
        sessionKey: session.sessionKey,
        promise: search.then((found) => found?.caution ?? null),
        value: undefined as OpeningCaution | null | undefined
      };
      cautionRef.current = entry;
      void timelinePromise.then((timeline) => {
        if (cancelled || timelineRef.current?.sessionKey !== session.sessionKey) return;
        setState((previous) => (previous.session?.sessionKey === session.sessionKey ? { ...previous, timeline } : previous));
        // Then the formation lap, in the background and one read at a time, so
        // "From the formation lap" is instant when the visitor reaches for it.
        if (formationAvailable) locateFormationRef.current();
      });
      const found = await search;
      const caution = found?.caution ?? null;
      entry.value = caution;
      if (cancelled || !found || !caution || cautionRef.current !== entry) return;
      setState((previous) =>
        previous.session?.sessionKey === session.sessionKey ? { ...previous, openingCaution: cautionForState(caution, found.laps) } : previous
      );
      // Give the running clock its jump: from where it is now, the start plays
      // on to a beat after the throw and then goes to the restart; a clock
      // already past that beat jumps at once. A clock the visitor has since
      // moved (formation, watching the caution, a seek) was built without it.
      const clock = clockRef.current;
      if (!clock || clock.sessionKey !== session.sessionKey || clock.phases.length > 0) return;
      if (clockFromRef.current !== 'raceStart' && clockFromRef.current !== 't0') return;
      const nowMs = virtualNowMsOf(clock);
      clockRef.current = {
        ...clock,
        virtualStartMs: nowMs,
        startedAtWallMs: Date.now(),
        phases: replayPhases({ fromMs: nowMs, greenMs: null, caution, speed: clock.speed })
      };
      syncPhase();
    })();

    return () => {
      cancelled = true;
      if (autoTimeline !== null) clearTimeout(autoTimeline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey, fromParam, t0Param, speedParam, lapParam]);

  // Live-guard watch: while replaying, poll readiness with THIS client's own
  // replay params. If the server answers with a non-simulated payload, the real
  // runner has gone live — the server's per-request live-guard ignored our
  // params and served reality. Drop the clock (stop sending params so the main
  // poll takes over the live feed) and surface the honest handoff.
  useEffect(() => {
    if (!state.started || state.endedByLive) return undefined;
    let cancelled = false;
    const poll = window.setInterval(async () => {
      // A backgrounded tab has no one watching for the live-guard handoff —
      // skip this tick's request rather than polling a hidden tab at the same
      // cadence as a foregrounded one. The interval keeps ticking, so the next
      // check after the tab is visible again is at most 5s away.
      if (typeof document !== 'undefined' && document.hidden) return;
      const params = getReplayParams();
      if (!params) return;
      try {
        const response = await fetch(apiUrl(`/api/readiness${params}`), { headers: { accept: 'application/json' } });
        if (!response.ok || cancelled) return;
        const data = (await response.json().catch(() => null)) as { replay?: { simulation?: { active?: boolean } } } | null;
        if (cancelled) return;
        const simulated = data?.replay?.simulation?.active === true;
        if (!simulated) {
          window.clearInterval(poll);
          clockRef.current = null;
          setState((previous) => ({ ...previous, started: false, endedByLive: true }));
        }
      } catch {
        // A transient failure is not a live-guard trip; keep replaying.
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [state.started, state.endedByLive, getReplayParams]);

  const setSpeed = useCallback((next: number) => {
    const clock = clockRef.current;
    const session = sessionRef.current;
    if (!clock || !session || !REPLAY_SPEEDS.includes(next as (typeof REPLAY_SPEEDS)[number])) return;
    // A speed the visitor picks wins over any skim still ahead: pressing 4×
    // during the formation slows it to 4× there and then. The opening-caution
    // jump stays (its beat re-timed to the new speed), unless the visitor is
    // watching the caution, where the picked speed now plays it.
    const position = clockPosition(clock);
    const skimming = position.rate !== clock.speed;
    if (next === clock.speed && !skimming) return;
    const nowMs = virtualNowMsOf(clock);
    const watching = clockFromRef.current === 'caution';
    clockRef.current = {
      ...clock,
      virtualStartMs: nowMs,
      startedAtWallMs: Date.now(),
      speed: next,
      phases: watching ? [] : replayPhases({ fromMs: nowMs, greenMs: null, caution: knownCaution(clock.sessionKey), speed: next })
    };
    speedRef.current = next;
    setState((previous) => ({ ...previous, speed: next, started: true }));
    syncPhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncPhase]);

  const restart = useCallback(() => {
    const session = sessionRef.current;
    if (!clockRef.current || !session) return;
    const startMs = raceStartMsOf(session);
    startClockAt(session, startMs ?? Date.parse(clampT0(session, null)), 'raceStart');
  }, [startClockAt]);

  /** The formation start for the current session: one bounded search,
   *  shared by a hover that prepares it and the click that uses it. */
  const locateFormation = useCallback((): Promise<number> | null => {
    const session = sessionRef.current;
    if (!session || !formationAvailableFor(session)) return null;
    const sessionKey = session.sessionKey;
    if (formationRef.current?.sessionKey === sessionKey) return formationRef.current.promise;
    const openMs = Date.parse(session.firstCheckedAt ?? '');
    const greenMs = Date.parse(session.firstGreenAt ?? '');
    // One read at a time: three in parallel on the replay host queue behind
    // the page's own polls and slow the frame the visitor is watching.
    const promise = withTimeout(
      findFormationStart({ openMs, startMs: greenMs, movingAt: limitConcurrency(timingMovingAt(sessionKey), 1) }),
      FORMATION_PROBE_TIMEOUT_MS,
      { atMs: openMs, requests: 0 }
    ).then(({ atMs }) => atMs);
    formationRef.current = { sessionKey, promise };
    return promise;
  }, []);
  locateFormationRef.current = () => {
    void locateFormation();
  };

  const prepareFormation = useCallback(() => {
    void locateFormation();
  }, [locateFormation]);

  const restartFromFormation = useCallback(() => {
    const session = sessionRef.current;
    if (!clockRef.current || !session) return;
    const located = locateFormation();
    if (!located) return;
    setState((previous) => ({ ...previous, formationPending: true }));
    // The formation laps skim to the green, the start plays at the visitor's
    // speed, and the opening caution is jumped as from the default start. The
    // caution search began when the replay did; it is normally in by now.
    const cautionSearch =
      cautionRef.current?.sessionKey === session.sessionKey ? cautionRef.current.promise : Promise.resolve(null);
    void Promise.all([located, cautionSearch]).then(([atMs]) => {
      startClockAt(session, atMs, 'formation');
    });
  }, [locateFormation, startClockAt]);

  const watchCaution = useCallback(() => {
    const session = sessionRef.current;
    if (!clockRef.current || !session) return;
    const caution = knownCaution(session.sessionKey);
    if (!caution) return;
    // From two seconds before the throw (never before the start), so the
    // visitor sees it come out.
    const greenMs = greenFlagMsOf(session) ?? caution.thrownMs;
    startClockAt(session, Math.max(greenMs, caution.thrownMs - 2_000), 'caution', { watchCaution: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startClockAt]);

  const jumpTo = useCallback((iso: string, sourceGapSeconds = 0) => {
    const clock = clockRef.current;
    const session = sessionRef.current;
    if (!clock || !session) return;
    const nextMs = Date.parse(clampT0(session, iso));
    if (!Number.isFinite(nextMs)) return;
    clockRef.current = {
      ...clock,
      virtualStartMs: nextMs,
      startedAtWallMs: Date.now(),
      // A gap skip keeps whatever skim or jump is still ahead of the new moment.
      phases: clock.phases.filter((phase) => phase.untilMs > nextMs)
    };
    clockFromRef.current = 'jump';
    // A source gap must not leave a chart line joining the last pre-gap rank to
    // the first post-gap rank as if those seven minutes had been observed.
    onRestartRef.current?.();
    setState((previous) => ({
      ...previous,
      started: true,
      endedByLive: false,
      skippedSourceGap: { seconds: Math.max(0, sourceGapSeconds), resumeAt: iso },
      clockFrom: 'jump',
      clockEpoch: previous.clockEpoch + 1
    }));
    syncPhase();
  }, [syncPhase]);

  const seekTo = useCallback((atMs: number) => {
    const clock = clockRef.current;
    const session = sessionRef.current;
    if (!clock || !session || !Number.isFinite(atMs)) return;
    const target = Math.min(clock.lastCheckedMs, Math.max(clock.firstCheckedMs, atMs));
    const greenMs = greenFlagMsOf(session);
    clockRef.current = {
      ...clock,
      virtualStartMs: target,
      startedAtWallMs: Date.now(),
      // Before the green the formation still skims; the opening-caution jump
      // is not re-armed behind a moment the visitor picked.
      phases: replayPhases({ fromMs: target, greenMs: greenMs !== null && target < greenMs ? greenMs : null, caution: null, speed: clock.speed })
    };
    clockFromRef.current = 'seek';
    onRestartRef.current?.();
    setState((previous) => ({
      ...previous,
      started: true,
      endedByLive: false,
      skippedSourceGap: null,
      formationPending: false,
      cautionSkippedAt: null,
      clockFrom: 'seek',
      clockEpoch: previous.clockEpoch + 1
    }));
    syncPhase();
  }, [syncPhase]);

  const togglePause = useCallback(() => {
    const clock = clockRef.current;
    if (!clock) return;
    const nowWall = Date.now();
    const paused = !clock.paused;
    // Held at the moment it reads now; released from that moment.
    clockRef.current = paused
      ? { ...clock, virtualStartMs: virtualNowMsOf(clock), startedAtWallMs: nowWall, paused: true }
      : { ...clock, startedAtWallMs: nowWall, paused: false };
    setState((previous) => ({ ...previous, paused }));
    syncPhase();
  }, [syncPhase]);

  const requestTimeline = useCallback(() => {
    timelineRef.current?.start();
  }, []);

  const exit = useCallback(() => {
    const href = state.returnHref;
    clockRef.current = null;
    navigate(href);
  }, [navigate, state.returnHref]);

  return {
    ...state,
    setSpeed,
    togglePause,
    seekTo,
    requestTimeline,
    restart,
    restartFromFormation,
    prepareFormation,
    watchCaution,
    jumpTo,
    exit,
    getReplayParams
  };
};
