import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card, SourcePill } from '../app/components';
import { inkGoldDiverging, useCoarsePointer } from '../app/charts';
import { TrackArt } from '../app/trackArt';
import type { TrackOutline } from '../assets/tracks';
import {
  hasDerivedRemainder,
  measuredSectionCount,
  measuredTrackSectionsFor,
  timedShareOf,
  trackSectionsFor,
  type TrackSectionAnchorSet
} from '../assets/tracks/sections';
import {
  MIN_CLEAN_LAPS,
  anchorsForPack,
  cleanSectionLapsOf,
  lapContextOf,
  lapScopesForObservedLaps,
  lapScopesForPack,
  resolveHeatSections,
  sectionObservationsFromLaps,
  type ResolvedHeatSection,
  type SectionScope,
  type SectionStat,
  type SectionObservationSet
} from '../data/sectionObservations';
import { loadSectionLaps, sectionLapVisitsFor, type SectionLapsPack } from '../data/sectionLaps';
import { loadPassMarks, resolvePassMarks, type PassMarksPack } from '../data/passMarks';
import { loadRaceStory } from '../data/raceStory';
import { uiDataPackage } from '../data/uiDataPackage';
import { ControlRow, Segmented, raceHref } from './careerExplorer';
import { Link } from '../app/router';
import { ordinal } from '../app/format';

/* ============================================================================
 * Section Intelligence — the venue heat map + its year-over-year shapes.
 *
 * Lifted verbatim out of RaceDetailScreen so the SAME cards render on race
 * pages AND on the Race Week venue home (phase3/raceweek-depth). The race page
 * imports SectionHeatCard + VenueYearsCard directly (unchanged behavior); Race
 * Week composes them through VenueSectionSuite + useVenueSectionData, keyed by
 * the upcoming venue's anchored sections and available packs — no new data
 * lanes, pure composition. A venue with no anchors renders none of it.
 * ==========================================================================*/

const cautionCopy: Record<string, string> = {
  green: 'green flag',
  caution: 'under caution',
  restart: 'restart lap',
  unknown: 'no flag report'
};

/** The house ink↔gold key rendered as a short swatch strip. Keyed on screen so
 *  gold's one meaning here (a stronger stretch) is never ambiguous. */
const HeatKey = () => {
  const stops = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1];
  return (
    <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Tougher</span>
      <span style={{ display: 'flex', borderRadius: 3, overflow: 'hidden' }}>
        {stops.map((stop) => (
          <span key={stop} style={{ width: 20, height: 8, background: inkGoldDiverging(stop) }} />
        ))}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Stronger</span>
      <span style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>
        deeper gold = stronger stretch, deeper ink = tougher
      </span>
    </div>
  );
};

/** Single-lap drawer row: a one-dot strip would imply a distribution that
 *  isn't there (director ruling), so one lap gets its plain value instead. */
const SectionSingleLapRow = ({
  label,
  observation
}: {
  label: string;
  observation: {
    percentile: number | null;
    cautionState?: 'green' | 'caution' | 'restart' | 'unknown';
    bryceSummarySeconds?: number | null;
    fieldRank?: number | null;
    fieldComparisonCount?: number | null;
  };
}) => (
  <div className="row row--between" style={{ gap: 12 }}>
    <span
      title={label}
      style={{ fontSize: 12.5, color: 'var(--ink-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {label}
    </span>
    <span className="tnum" style={{ fontSize: 12, color: observation.percentile === null ? 'var(--ink-muted)' : 'var(--ink-primary)', textAlign: 'right' }}>
      {observation.percentile === null
        ? 'no timing row for this lap'
        : `this lap: ${ordinal(Math.round(observation.percentile * 100))} percentile${
            typeof observation.bryceSummarySeconds === 'number'
              ? ` · ${observation.bryceSummarySeconds.toFixed(3)}s`
              : ''
          }${
            typeof observation.fieldRank === 'number' && typeof observation.fieldComparisonCount === 'number'
              ? ` · P${observation.fieldRank} of ${observation.fieldComparisonCount}`
              : ''
          }${
            observation.cautionState && observation.cautionState !== 'green' ? ` · ${cautionCopy[observation.cautionState]}` : ''
          }`}
    </span>
  </div>
);

/** One drawer row: official label, summary ordinal, clean-lap count, and two
 *  quiet strips — the top one every clean lap as a dot on the 0–100 field-beaten
 *  scale with the summary statistic a gold tick; the lower one the FIELD's own
 *  pace this section (each car a faint tick, Bryce's median the gold tick), so
 *  the percentile's meaning is shown, not told. Faster reads to the right on
 *  both, matching the map's key. */
const SectionDistributionRow = ({
  label,
  observation,
  stat,
  qualifying = false
}: {
  label: string;
  observation: {
    percentile: number | null;
    observationCount: number | null;
    lapPercentiles?: Array<{ lap: number; percentile: number }>;
    bryceSummarySeconds?: number | null;
    bryceMedianSeconds?: number | null;
    fieldSeconds?: number[] | null;
    kind?: 'measured' | 'derived_remainder';
  };
  stat: SectionStat;
  qualifying?: boolean;
}) => {
  const points = observation.lapPercentiles ?? [];
  const suppressed = observation.percentile === null;
  const field = observation.fieldSeconds ?? null;
  const bryceMed = observation.bryceSummarySeconds ?? observation.bryceMedianSeconds ?? null;
  /* Field-pace strip range spans the field plus Bryce, so his tick is always in
   * frame even when he is the fastest or slowest car. Faster → right. */
  const paceValues = field && field.length > 0 ? [...field, ...(bryceMed !== null ? [bryceMed] : [])] : [];
  const lo = paceValues.length > 0 ? Math.min(...paceValues) : 0;
  const hi = paceValues.length > 0 ? Math.max(...paceValues) : 1;
  const xOf = (seconds: number) => (hi > lo ? ((hi - seconds) / (hi - lo)) * 100 : 50);
  /* Qualifying fieldSeconds are each driver's best comparable section, while
   * the summary is Bryce's mean/median across selected laps. Do not draw those
   * unlike aggregates on one pace axis. The per-lap percentile dots remain the
   * source-valid comparison against that fixed group benchmark. */
  const showPace = !qualifying && !suppressed && field !== null && field.length > 0;
  return (
    <div className="row" style={{ gap: 12, alignItems: 'center' }}>
      <span
        title={label}
        style={{ fontSize: 12.5, color: 'var(--ink-secondary)', flex: '0 0 32%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {label}
      </span>
      <span className="stack" style={{ flex: 1, gap: 3 }}>
        <span style={{ position: 'relative', display: 'block', height: 22 }}>
          <span style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, borderRadius: 1, background: 'var(--surface-2)' }} />
          {points.map((point) => (
            <span
              key={point.lap}
              style={{
                position: 'absolute',
                top: 8,
                left: `calc(${point.percentile * 100}% - 3px)`,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--ink-primary)',
                opacity: 0.18
              }}
            />
          ))}
          {observation.percentile !== null ? (
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: `calc(${observation.percentile * 100}% - 1.5px)`,
                width: 3,
                height: 16,
                borderRadius: 1.5,
                background: 'var(--bryce)'
              }}
            />
          ) : null}
        </span>
        {showPace ? (
          <span style={{ position: 'relative', display: 'block', height: 10 }} aria-hidden>
            <span style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 1, background: 'var(--grid-hairline)' }} />
            {field!.map((seconds, index) => (
              <span
                key={index}
                style={{
                  position: 'absolute',
                  top: 1,
                  left: `calc(${xOf(seconds)}% - 0.5px)`,
                  width: 1,
                  height: 8,
                  background: 'var(--ink-muted)',
                  opacity: 0.35
                }}
              />
            ))}
            {bryceMed !== null ? (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `calc(${xOf(bryceMed)}% - 1px)`,
                  width: 2,
                  height: 10,
                  borderRadius: 1,
                  background: 'var(--bryce)'
                }}
              />
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="tnum" style={{ fontSize: 12, color: suppressed ? 'var(--ink-muted)' : 'var(--ink-primary)', width: 128, textAlign: 'right' }}>
        {suppressed
          ? `${observation.observationCount ?? 0} ${qualifying ? 'valid ' : 'clean '}${observation.observationCount === 1 ? 'lap' : 'laps'}`
          : `${ordinal(Math.round(observation.percentile! * 100))} · ${
              showPace ? `vs ${field!.length} cars · ` : ''
            }${bryceMed !== null ? `${bryceMed.toFixed(3)}s ${stat === 'mean' ? 'avg' : 'med'} · ` : ''}${observation.observationCount ?? 0} ${observation.observationCount === 1 ? 'lap' : 'laps'}`}
      </span>
    </div>
  );
};

/** The venue heat card: the track shape as the interface, with lap scopes, the
 *  numbers drawer, and pass marks. Race pages pass a single race's pack; Race
 *  Week passes the selected visit's pack plus a `visitControl` year toggle and
 *  an `orientationClause` that names which year is shown. `title` lets Race Week
 *  scope the heading to "his record here" without forking the component. */
export interface QualifyingHeatMode {
  laps: SectionLapsPack | null;
  /** Qualifying can use a different section-name grain from the race pack
   * (for example Nashville's official report beside measured race loops). */
  anchors?: TrackSectionAnchorSet | null;
  status: 'available' | 'partial' | 'unavailable' | 'cancelled';
  note?: string | null;
  sourceUrl?: string | null;
  sessionLabel?: string | null;
  gridLabel?: string | null;
}

export const SectionHeatCard = ({
  outline,
  anchors,
  laps,
  fallbackSet,
  passMarks,
  title = 'The track, section by section',
  orientationClause,
  visitControl,
  visitLapsCompleted,
  priorComparison,
  qualifying
}: {
  outline: TrackOutline;
  anchors: TrackSectionAnchorSet;
  laps: SectionLapsPack | null;
  fallbackSet: SectionObservationSet | null;
  passMarks: PassMarksPack | null;
  title?: string;
  /** Race Week only: a lead sentence naming the shown year ("His 2025 race here
   *  … — toggle for 2024."). Absent on race pages (the default hover copy). */
  orientationClause?: string;
  /** Race Week only: the quiet year toggle (a ControlRow + Segmented wired to
   *  the suite's selected-visit state), rendered above the scope control. */
  visitControl?: ReactNode;
  /** Canonical laps Bryce completed this visit (from the race-story pack). When
   *  it's zero — an opening-lap ending — the empty state states why with dignity
   *  instead of the generic too-few-clean-laps line. Absent on race pages. */
  visitLapsCompleted?: number | null;
  /** When this race has NO valid comparison scope at all, the card collapses to
   *  one dignified sentence and links here — a prior year that actually renders
   *  (finding #16). Null hides the link; the sentence still stands. */
  priorComparison?: { href: string; label: string } | null;
  /** Race-detail only: a second sourced substrate rendered through this same
   * map, controls, key, drawer, and section-selection engine. */
  qualifying?: QualifyingHeatMode | null;
}) => {
  const [mode, setMode] = useState<'race' | 'qualifying'>('race');
  const [raceScopeKey, setRaceScopeKey] = useState('full');
  const [qualifyingScopeKey, setQualifyingScopeKey] = useState('full');
  const [raceLap, setRaceLap] = useState(1);
  const [qualifyingLap, setQualifyingLap] = useState(1);
  const [raceStat, setRaceStat] = useState<SectionStat>('median');
  const [qualifyingStat, setQualifyingStat] = useState<SectionStat>('mean');
  const [numbersOpen, setNumbersOpen] = useState(false);
  /* Touch screens can't hover: swap the interaction verb so the caption asks
   * for a gesture the device can actually make (a tap opens the same tooltip). */
  const coarse = useCoarsePointer();
  const readVerb = coarse ? 'tap' : 'hover';

  const qualifyingMode = mode === 'qualifying';
  const activeLaps = qualifyingMode ? qualifying?.laps ?? null : laps;
  const activeFallbackSet = qualifyingMode ? null : fallbackSet;
  const activeAnchors = qualifyingMode ? qualifying?.anchors ?? anchors : anchors;
  const activePassMarks = qualifyingMode ? null : passMarks;
  const scopeKey = qualifyingMode ? qualifyingScopeKey : raceScopeKey;
  const setScopeKey = qualifyingMode ? setQualifyingScopeKey : setRaceScopeKey;
  const scrubLap = qualifyingMode ? qualifyingLap : raceLap;
  const setScrubLap = qualifyingMode ? setQualifyingLap : setRaceLap;
  const stat = qualifyingMode ? qualifyingStat : raceStat;
  const setStat = qualifyingMode ? setQualifyingStat : setRaceStat;
  const scopes = useMemo(
    () => {
      if (!activeLaps) return [{ kind: 'full_race' } as SectionScope];
      if (!qualifyingMode) return lapScopesForPack(activeLaps);
      return lapScopesForObservedLaps(
        activeLaps.lapTotals
          .filter((tuple) => tuple[0] !== null && (tuple[6] !== null || tuple[1] !== null))
          .map((tuple) => tuple[0] as number)
      );
    },
    [activeLaps, qualifyingMode]
  );
  const lapContext = useMemo(() => (activeLaps ? lapContextOf(activeLaps) : []), [activeLaps]);
  const availableLapIndexes = useMemo(
    () =>
      activeLaps
        ? activeLaps.lapTotals
            .filter((tuple) => tuple[0] !== null && (tuple[6] !== null || tuple[1] !== null))
            .map((tuple) => tuple[0] as number)
            .filter((lap, index, held) => held.indexOf(lap) === index)
            .sort((left, right) => left - right)
        : [],
    [activeLaps]
  );
  const officialQualifyingFastestLap = useMemo(() => {
    const timed = qualifying?.laps?.lapTotals.filter((tuple) => tuple[0] !== null && tuple[6] !== null) ?? [];
    return timed.reduce<typeof timed[number] | null>(
      (best, tuple) => (!best || (tuple[6] as number) < (best[6] as number) ? tuple : best),
      null
    )?.[0] ?? null;
  }, [qualifying?.laps]);

  useEffect(() => {
    setRaceScopeKey('full');
    setRaceLap(1);
    setRaceStat('median');
  }, [laps?.sessionId, fallbackSet?.sessionId]);

  useEffect(() => {
    if (!qualifying?.laps) return;
    const timed = qualifying.laps.lapTotals
      .filter((tuple) => tuple[0] !== null && (tuple[6] !== null || tuple[1] !== null))
      .map((tuple) => tuple[0] as number);
    setQualifyingScopeKey('full');
    setQualifyingStat('mean');
    if (timed.length > 0) setQualifyingLap(officialQualifyingFastestLap ?? timed[0]);
  }, [officialQualifyingFastestLap, qualifying?.laps?.sessionId]);

  const scope: SectionScope = useMemo(() => {
    if (!activeLaps || scopeKey === 'full') return { kind: 'full_race' };
    if (scopeKey === 'lap') return { kind: 'single_lap', lap: scrubLap };
    return scopes.find((entry) => entry.kind === 'lap_window' && entry.label === scopeKey) ?? { kind: 'full_race' };
  }, [activeLaps, scopeKey, scrubLap, scopes]);
  /* One floor for every race scope (MIN_CLEAN_LAPS) — the thirds menu above
   * only offers a third that can clear it. Qualifying keeps its own
   * one-lap-is-enough floor regardless of scope. */
  const minimumObservations = qualifyingMode ? 1 : MIN_CLEAN_LAPS;
  const aggregationOptions = qualifyingMode
    ? { minimumObservations, observationLabel: 'valid observed qualifying laps' }
    : undefined;

  const set = useMemo(() => {
    if (activeLaps) return sectionObservationsFromLaps(activeLaps, scope, stat, aggregationOptions);
    return activeFallbackSet;
  }, [activeLaps, scope, stat, aggregationOptions, activeFallbackSet]);
  const heatSections = useMemo(() => (set ? resolveHeatSections(activeAnchors, set) : []), [activeAnchors, set]);
  const hasHeat = heatSections.length > 0;
  /* Does this race have ANY valid comparison scope? Resolve the full-race default
   * independently of the selected scope — the full race carries the most clean
   * laps, so if it can't shade, no narrower window can either. When it can't, the
   * whole card collapses instead of showing a hollow outline + dead controls
   * (finding #16). */
  const noValidScope = useMemo(() => {
    const fullSet = activeLaps
      ? sectionObservationsFromLaps(activeLaps, { kind: 'full_race' }, stat, aggregationOptions)
      : activeFallbackSet;
    return !fullSet || resolveHeatSections(activeAnchors, fullSet).length === 0;
  }, [activeLaps, stat, aggregationOptions, activeFallbackSet, activeAnchors]);
  /* Pass marks are race-wide (scope-independent): each green Bryce pass joined
   * to the span it happened on, for the active anchor set. */
  const resolvedMarks = useMemo(
    () => (activePassMarks ? resolvePassMarks(activeAnchors, activePassMarks) : []),
    [activePassMarks, activeAnchors]
  );
  const showMarks = hasHeat && resolvedMarks.length > 0;
  /* Both counts read only the sections this map can actually draw — the ones
   * whose names join the ACTIVE anchor set. Reading the whole pack instead is
   * what let a venue page print "Only 55 clean green-flag laps…" beside an
   * empty shape: the count came from a measured pack whose section names never
   * matched the anchors it was being joined against. */
  const joinedSections = useMemo(() => {
    if (!set) return [];
    const anchorNames = new Set(activeAnchors.sections.map((anchor) => anchor.sectionName));
    return set.sections.filter((section) => anchorNames.has(section.sectionName));
  }, [set, activeAnchors]);
  const suppressedCount = joinedSections.filter((section) => section.percentile === null).length;
  /* observationCount is the real clean-lap count for this scope, unrounded and
   * ungated by the minimum — cheap to read straight off the set, so the empty
   * state below can name the actual shortfall instead of a generic sentence. */
  const scopeCleanLapCount = set ? Math.max(0, ...joinedSections.map((section) => section.observationCount ?? 0)) : null;
  /* Thirds are offered only when every third clears the floor (see
   * lapScopesForPack). When they aren't, the card says so once, quietly, in the
   * same muted note style as the suppression line — never a dead control and
   * never an empty map. */
  const cleanLapTotal = useMemo(
    () => (activeLaps && !qualifyingMode ? cleanSectionLapsOf(activeLaps).length : null),
    [activeLaps, qualifyingMode]
  );
  const thirdsWithheld =
    !qualifyingMode &&
    activeLaps !== null &&
    cleanLapTotal !== null &&
    cleanLapTotal > 0 &&
    !scopes.some((entry) => entry.kind === 'lap_window');
  const singleLap = scope.kind === 'single_lap';
  const scrubContext = singleLap ? lapContext.find((entry) => entry.lap === scrubLap) ?? null : null;
  const drawerRows = useMemo(() => {
    if (!set) return [];
    const labelFor = new Map(activeAnchors.sections.map((anchor) => [anchor.sectionName, anchor.label]));
    /* The drawer explains exactly what the shape shows: only sections with a
     * curated anchor (the derived remainder among them where it's anchored). */
    return set.sections
      .filter((observation) => labelFor.has(observation.sectionName))
      .map((observation) => ({ observation, label: labelFor.get(observation.sectionName) ?? observation.sectionName }))
      .sort((left, right) => (right.observation.percentile ?? -1) - (left.observation.percentile ?? -1));
  }, [set, activeAnchors]);

  /* Coverage up front (Jack's review): how much of the lap the loops measure,
   * and that the rest is derived from lap time rather than a blind spot. */
  const measuredPct = Math.round(timedShareOf(activeAnchors) * 100);
  const coverage = hasDerivedRemainder(activeAnchors)
    ? `${measuredSectionCount(activeAnchors)} timed sections · ${measuredPct}% measured · rest derived from lap time`
    : `${measuredSectionCount(activeAnchors)} timed sections · ${measuredPct}% of the lap`;
  /* Source-tier switch (adapter-contract law): a measured lake pack names the
     RaceTools capture per the permissions ledger — never "official timing" —
     while the fallback PDF path keeps the official Section Results copy. */
  const measured = set?.sourceTier === 'lake_loop_crossings';
  const intervalPath = activeLaps?.sourceRefs?.find((ref) => ref.key === 'nashvilleIntervalPack')?.path ?? null;
  const sourceEntries = qualifyingMode
    ? activeLaps?.sourceRefs?.length
      ? activeLaps.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))
      : qualifying?.sourceUrl
        ? [{ label: 'Official qualifying notice', path: qualifying.sourceUrl, note: qualifying.note ?? undefined }]
        : []
    : measured
    ? [
        {
          label: 'RaceTools race-weekend capture · timing-loop crossings',
          path: intervalPath ?? 'analysis/semantic-layer/output/nashville/',
          note: `Bryce's per-lap section times and full-field percentiles, differenced from the RaceTools race-weekend capture's timing-loop crossings — ${measuredSectionCount(activeAnchors)} sub-sections tiling the whole lap. A third-party capture; not official timing.`
        }
      ]
    : [
        {
          label: 'Official Section Results, lap by lap',
          path: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv',
          note: `Bryce's per-lap section times and field percentiles from the official timing loops. Section names follow the track's official timing stations; span lengths are measured from official time × speed (${activeAnchors.confidence}).`
        }
      ];
  /* Pass-mark provenance rides the SAME drawer as the shades it draws over
     (mixed-tier honesty): the marks are RaceTools-capture-derived even on
     pages whose sections are official PDFs, so their source is named where
     they render — entries and caveats straight from the pass pack. */
  const passEntries = showMarks && activePassMarks
    ? activePassMarks.sourceRefs.map((ref) => ({ label: ref.key === 'passPlacement' ? 'Pass marks · RaceTools race-weekend capture' : 'Pass-placement validation', path: ref.path, note: ref.note }))
    : [];
  const allEntries = [...sourceEntries, ...passEntries];
  const sourceCaveats = [
    qualifyingMode
      ? activeLaps?.comparisonScope === 'qualifying_group_best_sections'
        ? "Each lap's section is compared with every driver's best comparable section in Bryce's actual qualifying group; those benchmark sections need not come from one lap."
        : 'Qualifying section ranks and denominators follow the official report scope.'
      : measured
      ? 'Section times are the RaceTools race-weekend capture — timing-loop crossings, time-based, not GPS or car position; not official timing.'
      : 'Section times come from official timing loops — they are time-based, not GPS or car position.',
    ...(set ? [set.caveat] : []),
    ...(measured ? ['Sanity-checked: the three published corner sections agree with these measured spans within ~0.10s per lap.'] : []),
    ...(qualifyingMode && activeLaps
      ? ['Session averages are arithmetic means of Bryce’s valid observed section times and lap-level field shares; the field reference stays each driver’s best comparable section.', ...(activeLaps.caveats ?? [])]
      : []),
    ...(showMarks && activePassMarks ? activePassMarks.caveats : []),
    activeAnchors.note
  ];
  /* The face keeps only family-legible scope + denominator; the timing-loop
   * coverage string (method) moves into "The numbers behind the shades". */
  const scopeSummary = !set
    ? null
    : singleLap
      ? `Lap ${scrubLap}${qualifyingMode ? '' : ` of ${activeLaps?.totalLaps ?? '—'}`} · ${scrubContext ? cautionCopy[scrubContext.caution] : 'no flag report'}`
      : scope.kind === 'lap_window'
        ? `${scope.label} · laps ${scope.fromLap}–${scope.toLap} · ${set.comparisonRows ?? 0} ${qualifyingMode ? 'valid section-lap' : 'clean-lap'} comparisons`
        : qualifyingMode
          ? `${stat === 'mean' ? 'Average' : 'Median'} across ${new Set(set.sections.flatMap((section) => section.lapPercentiles?.map((point) => point.lap) ?? [])).size} valid observed laps · ${set.comparisonRows ?? 0} section-lap comparisons`
          : `${set.comparisonRows ?? 0} clean-lap comparisons`;

  const sessionControl = qualifying ? (
    <ControlRow label="Session">
      <Segmented
        options={[
          { value: 'race', label: 'Race' },
          { value: 'qualifying', label: 'Qualifying' }
        ]}
        value={mode}
        onChange={setMode}
      />
    </ControlRow>
  ) : null;
  const qualifyingContext = qualifyingMode
    ? [qualifying?.sessionLabel, qualifying?.gridLabel].filter(Boolean).join('\u00a0· ')
    : null;

  /* No valid scope: one dignified sentence, no hollow outline, no dead controls
   * (finding #16). The year toggle stays (it's navigation, not a scope control),
   * and a prior year that actually renders is one tap away. */
  if (noValidScope) {
    /* The honest empty state names the actual clean-lap count, and by
     * construction can never print one at or above the floor: this branch is
     * only reached when the full-race scope itself cannot shade. */
    const dignified =
      qualifyingMode
        ? qualifying?.note ?? 'No official qualifying section times are on file for this session.'
        : visitLapsCompleted === 0
        ? `His ${laps?.seasonYear ?? ''} visit ended on the opening lap — no clean laps to compare.`.replace(/\s{2,}/g, ' ')
        : !set
          ? 'No official section times are on file for this race yet.'
          : cleanLapTotal === 0
            ? 'This race ran no clean green-flag laps, so there is no section comparison to draw.'
            : cleanLapTotal !== null && cleanLapTotal < MIN_CLEAN_LAPS
              ? `This race ran ${cleanLapTotal} clean green-flag lap${cleanLapTotal === 1 ? '' : 's'} — a section comparison needs ${MIN_CLEAN_LAPS}.`
              : 'The section report for this race does not line up with this track’s timing sections.';
    return (
      <Card
        title={title}
        action={allEntries.length > 0 ? <SourcePill title={`${qualifyingMode ? 'Qualifying' : 'Race'} section signal`} entries={allEntries} caveats={sourceCaveats} /> : undefined}
      >
        <div className="stack" style={{ gap: 10, marginBottom: 12 }}>
          {sessionControl}
          {visitControl}
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-secondary)' }}>{dignified}</p>
        {qualifyingMode && qualifying?.sourceUrl ? (
          <p style={{ margin: '10px 0 0', fontSize: 13 }}>
            <a href={qualifying.sourceUrl} target="_blank" rel="noreferrer">Official notice</a>
          </p>
        ) : null}
        {!qualifyingMode && priorComparison ? (
          <p style={{ margin: '10px 0 0', fontSize: 13 }}>
            <Link to={priorComparison.href} className="navlink" style={{ padding: 0 }}>
              See {priorComparison.label} →
            </Link>
          </p>
        ) : null}
      </Card>
    );
  }

  return (
    <Card
      title={title}
      action={<SourcePill title={`${qualifyingMode ? 'Qualifying' : 'Race'} section signal`} entries={allEntries} caveats={sourceCaveats} />}
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        {hasHeat
          ? orientationClause
            ? `${orientationClause} Gold shows where he was strongest — ${readVerb} the shape to read his pace stretch by stretch.`
            : qualifyingMode
              ? `Gold shows the stronger qualifying stretches — ${readVerb} the shape to read the selected session summary stretch by stretch.`
              : `Gold shows where Bryce was strongest — ${readVerb} the shape to read his pace stretch by stretch.`
          : set
            ? visitLapsCompleted === 0
              ? `His ${laps?.seasonYear ?? ''} visit ended on the opening lap — no clean laps to compare.`.replace(/\s{2,}/g, ' ')
              : !qualifyingMode &&
                  scope.kind === 'lap_window' &&
                  scopeCleanLapCount !== null &&
                  scopeCleanLapCount < minimumObservations
                ? `Only ${scopeCleanLapCount} clean green-flag lap${scopeCleanLapCount === 1 ? '' : 's'} in the ${scope.label.toLowerCase()} — cautions covered the rest. Try Full race.`
                : 'Too few clean laps in this scope to compare sections.'
            : 'The venue shape, with the start/finish line marked.'}
      </p>
      {sessionControl || visitControl ? (
        <div className="stack" style={{ gap: 10, marginBottom: 12 }}>
          {sessionControl}
          {visitControl}
        </div>
      ) : null}
      {activeLaps ? (
        <div className="stack" style={{ gap: 10, marginBottom: 12 }}>
          {qualifyingContext ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-secondary)' }}>{qualifyingContext}</p>
          ) : null}
          {qualifyingMode && qualifying?.status === 'cancelled' ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-secondary)' }}>
              {qualifying.note ?? 'This qualifying session was cancelled; the available laps are an interrupted run without an official classification.'}
            </p>
          ) : null}
          <ControlRow label="Scope">
            <Segmented
              wrap
              options={[
                { value: 'full', label: qualifyingMode ? 'Whole session' : 'Full race' },
                ...scopes
                  .filter((entry): entry is Extract<SectionScope, { kind: 'lap_window' }> => entry.kind === 'lap_window')
                  .map((entry) => ({ value: entry.label, label: entry.label })),
                { value: 'lap', label: 'One lap' }
              ]}
              value={scopeKey}
              onChange={setScopeKey}
            />
          </ControlRow>
          {!singleLap ? (
            <ControlRow label="Metric">
              <Segmented
                options={[
                  { value: 'mean', label: 'Average' },
                  { value: 'median', label: 'Median' }
                ]}
                value={stat}
                onChange={setStat}
              />
            </ControlRow>
          ) : null}
          {singleLap ? (
            <ControlRow label="Lap">
              {qualifyingMode ? (
                <span style={{ minWidth: 0, width: '100%', maxWidth: 380, flex: '1 1 180px' }}>
                  <select
                    aria-label="Qualifying lap"
                    value={scrubLap}
                    onChange={(event) => setScrubLap(Number(event.target.value))}
                    style={{ width: '100%', minWidth: 0, maxWidth: '100%', font: 'inherit', color: 'var(--ink-primary)', background: 'var(--surface-0)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 28px 6px 9px' }}
                  >
                    {availableLapIndexes.map((lap) => (
                      <option key={lap} value={lap}>
                        Lap {lap}{lap === officialQualifyingFastestLap ? qualifying?.status === 'cancelled' ? ' · quickest observed' : ' · fastest official lap' : ''}
                      </option>
                    ))}
                  </select>
                </span>
              ) : (
              <span className="stack" style={{ gap: 4, minWidth: 220, flex: 1, maxWidth: 380 }}>
                <input
                  type="range"
                  min={availableLapIndexes[0] ?? 1}
                  max={availableLapIndexes.at(-1) ?? activeLaps.totalLaps}
                  value={scrubLap}
                  onChange={(event) => setScrubLap(Number(event.target.value))}
                  aria-label={`Race lap ${scrubLap} of ${activeLaps.totalLaps}`}
                  style={{ width: '100%' }}
                />
                <span style={{ position: 'relative', display: 'block', height: 4 }} aria-hidden>
                  {lapContext
                    .filter((entry) => entry.caution !== 'green')
                    .map((entry) => (
                      <span
                        key={entry.lap}
                        style={{
                          position: 'absolute',
                          left: `${((entry.lap - 1) / Math.max(activeLaps.totalLaps - 1, 1)) * 100}%`,
                          width: 2,
                          height: 4,
                          background: 'var(--ink-muted)',
                          opacity: 0.6
                        }}
                      />
                    ))}
                </span>
              </span>
              )}
            </ControlRow>
          ) : null}
        </div>
      ) : null}
      {hasHeat ? (
        <div className="row row--between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <HeatKey />
          {scopeSummary ? (
            <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
              {scopeSummary}
            </span>
          ) : null}
        </div>
      ) : null}
      <TrackArt
        outline={outline}
        showCornerLabels={false}
        maxHeight={300}
        sections={hasHeat ? { resolved: heatSections, showLabels: true, contextLabel: qualifyingMode ? 'in qualifying' : 'this race' } : null}
        passMarks={showMarks ? resolvedMarks : null}
      />
      {showMarks ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          <span aria-hidden style={{ marginRight: 6 }}>○</span>
          a pass involving Bryce — placed between timing loops · derived from the RaceTools race-weekend capture,{' '}
          {resolvedMarks.length} this race. {coarse ? 'Tap' : 'Hover'} for the lap and the car.
        </p>
      ) : null}
      {thirdsWithheld && hasHeat && !singleLap ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          This race carries {cleanLapTotal} clean green-flag lap{cleanLapTotal === 1 ? '' : 's'} — the map reads them
          together rather than splitting them into thirds.
        </p>
      ) : null}
      {suppressedCount > 0 && !singleLap && hasHeat ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {suppressedCount === 1 ? 'One stretch stays uncoloured' : `${suppressedCount} stretches stay uncoloured`} — under{' '}
          {minimumObservations} {qualifyingMode ? 'valid observed qualifying laps' : 'clean laps'} in this scope.
        </p>
      ) : null}
      {singleLap && scrubContext && scrubContext.caution !== 'green' ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          Lap {scrubLap} ran {cautionCopy[scrubContext.caution]} — one lap is a snapshot, not a trend.
        </p>
      ) : null}
      {activeLaps && set ? (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
          <button
            type="button"
            onClick={() => setNumbersOpen((open) => !open)}
            aria-expanded={numbersOpen}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              fontSize: 13,
              color: 'var(--link)',
              cursor: 'pointer'
            }}
          >
            {numbersOpen ? 'Hide the numbers' : 'The numbers behind the shades'}
          </button>
          {numbersOpen ? (
            <div className="stack" style={{ gap: 12, marginTop: 12 }}>
              {!singleLap ? (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  {qualifyingMode
                    ? `Each dot is one valid observed qualifying lap and its share of the group benchmark beaten in that section. The gold tick is Bryce’s ${stat === 'median' ? 'median' : 'average'} lap-level share. Each driver’s best comparable section remains the fixed benchmark; it is not drawn as a field average.`
                    : `Top rule: each dot is one clean lap — its share of the field beaten in that section, the gold tick his ${stat === 'median' ? 'median' : 'average'} lap and the number the map carries. Lower rule: where his pace sits among the field this section — each faint mark a car, the gold tick Bryce, faster to the right.`}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  One lap's field share per section, exactly as timed — {scrubContext ? cautionCopy[scrubContext.caution] : 'no flag report'}.
                </p>
              )}
              <div className="stack" style={{ gap: 10 }}>
                {drawerRows.map(({ observation, label }) =>
                  singleLap ? (
                    <SectionSingleLapRow key={observation.sectionName} label={label} observation={observation} />
                  ) : (
                    <SectionDistributionRow key={observation.sectionName} label={label} observation={observation} stat={stat} qualifying={qualifyingMode} />
                  )
                )}
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                {coverage}.{' '}
                {measured
                  ? `${measuredSectionCount(activeAnchors)} timing-loop sub-sections from the RaceTools race-weekend capture, tiling the whole lap — time-based, not GPS, and not official timing.`
                  : hasDerivedRemainder(activeAnchors)
                    ? 'Solid spans are official timing loops — time-based, not GPS. The dotted stretch is derived: lap time minus the timed sections, ranked against the field the same way.'
                    : 'Section times from official timing loops — time-based, not GPS. Stretches without timing loops stay the plain line.'}
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                {qualifyingMode
                  ? 'Qualifying summaries use valid observed laps from the official section report. Loop timing measures time, not GPS or car position.'
                  : 'Clean green-flag laps only — caution and restart laps are excluded from the shades. Loop timing measures time, not car position.'}
              </p>
              {activePassMarks ? (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  The open circles are green, on-track passes involving Bryce. Pass placement validated{' '}
                  {activePassMarks.pairwiseConcordancePct}% against the official lap chart.
                  {activePassMarks.reshuffleCounts.pit_cycle + activePassMarks.reshuffleCounts.caution > 0
                    ? ` Pit-cycle and caution reshuffles (${activePassMarks.reshuffleCounts.pit_cycle} + ${activePassMarks.reshuffleCounts.caution}) are counted, not drawn.`
                    : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {!hasHeat ? (
        /* Method copy (coverage, derivation, GPS caveats) now lives behind "The
         * numbers behind the shades"; the face only carries the empty state. */
        <p style={{ margin: 0, paddingTop: 14, fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {set
            ? `Sections need ${minimumObservations} ${qualifyingMode ? 'valid observed qualifying laps' : 'clean laps'} in a scope to compare honestly.`
            : `No official section times are on file for this ${qualifyingMode ? 'qualifying session' : 'race'} yet.`}
        </p>
      ) : null}
    </Card>
  );
};

/* ---------- this place, other years (YoY shapes, same key) ---------- */

/** Each visit resolves against ITS OWN grain: a measured (lake) pack keeps the
 *  venue's finer tiling; a PDF-tier pack keeps the venue's coarser PDF anchors —
 *  never a finer set it can't match. This is what lets Nashville's 2026 3-section
 *  PDF shape render beside its 8-loop measured years instead of a bare outline
 *  that still claimed its clean-lap count (finding #17). The rule itself lives
 *  in the adapter layer (`anchorsForPack`) so every surface — and the contract
 *  test — resolves it identically. */
const anchorsForVisit = anchorsForPack;

/** The most recent OTHER visit at this venue whose section shape actually renders
 *  — the honest destination for a collapsed hollow heat card (finding #16). */
export const validPriorComparison = (
  visits: SectionLapsPack[],
  currentSessionId: string | null,
  anchors: TrackSectionAnchorSet
): { href: string; label: string } | null => {
  const others = visits
    .filter((visit) => visit.sessionId !== currentSessionId)
    .sort((left, right) => (right.seasonYear ?? 0) - (left.seasonYear ?? 0));
  for (const visit of others) {
    const set = sectionObservationsFromLaps(visit, { kind: 'full_race' }, 'median');
    if (resolveHeatSections(anchorsForVisit(visit, anchors), set).length > 0) {
      const row = uiDataPackage.screens.raceDebrief.seasonIndex.find((entry) => entry.sessionId === visit.sessionId);
      const raceNo = row?.raceLabel?.match(/Race (\d)/)?.[1];
      return {
        href: raceHref(visit.sessionId),
        label: `his ${visit.seasonYear ?? 'earlier'}${raceNo ? ` Race ${raceNo}` : ''} race here`
      };
    }
  }
  return null;
};

const VisitShape = ({
  outline,
  anchors,
  pack,
  lapsCompleted,
  label,
  grainNote
}: {
  outline: TrackOutline;
  /** Pre-resolved to THIS visit's own grain by the parent. */
  anchors: TrackSectionAnchorSet;
  pack: SectionLapsPack;
  /** Canonical laps Bryce completed this visit; zero means the caption states an
   *  opening-lap ending instead of a bare "0 clean-lap comparisons". */
  lapsCompleted?: number | null;
  /** Disambiguated year label — "2026 · Race 1" on a double-header, else the year. */
  label?: string;
  /** When the venue's visits carry mixed grains, each shape states its own section
   *  count so no reader assumes one scale across all the years. */
  grainNote?: string | null;
}) => {
  const set = useMemo(() => sectionObservationsFromLaps(pack, { kind: 'full_race' }, 'median'), [pack]);
  const resolved = useMemo(() => resolveHeatSections(anchors, set), [anchors, set]);
  /* Orientation, not a second question (director ruling): each year carries its
   * official result as quiet label text from the synchronous season index. */
  const indexRow = uiDataPackage.screens.raceDebrief.seasonIndex.find((row) => row.sessionId === pack.sessionId) ?? null;
  const resultLabel =
    indexRow && indexRow.finishPosition !== null
      ? indexRow.startPosition !== null
        ? `P${indexRow.finishPosition} from P${indexRow.startPosition}`
        : `P${indexRow.finishPosition}`
      : null;
  return (
    <div className="stack" style={{ gap: 6, flex: '1 1 240px', minWidth: 220, maxWidth: 420 }}>
      <TrackArt outline={outline} showCornerLabels={false} maxHeight={170} sections={resolved.length > 0 ? { resolved } : null} />
      <div className="row row--between" style={{ alignItems: 'baseline' }}>
        <span style={{ fontSize: 13 }}>
          <strong style={{ fontWeight: 600 }}>{label ?? (pack.seasonYear !== null ? String(pack.seasonYear) : '—')}</strong>
          {resultLabel ? <span className="tnum" style={{ color: 'var(--ink-secondary)' }}> · {resultLabel}</span> : null}
        </span>
        <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {lapsCompleted === 0
            ? 'ended on the opening lap'
            : resolved.length === 0
              ? 'too few clean laps per section'
              : `${set.comparisonRows ?? 0} clean-lap comparisons`}
        </span>
      </div>
      {grainNote ? <span className="caption caption--secondary" style={{ fontSize: 11 }}>{grainNote}</span> : null}
    </div>
  );
};

/** The venue's year-over-year shapes, same scale + key as the heat card above.
 *  `title` lets Race Week retitle to "The track, year over year" so it never
 *  collides with the venue dossier's "This place, other years" card. */
export const VenueYearsCard = ({
  outline,
  anchors,
  visits,
  title = 'This place, other years',
  lapsCompletedBySession
}: {
  outline: TrackOutline;
  anchors: TrackSectionAnchorSet;
  visits: SectionLapsPack[];
  title?: string;
  /** Canonical laps-completed per session, so an opening-lap visit's shape reads
   *  "ended on the opening lap" instead of "0 clean-lap comparisons". Absent on
   *  race pages (each shape then keeps the bare comparison count). */
  lapsCompletedBySession?: Map<string, number | null>;
}) => {
  if (visits.length < 2) return null;
  const measured = visits.every((visit) => visit.sourceTier === 'lake_loop_crossings');

  /* Per-visit labels: a double-header year ("2026 · Race 1" / "2026 · Race 2")
   * never renders two bare "2026" shapes (finding #18). Prefer the official race
   * number from the label; fall back to chronological order (visits oldest-first). */
  const visitLabels = (() => {
    const yearCounts = new Map<number, number>();
    for (const visit of visits) {
      if (visit.seasonYear !== null) yearCounts.set(visit.seasonYear, (yearCounts.get(visit.seasonYear) ?? 0) + 1);
    }
    const seen = new Map<number, number>();
    const out = new Map<string, string>();
    for (const visit of visits) {
      const year = visit.seasonYear;
      if (year === null) {
        out.set(visit.sessionId, '—');
        continue;
      }
      if ((yearCounts.get(year) ?? 0) <= 1) {
        out.set(visit.sessionId, String(year));
        continue;
      }
      const raceMatch = /race\s*(\d+)/i.exec(visit.raceLabel ?? '');
      if (raceMatch) {
        out.set(visit.sessionId, `${year} · Race ${raceMatch[1]}`);
        continue;
      }
      const next = (seen.get(year) ?? 0) + 1;
      seen.set(year, next);
      out.set(visit.sessionId, `${year} · Race ${next}`);
    }
    return out;
  })();

  /* Each visit draws at its own grain; when those grains differ across the years
   * the card can't honestly claim one scale, so each shape states its own count
   * and the copy drops the "same scale" promise (finding #17). */
  const visitAnchors = new Map(visits.map((visit) => [visit.sessionId, anchorsForVisit(visit, anchors)]));
  const mixedGrain = new Set([...visitAnchors.values()].map((set) => measuredSectionCount(set))).size > 1;

  return (
    <Card
      title={title}
      action={
        <SourcePill
          title="Same venue, every visit"
          entries={[
            measured
              ? {
                  label: 'RaceTools race-weekend capture · timing-loop crossings',
                  path: 'analysis/semantic-layer/output/nashville/',
                  note: `Each year aggregates its own race on the same ${measuredSectionCount(anchors)}-section scale: median clean-lap percentile per timing-loop sub-section. A third-party capture; not official timing.`
                }
              : {
                  label: 'Official Section Results, lap by lap',
                  path: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv',
                  note: mixedGrain
                    ? 'Each year aggregates its own race: median clean-lap percentile per section, drawn at the finest grain that year’s timing carried.'
                    : 'Each year aggregates its own race on the same scale: median clean-lap percentile per section.'
                }
          ]}
          caveats={[
            mixedGrain
              ? 'Different years can carry different field sizes, caution patterns, and section grains; each shape states its own denominator and section count.'
              : 'Different years can carry different field sizes and caution patterns; each shape states its own denominator.'
          ]}
        />
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        {mixedGrain
          ? 'The same shape, one per visit — same key as above; each drawn at the finest grain its own timing carried.'
          : 'The same shape, one per visit — same scale, same key as above.'}
      </p>
      <div className="row row--between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <HeatKey />
        {mixedGrain ? null : (
          <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
            {measuredSectionCount(anchors)} timed sections ·{' '}
            {hasDerivedRemainder(anchors)
              ? `${Math.round(timedShareOf(anchors) * 100)}% measured · rest derived`
              : `${Math.round(timedShareOf(anchors) * 100)}% of the lap`}
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {visits.map((pack) => {
          const packAnchors = visitAnchors.get(pack.sessionId) ?? anchors;
          return (
            <VisitShape
              key={pack.sessionId}
              outline={outline}
              anchors={packAnchors}
              pack={pack}
              lapsCompleted={lapsCompletedBySession?.get(pack.sessionId) ?? null}
              label={visitLabels.get(pack.sessionId)}
              grainNote={mixedGrain ? `${measuredSectionCount(packAnchors)} timed sections` : null}
            />
          );
        })}
      </div>
    </Card>
  );
};

/* ============================================================================
 * Race Week composition: the venue's section suite, keyed by the upcoming
 * venue's anchored sections + available packs. Portland gets it automatically;
 * a venue with no anchors renders nothing (silently).
 * ==========================================================================*/

export interface VenueSectionData {
  loading: boolean;
  /** The venue's representative anchor set: the measured (finer) tiling when
   *  every loaded visit carries lake loop-crossings, else the curated-PDF
   *  anchored set, else null (no anchors → the suite renders nothing). This is
   *  the venue FRAME — the card's coverage line and the "all visits measured"
   *  check. Anything that JOINS a pack's section names must use
   *  `anchorsBySession` instead. */
  anchors: TrackSectionAnchorSet | null;
  /** Per-visit anchors, resolved by that visit's own source tier (measured lake
   *  pack → measured anchors; PDF-tier pack → curated PDF anchors), mirroring
   *  what the race page does. A venue-wide, all-or-nothing choice is what left
   *  Nashville's 2024/2025 measured packs (S1…S5) joined against the PDF anchor
   *  set — blank at every scope, under copy that still claimed its clean-lap
   *  count. */
  anchorsBySession: Map<string, TrackSectionAnchorSet>;
  /** Loaded section-lap packs for the venue, oldest-first. */
  visits: SectionLapsPack[];
  passMarksBySession: Map<string, PassMarksPack | null>;
  /** Canonical laps Bryce completed per visit (from each race-story pack). Zero
   *  means an opening-lap ending — the suite states why with dignity instead of
   *  a bare zero-comparison count. */
  lapsCompletedBySession: Map<string, number | null>;
  /** The most recent visit that carries clean-lap comparisons (the heat card's
   *  default + the hero's shading); falls back to the plain newest visit only
   *  when no visit here has data. */
  mostRecent: SectionLapsPack | null;
  /** The most recent visit's full-race median heat, resolved for the hero's
   *  compact (no-labels) shading. Empty when the venue has no anchors/packs. */
  heroHeat: ResolvedHeatSection[];
}

/** True when a pack holds enough clean laps with real field percentiles for at
 * least one section to shade under the same suppression rule as the card. Tuple order:
 *  [lap, fieldPercentile, fieldRank, fieldComparisonCount, clean, caution, …]. */
const packHasCleanComparisons = (pack: SectionLapsPack): boolean =>
  pack.sections.some(
    (section) => section.laps.filter((lap) => lap[4] === 1 && lap[1] !== null).length >= MIN_CLEAN_LAPS
  );

/** Load a venue's section packs + pass marks and resolve its anchor set — the
 *  data behind both the Race Week hero shading and the section suite. Keyed on
 *  the upcoming venue's track name; async and cancel-safe, mirroring the race
 *  page's own load. No new data lanes — the same loaders the race page uses.
 *
 *  `prioritySessionId` (optional): the visit about to actually render (the
 *  Tracks page's selected year/race) among the whole venue's visits this hook
 *  fetches concurrently for the year-over-year comparison. All visits are
 *  still awaited before `loading` clears — the anchor-set choice below
 *  legitimately needs every visit's `sourceTier` to decide measured vs PDF
 *  tiling, so this can't skip ahead to render early without risking a visible
 *  geometry flip once the rest arrive. What it CAN safely do is bias which
 *  pack wins the race on a constrained connection: the selected visit is
 *  fetched at `'high'` priority so it's not left waiting behind 2-3 other
 *  years' packs the reader isn't looking at yet. */
export const useVenueSectionData = (
  trackName: string | null | undefined,
  prioritySessionId?: string | null
): VenueSectionData => {
  const [visits, setVisits] = useState<SectionLapsPack[]>([]);
  const [passMarksBySession, setPassMarksBySession] = useState<Map<string, PassMarksPack | null>>(new Map());
  const [lapsCompletedBySession, setLapsCompletedBySession] = useState<Map<string, number | null>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setVisits([]);
    setPassMarksBySession(new Map());
    setLapsCompletedBySession(new Map());
    setLoading(true);
    const venueRefs = sectionLapVisitsFor(trackName);
    if (venueRefs.length === 0) {
      setLoading(false);
      return;
    }
    Promise.all(
      venueRefs.map((ref) => loadSectionLaps(ref.sessionId, ref.sessionId === prioritySessionId ? 'high' : undefined).catch(() => null))
    )
      .then((packs) => {
        if (cancelled) return;
        setVisits(packs.filter((pack): pack is SectionLapsPack => pack !== null));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    Promise.all(
      venueRefs.map(async (ref) => [ref.sessionId, await loadPassMarks(ref.sessionId).catch(() => null)] as const)
    ).then((entries) => {
      if (!cancelled) setPassMarksBySession(new Map(entries));
    });
    /* Canonical laps-completed per visit, from the same race-story pack the race
       page reads — the honest source for the opening-lap dignity copy. Cached in
       the loader; null when a visit has no story pack (copy then falls back). */
    Promise.all(
      venueRefs.map(
        async (ref) => [ref.sessionId, (await loadRaceStory(ref.sessionId).catch(() => null))?.bryce.lapsCompleted ?? null] as const
      )
    ).then((entries) => {
      if (!cancelled) setLapsCompletedBySession(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
    // `prioritySessionId` is deliberately not a dependency: it only needs to
    // be correct for the initial fetch this effect kicks off (all of a
    // venue's visits are cached after that; switching the selected visit
    // within the same venue must stay instant, not re-fetch everything).
  }, [trackName]);

  return useMemo<VenueSectionData>(() => {
    const pdf = trackSectionsFor(trackName);
    const pdfAnchors = pdf && pdf.confidence === 'anchored' ? pdf : null;
    /* The measured (finer) tiling is used only when EVERY loaded visit carries
     * lake loop-crossings — so a mixed venue never resolves measured names
     * against a PDF-tier pack. Nashville: both visits measured. */
    const allMeasured = visits.length > 0 && visits.every((visit) => visit.sourceTier === 'lake_loop_crossings');
    const anchors = (allMeasured ? measuredTrackSectionsFor(trackName) : null) ?? pdfAnchors;
    /* …but every JOIN resolves per visit, at that visit's own grain, so a
     * mixed-tier venue draws each year against the anchors its own timing
     * carried instead of one all-or-nothing venue choice. */
    const anchorsBySession = new Map(
      anchors ? visits.map((visit) => [visit.sessionId, anchorsForVisit(visit, anchors)] as const) : []
    );
    /* The default (and the hero shading) is the most recent visit that CARRIES
     * clean-lap comparisons — a visit that ended on the opening lap (Portland
     * 2025) stays reachable through the year toggle but never greets the reader
     * with an empty shape (Jack's review, 2026-07-21). */
    const newestWithData = [...visits].reverse().find(packHasCleanComparisons) ?? null;
    const mostRecent = newestWithData ?? (visits.length > 0 ? visits[visits.length - 1] : null);
    const heroHeat =
      anchors && mostRecent
        ? resolveHeatSections(
            anchorsBySession.get(mostRecent.sessionId) ?? anchors,
            sectionObservationsFromLaps(mostRecent)
          )
        : [];
    return { loading, anchors, anchorsBySession, visits, passMarksBySession, lapsCompletedBySession, mostRecent, heroHeat };
  }, [trackName, visits, passMarksBySession, lapsCompletedBySession, loading]);
};

/** The Race Week section suite: the venue heat card (defaulting to the most
 *  recent visit, with a quiet year toggle when the venue has more than one) and
 *  the year-over-year shapes card directly after it. Renders nothing until the
 *  venue's anchors + at least one pack are resolved. */
export const VenueSectionSuite = ({
  outline,
  data,
  selectedVisitId,
  onSelectedVisitChange,
  showVisitControl = true,
  qualifying
}: {
  outline: TrackOutline;
  data: VenueSectionData;
  /** Optional route-owned visit selection for permanent venue URLs. Omitted on
   * Race Week, which keeps the suite's local control. */
  selectedVisitId?: string | null;
  onSelectedVisitChange?: (sessionId: string) => void;
  showVisitControl?: boolean;
  qualifying?: QualifyingHeatMode | null;
}) => {
  const { anchors, anchorsBySession, visits, passMarksBySession, lapsCompletedBySession, mostRecent } = data;
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);

  if (!outline || !anchors || (!mostRecent && !qualifying)) return null;

  const activeSelectedId = selectedVisitId === undefined ? localSelectedId : selectedVisitId;
  const selectedMatch = visits.find((visit) => visit.sessionId === (activeSelectedId ?? mostRecent?.sessionId)) ?? null;
  /* A permanent Tracks URL can select a canonical race whose section report is
   * unavailable. Never substitute another year's race under that label: keep
   * the Race side honest and let the same card expose qualifying when it exists. */
  const selected = selectedMatch ?? (selectedVisitId === undefined ? mostRecent : null);
  if (!selected) {
    return (
      <>
        <SectionHeatCard
          key={selectedVisitId ?? 'missing-race-pack'}
          title="Race and qualifying, section by section — his record here"
          outline={outline}
          anchors={anchors}
          laps={null}
          fallbackSet={null}
          passMarks={null}
          priorComparison={validPriorComparison(visits, selectedVisitId ?? null, anchors)}
          qualifying={qualifying}
        />
        <VenueYearsCard
          title="The track, year over year"
          outline={outline}
          anchors={anchors}
          visits={visits}
          lapsCompletedBySession={lapsCompletedBySession}
        />
      </>
    );
  }
  const passMarks = passMarksBySession.get(selected.sessionId) ?? null;
  const multi = visits.length > 1;
  /* Toggle label per visit. A single race that year is just the year ("2025").
   * A double-header (two races the same year — Laguna Seca, etc.) would collide
   * on the bare year, so it takes the "Race N" from the official label ("2025
   * R1"), falling back to an ordinal so the control is never ambiguous. */
  const sameYearIndex = new Map<number, number>();
  const labelFor = new Map<string, string>();
  for (const visit of visits) {
    const year = visit.seasonYear;
    const duplicated = year !== null && visits.filter((other) => other.seasonYear === year).length > 1;
    if (!duplicated) {
      labelFor.set(visit.sessionId, String(year ?? '—'));
      continue;
    }
    const raceMatch = /race\s*(\d+)/i.exec(visit.raceLabel ?? '');
    if (raceMatch) {
      labelFor.set(visit.sessionId, `${year} R${raceMatch[1]}`);
    } else {
      const next = (sameYearIndex.get(year!) ?? 0) + 1;
      sameYearIndex.set(year!, next);
      labelFor.set(visit.sessionId, `${year} (${next})`);
    }
  }
  const selectedLabel = labelFor.get(selected.sessionId) ?? String(selected.seasonYear ?? '');
  /* Chronological toggle (2024 · 2025): visits arrive oldest-first and stay
   * that way, so the control reads left-to-right through time (Jack's review,
   * 2026-07-21 — was newest-first). */
  const yearOptions = visits.map((visit) => ({
    value: visit.sessionId,
    label: labelFor.get(visit.sessionId) ?? String(visit.seasonYear ?? '—')
  }));
  /* Orientation names the OTHER distinct years, in the toggle's own order. */
  const otherYears = [...new Set(visits.map((visit) => visit.seasonYear).filter((year): year is number => year !== null))]
    .filter((year) => year !== selected.seasonYear)
    .sort((left, right) => left - right);
  const orientationClause = `His ${selectedLabel} race here, section by section${
    multi && showVisitControl && otherYears.length > 0 ? ` — toggle for ${otherYears.join(' · ')}` : ''
  }.`;
  /* Single-visit venues hide the toggle entirely (director spec): one year, no
   * control, no "toggle for" clause. */
  const selectVisit = (sessionId: string) => {
    if (selectedVisitId === undefined) setLocalSelectedId(sessionId);
    onSelectedVisitChange?.(sessionId);
  };
  const visitControl = multi && showVisitControl ? (
    <ControlRow label="Year">
      <Segmented options={yearOptions} value={selected.sessionId} onChange={selectVisit} />
    </ControlRow>
  ) : null;

  return (
    <>
      <SectionHeatCard
        key={selected.sessionId}
        title={qualifying ? 'Race and qualifying, section by section — his record here' : 'The track, section by section — his record here'}
        orientationClause={orientationClause}
        visitControl={visitControl}
        outline={outline}
        /* The selected visit joins against ITS OWN grain, not the venue's. */
        anchors={anchorsBySession.get(selected.sessionId) ?? anchors}
        laps={selected}
        fallbackSet={null}
        passMarks={passMarks}
        visitLapsCompleted={lapsCompletedBySession.get(selected.sessionId) ?? null}
        priorComparison={validPriorComparison(visits, selected.sessionId, anchors)}
        qualifying={qualifying}
      />
      <VenueYearsCard
        title="The track, year over year"
        outline={outline}
        anchors={anchors}
        visits={visits}
        lapsCompletedBySession={lapsCompletedBySession}
      />
    </>
  );
};
