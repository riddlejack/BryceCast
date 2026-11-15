import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { HeroPanel, Plate } from '../app/components';
import { asNumber, asString, formatDate } from '../app/format';
import { trackOutlineFor, type TrackOutline } from '../assets/tracks';
import type { LiveReadiness } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import { uiDataPackage } from '../data/uiDataPackage';
import { displayRaceLabelText } from '../data/debriefArchive';
import { canonicalLiveRaceSessionId } from '../data/liveRaceShellModel';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import { LiveTrack, useSectionLight, type SectionLightState } from './liveTrack';
import { sectionDisplayName } from './liveSectionLight';

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

const trackCaption = (light: SectionLightState, mode: 'race' | 'prestart' | 'session'): string => {
  if (mode === 'session') return 'Timing gives each car’s laps, not where it is on the circuit, so the circuit stays unlit.';
  if (light.status === 'live') return 'Live timing gives laps and gaps, not where a car is on the circuit, so the circuit stays unlit.';
  if (mode === 'prestart') {
    return light.status === 'no_sections' || light.status === 'loading'
      ? 'Start / finish is marked; the arrow shows which way they run.'
      : 'Once the race is on, the timing section Bryce is in lights up as he crosses each timing loop.';
  }
  switch (light.status) {
    case 'loading':
      return 'Loading the official section times for this race.';
    case 'no_sections':
      return 'This race has no complete official section times, so the circuit stays unlit.';
    case 'waiting_line':
      return 'The section light starts the first time he crosses the line in this replay.';
    case 'between':
      return 'No complete section times for this lap, so the circuit is unlit until the next one.';
    case 'lit':
    default:
      return 'Amber is the timing section he is in, from the official section times and the moment he crosses the line each lap. Timing loops only: it shows the section, not his exact spot.';
  }
};

export const TrackPanel = ({
  identity,
  replay,
  history,
  mode
}: {
  identity: RaceIdentity;
  replay: ReplaySession | null;
  history: LiveSessionHistory | null;
  mode: 'race' | 'prestart' | 'session';
}) => {
  const virtualNow = useVirtualNow(replay);
  const light = useSectionLight({
    sessionId: replay && mode !== 'session' ? identity.sessionId : null,
    outline: identity.outline,
    history,
    virtualNow,
    speed: replay?.speed ?? 1
  });
  if (!identity.outline) {
    return (
      <div className="live-hero__track live-hero__track--none">
        <p className="caption caption--secondary">No traced outline for this circuit yet.</p>
      </div>
    );
  }
  const chain = light.plan?.usable ? light.plan.chain : null;
  const litName = light.lit && chain ? sectionDisplayName(light.lit.anchor, light.lit.index, chain.length) : null;
  return (
    <div className="live-hero__track" data-section-light={light.status} data-section-light-reason={light.plan?.reason ?? ''}>
      <LiveTrack
        outline={identity.outline}
        chain={chain}
        labelRoom={Boolean(replay) && mode !== 'session'}
        lit={light.lit}
        ariaLabel={`${identity.outline.name}${litName ? `: Bryce is in ${litName}, on his lap ${light.lit!.lap}` : ''}`}
      />
      <p className="caption caption--secondary live-hero__track-caption">{trackCaption(light, mode)}</p>
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
        <div className="live-hero__now" data-live-flag={asString(heartbeat.flag) ?? ''}>
          <div className="live-now">
            <span className="live-now__flag live-now__flag--neutral">
              <span className="live-now__swatch" aria-hidden />
              {rolling ? 'Formation laps' : 'On the grid'}
            </span>
            {totalLaps !== null ? <span className="live-now__lap">{totalLaps} laps to run</span> : null}
          </div>
        </div>
        <div className="live-hero__position">
          {toGreen !== null && toGreen > 0 ? (
            <div className="live-prestart__countdown" role="timer" aria-label="Race time to the green flag">
              <span className="caption">Green flag in</span>
              <span className="stat__value stat__value--hero live-prestart__clock">{clockText(toGreen)}</span>
              <span className="caption caption--secondary">
                race time{replay.speed > 1 ? ` · about ${clockText(toGreen / replay.speed)} at ${replay.speed}×` : ''}
              </span>
            </div>
          ) : (
            <div className="live-prestart__countdown">
              <span className="caption">Green flag</span>
              <span className="stat__value stat__value--big">any moment</span>
            </div>
          )}
        </div>
        <div className="live-hero__jumbotron live-prestart__slot">
          <span className="caption">Bryce starts</span>
          <div className="live-prestart__slot-row">
            <Plate size="hero" />
            <span className="stat__value stat__value--big">{bryceSlot !== null ? ordinalWord(bryceSlot) : '—'}</span>
          </div>
          <span className="caption caption--secondary">{grid.length > 0 ? `of ${grid.length} cars on the grid` : 'grid slot pending'}</span>
        </div>
        <TrackPanel identity={identity} replay={replay} history={history} mode="prestart" />
      </HeroPanel>
      {grid.length > 0 ? (
        <section className="live-grid" aria-label="The starting grid">
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
          <p className="caption caption--secondary">Grid order as Race Control published it before the start.</p>
        </section>
      ) : null}
    </>
  );
};

