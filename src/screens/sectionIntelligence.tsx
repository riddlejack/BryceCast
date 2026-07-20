import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card, SourcePill } from '../app/components';
import { inkGoldDiverging } from '../app/charts';
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
  lapContextOf,
  lapScopesFor,
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
import { ControlRow, Segmented } from './careerExplorer';
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
  observation: { percentile: number | null; cautionState?: 'green' | 'caution' | 'restart' | 'unknown' };
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
  observation
}: {
  label: string;
  observation: {
    percentile: number | null;
    observationCount: number | null;
    lapPercentiles?: Array<{ lap: number; percentile: number }>;
    bryceMedianSeconds?: number | null;
    fieldSeconds?: number[] | null;
    kind?: 'measured' | 'derived_remainder';
  };
  stat: SectionStat;
}) => {
  const points = observation.lapPercentiles ?? [];
  const suppressed = observation.percentile === null;
  const field = observation.fieldSeconds ?? null;
  const bryceMed = observation.bryceMedianSeconds ?? null;
  /* Field-pace strip range spans the field plus Bryce, so his tick is always in
   * frame even when he is the fastest or slowest car. Faster → right. */
  const paceValues = field && field.length > 0 ? [...field, ...(bryceMed !== null ? [bryceMed] : [])] : [];
  const lo = paceValues.length > 0 ? Math.min(...paceValues) : 0;
  const hi = paceValues.length > 0 ? Math.max(...paceValues) : 1;
  const xOf = (seconds: number) => (hi > lo ? ((hi - seconds) / (hi - lo)) * 100 : 50);
  const showPace = !suppressed && field !== null && field.length > 0;
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
      <span className="tnum" style={{ fontSize: 12, color: suppressed ? 'var(--ink-muted)' : 'var(--ink-primary)', width: 96, textAlign: 'right' }}>
        {suppressed
          ? `${observation.observationCount ?? 0} clean ${observation.observationCount === 1 ? 'lap' : 'laps'}`
          : `${ordinal(Math.round(observation.percentile! * 100))} · ${
              showPace ? `vs ${field!.length} cars · ` : ''
            }${observation.observationCount ?? 0} ${observation.observationCount === 1 ? 'lap' : 'laps'}`}
      </span>
    </div>
  );
};

/** The venue heat card: the track shape as the interface, with lap scopes, the
 *  numbers drawer, and pass marks. Race pages pass a single race's pack; Race
 *  Week passes the selected visit's pack plus a `visitControl` year toggle and
 *  an `orientationClause` that names which year is shown. `title` lets Race Week
 *  scope the heading to "his record here" without forking the component. */
export const SectionHeatCard = ({
  outline,
  anchors,
  laps,
  fallbackSet,
  passMarks,
  title = 'The track, section by section',
  orientationClause,
  visitControl,
  visitLapsCompleted
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
}) => {
  const [scopeKey, setScopeKey] = useState('full');
  const [scrubLap, setScrubLap] = useState(1);
  const [stat, setStat] = useState<SectionStat>('median');
  const [numbersOpen, setNumbersOpen] = useState(false);

  const scopes = useMemo(() => (laps ? lapScopesFor(laps.totalLaps) : []), [laps]);
  const lapContext = useMemo(() => (laps ? lapContextOf(laps) : []), [laps]);
  const scope: SectionScope = useMemo(() => {
    if (!laps || scopeKey === 'full') return { kind: 'full_race' };
    if (scopeKey === 'lap') return { kind: 'single_lap', lap: scrubLap };
    return scopes.find((entry) => entry.kind === 'lap_window' && entry.label === scopeKey) ?? { kind: 'full_race' };
  }, [laps, scopeKey, scrubLap, scopes]);

  const set = useMemo(() => {
    if (laps) return sectionObservationsFromLaps(laps, scope, stat);
    return fallbackSet;
  }, [laps, scope, stat, fallbackSet]);
  const heatSections = useMemo(() => (set ? resolveHeatSections(anchors, set) : []), [anchors, set]);
  const hasHeat = heatSections.length > 0;
  /* Pass marks are race-wide (scope-independent): each green Bryce pass joined
   * to the span it happened on, for the active anchor set. */
  const resolvedMarks = useMemo(() => (passMarks ? resolvePassMarks(anchors, passMarks) : []), [passMarks, anchors]);
  const showMarks = hasHeat && resolvedMarks.length > 0;
  const suppressedCount = set ? set.sections.filter((section) => section.percentile === null).length : 0;
  const singleLap = scope.kind === 'single_lap';
  const scrubContext = singleLap ? lapContext.find((entry) => entry.lap === scrubLap) ?? null : null;
  const drawerRows = useMemo(() => {
    if (!set) return [];
    const labelFor = new Map(anchors.sections.map((anchor) => [anchor.sectionName, anchor.label]));
    /* The drawer explains exactly what the shape shows: only sections with a
     * curated anchor (the derived remainder among them where it's anchored). */
    return set.sections
      .filter((observation) => labelFor.has(observation.sectionName))
      .map((observation) => ({ observation, label: labelFor.get(observation.sectionName) ?? observation.sectionName }))
      .sort((left, right) => (right.observation.percentile ?? -1) - (left.observation.percentile ?? -1));
  }, [set, anchors]);

  /* Coverage up front (Jack's review): how much of the lap the loops measure,
   * and that the rest is derived from lap time rather than a blind spot. */
  const measuredPct = Math.round(timedShareOf(anchors) * 100);
  const coverage = hasDerivedRemainder(anchors)
    ? `${measuredSectionCount(anchors)} timed sections · ${measuredPct}% measured · rest derived from lap time`
    : `${measuredSectionCount(anchors)} timed sections · ${measuredPct}% of the lap`;
  /* Source-tier switch (adapter-contract law): a measured lake pack names the
     RaceTools capture per the permissions ledger — never "official timing" —
     while the fallback PDF path keeps the official Section Results copy. */
  const measured = set?.sourceTier === 'lake_loop_crossings';
  const intervalPath = laps?.sourceRefs?.find((ref) => ref.key === 'nashvilleIntervalPack')?.path ?? null;
  const sourceEntries = measured
    ? [
        {
          label: 'RaceTools race-weekend capture · timing-loop crossings',
          path: intervalPath ?? 'analysis/semantic-layer/output/nashville/',
          note: `Bryce's per-lap section times and full-field percentiles, differenced from the RaceTools race-weekend capture's timing-loop crossings — ${measuredSectionCount(anchors)} sub-sections tiling the whole lap. A third-party capture; not official timing.`
        }
      ]
    : [
        {
          label: 'Official Section Results, lap by lap',
          path: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv',
          note: `Bryce's per-lap section times and field percentiles from the official timing loops. Section names follow the track's official timing stations; span lengths are measured from official time × speed (${anchors.confidence}).`
        }
      ];
  /* Pass-mark provenance rides the SAME drawer as the shades it draws over
     (mixed-tier honesty): the marks are RaceTools-capture-derived even on
     pages whose sections are official PDFs, so their source is named where
     they render — entries and caveats straight from the pass pack. */
  const passEntries = showMarks && passMarks
    ? passMarks.sourceRefs.map((ref) => ({ label: ref.key === 'passPlacement' ? 'Pass marks · RaceTools race-weekend capture' : 'Pass-placement validation', path: ref.path, note: ref.note }))
    : [];
  const allEntries = [...sourceEntries, ...passEntries];
  const sourceCaveats = [
    measured
      ? 'Section times are the RaceTools race-weekend capture — timing-loop crossings, time-based, not GPS or car position; not official timing.'
      : 'Section times come from official timing loops — they are time-based, not GPS or car position.',
    ...(set ? [set.caveat] : []),
    ...(measured ? ['Sanity-checked: the three published corner sections agree with these measured spans within ~0.10s per lap.'] : []),
    ...(showMarks && passMarks ? passMarks.caveats : []),
    anchors.note
  ];
  const scopeSummary = !set
    ? null
    : singleLap
      ? `${coverage} · Lap ${scrubLap} of ${laps?.totalLaps ?? '—'} · ${scrubContext ? cautionCopy[scrubContext.caution] : 'no flag report'}`
      : scope.kind === 'lap_window'
        ? `${coverage} · ${scope.label} · laps ${scope.fromLap}–${scope.toLap} · ${set.comparisonRows ?? 0} clean-lap comparisons`
        : `${coverage} · ${set.comparisonRows ?? 0} clean-lap comparisons`;

  return (
    <Card
      title={title}
      action={<SourcePill title="Section signal" entries={allEntries} caveats={sourceCaveats} />}
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        {hasHeat
          ? orientationClause
            ? `${orientationClause} Hover the shape to read his pace stretch by stretch — the gold dots mark his two strongest.`
            : 'Hover the shape to read Bryce’s pace stretch by stretch — the gold dots mark his two strongest.'
          : set
            ? visitLapsCompleted === 0
              ? `His ${laps?.seasonYear ?? ''} visit ended on the opening lap — no clean laps to compare.`.replace(/\s{2,}/g, ' ')
              : 'Too few clean laps in this scope to compare sections.'
            : 'The venue shape, with the start/finish line marked.'}
      </p>
      {laps ? (
        <div className="stack" style={{ gap: 10, marginBottom: 12 }}>
          {visitControl}
          <ControlRow label="Scope">
            <Segmented
              wrap
              options={[
                { value: 'full', label: 'Full race' },
                ...scopes
                  .filter((entry): entry is Extract<SectionScope, { kind: 'lap_window' }> => entry.kind === 'lap_window')
                  .map((entry) => ({ value: entry.label, label: entry.label })),
                { value: 'lap', label: 'One lap' }
              ]}
              value={scopeKey}
              onChange={setScopeKey}
            />
          </ControlRow>
          {singleLap ? (
            <ControlRow label="Lap">
              <span className="stack" style={{ gap: 4, minWidth: 220, flex: 1, maxWidth: 380 }}>
                <input
                  type="range"
                  min={1}
                  max={laps.totalLaps}
                  value={scrubLap}
                  onChange={(event) => setScrubLap(Number(event.target.value))}
                  aria-label={`Lap ${scrubLap} of ${laps.totalLaps}`}
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
                          left: `${((entry.lap - 1) / Math.max(laps.totalLaps - 1, 1)) * 100}%`,
                          width: 2,
                          height: 4,
                          background: 'var(--ink-muted)',
                          opacity: 0.6
                        }}
                      />
                    ))}
                </span>
              </span>
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
        sections={hasHeat ? { resolved: heatSections, showLabels: true } : null}
        passMarks={showMarks ? resolvedMarks : null}
      />
      {showMarks ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          <span aria-hidden style={{ marginRight: 6 }}>○</span>
          a pass involving Bryce — placed between timing loops · derived from the RaceTools race-weekend capture,{' '}
          {resolvedMarks.length} this race. Hover for the lap and the car.
        </p>
      ) : null}
      {suppressedCount > 0 && !singleLap && hasHeat ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {suppressedCount === 1 ? 'One stretch stays uncoloured' : `${suppressedCount} stretches stay uncoloured`} — under{' '}
          {MIN_CLEAN_LAPS} clean laps in this scope.
        </p>
      ) : null}
      {singleLap && scrubContext && scrubContext.caution !== 'green' ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          Lap {scrubLap} ran {cautionCopy[scrubContext.caution]} — one lap is a snapshot, not a trend.
        </p>
      ) : null}
      {laps && set ? (
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
                <ControlRow label="Stat">
                  <Segmented
                    options={[
                      { value: 'median', label: 'Median lap' },
                      { value: 'mean', label: 'Average lap' }
                    ]}
                    value={stat}
                    onChange={setStat}
                  />
                </ControlRow>
              ) : null}
              {!singleLap ? (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  Top rule: each dot is one clean lap — its share of the field beaten in that section, the gold tick his{' '}
                  {stat === 'median' ? 'median' : 'average'} lap and the number the map carries. Lower rule: where his pace
                  sits among the field this section — each faint mark a car, the gold tick Bryce, faster to the right.
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
                    <SectionDistributionRow key={observation.sectionName} label={label} observation={observation} stat={stat} />
                  )
                )}
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                Clean green-flag laps only — caution and restart laps are excluded from the shades. Loop timing measures
                time, not car position.
              </p>
              {passMarks ? (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  The open circles are green, on-track passes involving Bryce. Pass placement validated{' '}
                  {passMarks.pairwiseConcordancePct}% against the official lap chart.
                  {passMarks.reshuffleCounts.pit_cycle + passMarks.reshuffleCounts.caution > 0
                    ? ` Pit-cycle and caution reshuffles (${passMarks.reshuffleCounts.pit_cycle} + ${passMarks.reshuffleCounts.caution}) are counted, not drawn.`
                    : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <p style={{ margin: 0, paddingTop: 14, fontSize: 11.5, color: 'var(--ink-muted)' }}>
        {hasHeat
          ? measured
            ? `${measuredSectionCount(anchors)} timing-loop sub-sections from the RaceTools race-weekend capture, tiling the whole lap — time-based, not GPS, and not official timing.`
            : hasDerivedRemainder(anchors)
              ? 'Solid spans are official timing loops — time-based, not GPS. The dotted stretch is derived: lap time minus the timed sections, ranked against the field the same way.'
              : 'Section times from official timing loops — time-based, not GPS. Stretches without timing loops stay the plain line.'
          : set
            ? `Sections need ${MIN_CLEAN_LAPS} clean laps in a scope to compare honestly.`
            : 'No official section times are on file for this race yet.'}
      </p>
    </Card>
  );
};

/* ---------- this place, other years (YoY shapes, same scale, same key) ---------- */

const VisitShape = ({
  outline,
  anchors,
  pack,
  lapsCompleted
}: {
  outline: TrackOutline;
  anchors: TrackSectionAnchorSet;
  pack: SectionLapsPack;
  /** Canonical laps Bryce completed this visit; zero means the caption states an
   *  opening-lap ending instead of a bare "0 clean-lap comparisons". */
  lapsCompleted?: number | null;
}) => {
  const set = useMemo(() => sectionObservationsFromLaps(pack, { kind: 'full_race' }, 'median'), [pack]);
  /* Each visit joins the anchor set matching ITS OWN pack's grain — a lake
   * loop-crossing year keeps the venue's finer measured tiling even when the
   * page's own race is PDF-tier (Nashville 2026 beside its 2024/2025 visits).
   * Without this, mixed-tier venues rendered prior years as bare outlines. */
  const anchorsForPack = useMemo(
    () => (pack.sourceTier === 'lake_loop_crossings' ? measuredTrackSectionsFor(pack.venueName) ?? anchors : anchors),
    [pack, anchors]
  );
  const resolved = useMemo(() => resolveHeatSections(anchorsForPack, set), [anchorsForPack, set]);
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
          <strong style={{ fontWeight: 600 }}>{pack.seasonYear ?? '—'}</strong>
          {resultLabel ? <span className="tnum" style={{ color: 'var(--ink-secondary)' }}> · {resultLabel}</span> : null}
        </span>
        <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {lapsCompleted === 0 ? 'ended on the opening lap' : `${set.comparisonRows ?? 0} clean-lap comparisons`}
        </span>
      </div>
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
                  note: 'Each year aggregates its own race on the same scale: median clean-lap percentile per section.'
                }
          ]}
          caveats={['Different years can carry different field sizes and caution patterns; each shape states its own denominator.']}
        />
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        The same shape, one per visit — same scale, same key as above.
      </p>
      <div className="row row--between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <HeatKey />
        <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {measuredSectionCount(anchors)} timed sections ·{' '}
          {hasDerivedRemainder(anchors)
            ? `${Math.round(timedShareOf(anchors) * 100)}% measured · rest derived`
            : `${Math.round(timedShareOf(anchors) * 100)}% of the lap`}
        </span>
      </div>
      <div className="row" style={{ gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {visits.map((pack) => (
          <VisitShape
            key={pack.sessionId}
            outline={outline}
            anchors={anchors}
            pack={pack}
            lapsCompleted={lapsCompletedBySession?.get(pack.sessionId) ?? null}
          />
        ))}
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
  /** The venue's active anchor set: the measured (finer) tiling when every
   *  loaded visit carries lake loop-crossings, else the curated-PDF anchored
   *  set, else null (no anchors → the suite renders nothing). */
  anchors: TrackSectionAnchorSet | null;
  /** Loaded section-lap packs for the venue, oldest-first. */
  visits: SectionLapsPack[];
  passMarksBySession: Map<string, PassMarksPack | null>;
  /** Canonical laps Bryce completed per visit (from each race-story pack). Zero
   *  means an opening-lap ending — the suite states why with dignity instead of
   *  a bare zero-comparison count. */
  lapsCompletedBySession: Map<string, number | null>;
  /** The most recent visit (the heat card's default + the hero's shading). */
  mostRecent: SectionLapsPack | null;
  /** The most recent visit's full-race median heat, resolved for the hero's
   *  compact (no-labels) shading. Empty when the venue has no anchors/packs. */
  heroHeat: ResolvedHeatSection[];
}

/** Load a venue's section packs + pass marks and resolve its anchor set — the
 *  data behind both the Race Week hero shading and the section suite. Keyed on
 *  the upcoming venue's track name; async and cancel-safe, mirroring the race
 *  page's own load. No new data lanes — the same loaders the race page uses. */
export const useVenueSectionData = (trackName: string | null | undefined): VenueSectionData => {
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
    Promise.all(venueRefs.map((ref) => loadSectionLaps(ref.sessionId).catch(() => null)))
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
  }, [trackName]);

  return useMemo<VenueSectionData>(() => {
    const pdf = trackSectionsFor(trackName);
    const pdfAnchors = pdf && pdf.confidence === 'anchored' ? pdf : null;
    /* The measured (finer) tiling is used only when EVERY loaded visit carries
     * lake loop-crossings — so a mixed venue never resolves measured names
     * against a PDF-tier pack. Nashville: both visits measured. */
    const allMeasured = visits.length > 0 && visits.every((visit) => visit.sourceTier === 'lake_loop_crossings');
    const anchors = (allMeasured ? measuredTrackSectionsFor(trackName) : null) ?? pdfAnchors;
    const mostRecent = visits.length > 0 ? visits[visits.length - 1] : null;
    const heroHeat =
      anchors && mostRecent ? resolveHeatSections(anchors, sectionObservationsFromLaps(mostRecent)) : [];
    return { loading, anchors, visits, passMarksBySession, lapsCompletedBySession, mostRecent, heroHeat };
  }, [trackName, visits, passMarksBySession, lapsCompletedBySession, loading]);
};

/** The Race Week section suite: the venue heat card (defaulting to the most
 *  recent visit, with a quiet year toggle when the venue has more than one) and
 *  the year-over-year shapes card directly after it. Renders nothing until the
 *  venue's anchors + at least one pack are resolved. */
export const VenueSectionSuite = ({
  outline,
  data
}: {
  outline: TrackOutline;
  data: VenueSectionData;
}) => {
  const { anchors, visits, passMarksBySession, lapsCompletedBySession, mostRecent } = data;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!outline || !anchors || visits.length === 0 || !mostRecent) return null;

  const selected = visits.find((visit) => visit.sessionId === (selectedId ?? mostRecent.sessionId)) ?? mostRecent;
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
  /* Newest-first toggle (2025 · 2024): visits are oldest-first, so reverse. */
  const yearOptions = [...visits]
    .reverse()
    .map((visit) => ({ value: visit.sessionId, label: labelFor.get(visit.sessionId) ?? String(visit.seasonYear ?? '—') }));
  /* Orientation names the OTHER distinct years, newest-first — "toggle for 2024"
   * on a two-visit venue; a double-header lists its distinct other years. */
  const otherYears = [...new Set(visits.map((visit) => visit.seasonYear).filter((year): year is number => year !== null))]
    .filter((year) => year !== selected.seasonYear)
    .sort((left, right) => right - left);
  const orientationClause = `His ${selectedLabel} race here, section by section${
    multi && otherYears.length > 0 ? ` — toggle for ${otherYears.join(' · ')}` : ''
  }.`;
  /* Single-visit venues hide the toggle entirely (director spec): one year, no
   * control, no "toggle for" clause. */
  const visitControl = multi ? (
    <ControlRow label="Year">
      <Segmented options={yearOptions} value={selected.sessionId} onChange={setSelectedId} />
    </ControlRow>
  ) : null;

  return (
    <>
      <SectionHeatCard
        title="The track, section by section — his record here"
        orientationClause={orientationClause}
        visitControl={visitControl}
        outline={outline}
        anchors={anchors}
        laps={selected}
        fallbackSet={null}
        passMarks={passMarks}
        visitLapsCompleted={lapsCompletedBySession.get(selected.sessionId) ?? null}
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
