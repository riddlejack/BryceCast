/** Quali & Practice Lab run-by-run loader (Brief M, first slice).
 *
 *  The UI reads run-by-run qualifying through THIS interface only. It is sized
 *  for the full Quali & Practice Lab (adapter-contract law): `trafficContext`,
 *  `theoreticalBestSeconds`, and `trackEvolutionCurve` are v2 fields a later
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

export type QualiSource = 'racetools' | 'timing71';
export type QualiSourceTier = 'racetools_capture' | 'timing71_normalized';
export type QualiLapKind = 'flying' | 'support';

export interface QualiLap {
  seq: number;
  lapIndex: number | null;
  seconds: number;
  kind: QualiLapKind;
  isPersonalBest: boolean;
  runningBestSeconds: number;
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
  sessionBestMoves: number;
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
  rankAttribution: 'single' | 'doubleheader_bestlap';
  rankSource: string;

  /* validation echoes */
  semanticClassificationPosition: number | null;
  positionCrossCheck: 'match' | 'mismatch' | 'na';

  /* v2 fields (full Quali & Practice Lab) — filled by a lake producer later */
  trafficContext: unknown | null;
  theoreticalBestSeconds: number | null;
  trackEvolutionCurve: unknown | null;
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
  coverage: { coveredSessions: number; excludedSessions: number; bySeasonSource: Record<string, number> };
  sessions: QualiLabSession[];
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

/** Lazy hook keyed by a race session id — the pack only loads when a race page
 *  renders this, and an integrity failure leaves the module honestly empty
 *  (fail closed, never render unverified numbers). */
export const useQualiLabForRace = (raceSessionId: string): QualiLabSession | null | 'failed' => {
  const [state, setState] = useState<QualiLabSession | null | 'failed'>(null);
  useEffect(() => {
    let alive = true;
    loadQualiLab()
      .then((pack) => {
        if (alive) setState(pack ? qualiSessionForRace(pack, raceSessionId) : null);
      })
      .catch(() => {
        if (alive) setState('failed');
      });
    return () => {
      alive = false;
    };
  }, [raceSessionId]);
  return state;
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
