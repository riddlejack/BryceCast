import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card, HeroPanel, Plate, SourcePill, Stat, StatusChip, TickerValue, Unavailable, type Tone } from '../app/components';
import { Link } from '../app/router';
import { TrackArt } from '../app/trackArt';
import { trackOutlineFor } from '../assets/tracks';
import { formatDate } from '../app/format';
import type { LiveReadiness } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import { livePosition, liveBryceRowOf } from '../data/livePageModel';
import { liveSourceCheckedAtOf, type LiveSessionHistory } from '../data/liveHistoryModel';
import {
  BATTLES_MIN_LAPS,
  battlesSoFarFrom,
  buildingLapChartFrom,
  isPostCheckeredRef,
  liveRaceSessionRefOf,
  replayDeepLinkQuery,
  trailingNumericId,
  type BuildingLapChart
} from '../data/liveRaceShellModel';
import { LapChart } from './RaceDetailScreen';
import { watchableCaptureForRace, replayProvenance } from '../data/replayAvailable';
import { ReplayAffordance, useReplayCatalog } from './replayAffordance';

/**
 * The live race page (Brief R-c): /races/<sessionId> while THIS race is live or
 * replayed and its debrief pack does not yet own the page. One URL from green
 * flag to family archive — the link shared at lap 20 is the link that holds the
 * finished story forever. Modules append as their data becomes honest; nothing
 * here projects, and the word "provisional" appears exactly once, in the hero.
 * /live answers "what is happening right now?" — this page answers "what has
 * this race been?" — so there is no battle corridor, no speedometer, and no
 * points jumbotron here, only cross-links.
 */

const flagTone = (flag: string | null): Tone => {
  const value = (flag ?? '').toUpperCase();
  if (value === 'GREEN') return 'good';
  if (value.includes('YELLOW') || value.includes('CAUTION') || value === 'FCY') return 'warn';
  if (value.includes('RED')) return 'bad';
  return 'neutral';
};

const spanLabel = (fromLap: number, toLap: number): string =>
  fromLap === toLap ? `lap ${fromLap}` : `laps ${fromLap}–${toLap}`;

/* ---------- module 2: the race so far — the lap chart, building ---------- */

const RaceSoFarCard = ({
  chart,
  preGreen,
  paused,
  simulated
}: {
  chart: BuildingLapChart | null;
  preGreen: boolean;
  paused: boolean;
  simulated: boolean;
}) => (
  <Card
    title="The race so far"
    action={
      <SourcePill
        title="The race so far — running order, building"
        entries={[
          {
            label: 'Accumulated running order · rank-series history',
            path: '/api/history/rank-series',
            note: 'The server remembers the race: the running order at every position change so far this session, from the same feed the Live page reads.'
          },
          {
            label: simulated ? 'Archived Race Control capture · replayed' : 'Race Control live timing · 1-second capture',
            path: '/api/readiness',
            note: simulated
              ? 'This client is replaying an archived capture; the chart builds from the archive exactly as it built live.'
              : 'New laps append from the live 1-second Race Control capture as the race runs.'
          }
        ]}
        caveats={[
          'Positions settle at the flag; the official lap chart replaces this record in the debrief.',
          'Caution shading comes from the live flag record — spans are whole laps, not exact yellow seconds.'
        ]}
      />
    }
  >
    {chart ? (
      <>
        <p className="caption caption--secondary" style={{ margin: '0 0 10px' }}>
          Bryce in ink · the field in light gray · shaded = caution · the newest lap touches the right edge
          {paused ? ' · paused — holding the last good laps' : ''}
        </p>
        <LapChart story={chart} building={{ cautionSpans: chart.cautionSpans }} />
        <p className="tnum" style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-secondary)' }}>
          Through lap {chart.latestLap} — the running order at every recorded position change.
        </p>
      </>
    ) : (
      <Unavailable>
        {preGreen
          ? 'The lap chart starts drawing at the green flag.'
          : 'Waiting for the first laps from the timing feed.'}
      </Unavailable>
    )}
  </Card>
);

/* ---------- module 3: battles so far ---------- */

const BattlesSoFarCard = ({ chart }: { chart: BuildingLapChart | null }) => {
  const battles = useMemo(() => battlesSoFarFrom(chart), [chart]);
  if (battles.length === 0) return null;
  return (
    <Card
      title="Battles so far"
      action={
        <SourcePill
          title="Battles so far"
          entries={[
            {
              label: 'Adjacency over the accumulated laps',
              path: '/api/history/rank-series',
              note: `Laps spent within one running-order spot of Bryce, counted over the laps charted so far (this module appears once ${BATTLES_MIN_LAPS} laps exist).`
            }
          ]}
          caveats={['Counted facts only — the full battle read, with official lap-chart precision, arrives in the debrief.']}
        />
      }
    >
      <div style={{ display: 'grid', gap: 6 }}>
        {battles.map((battle) => (
          <p key={battle.driverId} style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-primary)' }}>
            Within one spot of {battle.driverName} for {battle.lapsAdjacent} laps
            {battle.swaps >= 2 ? `, trading places ${battle.swaps} times` : battle.swaps === 1 ? ', trading places once' : ''}.
          </p>
        ))}
      </div>
    </Card>
  );
};

/* ---------- module 4: cautions, from the live flag record ---------- */

const CautionsCard = ({ chart }: { chart: BuildingLapChart | null }) => {
  if (!chart || chart.cautionSpans.length === 0) return null;
  const spans = chart.cautionSpans;
  const ongoing = spans.some((span) => span.ongoing);
  const note = [
    spans.map((span) => spanLabel(span.fromLap, span.toLap)).join(' · '),
    ongoing ? 'still under yellow' : null
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card
      title="Cautions"
      action={
        <SourcePill
          title="Full-course cautions so far"
          entries={[
            {
              label: 'Live flag record',
              path: '/api/readiness',
              note: 'Caution spans counted from the flag state on each charted lap of our capture.'
            }
          ]}
          caveats={['Official caution causes and exact yellow-lap counts arrive with the post-race reports.']}
        />
      }
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 16 }}>
        <Stat
          label={`Full-course caution${spans.length === 1 ? '' : 's'} so far`}
          value={spans.length}
          note={note}
        />
      </div>
    </Card>
  );
};

/* ---------- module 6: the replay affordance, at COLD ---------- */

const WatchThisRaceUnfold = ({ sessionId }: { sessionId: string }) => {
  const catalog = useReplayCatalog();
  const capture = catalog ? watchableCaptureForRace(catalog, sessionId) : null;
  if (!capture) return null;
  const isOwnCapture = replayProvenance(capture).tier === 'brycecast_capture';
  return (
    <section className="race-replay" aria-label="Watch this race unfold">
      <ReplayAffordance
        capture={capture}
        fromSessionId={sessionId}
        title="Watch this race unfold"
        copy={
          isOwnCapture
            ? 'Every second of this race, replayed as it happened, from our own trackside capture.'
            : 'Every second of this race, reconstructed from a third-party timing archive and replayed as it happened.'
        }
      />
    </section>
  );
};

/* ---------- the shell ---------- */

export const LiveRaceShell = ({
  sessionId,
  payload,
  history,
  replay
}: {
  sessionId: string;
  payload: LiveReadiness | null;
  history: LiveSessionHistory | null;
  replay: ReplaySession | null;
}) => {
  const ref = liveRaceSessionRefOf(payload);
  const requestedEsid = trailingNumericId(sessionId);
  // Only frames that belong to THIS race render — during a replay's cue-up the
  // poll may still carry the real feed, which must never paint the shell.
  const payloadIsThisRace = Boolean(ref && requestedEsid && ref.eventSessionId === requestedEsid);
  const simulated = Boolean(ref?.simulated && payloadIsThisRace);
  const chart = useMemo(
    () => (payloadIsThisRace ? buildingLapChartFrom(history) : null),
    [payloadIsThisRace, history]
  );

  const preGreen = payloadIsThisRace && payload?.state === 'pre_session';
  const finished = payloadIsThisRace && isPostCheckeredRef(ref);
  // Post-race the capture itself goes cold and reads 'stale' — that is the
  // finished state, not a pause, so the paused treatment yields to "Finished".
  const paused = payloadIsThisRace && payload?.state === 'stale' && !finished;
  const running = payloadIsThisRace && !preGreen && !finished;

  const rank = payloadIsThisRace && payload ? livePosition(liveBryceRowOf(payload) ?? {}) : null;
  const outline = payloadIsThisRace ? trackOutlineFor(ref?.trackName ?? null) : null;
  // The archived record time, so a replayed race is dated the day it RAN;
  // live, this is simply today — the race day.
  const raceDate = payloadIsThisRace && payload ? liveSourceCheckedAtOf(payload) : null;
  const heroTitle =
    (payloadIsThisRace ? ref?.eventName : null) ?? (replay?.session?.eventName ?? null) ?? 'This race, live';
  const seasonYear = (payloadIsThisRace ? ref?.seasonYear : null) ?? replay?.session?.seasonYear ?? null;

  // Cross-links, never duplication: this page opens with one link back to /live.
  // Mid-replay the link carries the virtual clock so the replay continues there.
  const liveHref = `/live${replay ? replayDeepLinkQuery(replay.getReplayParams()) : ''}`;

  const raceStateLabel = finished
    ? 'Finished'
    : preGreen
      ? 'Pre-race'
      : simulated
        ? 'Replay'
        : 'LIVE';
  const lapLine =
    ref?.lap !== null && ref?.lap !== undefined && ref?.totalLaps ? `lap ${ref.lap} of ${ref.totalLaps}` : null;

  return (
    <div className="page stack">
      <Link to="/races" className="navlink" style={{ alignSelf: 'flex-start', padding: '4px 2px' }}>
        <ArrowLeft size={14} aria-hidden /> All races
      </Link>
      <header className="screen-head" style={{ margin: 0 }}>
        <span className="kicker">
          {[
            seasonYear ? `${seasonYear} season` : null,
            payloadIsThisRace ? ref?.trackName : null,
            raceDate ? formatDate(raceDate, { month: 'long', day: 'numeric' }) : null
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <h1 className="screen-head__title">{heroTitle}</h1>
      </header>

      <HeroPanel>
        <div className="row row--between" style={{ alignItems: 'flex-start' }}>
          <span className="caption">
            {finished ? 'The finish, unofficial' : preGreen ? 'Before the green' : simulated ? 'The race, replayed' : 'The race, live'}
          </span>
          <SourcePill
            title={heroTitle}
            entries={[
              {
                label: simulated ? 'Archived Race Control capture · replayed' : 'Race Control live timing · 1-second capture',
                path: '/api/readiness',
                note: simulated
                  ? 'This client is replaying an archived Race Control capture — flag, lap and running position exactly as they happened.'
                  : 'Flag, lap and running position straight from the official Race Control feed, polled once a second.'
              }
            ]}
            caveats={[
              'Every number on this page is provisional until the official results land.',
              'This page fills in as the race runs, and becomes the full debrief — at this same address — once official reports arrive.'
            ]}
          />
        </div>
        <div className="hero-race">
          <div className="stat">
            <div className="live-position" style={{ minHeight: 0 }}>
              <Plate size="hero" />
              <div>
                <span className="caption">{finished ? 'ran at the flag' : 'running position'}</span>
                <TickerValue
                  className="stat__value stat__value--hero live-position__value"
                  value={rank !== null ? `P${rank}` : '—'}
                  valueKey={rank ?? 'na'}
                />
              </div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 6, maxWidth: '38ch' }}>
              {finished
                ? 'Finished · unofficial order — provisional until official results land.'
                : preGreen
                  ? 'The grid forms at the green flag — provisional from the first lap on.'
                  : 'Provisional — positions settle at the flag.'}
            </span>
          </div>
          <div className="hero-race__art">
            {outline ? <TrackArt outline={outline} showCornerLabels={false} maxHeight={150} /> : null}
          </div>
          <div className="stat" style={{ alignItems: 'flex-end', gap: 8 }}>
            <div className="row row--wrap" style={{ justifyContent: 'flex-end' }}>
              {ref?.flag && !finished ? (
                <StatusChip tone={flagTone(ref.flag)} label={`${ref.flag} flag`} live={running && !simulated && ref.flag.toUpperCase() === 'GREEN'} />
              ) : null}
              {finished ? <StatusChip tone="neutral" label="Finished · unofficial order" /> : null}
              {paused ? <StatusChip tone="warn" label="Paused · holding last good data" /> : null}
            </div>
            <TickerValue
              className="tnum"
              value={[raceStateLabel, lapLine].filter(Boolean).join(' · ')}
              valueKey={`${raceStateLabel}-${ref?.lap ?? 'na'}`}
            />
            <Link to={liveHref} className="navlink" style={{ padding: 0 }}>
              Watch live →
            </Link>
          </div>
        </div>
      </HeroPanel>

      <RaceSoFarCard chart={chart} preGreen={preGreen || !payloadIsThisRace} paused={paused} simulated={simulated} />

      <BattlesSoFarCard chart={chart} />

      <CautionsCard chart={chart} />

      {/* Module 5 — sections, honestly absent: one line, no placeholder chart. */}
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-secondary)' }}>
        Section times arrive with the official reports after the race.
      </p>

      {finished ? <WatchThisRaceUnfold sessionId={sessionId} /> : null}

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Everything on this page comes from {simulated ? 'an archived Race Control capture, replayed second by second' : 'our own live Race Control capture'} — the full debrief takes over here once official results land.
      </p>
    </div>
  );
};
