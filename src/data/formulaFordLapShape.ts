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

import { useEffect, useState } from 'react';
import { packModules, packRawModules } from './packModules';
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

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const load = async (): Promise<FormulaFordLapShapePack | null> => {
  const ref = formulaFordLapShapeRef();
  if (!ref) return null;
  const key = `../../${ref.path}`;
  const jsonLoader = packModules[key];
  const rawLoader = packRawModules[key];
  if (!jsonLoader || !rawLoader) return null;
  const pack = ((await jsonLoader()) as { default: FormulaFordLapShapePack }).default;
  const rawText = (await rawLoader()) as string;
  if ((await sha256Hex(rawText)) !== ref.sha256 || pack.id !== ref.id) {
    throw new Error(`Formula Ford lap-shape pack integrity mismatch: ${ref.path}`);
  }
  return pack;
};

let cached: Promise<FormulaFordLapShapePack | null> | null = null;

/** Load the pack once, hash-verified against the source-inventory ref. Fails
 *  closed (throws) on a tampered pack; a failed load is NOT cached. */
export const loadFormulaFordLapShape = (): Promise<FormulaFordLapShapePack | null> => {
  if (!cached) {
    cached = load().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
};

/** Lazy hook — the pack only loads when the Formula Ford depth layer renders.
 *  An integrity failure leaves the layer honestly empty (fail closed). */
export const useFormulaFordLapShape = (): FormulaFordLapShapePack | null | 'failed' => {
  const [pack, setPack] = useState<FormulaFordLapShapePack | null | 'failed'>(null);
  useEffect(() => {
    let alive = true;
    loadFormulaFordLapShape()
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
