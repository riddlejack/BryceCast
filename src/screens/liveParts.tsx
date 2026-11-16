import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HeroPanel, Plate } from '../app/components';
import { asNumber, asString, formatDate } from '../app/format';
import { trackOutlineFor, type TrackOutline } from '../assets/tracks';
import type { LiveReadiness } from '../app/useReadiness';
import type { ReplayOpeningCaution, ReplaySession } from '../app/useReplaySession';
import { uiDataPackage } from '../data/uiDataPackage';
import { displayRaceLabelText } from '../data/debriefArchive';
import { canonicalLiveRaceSessionId } from '../data/liveRaceShellModel';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import { useRouter } from '../app/router';
import { useCoarsePointer } from '../app/charts';
import { TrackModelSlot } from '../three/TrackModelSlot';
import type { TrackModelSection, TrackOverlayView } from '../three/TrackModel3D';
import { LiveTrack, TrackDots, useSectionLight, type CarLabel, type SectionLightState } from './liveTrack';
import { sectionDisplayName, type DotMode } from './liveSectionLight';

type Row = Record<string, unknown>;

const recordOf = (value: unknown): Row => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {});
const heartbeatOf = (payload: LiveReadiness | null): Row => recordOf(recordOf(payload?.liveTiming).heartbeat);

/* ---------- which race this is ---------- */

export interface RaceIdentity {
  /** Canonical race id (`session_indy_nxt_<year>_<id>`), when known. */
  sessionId: string | null;
  venue: string | null;
  /** "Grand Prix of Monterey, Race 2" — the race, not the weekend. */
  title: string;
  dateLabel: string | null;
  outline: TrackOutline | null;
}

/** "Grand Prix of Monterey Race 2" → "Grand Prix of Monterey, Race 2". */
const withRaceNumber = (label: string) => label.replace(/[,\s]+(Race\s+\d+)$/i, ', $1');

export const raceIdentityFor = (payload: LiveReadiness | null, replay: ReplaySession | null): RaceIdentity => {
  const heartbeat = heartbeatOf(payload);
  const weekend = recordOf(payload?.raceWeekend);
  const sessionId = replay ? replay.session?.canonicalSessionId ?? null : payload ? canonicalLiveRaceSessionId(payload) : null;
  const row = sessionId ? (uiDataPackage.screens.raceDebrief.seasonIndex ?? []).find((candidate) => candidate.sessionId === sessionId) ?? null : null;
  const feedVenue = asString(heartbeat.trackName ?? weekend.trackName) ?? replay?.venue ?? null;
  // The canonical track name first: replay feeds name venues loosely ("Barber",
  // "IMS"), and the outline lookup needs the real name.
  const outline = trackOutlineFor(row?.trackName ?? null) ?? trackOutlineFor(feedVenue);
  const venue = outline?.name ?? row?.trackName ?? feedVenue;
  const feedEvent = asString(weekend.eventName) ?? asString(heartbeat.eventName) ?? replay?.session?.eventName ?? null;
  const title = row ? withRaceNumber(displayRaceLabelText(row.raceLabel)) : feedEvent ? withRaceNumber(feedEvent) : 'INDY NXT';
  const dateLabel = replay && row ? formatDate(row.raceDate ?? row.eventStartDate, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  return { sessionId, venue, title, dateLabel, outline };
};

export const HeroIdentity = ({ identity, action }: { identity: RaceIdentity; action?: ReactNode }) => (
  <div className="live-hero__head">
    <div className="live-hero__head-text">
      <span className="kicker">{[identity.venue, identity.dateLabel].filter(Boolean).join(' · ') || 'Live companion'}</span>
      <h1 className="screen-head__title live-hero__title">{identity.title}</h1>
    </div>
    {action}
  </div>
);

/* ---------- the flag and the lap, large ---------- */

const flagWords = (flag: string): { label: string; tone: string } => {
  const value = flag.toUpperCase();
  if (value === 'GREEN') return { label: 'Green flag', tone: 'green' };
  if (value.includes('YELLOW') || value.includes('CAUTION') || value === 'FCY') return { label: 'Yellow flag', tone: 'yellow' };
  if (value.includes('RED')) return { label: 'Red flag', tone: 'red' };
  if (value.includes('WHITE')) return { label: 'White flag', tone: 'white' };
  if (value.includes('CHECK')) return { label: 'Checkered flag', tone: 'checkered' };
  return { label: `${flag.charAt(0)}${flag.slice(1).toLowerCase()} flag`, tone: 'neutral' };
};

export const FlagReadout = ({
  flag,
  lap,
  totalLaps,
  ended,
  isRace,
  sessionName
}: {
  flag: string | null;
  lap: number | null;
  totalLaps: number | null;
  ended: boolean;
  isRace: boolean;
  sessionName: string | null;
}) => {
  const words = ended ? { label: 'Race complete', tone: 'checkered' } : flag ? flagWords(flag) : null;
  const progress = lap !== null && totalLaps !== null && totalLaps > 0 ? Math.max(0, Math.min(1, lap / totalLaps)) : null;
  return (
    <div className="live-hero__now" data-live-flag={flag ?? ''}>
      <div className="live-now">
        {words ? (
          <span className={`live-now__flag live-now__flag--${words.tone}`} aria-live="polite">
            <span className="live-now__swatch" aria-hidden />
            {words.label}
          </span>
        ) : null}
        {isRace ? (
          <span className="live-now__lap" aria-live="off">
            {lap !== null ? (
              <>
                Lap <span className="live-now__num">{lap}</span>
                {totalLaps !== null ? <span className="live-now__of"> of {totalLaps}</span> : null}
              </>
            ) : (
              'Lap pending'
            )}
          </span>
        ) : (
          /* A practice or qualifying session has no finish line and the
           * payload carries no session clock: its name, never an invented
           * elapsed time. */
          <span className="live-now__lap">{sessionName ?? 'Session live'}</span>
        )}
      </div>
      {isRace && progress !== null ? (
        <div className="live-now__progress" role="progressbar" aria-label="Race completion by completed lap" aria-valuemin={0} aria-valuemax={totalLaps ?? 0} aria-valuenow={lap ?? 0}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
};

/* ---------- the replay's virtual clock ---------- */

/** Epoch ms of the replay's virtual clock, read fresh on every call. */
export const useVirtualNow = (replay: ReplaySession | null) => {
  const replayRef = useRef(replay);
  replayRef.current = replay;
  return useCallback(() => {
    const params = replayRef.current?.getReplayParams() ?? '';
    if (!params) return null;
    const rt = new URLSearchParams(params.replace(/^\?/, '')).get('rt');
    const ms = rt ? Date.parse(rt) : NaN;
    return Number.isFinite(ms) ? ms : null;
  }, []);
};

/* ---------- the track panel ---------- */

/** What the dots are, for the caption and the "how" under the track. */
export interface DotsReadout {
  mode: DotMode;
  /** Cars with a dot now, Bryce included. */
  placed: number;
  /** Cars in the timing feed. */
  cars: number;
}

const trackCaption = (light: SectionLightState, mode: 'race' | 'prestart' | 'session', dots: DotsReadout | null): string => {
  if (mode === 'session') return 'Timing gives each car’s laps, not where it is on the circuit, so the track has no car dots outside a race.';
  if (light.status === 'live') {
    return 'Live, the timing gives each car’s laps and gaps but not its section times, so the track has no car dots. A replay of a finished race shows them.';
  }
  if (mode === 'prestart') {
    return light.status === 'no_sections' || light.status === 'loading'
      ? 'Start / finish is marked; the arrow shows which way they run.'
      : 'Once the race is on, each car gets a dot at the timing loop it last crossed.';
  }
  switch (light.status) {
    case 'loading':
      return 'Loading the official section times for this race.';
    case 'no_sections':
      return 'This race has no complete official section times, so the track has no car dots.';
    case 'waiting_line':
      return 'The dots start the first time the cars cross the line in this replay.';
    default: {
      const count = dots ? `${dots.placed} of ${dots.cars} cars have a dot now. ` : '';
      const lit = light.lit ? 'Amber is the section Bryce is in. ' : '';
      return dots?.mode === 'glide'
        ? `${count}${lit}Each dot moves through its section by time between two timing loops, not GPS.`
        : `${count}${lit}Each dot sits on the timing loop that car last crossed.`;
    }
  }
};

/** The plain account of the dots, under the track. */
const DotsHow = ({ light, dots }: { light: SectionLightState; dots: DotsReadout }) => {
  const field = light.field;
  const others = Math.max(0, dots.cars - 1);
  const noTimes = field.usable ? Math.max(0, others - field.rows) : others;
  const unmatched = field.usable ? Math.max(0, field.rows - field.joined) : 0;
  return (
    <details className="live-dots-how" data-dots-field={field.usable ? 'usable' : field.reason ?? 'none'} data-dots-joined={field.joined} data-dots-rows={field.rows}>
      <summary>How the dots work</summary>
      <p>
        Cars are timed at loops in the track surface, and a loop is the only place a car&rsquo;s position is measured. A dot sits on the last
        loop that car crossed and jumps to the next one when the car gets there. Nothing between two loops is measured, and none of this is GPS.
      </p>
      <p>
        Bryce&rsquo;s gold No. 9 is placed from his official section times and the moment he crosses the line each lap. The other cars&rsquo;
        section times are published without car numbers, so each set is matched to a car by its lap time: the section times of a lap add up to
        that car&rsquo;s lap time to the thousandth. A car gets its dot after its first clean green-flag lap. Under caution, on a pit lap, or
        when a car cannot be matched, it has no dot rather than a guess.
      </p>
      {dots.mode === 'glide' ? (
        <p>
          This view moves each dot through its section at an even pace between its two measured crossings: placed by time between timing loops,
          not GPS. Without <code>?dots=glide</code> the dots stay on the loops.
        </p>
      ) : null}
      <p className="live-dots-how__count">
        {field.usable
          ? `Now: ${dots.placed} of ${dots.cars} cars have a dot. ${field.joined} of ${field.rows} other cars are matched${unmatched ? `, ${unmatched} not yet` : ''}${
              noTimes ? `; ${noTimes} ${noTimes === 1 ? 'car has' : 'cars have'} no clean lap in the section times, so no dot all race` : ''
            }.`
          : `Only Bryce has a dot in this race: ${field.reason ?? 'the section times do not carry the other cars'}.`}
      </p>
    </details>
  );
};

/* ---------- the opening caution a replay jumped ---------- */

/** "Caution, laps 1–4, skipped to the restart." A feed that began with the
 *  caution out knows only where it ended: "Caution to lap 7, …". */
export const skippedCautionWords = (caution: ReplayOpeningCaution): string => {
  const what = caution.kind === 'red' ? 'Red flag' : 'Caution';
  const span = caution.laps;
  const laps = !span
    ? ' at the start'
    : span.from === null
      ? ` to lap ${span.to}`
      : span.from === span.to
        ? `, lap ${span.from}`
        : `, laps ${span.from}–${span.to}`;
  return `${what}${laps}, skipped to the restart.`;
};

/** How long the note sits on the track after the jump; the bar keeps it after. */
export const SKIP_NOTE_WALL_MS = 15_000;

/** On the track, for a few seconds after the jump: what the replay skipped,
 *  and the way to watch it instead. */
const SkippedCautionNote = ({ replay }: { replay: ReplaySession }) => {
  const caution = replay.openingCaution;
  const skippedAt = replay.clockFrom === 'caution' ? null : replay.cautionSkippedAt;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (skippedAt === null) return undefined;
    const left = skippedAt + SKIP_NOTE_WALL_MS - Date.now();
    if (left <= 0) return undefined;
    const timer = window.setTimeout(() => setTick((value) => value + 1), left + 50);
    return () => window.clearTimeout(timer);
  }, [skippedAt]);
  if (!caution || skippedAt === null || Date.now() - skippedAt > SKIP_NOTE_WALL_MS) return null;
  return (
    <div className={`live-skip-note live-skip-note--${caution.kind}`} role="status" data-replay-skip-note>
      <span className="live-skip-note__swatch" aria-hidden />
      <span className="live-skip-note__text">{skippedCautionWords(caution)}</span>
      <button type="button" className="live-skip-note__watch" onClick={replay.watchCaution}>
        Watch it
      </button>
    </div>
  );
};

const AMBER = '#CC7E16';

export const TrackPanel = ({
  identity,
  replay,
  history,
  mode,
  cars,
  highlightId = null,
  onHoverCar
}: {
  identity: RaceIdentity;
  replay: ReplaySession | null;
  history: LiveSessionHistory | null;
  mode: 'race' | 'prestart' | 'session';
  /** Who each dot is (from the timing rows); no map, no dots. */
  cars?: Map<string, CarLabel>;
  highlightId?: string | null;
  onHoverCar?: (id: string | null) => void;
}) => {
  const virtualNow = useVirtualNow(replay);
  const coarse = useCoarsePointer();
  const { route } = useRouter();
  const dotMode: DotMode = route.search.get('dots') === 'glide' ? 'glide' : 'loops';
  const light = useSectionLight({
    sessionId: replay && mode !== 'session' ? identity.sessionId : null,
    outline: identity.outline,
    history,
    virtualNow,
    speed: replay?.speed ?? 1
  });
  const [placed, setPlaced] = useState(0);
  const chain = light.plan?.usable ? light.plan.chain : null;
  const litKey = light.lit?.anchor.familyId ?? null;
  const sections = useMemo<TrackModelSection[]>(
    () =>
      (chain ?? []).map((anchor, index, list) => ({
        key: anchor.familyId,
        label: sectionDisplayName(anchor, index, list.length),
        spans: [[anchor.startT, anchor.endT]],
        color: anchor.familyId === litKey ? AMBER : null,
        dashed: false,
        words: anchor.familyId === litKey ? 'Bryce is in this section now.' : 'A timing section: a loop at each end times every car through it.'
      })),
    [chain, litKey]
  );
  const dotsOn = mode === 'race' && Boolean(replay) && Boolean(chain) && Boolean(cars) && (light.bryce !== null || light.field.placers.length > 0);
  const speed = replay?.speed ?? 1;
  const overlay = dotsOn
    ? (view: TrackOverlayView) => (
        <TrackDots
          view={view}
          chain={chain!}
          bryce={light.bryce}
          placers={light.field.placers}
          virtualNow={virtualNow}
          speed={speed}
          mode={dotMode}
          cars={cars!}
          highlightId={highlightId}
          onHoverCar={onHoverCar}
          onCount={setPlaced}
        />
      )
    : undefined;
  if (!identity.outline) {
    return (
      <div className="live-hero__track live-hero__track--none">
        <p className="caption caption--secondary">No traced outline for this circuit yet.</p>
      </div>
    );
  }
  const litName = light.lit && chain ? sectionDisplayName(light.lit.anchor, light.lit.index, chain.length) : null;
  const ariaLabel = `${identity.outline.name}${litName ? `: Bryce is in ${litName}, on his lap ${light.lit!.lap}` : ''}`;
  const dots: DotsReadout | null = dotsOn ? { mode: dotMode, placed: dotsOn ? placed : 0, cars: cars?.size ?? 0 } : null;
  const flat = (
    <LiveTrack
      outline={identity.outline}
      chain={chain}
      labelRoom={Boolean(replay) && mode !== 'session'}
      lit={light.lit}
      ariaLabel={ariaLabel}
      overlay={overlay}
    />
  );
  return (
    <div
      className="live-hero__track live-desk__track"
      data-section-light={light.status}
      data-section-light-reason={light.plan?.reason ?? ''}
      data-lit-section={litKey ?? ''}
      data-dots={dots ? dots.mode : 'off'}
    >
      {replay && mode === 'race' ? <SkippedCautionNote replay={replay} /> : null}
      <div className="live-desk__model">
        <TrackModelSlot
          slug={identity.outline.slug}
          name={identity.outline.name}
          sections={sections}
          active={litKey}
          fallback={flat}
          overlay={overlay}
          hint={
            coarse
              ? dotsOn
                ? 'Tap a dot for the driver; drag sideways to turn the track.'
                : 'Drag sideways to turn the track.'
              : dotsOn
                ? 'Point at a dot for the driver; drag to turn the track.'
                : 'Drag to turn the track.'
          }
        />
      </div>
      <p className="caption caption--secondary live-hero__track-caption">{trackCaption(light, mode, dots)}</p>
      {dots ? <DotsHow light={light} dots={dots} /> : null}
    </div>
  );
};

/* ---------- a replay before the green flag ---------- */

const clockText = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
};

const ordinalWord = (value: number) => {
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th';
  return `${value}${suffix}`;
};

/** This race's own pre-start: the grid, the cars, the minutes to the green.
 *  Never the off-season countdown to the next event. */
export const ReplayPreStart = ({
  payload,
  replay,
  history,
  identity,
  source
}: {
  payload: LiveReadiness;
  replay: ReplaySession;
  history: LiveSessionHistory | null;
  identity: RaceIdentity;
  source: ReactNode;
}) => {
  const virtualNow = useVirtualNow(replay);
  const [now, setNow] = useState<number | null>(() => virtualNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(virtualNow()), 500);
    return () => window.clearInterval(timer);
  }, [virtualNow]);
  const rows = (Array.isArray(recordOf(payload.liveTiming).rows) ? (recordOf(payload.liveTiming).rows as Row[]) : []).filter(
    (row) => asNumber(row.startPosition) !== null
  );
  const grid = [...rows].sort((a, b) => (asNumber(a.startPosition) ?? 99) - (asNumber(b.startPosition) ?? 99));
  const bryce = grid.find((row) => row.bryce === true) ?? null;
  const bryceSlot = bryce ? asNumber(bryce.startPosition) : null;
  // Before the start every car's interval reads zero; once they leave the grid
  // and cross the timing loops behind the pace car, the intervals fill in.
  const rolling = rows.some((row) => {
    const gap = Number(String(row.liveGap ?? '').trim());
    return Number.isFinite(gap) && gap > 0;
  });
  const greenAt = replay.greenFlagAt ? Date.parse(replay.greenFlagAt) : NaN;
  const toGreen = now !== null && Number.isFinite(greenAt) ? (greenAt - now) / 1000 : null;
  const heartbeat = heartbeatOf(payload);
  const totalLaps = asNumber(heartbeat.totalLaps);
  return (
    <>
      <HeroPanel className="live-hero live-hero--prestart">
        <HeroIdentity identity={identity} action={source} />
        <div className="live-hero__now" data-live-flag={asString(heartbeat.flag) ?? ''} data-prestart-phase={rolling ? 'formation' : 'grid'}>
          <div className="live-now">
            <span className="live-now__flag live-now__flag--neutral">
              <span className="live-now__swatch" aria-hidden />
              {rolling ? 'Formation laps' : 'On the grid'}
            </span>
            {totalLaps !== null ? <span className="live-now__lap">{totalLaps} laps to run</span> : null}
          </div>
        </div>
        <div className="live-hero__position live-prestart__row">
          {toGreen !== null && toGreen > 0 ? (
            <div className="live-prestart__countdown" role="timer" aria-label="Race time to the green flag">
              <span className="caption">Green flag in</span>
              <span className="stat__value stat__value--hero live-prestart__clock">{clockText(toGreen)}</span>
              <span className="caption caption--secondary">
                race time
                {replay.playbackSpeed > 1
                  ? ` · about ${clockText(toGreen / replay.playbackSpeed)} at ${replay.playbackSpeed}×`
                  : ''}
              </span>
            </div>
          ) : (
            <div className="live-prestart__countdown">
              <span className="caption">Green flag</span>
              <span className="stat__value stat__value--big">any moment</span>
            </div>
          )}
          <div className="live-prestart__slot">
            <span className="caption">Bryce starts</span>
            <div className="live-prestart__slot-row">
              <Plate size="hero" />
              <span className="stat__value stat__value--big">{bryceSlot !== null ? ordinalWord(bryceSlot) : '—'}</span>
            </div>
            <span className="caption caption--secondary">{grid.length > 0 ? `of ${grid.length} cars on the grid` : 'grid slot pending'}</span>
          </div>
        </div>
        {grid.length > 0 ? (
          <section className="live-hero__near live-grid" aria-label="The starting grid">
            <h2 className="live-grid__title">The grid</h2>
            <ol className="live-grid__list">
              {grid.map((row) => {
                const slot = asNumber(row.startPosition) ?? 0;
                const name = asString(row.lastName) ?? asString(row.name) ?? `Car ${asString(row.no) ?? ''}`;
                return (
                  <li
                    key={`${asString(row.no) ?? ''}-${slot}`}
                    className={`live-grid__car${slot % 2 === 0 ? ' live-grid__car--even' : ''}${row.bryce === true ? ' live-grid__car--bryce' : ''}`}
                  >
                    <span className="live-grid__slot">{slot}</span>
                    <span className="live-grid__name">{row.bryce === true ? <Plate size="row" /> : null}{name}</span>
                    <span className="live-grid__no">No. {asString(row.no) ?? '—'}</span>
                  </li>
                );
              })}
            </ol>
            <p className="caption caption--secondary live-grid__note">Grid order as Race Control published it before the start.</p>
          </section>
        ) : null}
        <TrackPanel identity={identity} replay={replay} history={history} mode="prestart" />
      </HeroPanel>
    </>
  );
};

