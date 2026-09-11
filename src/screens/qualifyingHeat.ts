import { trackSectionsFor, type TrackSectionAnchorSet } from '../assets/tracks/sections';
import type { QualiLabResolution } from '../data/qualiLab';
import type { QualifyingHeatMode } from './sectionIntelligence';

const gridBasisLabel = (
  selection: NonNullable<QualiLabResolution['gridClassification']>['lapSelection']
): string => {
  if (selection === 'second_fastest' || selection === 'second_fastest_lap') return 'second-fastest lap';
  if (selection === 'two_lap_average' || selection === 'oval_two_lap_average') return 'two-lap average';
  return 'fastest lap';
};

/** Resolve the Quali Lab's race join into the shared section-heat contract.
 * The caller supplies the canonical race venue because capture/session labels
 * can use provider aliases (for example "Indianapolis Motor Speedway RC"). */
export const resolveQualifyingHeatMode = (
  resolution: QualiLabResolution | null | 'failed',
  raceVenueName: string | null | undefined,
  fallbackAnchors: TrackSectionAnchorSet | null
): QualifyingHeatMode | null => {
  if (!resolution || resolution === 'failed') return null;

  const session = resolution.session;
  const sessionAnchors = session ? trackSectionsFor(session.venueName) : null;
  const canonicalAnchors = trackSectionsFor(raceVenueName);
  const anchored = [sessionAnchors, canonicalAnchors, fallbackAnchors].find(
    (candidate): candidate is TrackSectionAnchorSet => Boolean(candidate && candidate.confidence === 'anchored')
  ) ?? fallbackAnchors;
  const grid = resolution.gridClassification;
  const gridLabel = grid
    ? `${grid.raceLabel ?? 'This race'} grid${
        grid.combinedGridPosition !== null && grid.combinedFieldSize !== null
          ? `: P${grid.combinedGridPosition} of ${grid.combinedFieldSize}`
          : ''
      } · ${gridBasisLabel(grid.lapSelection)}`
    : null;

  return {
    laps: session?.sectionLaps ?? null,
    anchors: anchored,
    status:
      session?.qualifyingStatus === 'cancelled'
        ? 'cancelled'
        : resolution.coverageRace?.status ?? (session?.sectionLaps ? 'available' : 'unavailable'),
    note: session?.cancellation?.note ?? resolution.coverageRace?.note ?? null,
    sourceUrl: session?.cancellation?.url ?? resolution.coverageRace?.sourceUrl ?? null,
    sessionLabel: session?.sessionLabel ?? null,
    gridLabel
  };
};
