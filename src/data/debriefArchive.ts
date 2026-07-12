import { uiDataPackage } from './uiDataPackage';
import {
  type ContextPackManifest,
  type ContextPackRef,
  type RaceDebriefContextPack
} from './uiContextAdapter';
import { manifestModules, manifestRawModules, packModules, packRawModules } from './packModules';

/** Full race-debrief archive: every completed INDY NXT race, hydrated from the
 *  manifest with sha256 integrity checks. Loaded lazily (Races surfaces only). */

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const loadManifest = async (): Promise<ContextPackManifest> => {
  const ref = uiDataPackage.sourceInventory.predictiveContextPackManifest;
  const [moduleLoader] = Object.values(manifestModules);
  const [rawLoader] = Object.values(manifestRawModules);
  if (!moduleLoader || !rawLoader) throw new Error('Context-pack manifest module missing');
  const manifest = ((await moduleLoader()) as { default: unknown }).default as ContextPackManifest;
  const rawText = (await rawLoader()) as string;
  const actual = await sha256Hex(rawText);
  if (actual !== ref.sha256) throw new Error('Context-pack manifest integrity mismatch');
  return manifest;
};

export interface ArchiveEntry {
  ref: ContextPackRef;
  pack: RaceDebriefContextPack;
}

const loadPack = async (ref: ContextPackRef): Promise<ArchiveEntry | null> => {
  const key = `../../${ref.path}`;
  const jsonLoader = packModules[key];
  const rawLoader = packRawModules[key];
  if (!jsonLoader || !rawLoader) return null;
  const pack = ((await jsonLoader()) as { default: RaceDebriefContextPack }).default;
  const rawText = (await rawLoader()) as string;
  const actual = await sha256Hex(rawText);
  if (actual !== ref.sha256 || pack.id !== ref.id) {
    throw new Error(`Debrief pack integrity mismatch: ${ref.path}`);
  }
  return { ref, pack };
};

export const roundIndexOf = (pack: RaceDebriefContextPack): number => {
  if (typeof pack.raceOrder === 'number') return pack.raceOrder;
  return pack.raceOrder?.roundIndex ?? 0;
};

/** Chronological comparator: prefers the pack's eventStartDate (added in the
 *  July 2 data repair), falls back to roundIndex for older pack generations. */
export const chronoCompare = (a: RaceDebriefContextPack, b: RaceDebriefContextPack): number => {
  if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
  const dateA = (a as unknown as Record<string, unknown>).eventStartDate;
  const dateB = (b as unknown as Record<string, unknown>).eventStartDate;
  if (typeof dateA === 'string' && typeof dateB === 'string' && dateA !== dateB) return dateA.localeCompare(dateB);
  return roundIndexOf(a) - roundIndexOf(b);
};

/** Pack labels repeat the race number ("... Race 1 R1"); trim for display. */
export const displayRaceLabelText = (raceLabel: string): string =>
  raceLabel.replace(/^\d{4}\s+/, '').replace(/\s+R(\d)$/, '');

export const displayRaceLabel = (pack: RaceDebriefContextPack): string => displayRaceLabelText(pack.raceLabel);

let archivePromise: Promise<ArchiveEntry[]> | null = null;

/** Newest race first (seasonYear desc, raceOrder desc). */
export const loadDebriefArchive = (): Promise<ArchiveEntry[]> => {
  archivePromise ??= (async () => {
    const manifest = await loadManifest();
    const refs = manifest.packs.filter((pack) => pack.type === 'race_debrief');
    const entries = await Promise.all(refs.map((ref) => loadPack(ref)));
    return entries
      .filter((entry): entry is ArchiveEntry => entry !== null)
      .sort((a, b) => chronoCompare(b.pack, a.pack));
  })();
  return archivePromise;
};

export const loadDebriefBySessionId = async (sessionId: string): Promise<ArchiveEntry | null> => {
  const archive = await loadDebriefArchive();
  return archive.find((entry) => entry.pack.sessionId === sessionId) ?? null;
};
