/** IMSA Daytona stint/co-driver pack loader.
 *
 *  One race, twenty-four hours: the Rolex 24 at Daytona 2025 in the No. 85 GTP
 *  Porsche. This pack carries the official Al Kamel time-card derivation of
 *  Bryce's own stints, the car-85 co-driver roster, and class/hour context.
 *
 *  The earlier Daytona card imported this pack directly with no integrity gate
 *  (the audit flagged it). This loader closes that: the pack is registered in
 *  the ui-data-package source inventory (screens.careerLab.imsaStintRef) and
 *  verified by raw-byte sha256 + id before anything renders, failing closed on
 *  mismatch (the GB3 / raceStory pattern). */

import { useEffect, useState } from 'react';
import { packModules, packRawModules } from './packModules';
import { uiDataPackage } from './uiDataPackage';

/** One of Bryce's stints, derived from pit-in/out laps on the official time
 *  card. Session hour is the integer hour-of-race; `medianValidNonPitLapSeconds`
 *  excludes Al Kamel invalid and pit laps (but does not prove clean traffic). */
export interface ImsaStint {
  stintId: string;
  sessionId: string;
  driverStintIndex: number;
  startLap: number;
  endLap: number;
  startSessionHour: number;
  endSessionHour: number;
  lapCount: number;
  validLapCount: number;
  validNonPitLapCount: number;
  medianValidNonPitLapSeconds: number | null;
  bestValidLapSeconds: number | null;
}

/** One driver of car 85. `role` is either 'Bryce' or 'co-driver'. Pace fields
 *  exist but are presented as collective context only — never a per-driver
 *  verdict. */
export interface ImsaCoDriver {
  driverName: string;
  role: string;
  lapCount: number;
  validNonPitLapCount: number;
  stintCount: number;
  lapShareOfCar85: number;
  best20LapAverageSeconds: number | null;
}

export interface ImsaCar85Result {
  carNumber: string;
  class: string;
  classFinishPosition: number | null;
  finishPosition: number | null;
  lapsCompleted: number | null;
  pitStops: number | null;
  vehicle: string | null;
  teamName: string | null;
  bestLapTime: string | null;
  status: string | null;
}

export interface ImsaDaytonaStintPack {
  id: string;
  generatedAt: string;
  sourceHash: string;
  counts: Record<string, number>;
  displayRules: string[];
  positionTraceAvailable: boolean;
  car85Result: ImsaCar85Result;
  bryceStintContext: ImsaStint[];
  car85CodriverPace: ImsaCoDriver[];
}

/** Inventory-backed integrity ref. Null when the package predates the module. */
export const imsaStintRef = () => uiDataPackage.screens.careerLab.imsaStintRef ?? null;

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const load = async (): Promise<ImsaDaytonaStintPack | null> => {
  const ref = imsaStintRef();
  if (!ref) return null;
  const key = `../../${ref.path}`;
  const jsonLoader = packModules[key];
  const rawLoader = packRawModules[key];
  if (!jsonLoader || !rawLoader) return null;
  const pack = ((await jsonLoader()) as { default: ImsaDaytonaStintPack }).default;
  const rawText = (await rawLoader()) as string;
  if ((await sha256Hex(rawText)) !== ref.sha256 || pack.id !== ref.id) {
    throw new Error(`IMSA Daytona stint pack integrity mismatch: ${ref.path}`);
  }
  return pack;
};

let cached: Promise<ImsaDaytonaStintPack | null> | null = null;

/** Load the pack once, hash-verified against the source-inventory ref. Fails
 *  closed (throws) on a tampered pack; a failed load is NOT cached. */
export const loadImsaDaytonaStint = (): Promise<ImsaDaytonaStintPack | null> => {
  if (!cached) {
    cached = load().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
};

/** Lazy hook — an integrity failure surfaces as 'failed' so the chapter can
 *  fail closed rather than render unverified numbers. */
export const useImsaDaytonaStint = (): ImsaDaytonaStintPack | null | 'failed' => {
  const [pack, setPack] = useState<ImsaDaytonaStintPack | null | 'failed'>(null);
  useEffect(() => {
    let alive = true;
    loadImsaDaytonaStint()
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
