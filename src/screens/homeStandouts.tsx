import { useEffect, useMemo, useRef, useState } from 'react';
import { useMeasuredWidth, useReducedMotion } from '../app/charts';
import { formatDate } from '../app/format';
import { Link } from '../app/router';
import { TrackArt } from '../app/trackArt';
import { trackOutlineFor } from '../assets/tracks';
import type { UiSeasonIndexRow } from '../data/uiDataPackage';
import type { SeasonReview } from '../data/seasonPhase';
import { resolveHeatSections, sectionObservationsFromLaps, type ResolvedHeatSection } from '../data/sectionObservations';
import { useVenueSectionData } from './sectionIntelligence';

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
 * whole: no dot, and nothing implies where the car was inside a section
 * (there is no position data, only timing loops).
 * ============================================================ */

/** "2026 Grand Prix of Monterey Race 2 R2" → "Grand Prix of Monterey, Race 2". */
export const shortRaceName = (raceLabel: string): string =>
  raceLabel
    .replace(/^\d{4}\s+/, '')
    .replace(/^INDY NXT by Firestone at (the )?/i, '')
    .replace(/\s+R\d$/, '')
    .replace(/\s+(Race \d)$/, ', $1');

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
  section: ResolvedHeatSection;
  seconds: number;
}

const StandoutArt = ({ trackName, sessionId, raceName }: { trackName: string | null; sessionId: string; raceName: string }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const reduced = useReducedMotion();
  const outline = trackOutlineFor(trackName);
  const sections = useVenueSectionData(outline?.name ?? trackName);
  const { resolved, steps } = useMemo(() => {
    if (!sections.anchors) return { resolved: [] as ResolvedHeatSection[], steps: [] as SweepStep[] };
    const visit = sections.visits.find((pack) => pack.sessionId === sessionId);
    if (!visit) return { resolved: [] as ResolvedHeatSection[], steps: [] as SweepStep[] };
    /* That visit's own anchors: a measured pack never joins PDF names. */
    const anchors = sections.anchorsBySession.get(visit.sessionId) ?? sections.anchors;
    const set = sectionObservationsFromLaps(visit);
    const heat = resolveHeatSections(anchors, set);
    /* His median time in each section, in lap order (the anchor set's order).
     * A section with no time of his own takes the lap's average pace over its
     * length, so the sweep never stalls or skips a stretch it has drawn. */
    const byName = new Map(set.sections.map((observation) => [observation.sectionName, observation]));
    const timed = heat.map((section) => ({
      section,
      length: section.renderSpans.reduce((sum, span) => sum + spanLength(span.startT, span.endT), 0),
      seconds: byName.get(section.sectionName)?.bryceMedianSeconds ?? null
    }));
    const known = timed.filter((entry) => entry.seconds !== null && entry.length > 0);
    const pace = known.length > 0 ? known.reduce((s, e) => s + (e.seconds as number), 0) / known.reduce((s, e) => s + e.length, 0) : null;
    const sweep: SweepStep[] =
      pace === null ? [] : timed.map((entry) => ({ section: entry.section, seconds: entry.seconds ?? entry.length * pace }));
    return { resolved: heat, steps: sweep };
  }, [sessionId, sections.anchors, sections.anchorsBySession, sections.visits]);

  const lapSeconds = steps.reduce((sum, step) => sum + step.seconds, 0);
  const speedUp = lapSeconds > 0 ? Math.round(lapSeconds / (SWEEP_MS / 1000)) : null;

  /* The clock: which step is lit, or null at rest. */
  const [lit, setLit] = useState<number | null>(null);
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
      const index = ends.findIndex((end) => t < end);
      setLit(index < 0 ? steps.length - 1 : index);
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
  /* TrackArt's own box (maxHeight letterbox, centred): the overlay draws in
   * the same viewBox at the same size and place, so each lit span lands on its
   * drawn span exactly. */
  const geometry = useMemo(() => {
    if (!outline || width <= 0) return null;
    const [, , viewWidth, viewHeight] = outline.viewBox.split(' ').map(Number);
    const aspect = viewHeight / viewWidth;
    const artWidth = Math.max(0, Math.min(width, maxHeight / aspect));
    const scale = artWidth / viewWidth;
    return { left: Math.max(0, (width - artWidth) / 2), width: artWidth, height: artWidth * aspect, scale };
  }, [outline, width, maxHeight]);

  const canPlay = !reduced && steps.length > 0;
  const current = lit !== null ? steps[lit] : null;

  return (
    <div
      className={`home-race__art${playing ? ' is-playing' : ''}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') play();
      }}
    >
      <div ref={ref} className="home-race__draw">
        {outline && width > 0 ? (
          <TrackArt
            outline={outline}
            maxHeight={maxHeight}
            wind={null}
            showCornerLabels={false}
            strokeScale={2}
            sections={resolved.length > 0 ? { resolved, showLabels: false } : null}
          />
        ) : null}
        {outline && geometry && steps.length > 0 ? (
          <svg
            className="home-race__sweep"
            viewBox={outline.viewBox}
            width={geometry.width}
            height={geometry.height}
            style={{ left: geometry.left }}
            aria-hidden
          >
            {steps.map((step, index) =>
              step.section.renderSpans.flatMap((span, spanIndex) =>
                dashesFor(span.startT, span.endT).map((dash, dashIndex) => (
                  <path
                    key={`${step.section.familyId}-${spanIndex}-${dashIndex}`}
                    d={outline.mainPath}
                    fill="none"
                    pathLength={1}
                    stroke="var(--amber)"
                    strokeWidth={15 / geometry.scale}
                    strokeLinecap="butt"
                    strokeDasharray={dash.dasharray}
                    strokeDashoffset={dash.dashoffset}
                    className={index === lit ? 'is-lit' : undefined}
                  />
                ))
              )
            )}
          </svg>
        ) : null}
        {/* The hand's target over the whole drawing: TrackArt's own hover box
            and tap cycle stay off here; this card's answer is the sweep. */}
        {canPlay ? (
          <span
            className="home-race__hit"
            role="button"
            tabIndex={0}
            aria-label={`Play his median lap of the ${raceName}, section by section, sped up`}
            onClick={play}
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
          const name = shortRaceName(row.raceLabel);
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
