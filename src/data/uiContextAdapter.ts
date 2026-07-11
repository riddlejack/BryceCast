import type { UiDataPackage, UiLiveFixture, UiRoadAmericaPrepEvent, UiDebriefSeed, UiSourceRef } from './uiDataPackage';

export interface ContextPackRef {
  bytes: number;
  eventId?: string;
  id: string;
  modifiedAt?: string;
  path: string;
  roundIndex?: number;
  seasonYear?: number;
  sessionId?: string;
  sha256: string;
  sourceRefs: string[];
  type: 'upcoming_event' | 'race_debrief' | 'career_lab' | 'live_race_day';
}

export interface IntegrityRef {
  bytes: number;
  path: string;
  sha256: string;
}

export interface ContextPackManifest {
  asOfDate: string;
  generatedAt: string;
  packCounts: {
    career_lab: number;
    live_race_day: number;
    race_debrief: number;
    upcoming_event: number;
  };
  packs: ContextPackRef[];
  repoHead: string;
  schemaVersion: string;
  sourceHash: string;
  sourceRefs: Array<Record<string, string | number>>;
  upstreamCoverage: Record<string, unknown>;
}

export interface UiChartSpec {
  displayPolicy?: string;
  fields?: string[];
  filter?: Record<string, string>;
  id: string;
  source?: string;
  type: string;
}

export interface PredictionBand {
  calibrationState: string;
  claimStrength: 'source_bounded_historical_prior_band' | string;
  confidence: string;
  finishPercentileBand: {
    median: number;
    n: number;
    p25: number;
    p75: number;
  };
  modelPolicy: string;
  scorecardRef: string;
  target: string;
  top10Policy: string;
}

export interface Top10PathItem {
  actionableRead: string;
  currentState: string;
  factor: string;
  whyItMatters: string;
}

export interface AnalogRace {
  analogType: string;
  analogyBasis: string;
  confidence: string;
  finishPercentile?: number | null;
  finishPosition?: number | null;
  historicalOutcomePolicy?: string;
  positionGain?: number | null;
  raceLabel: string;
  seasonYear?: number | null;
  sessionId: string;
  startPosition?: number | null;
  trackName: string;
  trackType: string;
}

export interface UpcomingEventContextPack {
  analogRaces: AnalogRace[];
  analogSelectionPolicy: string[];
  asOfDate: string;
  careerPriorContext: Record<string, unknown>;
  caveats: string[];
  chartSpecs: UiChartSpec[];
  eventId: string;
  eventName: string;
  eventStartDate: string;
  generatedAt: string;
  id: string;
  predictionBand: PredictionBand;
  prepUpdateHooks: string[];
  sameTrackHistory: Record<string, number | string | null>;
  schemaVersion: string;
  sourceHash: string;
  sourceRefs: Array<Record<string, string | number>>;
  top10Path: Top10PathItem[];
  track: Record<string, string | number | null>;
  trackTypeHistory: Record<string, number | string | null>;
  type: 'upcoming_event';
  weatherState: string;
}

export interface RaceContext {
  bryceIncidentCount: number | null;
  brycePenaltyCount: number | null;
  leaderEntropy: number | null;
  sessionIncidentCount: number | null;
  sessionPenaltyCount: number | null;
  topLeader: string | null;
  topLeaderShare: number | null;
  weatherContext: string | null;
}

export interface RaceDebriefContextPack {
  caveats: string[];
  chartSpecs: UiChartSpec[];
  confidence: string;
  conversion: Record<string, string | number | null>;
  generatedAt: string;
  id: string;
  lapStory: Record<string, string | number | null>;
  outcome: Record<string, string | number | null>;
  raceContext: RaceContext;
  raceLabel: string;
  raceOrder: number | { roundIndex: number; seasonYear: number; source?: string };
  schemaVersion: string;
  seasonYear: number;
  sectionSignal: Record<string, string | number | null>;
  sessionId: string;
  sourceHash: string;
  sourceRefs: Array<Record<string, string | number>>;
  sourceState: string;
  teamContext: Record<string, string | number | null>;
  track: Record<string, string>;
  type: 'race_debrief';
}

export interface CareerLabContextPack {
  careerPriorMatrixPath: string;
  caveats: string[];
  chartSpecs: UiChartSpec[];
  generatedAt: string;
  id: string;
  metricFamilyParity: Array<Record<string, string>>;
  resultConversion: Array<Record<string, string>>;
  resultConversionRows: number;
  schemaVersion: string;
  seriesSummary: Array<Record<string, string>>;
  sourceFamilyRules: string[];
  sourceHash: string;
  sourceRefs: Array<Record<string, string | number>>;
  topCareerStories: Array<Record<string, string>>;
  type: 'career_lab';
}

export interface LiveRaceDayContextPack {
  caveats: string[];
  currentLocalEvidence: Record<string, unknown>;
  featureFlags: Record<string, unknown>;
  generatedAt: string;
  id: string;
  replayQuality: Record<string, unknown>;
  runtimeBoundary: Record<string, unknown>;
  schemaVersion: string;
  sourceHash: string;
  sourceRefs: Array<Record<string, string | number>>;
  type: 'live_race_day';
  validationGates: Array<Record<string, string>>;
}

export type SupplementalContextPack = Record<string, unknown> & { schemaVersion?: string };

export type RawUpcomingPrepEvent = UiRoadAmericaPrepEvent;

export interface HydratedUpcomingPrepEvent extends RawUpcomingPrepEvent {
  contextPack: UpcomingEventContextPack;
}

export interface HydratedDebriefSeed extends UiDebriefSeed {
  contextPackRef: ContextPackRef;
  contextPack: RaceDebriefContextPack;
}

export interface HydratedBryceCastUiContext {
  contextPackManifest: ContextPackManifest;
  contextPackIntegrity: {
    algorithm: 'sha256';
    checkedPaths: string[];
    checkedRefs: number;
  };
  dataPackage: UiDataPackage;
  liveCompanion: {
    caveats: string[];
    contextPack: LiveRaceDayContextPack;
    fixtures: UiLiveFixture[];
    requiredStates: UiLiveFixture['state'][];
  };
  upcomingPrep: {
    caveats: string[];
    events: HydratedUpcomingPrepEvent[];
    raceLapContext: SupplementalContextPack | null;
    sectionContext: SupplementalContextPack | null;
    sourceRefs: UiSourceRef[];
    title: string;
  };
  raceDebrief: {
    caveats: string[];
    featuredDebriefs: HydratedDebriefSeed[];
    sourceRefs: UiSourceRef[];
    title: string;
  };
  careerLab: {
    caveats: string[];
    contextPack: CareerLabContextPack;
    deepContextPacks: {
      careerDimension: SupplementalContextPack | null;
      contextEventNarrative: SupplementalContextPack | null;
      formulaFordLapShape: SupplementalContextPack | null;
      imsaDaytonaStint: SupplementalContextPack | null;
    };
    sourceRefs: UiSourceRef[];
    title: string;
  };
  sourceOps: UiDataPackage['screens']['sourceOps'];
}

/* ------------------------------------------------------------------
   Glob-based pack loading. Any pack referenced by the package/manifest
   resolves by path — new venues and new debriefs need no code change.
   ------------------------------------------------------------------ */

import { manifestModules, manifestRawModules, packModules, packRawModules } from './packModules';

const toModuleKey = (repoPath: string) => `../../${repoPath}`;

const loadPackJson = async <T>(repoPath: string): Promise<T> => {
  const loader = packModules[toModuleKey(repoPath)];
  if (!loader) throw new Error(`No context pack module found for ${repoPath}`);
  const module = (await loader()) as { default: T };
  return module.default;
};

const loadPackRaw = async (repoPath: string): Promise<string> => {
  const loader = packRawModules[toModuleKey(repoPath)];
  if (!loader) throw new Error(`No raw context pack module found for ${repoPath}`);
  return (await loader()) as string;
};

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const validateRawIntegrity = async (rawText: string, ref: IntegrityRef, label: string) => {
  const actualSha256 = await sha256Hex(rawText);
  const actualBytes = new TextEncoder().encode(rawText).byteLength;
  if (actualSha256 !== ref.sha256) {
    throw new Error(`SHA-256 mismatch for ${label}: ${ref.path}`);
  }
  if (actualBytes !== ref.bytes) {
    throw new Error(`Byte-size mismatch for ${label}: ${ref.path}`);
  }
};

const getContextPack = async <TPack extends { id: string; type: string }>(ref: ContextPackRef, label: string): Promise<TPack> => {
  const [pack, rawText] = await Promise.all([loadPackJson<TPack>(ref.path), loadPackRaw(ref.path)]);
  await validateRawIntegrity(rawText, ref, label);
  if (pack.id !== ref.id || pack.type !== ref.type) {
    throw new Error(`Context pack identity mismatch for ${label}: ${ref.path}`);
  }
  if (ref.eventId && 'eventId' in pack && String((pack as Record<string, unknown>).eventId) !== ref.eventId) {
    throw new Error(`Context pack eventId mismatch for ${label}: ${ref.path}`);
  }
  if (ref.sessionId && 'sessionId' in pack && String((pack as Record<string, unknown>).sessionId) !== ref.sessionId) {
    throw new Error(`Context pack sessionId mismatch for ${label}: ${ref.path}`);
  }
  return pack;
};

/** Integrity-checked when the package's sourceInventory records the ref; otherwise soft-loaded. */
const loadSupplementalPack = async (
  repoPath: string | undefined,
  inventoryRef: IntegrityRef | undefined,
  checked: string[]
): Promise<SupplementalContextPack | null> => {
  const path = inventoryRef?.path ?? repoPath;
  if (!path || !packModules[toModuleKey(path)]) return null;
  const pack = await loadPackJson<SupplementalContextPack>(path);
  if (inventoryRef) {
    const rawText = await loadPackRaw(path);
    await validateRawIntegrity(rawText, inventoryRef, path);
    checked.push(path);
  }
  return pack;
};

const loadManifest = async (ref: IntegrityRef): Promise<ContextPackManifest> => {
  const [moduleLoader] = Object.values(manifestModules);
  const [rawLoader] = Object.values(manifestRawModules);
  if (!moduleLoader || !rawLoader) throw new Error('Context-pack manifest module missing');
  const manifest = ((await moduleLoader()) as { default: unknown }).default;
  const rawText = (await rawLoader()) as string;
  await validateRawIntegrity(rawText, ref, 'context-pack manifest');
  return manifest as ContextPackManifest;
};

const getManifestPackByType = (manifest: ContextPackManifest, type: ContextPackRef['type']) => {
  const pack = manifest.packs.find((candidate) => candidate.type === type);
  if (!pack) throw new Error(`Context-pack manifest is missing type ${type}`);
  return pack;
};

interface PrepScreenShape {
  title: string;
  readiness: string;
  events: RawUpcomingPrepEvent[];
  caveats: string[];
  sourceRefs: UiSourceRef[];
}

const getPrepScreenFromPackage = (dataPackage: UiDataPackage): PrepScreenShape => {
  const screens = dataPackage.screens as unknown as Record<string, unknown>;
  return (screens.upcomingPrep ?? screens.roadAmericaPrep) as PrepScreenShape;
};

export const buildBryceCastUiContext = async (): Promise<HydratedBryceCastUiContext> => {
  const { uiDataPackage } = await import('./uiDataPackage');
  const inventory = uiDataPackage.sourceInventory;
  const manifest = await loadManifest(inventory.predictiveContextPackManifest);
  const prepScreen = getPrepScreenFromPackage(uiDataPackage);
  const raceDebrief = uiDataPackage.screens.raceDebrief;
  const careerLab = uiDataPackage.screens.careerLab as UiDataPackage['screens']['careerLab'] & { contextPackRef: ContextPackRef };
  const livePackRef = getManifestPackByType(manifest, 'live_race_day');

  const prepEventRefs = prepScreen.events.map((event) => event.contextPackRef as ContextPackRef);
  const debriefSeeds = raceDebrief.featuredDebriefs as Array<UiDebriefSeed & { contextPackRef: ContextPackRef }>;
  const checkedContextPackRefs: ContextPackRef[] = [livePackRef, ...prepEventRefs, ...debriefSeeds.map((seed) => seed.contextPackRef), careerLab.contextPackRef];
  const supplementalChecked: string[] = [];

  const [liveContextPack, hydratedPrepEvents, hydratedDebriefs, careerContextPack, sectionContext, raceLapContext, careerDimension, contextEventNarrative, formulaFordLapShape, imsaDaytonaStint] =
    await Promise.all([
      getContextPack<LiveRaceDayContextPack>(livePackRef, 'live race-day'),
      Promise.all(
        prepScreen.events.map(async (event) => ({
          ...event,
          contextPack: await getContextPack<UpcomingEventContextPack>(event.contextPackRef as ContextPackRef, event.eventName)
        }))
      ),
      Promise.all(
        debriefSeeds.map(async (seed) => ({
          ...seed,
          contextPack: await getContextPack<RaceDebriefContextPack>(seed.contextPackRef, seed.raceLabel)
        }))
      ),
      getContextPack<CareerLabContextPack>(careerLab.contextPackRef, 'Career Lab'),
      loadSupplementalPack(undefined, inventory.supplementalPrepSectionContextPack, supplementalChecked),
      loadSupplementalPack(undefined, inventory.supplementalRaceLapSectionContextPack, supplementalChecked),
      loadSupplementalPack('analysis/career-dimension-context-layer/output/context-packs/career-dimension-context.json', undefined, supplementalChecked),
      loadSupplementalPack('analysis/context-event-narrative-layer/output/context-packs/context-event-narrative-context.json', undefined, supplementalChecked),
      loadSupplementalPack('analysis/formula-ford-lap-shape/output/context-packs/formula-ford-lap-shape-context.json', undefined, supplementalChecked),
      loadSupplementalPack('analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json', undefined, supplementalChecked)
    ]);

  return {
    contextPackManifest: manifest,
    contextPackIntegrity: {
      algorithm: 'sha256',
      checkedPaths: [inventory.predictiveContextPackManifest.path, ...checkedContextPackRefs.map((ref) => ref.path), ...supplementalChecked],
      checkedRefs: checkedContextPackRefs.length + supplementalChecked.length + 1
    },
    dataPackage: uiDataPackage,
    liveCompanion: {
      caveats: uiDataPackage.screens.liveCompanionFixtures.caveats,
      contextPack: liveContextPack,
      fixtures: uiDataPackage.screens.liveCompanionFixtures.fixtures,
      requiredStates: uiDataPackage.screens.liveCompanionFixtures.requiredStates
    },
    upcomingPrep: {
      caveats: prepScreen.caveats,
      events: hydratedPrepEvents,
      raceLapContext,
      sectionContext,
      sourceRefs: prepScreen.sourceRefs,
      title: prepScreen.title
    },
    raceDebrief: {
      caveats: raceDebrief.caveats,
      featuredDebriefs: hydratedDebriefs,
      sourceRefs: raceDebrief.sourceRefs,
      title: raceDebrief.title
    },
    careerLab: {
      caveats: careerLab.caveats,
      contextPack: careerContextPack,
      deepContextPacks: {
        careerDimension,
        contextEventNarrative,
        formulaFordLapShape,
        imsaDaytonaStint
      },
      sourceRefs: careerLab.sourceRefs,
      title: careerLab.title
    },
    sourceOps: uiDataPackage.screens.sourceOps
  };
};

let hydratedContextPromise: Promise<HydratedBryceCastUiContext> | null = null;

export const loadBryceCastUiContext = () => {
  hydratedContextPromise ??= buildBryceCastUiContext();
  return hydratedContextPromise;
};
