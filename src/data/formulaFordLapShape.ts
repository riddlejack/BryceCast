/** Formula Ford lap-shape pack loader.
 *
 *  2020 in the UK's Formula Ford — a year of racecraft. The only pace signal
 *  the archive holds is Bryce's OWN lap-analysis blocks (labeled Bryce-only,
 *  never a full-field trace), so this pack carries condition-split lap SHAPE:
 *  how tightly his laps sat to his own session best, by track condition, with
 *  the lap and session denominators attached. No opponent comparison, no
 *  cross-track pace claim.
 *
 *  It rides the same vite context-pack glob as the GB3 pack and enforces the
 *  same integrity contract: the pack is registered in the ui-data-package
 *  source inventory (screens.careerLab.formulaFordLapShapeRef) and this loader
 *  verifies raw-byte sha256 + pack id against that ref before returning
 *  anything, failing closed on mismatch. */

import { createSupplementalPackModule } from './supplementalPackLoader';
import { uiDataPackage } from './uiDataPackage';

export type FfWetDry = 'dry' | 'damp' | 'drying' | 'wet' | 'unknown';
export type FfSessionType = 'race' | 'qualifying' | 'heat';

/** One (session-type × condition) cell of Bryce's lap shape. `deltaToBest` is
 *  the median gap between a lap and that session's best lap — a within-session,
 *  track-length-agnostic read on rhythm/consistency. Absolute `bestLapSeconds`
 *  is context only (conditions fall at different circuits). */
export interface FfConditionShape {
  sessionType: FfSessionType;
  wetDry: FfWetDry;
  sessionCount: number;
  validLapCount: number;
  sourceLapRows: number;
  medianBestLapSeconds: number;
  medianSessionMedianLapSeconds: number;
  medianSessionDeltaToBestSeconds: number;
  sourceState: string;
}

export interface FormulaFordLapShapePack {
  id: string;
  generatedAt: string;
  sourceHash: string;
  fieldRelativePaceAvailable: boolean;
  counts: Record<string, number>;
  displayRules: string[];
  conditionContext: FfConditionShape[];
}

/** Inventory-backed integrity ref (id + path + sha256). Null when the package
 *  predates the module — the loader then returns null rather than loading an
 *  unverifiable pack. */
export const formulaFordLapShapeRef = () => uiDataPackage.screens.careerLab.formulaFordLapShapeRef ?? null;

const formulaFordModule = createSupplementalPackModule<FormulaFordLapShapePack>(
  formulaFordLapShapeRef,
  'Formula Ford lap-shape pack'
);

/** Load the pack once, hash-verified against the source-inventory ref through
 *  the one centralized supplemental-pack loader. Fails closed on a tampered
 *  pack; a failed load is NOT cached. */
export const loadFormulaFordLapShape = formulaFordModule.load;

/** Lazy hook — the pack only loads when the Formula Ford depth layer renders.
 *  An integrity failure leaves the layer honestly empty (fail closed). */
export const useFormulaFordLapShape = formulaFordModule.useSupplementalPack;
