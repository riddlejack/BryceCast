import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plate } from '../app/components';
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
import { LiveTrack, TrackMarks, type CarLabel, type MarkerReadout, type ReplayRace } from './liveTrack';
import { sectionDisplayName } from './liveSectionLight';
import type { FieldCar, FieldMode } from './liveField';

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
  if (/(^|[^A-Z])RED([^A-Z]|$)/.test(value)) return { label: 'Red flag', tone: 'red' };
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
  sessionName,
  lapInProgress = false
}: {
  flag: string | null;
  lap: number | null;
  totalLaps: number | null;
  ended: boolean;
  isRace: boolean;
  sessionName: string | null;
  /** The feed's counter is the leader's laps completed (a replay's archive):
   *  the readout says the lap being run, one more, up to the distance. */
  lapInProgress?: boolean;
}) => {
  const words = ended ? { label: 'Race complete', tone: 'checkered' } : flag ? flagWords(flag) : null;
  if (lapInProgress && lap !== null) {
    lap = ended && totalLaps !== null ? totalLaps : totalLaps !== null ? Math.min(totalLaps, lap + 1) : lap + 1;
  }
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

const trackCaption = (race: ReplayRace, mode: 'race' | 'prestart' | 'session', field: FieldMode, placed: boolean): string => {
  if (mode === 'session') return 'Timing gives each car’s laps, not where it is on the circuit, so the track has no car marks outside a race.';
  if (race.status === 'live') {
    return 'Live, the timing gives each car’s laps and gaps but not its section times, so the track has no car marks. A replay of a finished race shows them.';
  }
  if (mode === 'prestart') return 'On the formation lap; timing places Bryce from the green.';
  switch (race.status) {
    case 'loading':
      return 'Loading the official section times for this race.';
    case 'no_sections':
      return 'This race has no complete official section times, so Bryce has no marker on the track.';
    case 'waiting_line':
      return 'Bryce’s marker appears once the replay has placed his first lap.';
    default: {
      if (!placed) return 'Bryce’s marker appears once the replay reaches his first lap.';
      const others =
        field === 'all' ? ' The other cars are placed by their gap to him.' : field === 'around' ? ' The two cars ahead and behind him are placed by their gap to him.' : '';
      return `Amber fills the section Bryce is in.${others} Placed by time between the timing loops, not GPS.`;
    }
  }
};

const paceBasisWords = (basis: ReplayRace['paceBasis']) =>
  basis === 'venue' ? 'his median here in his last race at this track' : basis === 'field' ? 'the field’s median here' : 'his median for the race';

/** The plain account of the marker, under the track. */
const TrackHow = ({ race, field }: { race: ReplayRace; field: FieldMode }) => (
  <details className="live-dots-how" data-track-how data-pace-basis={race.paceBasis ?? ''}>
    <summary>How the track works</summary>
    <p>
      Placed by time between the timing loops, not GPS. Cars are timed at loops in the track surface, and the moment a car crosses one is the only
      place its position is measured.
    </p>
    <p>
      Bryce&rsquo;s No. 9 reaches each loop when his official section times say he did. Between two loops it moves at the pace he is expected
      to hold there: his median clean time for that section so far in this race (before his first clean lap, {paceBasisWords(race.paceBasis)}),
      slowed under caution by how much slower his last lap ran. If the timing has not yet said he crossed the next loop, he waits just short of
      it; when it does, he catches up within half a second. He never goes backwards.
    </p>
    {field !== 'bryce' ? (
      <p>
        The {field === 'all' ? 'other cars' : 'cars around him'} are placed by their gap to him in the timing, turned into distance at his
        pace: a car 1.2 s ahead is drawn where he would be 1.2 s from now. A car that has been lapped, or has lapped him, sits where that gap
        puts it on the road.
      </p>
    ) : null}
  </details>
);

export const TrackPanel = ({
  identity,
  replay,
  race,
  mode,
  field = 'around',
  fieldCars = [],
  trail = false,
  bryceLabel = null,
  highlightId = null,
  onHoverCar
}: {
  identity: RaceIdentity;
  replay: ReplaySession | null;
  race: ReplayRace;
  mode: 'race' | 'prestart' | 'session';
  field?: FieldMode;
  fieldCars?: FieldCar[];
  trail?: boolean;
  bryceLabel?: CarLabel | null;
  highlightId?: string | null;
  onHoverCar?: (id: string | null) => void;
}) => {
  const virtualNow = useVirtualNow(replay);
  const coarse = useCoarsePointer();
  const [readout, setReadout] = useState<MarkerReadout | null>(null);
  const chain = race.plan?.usable ? race.plan.chain : null;
  // Hover still reads a section on the model; nothing is painted whole.
  const sections = useMemo<TrackModelSection[]>(
    () =>
      (chain ?? []).map((anchor, index, list) => ({
        key: anchor.familyId,
        label: sectionDisplayName(anchor, index, list.length),
        spans: [[anchor.startT, anchor.endT]],
        color: null,
        dashed: false,
        words: 'A timing section: a loop at each end times every car through it.'
      })),
    [chain]
  );
  const marksOn = mode === 'race' && Boolean(replay) && race.model !== null;
  const shownCars = marksOn && field !== 'bryce' ? fieldCars : [];
  const clockEpoch = replay?.clockEpoch ?? 0;
  const overlay = marksOn
    ? (view: TrackOverlayView) => (
        <TrackMarks
          view={view}
          race={race}
          virtualNow={virtualNow}
          clockEpoch={clockEpoch}
          cars={shownCars}
          fieldMode={field}
          trail={trail}
          bryceLabel={bryceLabel}
          highlightId={highlightId}
          onHoverCar={onHoverCar}
          onReadout={setReadout}
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
  const shownReadout = marksOn ? readout : null;
  const litName = shownReadout && chain ? sectionDisplayName(chain[shownReadout.index], shownReadout.index, chain.length) : null;
  const ariaLabel = `${identity.outline.name}${litName ? `: Bryce is in ${litName}, on his lap ${shownReadout!.lap}` : ''}`;
  const flat = (
    <LiveTrack
      outline={identity.outline}
      chain={chain}
      labelRoom={Boolean(replay) && mode !== 'session'}
      lit={shownReadout}
      ariaLabel={ariaLabel}
      overlay={overlay}
    />
  );
  return (
    <div
      className="live-hero__track live-desk__track"
      data-section-light={race.status}
      data-section-light-reason={race.plan?.reason ?? ''}
      data-lit-section={shownReadout && chain ? chain[shownReadout.index]?.familyId ?? '' : ''}
      data-bryce-lap={shownReadout?.lap ?? ''}
      data-marks={marksOn ? field : 'off'}
    >
      {replay && mode === 'race' ? <SkippedCautionNote replay={replay} /> : null}
      <div className="live-desk__model">
        <TrackModelSlot
          slug={identity.outline.slug}
          name={identity.outline.name}
          sections={sections}
          active={null}
          fallback={flat}
          overlay={overlay}
          hint={
            coarse
              ? marksOn
                ? 'Tap a car for the driver; drag sideways to turn the track.'
                : 'Drag sideways to turn the track.'
              : marksOn
                ? 'Point at a car for the driver; drag to turn the track.'
                : 'Drag to turn the track.'
          }
        />
      </div>
      <p className="caption caption--secondary live-hero__track-caption">
        {litName && shownReadout ? (
          <span className="live-hero__track-now">
            Bryce: {litName}, {shownReadout.lap > 0 ? `lap ${shownReadout.lap}` : 'to the line for lap 1'}
            {shownReadout.holding ? ' (due at the next loop)' : ''}.{' '}
          </span>
        ) : null}
        {trackCaption(race, mode, field, shownReadout !== null)}
      </p>
      {replay && mode !== 'session' && race.status !== 'live' ? <TrackHow race={race} field={field} /> : null}
    </div>
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

/** The rows on the grid, in slot order, and Bryce's slot. */
const gridOf = (payload: LiveReadiness) => {
  const rows = (Array.isArray(recordOf(payload.liveTiming).rows) ? (recordOf(payload.liveTiming).rows as Row[]) : []).filter(
    (row) => asNumber(row.startPosition) !== null
  );
  const grid = [...rows].sort((a, b) => (asNumber(a.startPosition) ?? 99) - (asNumber(b.startPosition) ?? 99));
  const bryce = grid.find((row) => row.bryce === true) ?? null;
  // Before the start every car's interval reads zero; once they leave the grid
  // and cross the timing loops behind the pace car, the intervals fill in.
  const rolling = rows.some((row) => {
    const gap = Number(String(row.liveGap ?? '').trim());
    return Number.isFinite(gap) && gap > 0;
  });
  return { grid, bryceSlot: bryce ? asNumber(bryce.startPosition) : null, rolling };
};

/** A replay before its green flag, in the bar's lead: on the grid or the
 *  formation laps, and the distance to run. */
export const PreStartReadout = ({ payload }: { payload: LiveReadiness }) => {
  const heartbeat = heartbeatOf(payload);
  const totalLaps = asNumber(heartbeat.totalLaps);
  const { rolling } = gridOf(payload);
  return (
    <div className="live-hero__now" data-live-flag={asString(heartbeat.flag) ?? ''} data-prestart-phase={rolling ? 'formation' : 'grid'}>
      <div className="live-now">
        <span className="live-now__flag live-now__flag--neutral">
          <span className="live-now__swatch" aria-hidden />
          {rolling ? 'Formation laps' : 'On the grid'}
        </span>
        {totalLaps !== null ? <span className="live-now__lap">{totalLaps} laps to run</span> : null}
      </div>
    </div>
  );
};

/** A replay's clock before the green flag (round 7): said from the clock,
 *  not the frame, so it is right the moment the visitor picks the
 *  formation lap, before its first archived frame arrives. */
export const FormationReadout = ({ totalLaps }: { totalLaps: number | null }) => (
  <div className="live-hero__now" data-live-flag="" data-prestart-phase="formation">
    <div className="live-now">
      <span className="live-now__flag live-now__flag--neutral">
        <span className="live-now__swatch" aria-hidden />
        Formation lap
      </span>
      {totalLaps !== null ? <span className="live-now__lap">{totalLaps} laps to run</span> : null}
    </div>
  </div>
);

/** In the running order's place before the green: the grid as Race Control
 *  published it. */
export const PreStartOrder = ({ payload }: { payload: LiveReadiness }) => {
  const { grid } = gridOf(payload);
  return (
    <section className="live-desk__order live-grid" aria-label="The starting grid">
      <h2 className="live-desk__label">The grid</h2>
      {grid.length > 0 ? (
        <>
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
        </>
      ) : (
        <p className="caption caption--secondary">The grid appears when Race Control publishes it.</p>
      )}
    </section>
  );
};

/** In Bryce's column before the green: the race time to the green and his slot. */
export const PreStartBryce = ({ payload, replay }: { payload: LiveReadiness; replay: ReplaySession }) => {
  const virtualNow = useVirtualNow(replay);
  const [now, setNow] = useState<number | null>(() => virtualNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(virtualNow()), 500);
    return () => window.clearInterval(timer);
  }, [virtualNow]);
  const { grid, bryceSlot } = gridOf(payload);
  const greenAt = replay.greenFlagAt ? Date.parse(replay.greenFlagAt) : NaN;
  const toGreen = now !== null && Number.isFinite(greenAt) ? (greenAt - now) / 1000 : null;
  return (
    <aside className="live-desk__bryce live-prestart" aria-label="Bryce before the start">
      {toGreen !== null && toGreen > 0 ? (
        <div className="live-prestart__countdown" role="timer" aria-label="Race time to the green flag">
          <span className="caption">Green flag in</span>
          <span className="stat__value stat__value--hero live-prestart__clock">{clockText(toGreen)}</span>
          <span className="caption caption--secondary">
            race time
            {replay.playbackSpeed > 1 ? ` · about ${clockText(toGreen / replay.playbackSpeed)} at ${replay.playbackSpeed}×` : ''}
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
    </aside>
  );
};
