/** GB3 deep-dive pack loader.
 *
 *  The two GB3 seasons (2021 Carlin, 2022 Hitech) are the career's longest
 *  junior chapter. This pack carries source-bounded result conversion, team
 *  result-order context, per-venue profiles, 2021 qualifying-to-race starts,
 *  and 2021 official condition strings — split by two source families that do
 *  not cover the same fields (2021 TSL PDFs vs 2022 GB3 JSON).
 *
 *  It rides the vite context-pack glob (src/data/packModules.ts) and loads
 *  lazily only when the GB3 depth layer opens — but integrity is NOT optional:
 *  the pack is registered in the ui-data-package source inventory
 *  (screens.careerLab.gb3DeepDiveRef) and this loader verifies raw-byte
 *  sha256 + pack id against that ref before returning anything, failing
 *  closed on mismatch (the raceStory loader pattern). */

import { useEffect, useState } from 'react';
import { packModules, packRawModules } from './packModules';
import { uiDataPackage } from './uiDataPackage';

export type Gb3SourceFamily = '2021 TSL official PDFs' | '2022 GB3 official JSON';
export type Gb3WetDry = 'dry' | 'wet' | 'damp' | 'drying';

export interface Gb3RaceResult {
  seasonYear: number;
  sessionId: string;
  eventName: string;
  raceNumber: number;
  sessionName: string;
  trackName: string;
  fieldSize: number | null;
  startPosition: number | null;
  finishPosition: number | null;
  finishPercentile: number | null;
  positionGain: number | null;
  qPrimaryPosition: number | null;
  status: string;
  points: number | null;
  sourceFamily: Gb3SourceFamily;
}

export interface Gb3TeamContext {
  seasonYear: number;
  sessionId: string;
  eventName: string;
  raceNumber: number;
  sessionName: string;
  trackName: string;
  bryceFinishPosition: number | null;
  bryceWithinTeamRank: number | null;
  teamName: string;
  teamRaceDriverCount: number;
  teammateCount: number;
  teammateMedianFinish: number | null;
  sourceFamily: Gb3SourceFamily;
}

export interface Gb3TrackProfile {
  trackName: string;
  trackType: string;
  raceRows: number;
  bestFinish: number;
  avgFinish: number;
  avgFinishPercentile: number;
  startKnownRows: number;
  avgPositionGainWhenStartKnown: number | null;
  cornerCount: number | null;
  direction: string | null;
  years: string;
}

export interface Gb3Weather {
  seasonYear: number;
  sessionType: string;
  wetDry: Gb3WetDry;
  trackConditionRaw: string;
  ambientConditionRaw: string;
}

export interface Gb3SourceFamilyReadiness {
  sourceFamily: string;
  seasonYear: number | string;
  events: number;
  sessions: number;
  bryceRaceRows: number;
  gridStartRaceRows: number;
  weatherConditionRows: number;
  lapSampleRows: number;
  sectionMetricRows: number;
  caveat: string;
}

/** One qualifying appearance — 2021 from dedicated TSL PDF classifications,
 *  2022 read from the qualifying-session result rows (the JSON feed carries no
 *  dedicated qualifying table). `gapToPole` is the official seconds behind pole
 *  as a display string; `position` is the qualifying grid slot. */
export interface Gb3QualifyingContext {
  seasonYear: number;
  sessionId: string;
  eventId: string;
  eventName: string;
  sessionName: string;
  sessionSegment: string;
  position: number | null;
  gapToPole: string | null;
  bestLapTime: string | null;
  fieldSize: number | null;
  sourceState: string;
  sourceTable: string;
  confidence: string;
  caveat: string;
}

/** One event (round) rolled up: best qualifying slot and best race finish plus
 *  the share of the field beaten, so a season can be read round by round without
 *  blending the two source families. */
export interface Gb3EventSummary {
  seasonYear: number;
  eventName: string;
  trackName: string;
  sourceFamily: Gb3SourceFamily;
  sourceState: string;
  raceRows: number;
  avgFinish: number | null;
  bestFinish: number | null;
  avgFinishPercentile: number | null;
  avgPositionGainWhenStartKnown: number | null;
  bestQualifyingPosition: number | null;
  top5Count: number;
  top10Count: number;
  points: number | null;
  weatherDrySessions: number;
  weatherWetSessions: number;
}

export interface Gb3DeepDivePack {
  id: string;
  generatedAt: string;
  sourceHash: string;
  sourceFamilies: Gb3SourceFamily[];
  sourceFamilyReadiness: Gb3SourceFamilyReadiness[];
  displayRules: string[];
  counts: Record<string, number>;
  lapShapeAvailable: boolean;
  sectionPaceAvailable: boolean;
  raceResults: Gb3RaceResult[];
  teamContext: Gb3TeamContext[];
  trackProfile: Gb3TrackProfile[];
  weatherContext: Gb3Weather[];
  qualifyingContext: Gb3QualifyingContext[];
  eventSummary: Gb3EventSummary[];
}

/** The inventory-backed integrity ref for the GB3 pack (id + path + sha256).
 *  Null when the package predates the GB3 module — the loader then returns
 *  null rather than loading an unverifiable pack. */
export const gb3DeepDiveRef = () => uiDataPackage.screens.careerLab.gb3DeepDiveRef ?? null;

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const load = async (): Promise<Gb3DeepDivePack | null> => {
  const ref = gb3DeepDiveRef();
  if (!ref) return null;
  const key = `../../${ref.path}`;
  const jsonLoader = packModules[key];
  const rawLoader = packRawModules[key];
  if (!jsonLoader || !rawLoader) return null;
  const pack = ((await jsonLoader()) as { default: Gb3DeepDivePack }).default;
  const rawText = (await rawLoader()) as string;
  if ((await sha256Hex(rawText)) !== ref.sha256 || pack.id !== ref.id) {
    throw new Error(`GB3 deep-dive pack integrity mismatch: ${ref.path}`);
  }
  return pack;
};

let cached: Promise<Gb3DeepDivePack | null> | null = null;

/** Load the GB3 pack once, hash-verified against the source-inventory ref.
 *  Fails closed (throws) on a tampered pack; a failed load is NOT cached, so a
 *  later attempt re-verifies rather than replaying the rejection. */
export const loadGb3DeepDive = (): Promise<Gb3DeepDivePack | null> => {
  if (!cached) {
    cached = load().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
};

/** Lazy hook for the GB3 depth layer — the pack only loads when a card renders
 *  this, so the closed chapter card costs nothing. An integrity failure leaves
 *  the layer honestly empty (fail closed, never render unverified numbers). */
export const useGb3DeepDive = (): Gb3DeepDivePack | null | 'failed' => {
  const [pack, setPack] = useState<Gb3DeepDivePack | null | 'failed'>(null);
  useEffect(() => {
    let alive = true;
    loadGb3DeepDive()
      .then((loaded) => {
        if (alive) setPack(loaded);
      })
      .catch(() => {
        if (alive) setPack('failed');
      });
    return () => {
      alive = false;
    };
  }, []);
  return pack;
};
