import { uiDataPackage, type UiPassMarkRef } from './uiDataPackage';
import { packModules, packRawModules } from './packModules';
import { passSpanAnchor, type TrackSectionAnchorSet } from '../assets/tracks/sections';

/** Pass-mark packs (heat-map v2, item 7): every `on_track_green` Bryce-involving
 *  pass in a GO race, bracketed to the between-loop interval where it happened,
 *  with the other car resolved to a name. Produced by
 *  analysis/track-position/build-pass-marks.mjs and loaded here with sha256
 *  integrity against the package refs. CONDITIONAL/NO-GO races carry no pack —
 *  the UI shows no marks and no mention there. */

export interface PassMarkPassRow {
  lap: number;
  /** 'gain' = Bryce passed the other car; 'loss' = the other car passed him. */
  direction: 'gain' | 'loss';
  otherCar: string;
  otherName: string;
  fromLoop: string;
  toLoop: string;
  intervalLabel: string;
}

export interface PassMarksPack {
  schemaVersion: string;
  type: 'pass_marks';
  id: string;
  sessionId: string;
  feedSessionId: string;
  venueName: string;
  seasonYear: number | null;
  bryceCar: string;
  verdict: 'GO';
  pairwiseConcordancePct: number;
  greenPasses: PassMarkPassRow[];
  reshuffleCounts: { pit_cycle: number; caution: number };
  sourceTier: string;
  sourceRefs: Array<{ key: string; path: string; note: string }>;
  caveats: string[];
}

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const refs = (): UiPassMarkRef[] => uiDataPackage.screens.raceDebrief.passMarkRefs ?? [];

const refFor = (sessionId: string): UiPassMarkRef | null =>
  refs().find((ref) => ref.sessionId === sessionId) ?? null;

const cache = new Map<string, Promise<PassMarksPack | null>>();

export const loadPassMarks = (sessionId: string): Promise<PassMarksPack | null> => {
  const existing = cache.get(sessionId);
  if (existing) return existing;
  const promise = (async (): Promise<PassMarksPack | null> => {
    const ref = refFor(sessionId);
    if (!ref) return null;
    const key = `../../${ref.path}`;
    const jsonLoader = packModules[key];
    const rawLoader = packRawModules[key];
    if (!jsonLoader || !rawLoader) return null;
    const pack = ((await jsonLoader()) as { default: PassMarksPack }).default;
    const rawText = (await rawLoader()) as string;
    if ((await sha256Hex(rawText)) !== ref.sha256 || pack.id !== ref.id || pack.sessionId !== sessionId) {
      throw new Error(`Pass-mark pack integrity mismatch: ${ref.path}`);
    }
    return pack;
  })();
  cache.set(sessionId, promise);
  return promise;
};

/** A green Bryce pass joined to the span it happened on, ready to draw. */
export interface ResolvedPassMark {
  id: string;
  /** The span (from the active anchor set) whose midpoint carries the mark. */
  startT: number;
  endT: number;
  lap: number;
  direction: 'gain' | 'loss';
  otherName: string;
}

/** Join each green pass to its bracketed interval's span on the ACTIVE anchor
 *  set. A pass whose interval doesn't correspond to a drawn span (e.g. a sub-
 *  loop the curated chain merges) resolves to no mark — honestly undrawn. */
export const resolvePassMarks = (
  anchors: TrackSectionAnchorSet,
  pack: PassMarksPack
): ResolvedPassMark[] =>
  pack.greenPasses
    .map((pass, index): ResolvedPassMark | null => {
      const anchor = passSpanAnchor(anchors, pass.fromLoop, pass.toLoop);
      if (!anchor) return null;
      return {
        id: `${pass.lap}-${pass.otherCar}-${pass.direction}-${index}`,
        startT: anchor.startT,
        endT: anchor.endT,
        lap: pass.lap,
        direction: pass.direction,
        otherName: pass.otherName
      };
    })
    .filter((mark): mark is ResolvedPassMark => mark !== null);
