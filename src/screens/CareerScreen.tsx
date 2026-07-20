import { useState, type ReactNode } from 'react';
import { Card, GhostButton, Reveal, SourcePill, Stat, TickerValue, Unavailable } from '../app/components';
import { asNumber, asString, formatNumber, formatPct } from '../app/format';
import { uiDataPackage } from '../data/uiDataPackage';
import { getVenueByTrackName } from '../data/venueDossier';
import { liveBryceRowOf } from '../data/livePageModel';
import type { LiveReadiness, ReadinessStatus } from '../app/useReadiness';
import { CareerAtlas } from './careerAtlas';
import { Gb3DepthLayer } from './gb3Depth';
import { FormulaFordDepthLayer } from './formulaFordDepth';
import { DaytonaDepthLayer } from './daytonaDepth';
import { EuroformulaDepthLayer } from './euroformulaDepth';
import {
  BestClimbs,
  CareerBests,
  CareerExplorer,
  CareerRestarts,
  QualiConversion,
  ChapterStrip,
  DaytonaChapterBody,
  DaytonaSourcePill,
  RainDays,
  RivalsCard,
  TheCampaigns,
  TheClimb,
  chapterTint
} from './careerExplorer';

type Row = Record<string, string | number | null>;

/* Career chapters in journey order — the climb from F1600 to INDY NXT.
 * Narrative lines are descriptive context only; every number beside them
 * comes from the source-backed series summary. */
const seriesChapters: Array<{ name: string; years: string; short?: string; narrative: string }> = [
  {
    name: 'F1600 Championship Series',
    years: '2019',
    short: 'F1600',
    narrative: 'Where the climb started — his first season racing cars, in American grassroots open-wheel.'
  },
  {
    name: 'Formula Ford',
    years: '2020',
    narrative: 'A year in the UK’s classic school of racecraft — Festival and Walter Hayes country.'
  },
  {
    name: 'GB3 Championship',
    years: '2021–22',
    short: 'GB3',
    narrative: 'Two seasons of British junior formula racing against deep international fields.'
  },
  {
    name: 'Euroformula Open',
    years: '2023',
    narrative: 'Continental single-seaters — front-running results across a full European campaign.'
  },
  {
    name: 'Castrol Toyota Formula Regional Oceania Championship',
    years: '2024',
    short: 'FR Oceania',
    narrative: 'A southern-hemisphere summer in the Toyota series that feeds the global junior ladder.'
  },
  {
    name: 'IMSA WeatherTech SportsCar Championship',
    years: '2025 · Daytona 24',
    short: 'IMSA',
    narrative:
      'One race, twenty-four hours: the Rolex 24 at Daytona in a GTP prototype — endurance racing’s deep end, shared with three co-drivers through the night.'
  },
  {
    name: 'INDY NXT',
    years: '2024–26 · current',
    narrative: 'The road to INDYCAR — the current chapter, one step from the top.'
  }
];

const ChapterCard = ({
  chapter,
  row,
  current,
  extra,
  depth
}: {
  chapter: (typeof seriesChapters)[number];
  row: Row | undefined;
  current: boolean;
  extra?: string | null;
  depth?: { title: string; render: () => ReactNode };
}) => {
  const races = row ? asNumber(row.raceRows) : null;
  const oneRace = chapter.short === 'IMSA';
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`journey__chapter${current ? ' journey__chapter--current' : ''}`}>
      <Card className={current ? undefined : 'panel--quiet'}>
        <div className="row row--between row--wrap" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div>
            <span className="caption" style={current ? { color: 'var(--ink-primary)', fontWeight: 570 } : undefined}>{chapter.years}</span>
            <h2 className="display row" style={{ fontSize: 18, margin: '3px 0 0', gap: 8, alignItems: 'center' }}>
              {!current ? (
                /* The chapter's climb color, carried onto its card. */
                <span
                  aria-hidden
                  style={{ width: 9, height: 9, borderRadius: '50%', background: chapterTint(chapter.name), opacity: 0.75, flex: 'none' }}
                />
              ) : null}
              {chapter.short ?? chapter.name}
            </h2>
          </div>
          <span className="row" style={{ gap: 8 }}>
            {races !== null ? (
              <span className="chip chip--outline tnum">
                {formatNumber(races, 0)} {races === 1 ? 'race' : 'races'}
              </span>
            ) : null}
            {oneRace ? <DaytonaSourcePill /> : null}
          </span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>{chapter.narrative}</p>
        {oneRace ? (
          /* A single dot on a percentile strip says nothing — the one-race
           * chapter gets told as the race it was. */
          <DaytonaChapterBody />
        ) : (
          <>
            <div style={{ marginTop: 10 }}>
              <ChapterStrip seriesName={chapter.name} />
            </div>
            {row ? (
              <div className="row" style={{ gap: 26, marginTop: 10, flexWrap: 'wrap' }}>
                <Stat label="Avg finish" value={formatNumber(row.avgFinish)} />
                <Stat label="Field beaten (avg)" value={formatPct(row.avgFinishPercentile)} />
                <Stat label="Top-10 rate" value={formatPct(row.top10RatePct)} />
              </div>
            ) : null}
            {extra ? (
              <p className="caption caption--secondary" style={{ margin: '10px 0 0' }}>
                {extra}
              </p>
            ) : null}
          </>
        )}
        {/* The depth layer serves both the ordinary chapters and the one-race
            Daytona card (its stint timeline + co-driver roster). */}
        {depth ? (
          <div style={{ marginTop: 12 }}>
            <GhostButton expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Show less' : depth.title}
            </GhostButton>
            {expanded ? (
              <Reveal>
                <div style={{ paddingTop: 4 }}>{depth.render()}</div>
              </Reveal>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
};

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const splitNamedSource = (source: string): { name: string; url: string } => {
  const separator = source.indexOf(' | ');
  if (separator < 0) return { name: source, url: '' };
  return { name: source.slice(0, separator), url: source.slice(separator + 3) };
};

/** During a live (or replayed) session the odometer counts today's on-track
 *  laps as they run — Bryce's completed laps × the canonical venue length. It
 *  never touches the exact sourced career figure above it.
 *
 *  Two guards keep the number honest:
 *  - Laps come only from `bryce.laps`. There is NO heartbeat-lap fallback: the
 *    session leader's lap counter overcounts the moment Bryce is lapped or his
 *    row is missing, so absent `bryce.laps` we render no provisional mileage.
 *  - `covered` is true when the active session is already summed into the exact
 *    career total (its event-session id is in the ledger). A covered session's
 *    laps are shown as a replay preview only and are NEVER added to the total —
 *    that double-count is what produced the false 7,053.
 *
 *  Absent a live session the card renders exactly as before. */
const liveOdometerIncrement = (live: LiveReadiness | null, coveredEventSessionIds: Set<string>) => {
  if (!live) return null;
  if (live.state !== 'ready' && live.state !== 'degraded') return null;
  const heartbeat = (live.liveTiming as Record<string, unknown> | undefined)?.heartbeat as
    | Record<string, unknown>
    | undefined;
  const trackName = asString(heartbeat?.trackName);
  if (!trackName) return null;
  const venue = getVenueByTrackName(trackName);
  const lengthMi = venue?.lengthMi ?? null;
  if (lengthMi === null || lengthMi <= 0) return null;
  const bryce = liveBryceRowOf(live);
  const laps = asNumber(bryce?.laps);
  if (laps === null || laps <= 0) return null;
  const rawSessionId = heartbeat?.eventSessionId;
  const activeSessionId = rawSessionId == null ? '' : String(rawSessionId).trim();
  const covered = activeSessionId.length > 0 && coveredEventSessionIds.has(activeSessionId);
  return { laps, lengthMi, trackName, todayMiles: laps * lengthMi, activeSessionId, covered };
};

const OdometerCard = ({ live }: { live: LiveReadiness | null }) => {
  const lifeStats = uiDataPackage.screens.careerLab.lifeStats;
  if (!lifeStats) {
    return (
      <Card title="The odometer">
        <Unavailable>Career life stats are unavailable until the sourced venue-and-lap lane is rebuilt.</Unavailable>
      </Card>
    );
  }

  /* The ledger stores full session ids (session_indy_nxt_2026_6755); the live
   * feed reports the bare event-session id (6755). Match on the trailing token
   * so a replay of an already-counted race dedups against the exact total. */
  const coveredEventSessionIds = new Set(
    (lifeStats.coveredSessionIds ?? [])
      .map((id) => id.slice(id.lastIndexOf('_') + 1))
      .filter(Boolean)
  );
  const liveToday = liveOdometerIncrement(live, coveredEventSessionIds);
  // Only fold today's laps into the exact career figure when the session is NOT
  // already counted; a covered replay leaves the total untouched.
  const provisionalTotalMiles =
    liveToday && !liveToday.covered ? lifeStats.personalRaceMileage.miles + liveToday.todayMiles : null;
  const routeAdjusted = lifeStats.travel.routeAdjustedMinimum;

  const venueSourceEntries = lifeStats.venueSources.flatMap((venue) => [
    ...venue.lengthSources.map((source, index) => {
      const named = splitNamedSource(source);
      return {
        label: `${venue.trackName} · length${venue.lengthSources.length > 1 ? ` ${index + 1}` : ''}`,
        path: named.url,
        note: named.name
      };
    }),
    ...venue.coordsSources.map((source, index) => {
      const named = splitNamedSource(source);
      return {
        label: `${venue.trackName} · coordinates${venue.coordsSources.length > 1 ? ` ${index + 1}` : ''}`,
        path: named.url,
        note: named.name
      };
    })
  ]);

  return (
    <Card
      title="The odometer"
      action={
        <SourcePill
          title="The odometer"
          entries={[
            ...lifeStats.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note })),
            ...venueSourceEntries
          ]}
          caveats={[
            ...lifeStats.caveats,
            /* Confidence classes, the harder bounds, and proxy methodology (#13)
               live here now — the card face stays family-first. */
            'Every sourced mile stays in its confidence class: exact, lower bound, modeled range, or unknown.',
            `On-track floor: ${wholeNumber.format(lifeStats.physicalSessionMileage.floor.miles)}+ miles across ${wholeNumber.format(
              lifeStats.physicalSessionMileage.floor.laps
            )} laps — exact laps plus lower bounds where a session's count is known but partial.`,
            `The on-track floor excludes ${lifeStats.physicalSessionMileage.unknown.sessions} sessions with no lap count.`,
            `Minimum travel: ${wholeNumber.format(
              lifeStats.travel.greatCircleMinimum.miles
            )} miles is the great-circle displacement venue to venue; real routes don't run straight, so the true number is larger.`,
            `Route-adjusted minimum proxy: ${wholeNumber.format(routeAdjusted.lowMiles)}–${wholeNumber.format(
              routeAdjusted.highMiles
            )} miles. Actual travel stays unknown until season bases and return-home frequency are supplied.`,
            `Route adjustment assumptions — drive legs: ${routeAdjusted.assumptions.driveProxy}; flight legs: ${routeAdjusted.assumptions.flightProxy}.`
          ]}
        />
      }
    >
      <p style={{ margin: '0 0 16px', color: 'var(--ink-secondary)', fontSize: 13.5 }}>
        How far the career has gone — every mile Bryce has raced, and every place he’s raced it, counted from official lap logs.
      </p>
      <div className="grid grid--2">
        <Stat
          label="Miles raced"
          value={wholeNumber.format(lifeStats.personalRaceMileage.miles)}
          note={`${wholeNumber.format(lifeStats.personalRaceMileage.laps)} personal laps · ${lifeStats.personalRaceMileage.raceRows} races`}
        />
        <Stat
          label="Venues · countries"
          value={`${wholeNumber.format(lifeStats.venues)} · ${wholeNumber.format(lifeStats.countries)}`}
          note="Physical venues · layouts combined"
        />
      </div>
      {liveToday && liveToday.covered ? (
        /* Already in the exact total above — preview the replay's laps, add
         * nothing. This is the guard against the false 7,053. */
        <div className="odometer-live odometer-live--preview">
          <span className="caption">Replay preview</span>
          <TickerValue
            className="odometer-live__value"
            value={`+${wholeNumber.format(liveToday.todayMiles)} mi`}
            valueKey={liveToday.laps}
          />
          <p className="caption caption--secondary odometer-live__note">
            {wholeNumber.format(liveToday.laps)} {liveToday.laps === 1 ? 'lap' : 'laps'} ×{' '}
            {liveToday.lengthMi.toFixed(2)} mi at {liveToday.trackName}. This session already counts in the total above —
            replaying it adds nothing.
          </p>
        </div>
      ) : liveToday && provisionalTotalMiles !== null ? (
        /* A session not yet in the ledger (a live race in progress). Today's
         * laps lead; the total including today stays subordinate. */
        <div className="odometer-live">
          <span className="caption">Today, provisional</span>
          <TickerValue
            className="odometer-live__value"
            value={`+${wholeNumber.format(liveToday.todayMiles)} mi today`}
            valueKey={liveToday.laps}
          />
          <p className="caption caption--secondary odometer-live__note">
            {wholeNumber.format(provisionalTotalMiles)} mi including today · {wholeNumber.format(liveToday.laps)}{' '}
            {liveToday.laps === 1 ? 'lap' : 'laps'} × {liveToday.lengthMi.toFixed(2)} mi at {liveToday.trackName}.
            Reconciled with official results after the flag.
          </p>
        </div>
      ) : null}
    </Card>
  );
};

export const CareerScreen = ({ readiness }: { readiness?: ReadinessStatus }) => {
  const careerLab = uiDataPackage.screens.careerLab;
  const rows = careerLab.seriesSummary as Row[];
  const rowByName = new Map(rows.map((row) => [asString(row.seriesName) ?? '', row]));
  /* Two deliberate, different denominators (FABLE_LESSONS editorial law):
   *  · ledgerRaces (146) — every race Bryce personally drove, across all series;
   *    the canonical career count the odometer and the atlas map also carry.
   *  · resultRaces (142) — the subset that carries a sourced finishing result,
   *    which is what the per-series averages and percentiles are computed on.
   *  The four-race gap is a DNS and three unclassified races: real starts with
   *  no finishing position to rank. The hero leads with the canonical 146 so the
   *  page's headline race count matches everywhere, and names the 142 for what
   *  it is rather than letting two unlabeled totals contradict each other. */
  const resultRaces = rows.reduce((sum, row) => sum + (asNumber(row.raceRows) ?? 0), 0);
  const ledgerRaces =
    asNumber(careerLab.lifeStats?.personalRaceMileage?.raceRows) ??
    asNumber((careerLab.atlas as { raceCount?: number } | undefined)?.raceCount) ??
    resultRaces;

  /* Lap texture for the current chapter: every sourced INDY NXT lap chart. */
  const lapTotals = (careerLab.lapPositionMix ?? []).reduce(
    (acc, season) => {
      for (const { position, laps } of season.positions) {
        acc.total += laps;
        if (position <= 5) acc.top5 += laps;
        if (position <= 10) acc.top10 += laps;
      }
      return acc;
    },
    { total: 0, top5: 0, top10: 0 }
  );
  const lapLine =
    lapTotals.total > 0
      ? `Lap by lap: of ${formatNumber(lapTotals.total, 0)} laps on sourced lap charts, ${formatNumber(lapTotals.top10, 0)} ran inside the top ten — ${formatNumber(lapTotals.top5, 0)} inside the top five.`
      : null;

  return (
    <div className="page stack">
      <header className="screen-head row row--between" style={{ alignItems: 'flex-end', gap: 14 }}>
        <div>
          <span className="kicker">Career Lab</span>
          <h1 className="screen-head__title">The climb.</h1>
          <p className="screen-head__sub">
            {seriesChapters.length} series, eight seasons, {formatNumber(ledgerRaces, 0)} races —{' '}
            {formatNumber(resultRaces, 0)} of them with a sourced finishing result. Percentiles matter more than raw
            finishes; field sizes changed a lot along the way.
          </p>
        </div>
        <SourcePill
          title="Career Lab"
          entries={careerLab.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
          caveats={careerLab.caveats}
        />
      </header>

      <CareerBests />

      <TheClimb />

      <div style={{ marginTop: 10 }}>
        <span className="kicker">The explorer</span>
      </div>
      <CareerExplorer />

      <div style={{ marginTop: 10 }}>
        <span className="kicker">The rivals</span>
      </div>
      <RivalsCard />

      <div style={{ marginTop: 10 }}>
        <span className="kicker">The restarts</span>
      </div>
      <CareerRestarts />

      <QualiConversion />
      <TheCampaigns />

      <OdometerCard live={readiness?.payload ?? null} />

      <CareerAtlas />

      {rows.length === 0 ? (
        <Card>
          <Unavailable>Career summary data unavailable.</Unavailable>
        </Card>
      ) : (
        <>
          <div style={{ marginTop: 10 }}>
            <span className="kicker">The chapters</span>
          </div>
          <div className="journey">
            {seriesChapters.map((chapter, index) => (
              <Reveal key={chapter.name} delay={(index % 2) * 60}>
                <ChapterCard
                  chapter={chapter}
                  row={rowByName.get(chapter.name)}
                  current={index === seriesChapters.length - 1}
                  extra={index === seriesChapters.length - 1 ? lapLine : null}
                  depth={
                    chapter.short === 'GB3'
                      ? { title: 'The GB3 years, in depth', render: () => <Gb3DepthLayer /> }
                      : chapter.name === 'Formula Ford'
                        ? { title: 'Formula Ford lap shape', render: () => <FormulaFordDepthLayer /> }
                        : chapter.short === 'IMSA'
                          ? { title: 'The 24 hours, in depth', render: () => <DaytonaDepthLayer /> }
                          : chapter.name === 'Euroformula Open'
                            ? { title: 'The 2023 season, in depth', render: () => <EuroformulaDepthLayer /> }
                            : undefined
                  }
                />
              </Reveal>
            ))}
          </div>
        </>
      )}

      <div className="grid grid--2">
        <BestClimbs />
        <RainDays />
      </div>
    </div>
  );
};
