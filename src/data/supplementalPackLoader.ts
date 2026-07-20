/** The single verified supplemental-pack loader.
 *
 *  The GB3, Formula Ford, and IMSA Daytona depth packs each ride the vite
 *  context-pack glob (src/data/packModules.ts) and load lazily only when their
 *  chapter opens — but integrity is NOT optional. Each pack is registered in the
 *  ui-data-package source inventory (screens.careerLab.*Ref) with a byte size and
 *  a raw-byte sha256, and this ONE loader verifies raw bytes, byte length, and
 *  pack id against that ref before returning anything — failing closed on any
 *  mismatch (the raceStory integrity contract). Every depth pack goes through
 *  here; there is no second, unverified load path. */

import { useEffect, useState } from 'react';
import { packModules, packRawModules } from './packModules';

/** The shape of an inventory integrity ref (screens.careerLab.gb3DeepDiveRef &
 *  friends). `type` narrows per pack in the package types; here it is a plain
 *  string so one loader serves all of them. */
export interface SupplementalPackRef {
  id: string;
  type: string;
  path: string;
  bytes: number;
  modifiedAt: string;
  sha256: string;
}

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

/** Load one supplemental pack, hash-verified against its inventory ref.
 *
 *  Returns null only when the ref is absent (the package predates the module) or
 *  the pack is not in the glob — an un-registered pack is never loaded
 *  unverified. Throws on ANY integrity mismatch (sha256, byte length, or pack
 *  id) so a tampered or stale pack fails closed rather than rendering. */
export const loadVerifiedSupplementalPack = async <TPack extends { id: string }>(
  ref: SupplementalPackRef | null,
  label: string
): Promise<TPack | null> => {
  if (!ref) return null;
  const key = `../../${ref.path}`;
  const jsonLoader = packModules[key];
  const rawLoader = packRawModules[key];
  if (!jsonLoader || !rawLoader) return null;
  const pack = ((await jsonLoader()) as { default: TPack }).default;
  const rawText = (await rawLoader()) as string;
  const actualSha256 = await sha256Hex(rawText);
  if (actualSha256 !== ref.sha256) {
    throw new Error(`${label} integrity mismatch (sha256): ${ref.path}`);
  }
  if (new TextEncoder().encode(rawText).byteLength !== ref.bytes) {
    throw new Error(`${label} integrity mismatch (bytes): ${ref.path}`);
  }
  if (pack.id !== ref.id) {
    throw new Error(`${label} integrity mismatch (id): ${ref.path}`);
  }
  return pack;
};

/** Build a once-cached, fail-closed loader and a lazy React hook for a
 *  supplemental pack. A failed load is NOT cached, so a later attempt
 *  re-verifies rather than replaying the rejection. The hook returns null while
 *  loading (or when the pack is absent) and 'failed' on an integrity rejection,
 *  so a screen can fail closed rather than render unverified numbers. */
export const createSupplementalPackModule = <TPack extends { id: string }>(
  refAccessor: () => SupplementalPackRef | null,
  label: string
): {
  load: () => Promise<TPack | null>;
  useSupplementalPack: () => TPack | null | 'failed';
} => {
  let cached: Promise<TPack | null> | null = null;

  const load = (): Promise<TPack | null> => {
    if (!cached) {
      cached = loadVerifiedSupplementalPack<TPack>(refAccessor(), label).catch((error) => {
        cached = null;
        throw error;
      });
    }
    return cached;
  };

  const useSupplementalPack = (): TPack | null | 'failed' => {
    const [pack, setPack] = useState<TPack | null | 'failed'>(null);
    useEffect(() => {
      let alive = true;
      load()
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

  return { load, useSupplementalPack };
};
