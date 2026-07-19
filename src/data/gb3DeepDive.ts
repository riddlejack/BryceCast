/** GB3 deep-dive pack loader.
 *
 *  The two GB3 seasons (2021 Carlin, 2022 Hitech) are the career's longest
 *  junior chapter. This pack carries source-bounded result conversion, team
 *  result-order context, per-venue profiles, 2021 qualifying-to-race starts,
 *  and 2021 official condition strings — split by two source families that do
 *  not cover the same fields (2021 TSL PDFs vs 2022 GB3 JSON).
 *
 *  It rides the vite context-pack glob (src/data/packModules.ts) exactly like
 *  the IMSA Daytona chapter pack — page-scale detail that would bloat the main
 *  ui-data-package, loaded lazily only when the GB3 depth layer opens. The pack
 *  path already matches `analysis/**\/output/context-packs/**\/*.json`, so no
 *  build-ui-data-package registration is required. */

import { useEffect, useState } from 'react';
import { packModules } from './packModules';

export const GB3_PACK_PATH = 'analysis/gb3-deep-dive/output/context-packs/gb3-deep-dive-context.json';
const GB3_PACK_KEY = `../../${GB3_PACK_PATH}`;

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
}

let cached: Gb3DeepDivePack | null = null;

/** Load the GB3 pack once (module-level cache; the file is static). */
export const loadGb3DeepDive = async (): Promise<Gb3DeepDivePack | null> => {
  if (cached) return cached;
  const loader = packModules[GB3_PACK_KEY];
  if (!loader) return null;
  const module = (await loader()) as { default: Gb3DeepDivePack };
  cached = module.default;
  return cached;
};

/** Lazy hook for the GB3 depth layer — the pack only loads when a card renders
 *  this, so the closed chapter card costs nothing. */
export const useGb3DeepDive = (): Gb3DeepDivePack | null => {
  const [pack, setPack] = useState<Gb3DeepDivePack | null>(cached);
  useEffect(() => {
    if (pack) return;
    let alive = true;
    loadGb3DeepDive().then((loaded) => {
      if (alive) setPack(loaded);
    });
    return () => {
      alive = false;
    };
  }, [pack]);
  return pack;
};
