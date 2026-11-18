import { Suspense, lazy, useEffect, useMemo, useRef } from 'react';
import { MapPin, Play } from 'lucide-react';
import { Card, ScreenHead, SourcePill, Unavailable } from '../app/components';
import { useRouter } from '../app/router';
import { ordinal } from '../app/format';
import { inkGoldDiverging } from '../app/charts';
import { trackOutlineFor } from '../assets/tracks';
import { sectionObservationsFromLaps } from '../data/sectionObservations';
import type { SectionLapsPack } from '../data/sectionLaps';
import { useQualiLabForRace } from '../data/qualiLab';
import { uiDataPackage } from '../data/uiDataPackage';
import { VenueSectionSuite, useVenueSectionData } from './sectionIntelligence';
import { TrackModelSlot } from '../three/TrackModelSlot';
import { prefetchTrackModel } from '../three/trackModelLoad';
import { resolveQualifyingHeatMode } from './qualifyingHeat';
import { switchValue } from '../review/switches';
import { watchableCaptureForRace } from '../data/replayAvailable';
import type { LiveReadiness, ReplaySourceGap } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import { ReplayAffordance, useReplayCatalog } from './replayAffordance';
import './tracks.css';

/* The race replayed on the track (round 8), loaded only when a replay starts. */
const TracksReplay = lazy(() => import('./tracksReplay'));

/** The season schedule (seasonIndex, from the official venue dossier) and the
 *  section-lap packs (sectionLapRefs, joined by the track-asset name) name a
 *  couple of street circuits differently — the dossier's full event name vs
 *  the track asset's short "Streets of …" form. Left uncanonicalized this
 *  produced two dropdown entries for the same venue (one of which had no
 *  section-lap pack), and split a venue's visits across both spellings.
 *  Canonicalize on the track-asset spelling everywhere this screen keys off a
 *  venue name; extend this map if another dossier/asset name pair diverges. */
const VENUE_NAME_ALIASES: Record<string, string> = {
  'Detroit Downtown Street Circuit': 'Streets of Detroit',
  'Grand Prix of Arlington Street Circuit': 'Streets of Arlington'
};
const canonicalVenueName = (name: string): string => VENUE_NAME_ALIASES[name] ?? name;

const selectStyle = {
  width: '100%',
  minWidth: 0,
  font: 'inherit',
  color: 'var(--ink-primary)',
  background: 'var(--surface-0)',
  border: '1px solid var(--hairline)',
  borderRadius: 9,
  padding: '8px 32px 8px 10px'
} as const;

const visitLabels = (
  visits: Array<{ sessionId: string; seasonYear: number | null; raceLabel: string }>
): Map<string, string> => {
  const labels = new Map<string, string>();
  const perYear = new Map<number, number>();
  for (const visit of visits) {
    const year = visit.seasonYear;
    const sameYear = year !== null ? visits.filter((other) => other.seasonYear === year) : [];
    if (year === null || sameYear.length < 2) {
      labels.set(visit.sessionId, String(year ?? 'Unknown year'));
      continue;
    }
    const raceNo = /race\s*(\d+)/i.exec(visit.raceLabel ?? '')?.[1];
    const sequence = (perYear.get(year) ?? 0) + 1;
    perYear.set(year, sequence);
    labels.set(visit.sessionId, `${year} · Race ${raceNo ?? sequence}`);
  }
  return labels;
};

/** Honest non-geometric comparison for IMSRC and approximate venue maps. The
 * official timing numbers remain useful even when no section span is accepted
 * for drawing. */
const VenueNumbersFallback = ({ visits, labels }: { visits: SectionLapsPack[]; labels: Map<string, string> }) => {
  const sets = visits.map((visit) => ({ visit, set: sectionObservationsFromLaps(visit) }));
  const sectionNames = [...new Set(sets.flatMap(({ set }) => set.sections.map((section) => section.sectionName)))];
  const entries = [
    {
      label: 'Official Section Results, lap by lap',
      path: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv',
      note: "Bryce's clean-lap section times and field percentiles from the official timing reports."
    }
  ];
  return (
    <Card
      title="The track, year over year: timing table"
      action={
        <SourcePill
          title="Venue section comparison"
          entries={entries}
          caveats={[
            'Values are median clean-lap shares of the field beaten in each official timing section.',
            'No heat map is drawn without visually accepted section-to-outline geometry.',
            ...[...new Set(visits.flatMap((visit) => visit.caveats ?? []))]
          ]}
        />
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        The official section timing is available, but the section-to-track geometry is not verified. Compare the numbers directly instead.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: Math.max(420, visits.length * 92 + 190), borderCollapse: 'collapse', fontSize: 12.5 }}>
          <caption style={{ textAlign: 'left', color: 'var(--ink-muted)', fontSize: 12.5, paddingBottom: 7 }}>
            Median clean-lap percentile · higher means Bryce beat more of the field in that section
          </caption>
          <thead>
            <tr style={{ color: 'var(--ink-muted)' }}>
              <th scope="col" style={{ textAlign: 'left', fontWeight: 520, padding: '7px 8px 7px 0' }}>Official section</th>
              {sets.map(({ visit }) => (
                <th key={visit.sessionId} scope="col" style={{ textAlign: 'right', fontWeight: 520, padding: '7px 8px' }}>
                  {labels.get(visit.sessionId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectionNames.map((name) => (
              <tr key={name} style={{ borderTop: '1px solid var(--divider)' }}>
                <th scope="row" style={{ textAlign: 'left', fontWeight: 520, padding: '9px 8px 9px 0' }}>{name}</th>
                {sets.map(({ visit, set }) => {
                  const value = set.sections.find((section) => section.sectionName === name)?.percentile ?? null;
                  return (
                    <td
                      key={visit.sessionId}
                      className="tnum"
                      style={{
                        textAlign: 'right',
                        padding: '9px 8px',
                        background: value === null ? undefined : inkGoldDiverging(value),
                        color: value !== null && value < 0.3 ? '#fff' : undefined,
                        borderLeft: '2px solid var(--surface-0)'
                      }}
                    >
                      {value === null ? '—' : ordinal(Math.round(value * 100))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export const TracksScreen = ({
  replay = null,
  payload = null,
  history = null,
  replaySourceGap = null
}: {
  /** The client-wide replay clock, engaged by `?replay=` on this page. */
  replay?: ReplaySession | null;
  payload?: LiveReadiness | null;
  history?: LiveSessionHistory | null;
  replaySourceGap?: ReplaySourceGap | null;
} = {}) => {
  const { route, navigate } = useRouter();
  const refs = uiDataPackage.screens.raceDebrief.sectionLapRefs ?? [];
  const seasonIndex = uiDataPackage.screens.raceDebrief.seasonIndex ?? [];
  const venues = useMemo(
    () =>
      [
        ...new Set([
          ...refs.map((ref) => canonicalVenueName(ref.venueName)),
          ...seasonIndex
            .map((row) => row.trackName)
            .filter((name): name is string => Boolean(name))
            .map(canonicalVenueName)
        ])
      ].sort((left, right) => left.localeCompare(right)),
    [refs, seasonIndex]
  );
  /* The actual most-recently-raced venue, by real race date across the whole
   * schedule — not whichever venue happened to sort first among sectionLapRefs
   * sharing the same season year (that unstable same-year sort was why the
   * page defaulted to Streets of Detroit regardless of the real season order). */
  const mostRecentlyRacedVenue = useMemo(() => {
    const dated = seasonIndex.filter((row): row is typeof row & { trackName: string } => Boolean(row.trackName));
    const latest = [...dated].sort(
      (left, right) =>
        (left.raceDate ?? left.eventStartDate ?? '').localeCompare(right.raceDate ?? right.eventStartDate ?? '') ||
        (left.roundIndex ?? 0) - (right.roundIndex ?? 0)
    ).at(-1);
    return latest ? canonicalVenueName(latest.trackName) : null;
  }, [seasonIndex]);
  const requestedVenue = route.search.get('venue');
  const selectedVenue =
    requestedVenue && venues.includes(requestedVenue) ? requestedVenue : mostRecentlyRacedVenue ?? venues[0] ?? null;
  const canonicalVisits = useMemo(
    () =>
      seasonIndex
        .filter((row) => row.trackName !== null && canonicalVenueName(row.trackName) === selectedVenue)
        .sort(
          (left, right) =>
            (left.raceDate ?? left.eventStartDate ?? '').localeCompare(right.raceDate ?? right.eventStartDate ?? '') ||
            (left.roundIndex ?? 0) - (right.roundIndex ?? 0) ||
            left.sessionId.localeCompare(right.sessionId)
        ),
    [seasonIndex, selectedVenue]
  );
  const requestedVisit = route.search.get('visit');
  // The pack this page is actually about to draw: an explicit `?visit=` deep
  // link if given, else a same-render best guess (the chronologically latest
  // visit — `data.mostRecent`'s own fallback once loaded almost always agrees)
  // so the fetch batch below can prioritize it without waiting on `data`
  // itself, which would be circular (`data.mostRecent` only exists once a
  // visit has already loaded). See useVenueSectionData's `prioritySessionId` doc.
  const priorityVisitId = requestedVisit ?? canonicalVisits.at(-1)?.sessionId ?? null;
  const data = useVenueSectionData(selectedVenue, priorityVisitId);
  const labels = useMemo(() => visitLabels(canonicalVisits), [canonicalVisits]);
  const sectionPackSessionIds = useMemo(() => new Set(refs.map((ref) => ref.sessionId)), [refs]);
  const selectedCanonicalVisit =
    canonicalVisits.find((visit) => visit.sessionId === requestedVisit) ??
    canonicalVisits.find((visit) => visit.sessionId === data.mostRecent?.sessionId) ??
    canonicalVisits.at(-1) ??
    null;
  const selectedVisit = data.visits.find((visit) => visit.sessionId === selectedCanonicalVisit?.sessionId) ?? null;
  const outline = trackOutlineFor(selectedVenue);
  /* Every state of this page draws the venue's 3D model (shaded, plain, or
   * under a replay), but only once the section data is in. Start its chunk,
   * three.js, the model and its poster now, so they load alongside that data
   * rather than after it. */
  const outlineSlug = outline?.slug ?? null;
  useEffect(() => {
    if (outlineSlug) prefetchTrackModel(outlineSlug);
  }, [outlineSlug]);
  const qualiResolution = useQualiLabForRace(selectedCanonicalVisit?.sessionId ?? '');
  const qualifying = useMemo(
    () =>
      resolveQualifyingHeatMode(
        qualiResolution,
        (selectedCanonicalVisit?.trackName ? canonicalVenueName(selectedCanonicalVisit.trackName) : null) ?? selectedVenue,
        data.anchors
      ),
    [qualiResolution, selectedCanonicalVisit?.trackName, selectedVenue, data.anchors]
  );

  /* The 3D model (round 5) lives in the section story below, shaded; where
   * there is no section story to draw, it stands alone, plain. */
  const plainModel = outline ? (
    <TrackModelSlot slug={outline.slug} name={outline.name} sections={[]} fallback={null} caption="The track, not shaded." />
  ) : null;
  const visitLabel = selectedCanonicalVisit ? labels.get(selectedCanonicalVisit.sessionId) ?? null : null;

  /* The replay of the picked race, when the archive has a watchable one
   * (matched by the race's canonical session, as on the race page). By
   * default it plays here, on this page's track; `trackreplay=link` keeps the
   * old way, a button to the Live page. A new venue or race drops `replay`
   * from the address, which stops it. */
  const catalog = useReplayCatalog();
  const capture = catalog && selectedCanonicalVisit ? watchableCaptureForRace(catalog, selectedCanonicalVisit.sessionId) : null;
  const replayAsLink = switchValue('trackreplay', route.search) === 'link';
  const visitHref = selectedCanonicalVisit
    ? `/tracks?venue=${encodeURIComponent(selectedVenue ?? '')}&visit=${encodeURIComponent(selectedCanonicalVisit.sessionId)}`
    : `/tracks?venue=${encodeURIComponent(selectedVenue ?? '')}`;
  const replayRequested = Boolean(route.search.get('replay')) && !replayAsLink;
  const replayShown =
    replayRequested && replay && !replay.unavailable && !replay.refusedReason && !replay.endedByLive && selectedCanonicalVisit
      ? replay
      : null;
  // A press of the button brings the replay up under the nav, once; a reload
  // or a shared link leaves the scroll where the browser puts it.
  const arriveRef = useRef(false);
  useEffect(() => {
    if (!replayShown || !arriveRef.current) return undefined;
    let frames = 0;
    let raf = 0;
    const settle = () => {
      const el = document.querySelector<HTMLElement>('[data-tracks-replay]');
      if (!el) {
        if (++frames < 120) raf = requestAnimationFrame(settle);
        return;
      }
      arriveRef.current = false;
      // The nav scrolls away with the page, so the bar goes to the top edge.
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: 'smooth' });
    };
    raf = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(raf);
  }, [replayShown]);
  const startReplay = () => {
    if (!capture || !selectedCanonicalVisit) return;
    arriveRef.current = true;
    navigate(`${visitHref}&replay=${encodeURIComponent(capture.sessionKey)}&from=${encodeURIComponent(selectedCanonicalVisit.sessionId)}`);
  };
  const exitReplay = () => navigate(visitHref);
  const replayControl = !selectedCanonicalVisit ? null : capture ? (
    replayAsLink ? (
      <div className="tracks-replay-pick tracks-replay-pick--link">
        <ReplayAffordance capture={capture} fromSessionId={selectedCanonicalVisit.sessionId} title="Watch this race unfold" variant="compact" />
      </div>
    ) : (
      <div className="tracks-replay-pick">
        <button
          type="button"
          className="tracks-replay-pick__btn"
          data-tracks-replay-start
          aria-pressed={replayShown !== null}
          disabled={replayRequested}
          onClick={startReplay}
        >
          <Play size={14} aria-hidden /> {replayRequested ? 'Replaying below' : 'Replay this race'}
        </button>
      </div>
    )
  ) : catalog ? (
    <p className="tracks-replay-pick tracks-replay-pick--none caption caption--secondary" data-tracks-replay-none>
      No replay of this race is on file.
    </p>
  ) : null;

  const setVenue = (venueName: string) => navigate(`/tracks?venue=${encodeURIComponent(venueName)}`);
  const setVisit = (sessionId: string) => {
    if (!selectedVenue) return;
    navigate(`/tracks?venue=${encodeURIComponent(selectedVenue)}&visit=${encodeURIComponent(sessionId)}`);
  };

  if (!selectedVenue) {
    return (
      <div className="page stack">
        <ScreenHead kicker="Track archive" title="Venues" sub="No venue section records are available yet." />
        <Card><Unavailable>The official section archive is empty.</Unavailable></Card>
      </div>
    );
  }

  return (
    <div className="page stack tracks-page">
      <div className="tracks-head">
        <div className="tracks-head__text">
          <ScreenHead
            kicker={<><MapPin size={13} aria-hidden /> Track archive</>}
            title={selectedVenue}
            sub="His pace at every INDY NXT track he has raced, section by section, from the official timing loops."
          />
          <div className="tracks-head__pickers">
            <label className="tracks-pick">
              <span>Venue</span>
              <select aria-label="Venue" value={selectedVenue} onChange={(event) => setVenue(event.target.value)} style={selectStyle}>
                {venues.map((venue) => <option key={venue} value={venue}>{venue}</option>)}
              </select>
            </label>
            <label className="tracks-pick">
              <span>Year and race</span>
              <select
                aria-label="Year and race"
                value={selectedCanonicalVisit?.sessionId ?? ''}
                disabled={canonicalVisits.length === 0}
                onChange={(event) => setVisit(event.target.value)}
                style={selectStyle}
              >
                {canonicalVisits.map((visit) => (
                  <option key={visit.sessionId} value={visit.sessionId}>
                    {labels.get(visit.sessionId)}{sectionPackSessionIds.has(visit.sessionId) ? '' : ' · section report unavailable'}
                  </option>
                ))}
              </select>
            </label>
            {replayControl}
          </div>
          {replayRequested && replay?.refusedReason ? (
            <p className="caption caption--secondary tracks-replay-refused">{replay.refusedReason}</p>
          ) : null}
        </div>
      </div>

      {replayShown && selectedCanonicalVisit ? (
        <Suspense fallback={<div className="skeleton" style={{ height: 360 }} />}>
          <TracksReplay
            replay={replayShown}
            payload={payload}
            history={history}
            sourceGap={replaySourceGap}
            sessionId={selectedCanonicalVisit.sessionId}
            onExit={exitReplay}
          />
        </Suspense>
      ) : replayRequested && !replay ? (
        <div className="skeleton" style={{ height: 360 }} />
      ) : data.loading ? (
        <div className="skeleton" style={{ height: 360 }} />
      ) : selectedCanonicalVisit && !selectedVisit && !qualifying ? (
        <Card title={labels.get(selectedCanonicalVisit.sessionId) ?? selectedCanonicalVisit.raceLabel}>
          {plainModel ? <div style={{ marginBottom: 16 }}>{plainModel}</div> : null}
          <Unavailable>
            <span>
              This race remains in the canonical archive, but its official Section Results report did not yield a validated lap-by-lap pack, so no section heat map is drawn for this visit.{' '}
              <a href={`/races/${selectedCanonicalVisit.sessionId}`}>Open the race debrief</a>.
            </span>
          </Unavailable>
        </Card>
      ) : data.visits.length === 0 ? (
        <Card>{plainModel ? <div style={{ marginBottom: 16 }}>{plainModel}</div> : null}<Unavailable>No official lap-by-lap section timing is on file for this venue.</Unavailable></Card>
      ) : outline && data.anchors ? (
        <VenueSectionSuite
          outline={outline}
          data={data}
          selectedVisitId={selectedCanonicalVisit?.sessionId ?? null}
          onSelectedVisitChange={setVisit}
          showVisitControl={false}
          qualifying={qualifying}
          layout="tracks"
          heatTitle={visitLabel ? `${visitLabel}, section by section` : undefined}
        />
      ) : (
        <>
          {plainModel}
          <VenueNumbersFallback visits={data.visits} labels={labels} />
        </>
      )}
    </div>
  );
};
