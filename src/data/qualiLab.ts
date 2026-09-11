/** Quali & Practice Lab run-by-run loader (Brief M, first slice).
 *
 *  The UI reads run-by-run qualifying through THIS interface only. It is sized
 *  for the full Quali & Practice Lab (adapter-contract law): `sessionType`
 *  (practice or qualifying), per-lap `trafficObservation`, composite
 *  `theoreticalBest`, and ordered `trackEvolution` are typed v2 fields a later
 *  lake-grain producer fills with NO UI rework. v1 is fed by the semantic layer
 *  (the run-by-run build) joined to the canonical official qualifying
 *  classification (the rank) — two substrates, never blended within a number.
 *
 *  It rides the vite context-pack glob (src/data/packModules.ts) and loads
 *  lazily only when a race page opens — but integrity is NOT optional: the pack
 *  is registered in the ui-data-package source inventory
 *  (sourceInventory.qualiLabContextPack) and this loader verifies raw-byte
 *  sha256 + pack id against that ref before returning anything, failing closed
 *  on mismatch (the GB3 / raceStory loader pattern). */

import { useEffect, useState } from 'react';
import { packModules, packRawModules } from './packModules';
import { uiDataPackage } from './uiDataPackage';
import type { SectionLapsPack } from './sectionLaps';

export type QualiSource = 'racetools' | 'timing71' | 'official' | 'official_section_results';
export type QualiSourceTier = 'racetools_capture' | 'timing71_normalized' | 'official_section_results';
export type QualiLapKind = 'flying' | 'support';
/** The weekend contract holds practice and qualifying alike; this first slice
 *  builds qualifying only, and a practice producer fills the same shape. */
export type QualiSessionType = 'qualifying' | 'practice';
/** Whether the on-screen benchmark line is the whole session's fastest lap
 *  (ovals: one group is the field) or only his qualifying group's (road/street
 *  split qualifying: the capture holds one group). */
export type QualiBenchmarkScope = 'session' | 'group';

/** v2 (full Quali & Practice Lab): typed traffic context for a single lap —
 *  the car ahead, the gap to it, and whether the lap was run in clear air.
 *  A lake-grain producer fills this per lap with no UI rework. Null in v1. */
export interface QualiTrafficObservation {
  aheadCar: string | null;
  gapAheadSeconds: number | null;
  inTraffic: boolean;
  clearAir: boolean;
}

/** v2: theoretical best as a composite — the sum of his fastest segment/sector
 *  times, each attributed to the lap it came from, so the UI can show how much
 *  time sat unclaimed across the run. */
export interface QualiTheoreticalBestComponent {
  segment: string;
  seconds: number;
  sourceLapSeq: number | null;
}
export interface QualiTheoreticalBest {
  seconds: number;
  components: QualiTheoreticalBestComponent[];
  sourceLapSeqs: number[];
  scope: QualiBenchmarkScope;
}

/** v2: track evolution as ordered observations of a reference lap time as the
 *  session ran (grip coming to the track), each with its own scope and how it
 *  was measured — never a single opaque "curve" blob. */
export interface QualiTrackEvolutionObservation {
  order: number;
  referenceSeconds: number;
  scope: QualiBenchmarkScope;
  coverage: string;
}

export interface QualiLap {
  seq: number;
  lapIndex: number | null;
  seconds: number;
  kind: QualiLapKind;
  isPersonalBest: boolean;
  runningBestSeconds: number;
  /* v2 field, per-lap: filled by a lake-grain producer, null in v1. */
  trafficObservation: QualiTrafficObservation | null;
}

/** The uncaptured sibling race of a covered doubleheader weekend — enough for a
 *  Race-2 page to show a quiet note (never Race-1's ranks). */
export interface QualiPairedRace {
  raceSessionId: string;
  raceLabel: string | null;
  eventName: string;
}

/** One official grid projection from a physical qualifying session. A
 * doubleheader keeps both projections beside the shared lap run: fastest lap
 * sets one grid, second-fastest lap the other (or the documented oval basis). */
export interface QualiGridClassification {
  raceSessionId: string;
  eventId: string;
  raceLabel: string | null;
  combinedGridPosition: number | null;
  combinedFieldSize: number | null;
  officialBestLapSeconds: number | null;
  lapSelection: 'fastest' | 'second_fastest' | 'fastest_lap' | 'second_fastest_lap' | 'two_lap_average' | 'oval_two_lap_average';
  groupRank?: number | null;
  groupFieldSize?: number | null;
  source: 'canonical_official_qualifying';
}

export interface QualiLabSession {
  id: string;
  source: QualiSource;
  sourceTier: QualiSourceTier;
  sourceTierLabel: string;
  seasonYear: number;
  date: string;
  venueName: string;
  trackId: string | null;
  sessionLabel: string | null;
  sessionType: QualiSessionType;
  eventId: string;
  /** Canonical race session ids whose grid this qualifying set — the surface
   *  join key (a race page finds its weekend's qualifying by its own id). */
  raceSessionIds: string[];
  isOval: boolean;
  /** 2026 (Timing71) only: the validated identity-crosswalk verdict + cross-check.
   *  Null for 2024-25 RaceTools rows. Named on screen for 2026 sessions. */
  crosswalkVerdict: string | null;
  crosswalkCrossCheck: string | null;
  qualityMasks: string[];

  /* the run-by-run BUILD (semantic substrate) */
  laps: QualiLap[];
  lapCount: number;
  droppedNoiseLaps: number;
  bryceBestSeconds: number;
  bryceBestSeq: number | null;
  sessionBestSeconds: number;
  sessionBestByBryce: boolean;
  benchmarkScope: QualiBenchmarkScope;
  sessionBestMoves: number | null;
  sessionBestSteps: Array<{ seconds: number; byBryce: boolean }>;
  gapToSessionBestSeconds: number;
  lapHolderCount: number;

  /* the final RANK (canonical substrate) */
  onTrackGroupRank: number | null;
  groupFieldSize: number | null;
  groupSegment: string | null;
  combinedGridPosition: number | null;
  combinedFieldSize: number | null;
  gridGapToPoleSeconds: number | null;
  onTrackGapToPoleSeconds: number | null;
  officialBestLapSeconds: number | null;
  capturedBestVsOfficialSeconds: number | null;
  doubleheaderRaceLabel: string | null;
  rankAttribution: 'single' | 'doubleheader_bestlap' | 'cancelled';
  rankSource: string;
  qualifyingStatus?: 'cancelled' | 'completed';
  cancellation?: { note: string; url: string | null } | null;

  /* validation echoes */
  semanticClassificationPosition: number | null;
  positionCrossCheck: 'match' | 'mismatch' | 'na';

  /** Per-grid official classifications. Doubleheaders carry two entries while
   * retaining one physical run of laps. Optional while older packs remain
   * readable; resolution projects the matching row into the legacy scalars. */
  gridClassifications?: QualiGridClassification[];

  /** Doubleheader pairing: the uncaptured sibling races of this weekend, so a
   *  Race-2 page shows a quiet note instead of silence and never reuses this
   *  Race-1 row's ranks. Empty for single-race weekends. */
  pairedUncapturedRaces: QualiPairedRace[];

  /* v2 fields (full Quali & Practice Lab) — filled by a lake producer later,
   * consumed through this same contract with no UI rework (adapter-contract law). */
  theoreticalBest: QualiTheoreticalBest | null;
  trackEvolution: QualiTrackEvolutionObservation[] | null;

  /** Official Section Results at qualifying-lap grain, using the established
   * SectionLapsPack tuple contract. It stays a separate sourced substrate from
   * the captured run-by-run laps above. */
  sectionLaps?: SectionLapsPack | null;
}

export interface QualiExclusion {
  seasonYear: number;
  venueName: string;
  reason: string;
  note: string;
}

export interface QualiLabCoverage {
  coveredSessions: number;
  excludedSessions: number;
  bySeasonSource: Record<string, number>;
  exclusions: QualiExclusion[];
  races?: QualiCoverageRace[];
}

export interface QualiCoverageRace {
  raceSessionId: string;
  qualifyingSessionId: string | null;
  status: 'available' | 'partial' | 'unavailable' | 'cancelled';
  lapRunAvailable: boolean;
  sectionTimesAvailable: boolean;
  note: string;
  sourceUrl: string | null;
}

export interface QualiLabPack {
  id: string;
  type: string;
  schemaVersion: string;
  generatedAt: string;
  question: string;
  sourceHash: string;
  sourceTiers: Array<{ tier: string; label: string; note: string }>;
  rankSource: string;
  method: string[];
  caveats: string[];
  coverage: QualiLabCoverage;
  sessions: QualiLabSession[];
}

/** A Race-2 doubleheader page whose own qualifying we did not capture: enough
 *  to render a quiet note explaining that only the sibling race's run was held,
 *  making no rank claim. */
export interface QualiPairedNote {
  venueName: string;
  seasonYear: number;
  notedRaceLabel: string | null;
  capturedRaceLabel: string | null;
  sourceTierLabel: string;
}

/** What a race page resolves to: either the covered qualifying module, or a
 *  paired Race-2 note — always with the pack-wide coverage for the source
 *  drawer. Exactly one of `session`/`pairedNote` is set. */
export interface QualiLabResolution {
  session: QualiLabSession | null;
  pairedNote: QualiPairedNote | null;
  coverage: QualiLabCoverage;
  /** The grid row selected for the race page being resolved. */
  gridClassification: QualiGridClassification | null;
  coverageRace: QualiCoverageRace | null;
}

/** The inventory-backed integrity ref (id + path + sha256). Null when the
 *  package predates the quali-lab lane — the loader then returns null rather
 *  than loading an unverifiable pack. */
export const qualiLabRef = () => uiDataPackage.sourceInventory.qualiLabContextPack ?? null;

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const load = async (): Promise<QualiLabPack | null> => {
  const ref = qualiLabRef();
  if (!ref) return null;
  const key = `../../${ref.path}`;
  const jsonLoader = packModules[key];
  const rawLoader = packRawModules[key];
  if (!jsonLoader || !rawLoader) return null;
  const pack = ((await jsonLoader()) as { default: QualiLabPack }).default;
  const rawText = (await rawLoader()) as string;
  if ((await sha256Hex(rawText)) !== ref.sha256 || pack.id !== ref.id) {
    throw new Error(`Quali Lab pack integrity mismatch: ${ref.path}`);
  }
  return pack;
};

let cached: Promise<QualiLabPack | null> | null = null;

/** Load the pack once, hash-verified against the source-inventory ref. Fails
 *  closed (throws) on a tampered pack; a failed load is NOT cached, so a later
 *  attempt re-verifies rather than replaying the rejection. */
export const loadQualiLab = (): Promise<QualiLabPack | null> => {
  if (!cached) {
    cached = load().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
};

/** The covered qualifying session for a race page: the one whose qualifying set
 *  that race's grid. */
export const qualiSessionForRace = (pack: QualiLabPack, raceSessionId: string): QualiLabSession | null =>
  pack.sessions.find((session) => session.raceSessionIds.includes(raceSessionId)) ?? null;

const sessionForRace = (session: QualiLabSession, raceSessionId: string): QualiLabSession => {
  const grid = session.gridClassifications?.find((entry) => entry.raceSessionId === raceSessionId) ?? null;
  if (!grid) return session;
  return {
    ...session,
    combinedGridPosition: grid.combinedGridPosition,
    combinedFieldSize: grid.combinedFieldSize,
    officialBestLapSeconds: grid.officialBestLapSeconds,
    onTrackGroupRank: grid.groupRank ?? session.onTrackGroupRank,
    groupFieldSize: grid.groupFieldSize ?? session.groupFieldSize,
    doubleheaderRaceLabel: session.gridClassifications && session.gridClassifications.length > 1 ? grid.raceLabel : session.doubleheaderRaceLabel,
    rankAttribution: session.gridClassifications && session.gridClassifications.length > 1 ? 'doubleheader_bestlap' : session.rankAttribution,
    rankSource: grid.source
  };
};

/** Resolve a race page against the pack: prefer a covered qualifying module;
 *  otherwise, if this page is the uncaptured Race-2 sibling of a covered
 *  doubleheader weekend, return a quiet paired note (never the Race-1 ranks).
 *  Returns null when the weekend's qualifying is not in the lab at all. */
export const resolveQualiForRace = (pack: QualiLabPack, raceSessionId: string): QualiLabResolution | null => {
  const session = qualiSessionForRace(pack, raceSessionId);
  const coverageRace = pack.coverage.races?.find((entry) => entry.raceSessionId === raceSessionId) ?? null;
  if (session) {
    const gridClassification = session.gridClassifications?.find((entry) => entry.raceSessionId === raceSessionId) ?? null;
    return { session: sessionForRace(session, raceSessionId), pairedNote: null, coverage: pack.coverage, gridClassification, coverageRace };
  }

  for (const covered of pack.sessions) {
    const paired = covered.pairedUncapturedRaces.find((race) => race.raceSessionId === raceSessionId);
    if (paired) {
      return {
        session: null,
        pairedNote: {
          venueName: covered.venueName,
          seasonYear: covered.seasonYear,
          notedRaceLabel: paired.raceLabel,
          capturedRaceLabel: covered.doubleheaderRaceLabel,
          sourceTierLabel: covered.sourceTierLabel
        },
        coverage: pack.coverage,
        gridClassification: null,
        coverageRace
      };
    }
  }
  if (coverageRace) {
    return { session: null, pairedNote: null, coverage: pack.coverage, gridClassification: null, coverageRace };
  }
  return null;
};

/** Lazy hook keyed by a race session id — the pack only loads when a race page
 *  renders this, and an integrity failure leaves the module honestly empty
 *  (fail closed, never render unverified numbers). */
export const useQualiLabForRace = (raceSessionId: string): QualiLabResolution | null | 'failed' => {
  const [state, setState] = useState<{
    raceSessionId: string;
    value: QualiLabResolution | null | 'failed';
  }>({ raceSessionId, value: null });
  useEffect(() => {
    let alive = true;
    setState({ raceSessionId, value: null });
    loadQualiLab()
      .then((pack) => {
        if (alive) setState({ raceSessionId, value: pack ? resolveQualiForRace(pack, raceSessionId) : null });
      })
      .catch(() => {
        if (alive) setState({ raceSessionId, value: 'failed' });
      });
    return () => {
      alive = false;
    };
  }, [raceSessionId]);
  /* A route switch renders once before the effect above runs. Pair the value
   * with its key so that frame cannot show the prior visit's qualifying data. */
  return state.raceSessionId === raceSessionId ? state.value : null;
};

/* ---------- copy helpers (family-legible; denominators always labelled) ---------- */

/** "1:10.6418" or "26.194" — official qualifying lap-time formatting, tabular. */
export const formatLapTime = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return seconds.toFixed(3);
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** The grid outcome sentence, denominator labelled, doubleheader named:
 *  "Qualified 7th of 20 on the grid" / "Race 1 grid: 5th of 24". */
export const gridOutcomeSentence = (s: QualiLabSession): string | null => {
  if (s.combinedGridPosition === null || s.combinedFieldSize === null) return null;
  const lead = s.doubleheaderRaceLabel ? `${s.doubleheaderRaceLabel} grid: ` : 'Qualified ';
  return `${lead}${ordinal(s.combinedGridPosition)} of ${s.combinedFieldSize}`;
};

/** The on-track group sentence, its own denominator: "4th of 11 in his group". */
export const groupRankSentence = (s: QualiLabSession): string | null => {
  if (s.onTrackGroupRank === null || s.groupFieldSize === null) return null;
  const scope = s.isOval ? 'in the session' : 'in his group';
  return `${ordinal(s.onTrackGroupRank)} of ${s.groupFieldSize} ${scope}`;
};
