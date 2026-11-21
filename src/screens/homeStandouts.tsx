import { useEffect, useMemo, useRef, useState } from 'react';
import { venueName } from '../app/venueNames';
import { useMeasuredWidth, useReducedMotion } from '../app/charts';
import { formatDate } from '../app/format';
import { Link } from '../app/router';
import { TrackArt } from '../app/trackArt';
import { TrackStill, hasStill, useStillIndex } from '../app/trackStill';
import { trackOutlineFor } from '../assets/tracks';
import type { UiSeasonIndexRow } from '../data/uiDataPackage';
import type { SeasonReview } from '../data/seasonPhase';
import type { ResolvedHeatSection } from '../data/sectionObservations';
import type { TrackModelSection } from '../three/TrackModel3D';
import { raceStillSectionsFor, useVenueSectionData } from './sectionIntelligence';
import { labelledRaceTitle } from './careerRaceNames';

/* ============================================================
 * The landing's standout races (site refresh, Nov 14 2026).
 *
 * Which races: the hero above is the season best (Laguna Seca, Race 1), so
 * the cards are the next three by the season review's own second rule, the
 * biggest climbs through the field: start minus finish, at least 3 places,
 * races he finished running, larger climb first and the better finish on a
 * tie. If fewer than three races qualify, the best other finishes fill in.
 *
 * What moves: on hover (or a tap, or Enter), each section of the track
 * lights in turn for his median time in it in that race, the whole lap
 * scaled to play once in about 3.5 s, then the map rests. Sections light
 * whole, each in its own heat colour ringed in ink: nothing implies where the
 * car was inside a section (there is no position data, only timing loops).
 * At rest, pointing at a section reads it in the Tracks page's words.
 *
 * Round 6 (Jack's review of Nov 16): the track is a still of the 3D model
 * (TrackStill), shaded for that race as the Tracks page's model shades it.
 * A venue with no model keeps the 2D drawing. A dot that runs along the
 * centreline by time is built behind ?sweep=dot for Jack to compare; it is
 * placed by time through each section, not a measured position, and off by
 * default (the repo's no-GPS boundary).
 * ============================================================ */

/** "2026 Grand Prix of Monterey Race 2 R2" → "Grand Prix of Monterey · Race 2": the site's one race name (careerRaceNames). */
export const shortRaceName = (row: Pick<UiSeasonIndexRow, 'raceLabel' | 'sessionId' | 'trackName'>): string =>
  labelledRaceTitle({ raceLabel: row.raceLabel, sessionId: row.sessionId, trackName: row.trackName });

export interface StandoutPick {
  row: UiSeasonIndexRow;
  label: string;
}

/** The three standouts after the hero race (see the rule above). */
export const standoutsAfter = (review: SeasonReview, heroSessionId: string): StandoutPick[] => {
  const clean = review.rows.filter(
    (row) => row.officialStatus === 'running' && row.finishPosition !== null && row.sessionId !== heroSessionId
  );
  const climbs = clean
    .filter((row) => row.startPosition !== null)
    .map((row) => ({ row, gain: (row.startPosition as number) - (row.finishPosition as number) }))
    .filter((entry) => entry.gain >= 3)
    .sort((a, b) => b.gain - a.gain || (a.row.finishPosition as number) - (b.row.finishPosition as number))
    .slice(0, 3)
    .map(({ row, gain }) => ({ row, label: `Up ${gain} places` }));
  if (climbs.length >= 3) return climbs;
  const taken = new Set(climbs.map((pick) => pick.row.sessionId));
  const fill = clean
    .filter((row) => !taken.has(row.sessionId))
    .sort((a, b) => (a.finishPosition as number) - (b.finishPosition as number))
    .slice(0, 3 - climbs.length)
    .map((row) => ({ row, label: 'One of his best other finishes' }));
  return [...climbs, ...fill];
};

const SWEEP_MS = 3500;

/** Forward arc length of a span in [0,1], across the seam (TrackArt's own). */
const spanLength = (start: number, end: number): number => ((end - start + 1) % 1) || (end === start ? 0 : 1);

/** Dash descriptors for a span on the outline drawn with pathLength=1
 *  (TrackArt's own trick, so the lit stretch lands on its drawn span). */
const dashesFor = (start: number, end: number): Array<{ dasharray: string; dashoffset: number }> =>
  start <= end
    ? [{ dasharray: `${end - start} 2`, dashoffset: -start }]
    : [
        { dasharray: `${1 - start} 2`, dashoffset: -start },
        { dasharray: `${end} 2`, dashoffset: 0 }
      ];

interface SweepStep {
  section: TrackModelSection;
  seconds: number;
  /** The section's forward length on the outline (the dot's run). */
  length: number;
}

/** ?sweep=dot: the comparison build of a dot run by time (off by default). */
const dotSweep = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('sweep') === 'dot';
  } catch {
    return false;
  }
};

const StandoutArt = ({ trackName, sessionId, raceName }: { trackName: string | null; sessionId: string; raceName: string }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const reduced = useReducedMotion();
  const outline = trackOutlineFor(trackName);
  const sections = useVenueSectionData(outline?.name ?? trackName);
  const stillIndex = useStillIndex();
  const still = outline ? hasStill(stillIndex, outline.slug) : false;
  const withDot = useMemo(dotSweep, []);
  const { modelSections, heat, steps } = useMemo(() => {
    const none = { modelSections: [] as TrackModelSection[], heat: [] as ResolvedHeatSection[], steps: [] as SweepStep[] };
    if (!sections.anchors || !outline) return none;
    const visit = sections.visits.find((pack) => pack.sessionId === sessionId);
    if (!visit) return none;
    /* That visit's own anchors: a measured pack never joins PDF names. */
    const anchors = sections.anchorsBySession.get(visit.sessionId) ?? sections.anchors;
    const { set, heat, sections: model } = raceStillSectionsFor(visit, anchors, outline);
    if (heat.length === 0) return none;
    /* His median time in each section, in the order he drives them. A section
     * with no time of his own takes the lap's average pace over its length,
     * so the sweep never stalls or skips a stretch it has drawn. */
    const byName = new Map(set.sections.map((observation) => [observation.sectionName, observation]));
    const timed = model.map((section) => ({
      section,
      length: section.spans.reduce((sum, [start, end]) => sum + spanLength(start, end), 0),
      seconds: byName.get(section.key)?.bryceMedianSeconds ?? null
    }));
    const known = timed.filter((entry) => entry.seconds !== null && entry.length > 0);
    const pace = known.length > 0 ? known.reduce((s, e) => s + (e.seconds as number), 0) / known.reduce((s, e) => s + e.length, 0) : null;
    const sweep: SweepStep[] =
      pace === null ? [] : timed.map((entry) => ({ section: entry.section, length: entry.length, seconds: entry.seconds ?? entry.length * pace }));
    return { modelSections: model, heat, steps: sweep };
  }, [sessionId, outline, sections.anchors, sections.anchorsBySession, sections.visits]);

  const lapSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);
  const speedUp = lapSeconds > 0 ? Math.round(lapSeconds / (SWEEP_MS / 1000)) : null;

  /* The clock: which step is lit (and, with the dot, how far through it), or
   * null at rest. */
  const [lit, setLit] = useState<{ index: number; through: number } | null>(null);
  const raf = useRef<number | null>(null);
  const playing = lit !== null;
  const play = () => {
    if (reduced || steps.length === 0 || raf.current !== null) return;
    const ends: number[] = [];
    let at = 0;
    for (const step of steps) {
      at += (step.seconds / lapSeconds) * SWEEP_MS;
      ends.push(at);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      if (t >= SWEEP_MS) {
        raf.current = null;
        setLit(null);
        return;
      }
      const found = ends.findIndex((end) => t < end);
      const index = found < 0 ? steps.length - 1 : found;
      const from = index > 0 ? ends[index - 1] : 0;
      setLit({ index, through: Math.max(0, Math.min(1, (t - from) / Math.max(1, ends[index] - from))) });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    []
  );

  const maxHeight = width > 0 && width < 480 ? 230 : 290;
  /* TrackArt's own box (maxHeight letterbox, centred): the 2D sweep draws in
   * the same viewBox at the same size and place, so each lit span lands on its
   * drawn span exactly. Only for a venue with no 3D still. */
  const geometry = useMemo(() => {
    if (!outline || width <= 0) return null;
    const [, , viewWidth, viewHeight] = outline.viewBox.split(' ').map(Number);
    const aspect = viewHeight / viewWidth;
    const artWidth = Math.max(0, Math.min(width, maxHeight / aspect));
    const scale = artWidth / viewWidth;
    return { left: Math.max(0, (width - artWidth) / 2), width: artWidth, height: artWidth * aspect, scale };
  }, [outline, width, maxHeight]);

  const canPlay = !reduced && steps.length > 0;
  const current = lit !== null ? steps[lit.index] : null;
  /* The dot (comparison build only): through the lit section's first span by
   * the share of its time gone. Placed by time, not a measured position. */
  const dotT =
    withDot && current && lit
      ? (() => {
          let left = lit.through * current.length;
          for (const [start, end] of current.section.spans) {
            const span = spanLength(start, end);
            if (left <= span) return (start + left) % 1;
            left -= span;
          }
          return current.section.spans[0][0];
        })()
      : null;
  const flat = (
    <div className="home-race__flat">
      <TrackArt
        outline={outline!}
        maxHeight={maxHeight}
        wind={null}
        showCornerLabels={false}
        strokeScale={2}
        sections={heat.length > 0 ? { resolved: heat, showLabels: false } : null}
      />
    </div>
  );

  return (
    <div
      className={`home-race__art${playing ? ' is-playing' : ''}${still ? ' home-race__art--still' : ''}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') play();
      }}
    >
      <div ref={ref} className="home-race__draw" onClick={still ? play : undefined}>
        {outline && still ? (
          <TrackStill
            slug={outline.slug}
            sessionId={sessionId}
            sections={modelSections}
            interactive={!playing && modelSections.length > 0}
            lit={current ? current.section.key : null}
            dotT={dotT}
            alt={`${venueName(outline.name)}: the 3D track, shaded section by section for the ${raceName}.`}
            sizes="(max-width: 760px) 100vw, 560px"
          />
        ) : null}
        {outline && !still && width > 0 ? flat : null}
        {outline && !still && geometry && steps.length > 0 ? (
          <svg
            className="home-race__sweep"
            viewBox={outline.viewBox}
            width={geometry.width}
            height={geometry.height}
            style={{ left: geometry.left }}
            aria-hidden
          >
            {steps.map((step, index) =>
              step.section.spans.flatMap(([start, end], spanIndex) =>
                dashesFor(start, end).map((dash, dashIndex) => (
                  <path
                    key={`${step.section.key}-${spanIndex}-${dashIndex}`}
                    d={outline.mainPath}
                    fill="none"
                    pathLength={1}
                    stroke={step.section.color ?? 'var(--ink-muted)'}
                    strokeWidth={15 / geometry.scale}
                    strokeLinecap="butt"
                    strokeDasharray={dash.dasharray}
                    strokeDashoffset={dash.dashoffset}
                    className={index === lit?.index ? 'is-lit' : undefined}
                  />
                ))
              )
            )}
          </svg>
        ) : null}
        {/* The hand's target over the whole drawing for touch and keys: a tap
            or Enter plays the lap. With a pointer that hovers, it lets the
            pointer through to the still, which reads each section. */}
        {canPlay ? (
          <span
            className="home-race__hit"
            role="button"
            tabIndex={0}
            aria-label={`Play his median lap of the ${raceName}, section by section, sped up`}
            onClick={(event) => {
              event.stopPropagation();
              play();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                play();
              }
            }}
          />
        ) : null}
      </div>
      {canPlay ? (
        <span className="home-race__sweep-cap" aria-live="off">
          His median lap, section by section, sped up{speedUp ? ` ${speedUp} times` : ''}
          {current ? (
            <>
              {' '}
              · <b>{current.section.label}</b> {current.seconds.toFixed(1)} s
            </>
          ) : (
            <span className="home-race__sweep-hint">
              {' '}
              · <span className="home-race__sweep-hint--hover">point at the track to play it</span>
              <span className="home-race__sweep-hint--touch">tap the track to play it</span>
            </span>
          )}
          {withDot && still ? <span className="home-race__dot-note"> · the dot is placed by time, not a measured position</span> : null}
        </span>
      ) : null}
    </div>
  );
};

export const Standouts = ({ review, complete, heroSessionId }: { review: SeasonReview; complete: boolean; heroSessionId: string }) => {
  const picks = useMemo(() => standoutsAfter(review, heroSessionId), [review, heroSessionId]);
  if (picks.length === 0) return null;
  const allClimbs = picks.every((pick) => pick.label.startsWith('Up '));
  return (
    <section className="home-standouts" aria-labelledby="home-standouts-title">
      <h2 id="home-standouts-title">
        Standout races of {review.seasonYear}
        {complete ? '' : ' so far'}
      </h2>
      <p className="home-sub">
        The season best is the race above. {allClimbs ? `These are the ${picks.length === 3 ? 'three ' : ''}races where he gained the most places` : 'These are the races where he gained the most places, then his best other finishes'}, each one finished running.
        Each track is shaded by his pace in that race, section by section.
      </p>
      <div className="home-races">
        {picks.map(({ row, label }) => {
          const date = row.raceDate ?? row.eventStartDate;
          const name = shortRaceName(row);
          return (
            <div key={row.sessionId} className="home-race">
              <StandoutArt trackName={row.trackName} sessionId={row.sessionId} raceName={name} />
              <Link to={`/races/${encodeURIComponent(row.sessionId)}`} className="home-race__link">
                <span className="home-race__pos">
                  <b>{row.finishPosition !== null ? `P${row.finishPosition}` : 'No finish'}</b>
                  {row.startPosition !== null ? <span>from P{row.startPosition} on the grid</span> : null}
                </span>
                <span className="home-race__name">{name}</span>
                <span className="home-race__meta">
                  {date ? `${formatDate(date, { month: 'long', day: 'numeric' })} · ` : ''}
                  {label.charAt(0).toLowerCase() + label.slice(1)}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
};
