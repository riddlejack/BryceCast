import { uiDataPackage } from './uiDataPackage';
import {
  type ContextPackManifest,
  type ContextPackRef,
  type RaceDebriefContextPack
} from './uiContextAdapter';
import { manifestUrls, packUrls } from './packModules';
import { loadContextPack, loadFirstContextPack } from './packLoader';

/** Full race-debrief archive: every completed INDY NXT race, hydrated from the
 *  manifest with sha256 integrity checks. Loaded lazily (Races surfaces only). */

const loadManifest = async (): Promise<ContextPackManifest> => {
  const ref = uiDataPackage.sourceInventory.predictiveContextPackManifest;
  const loaded = await loadFirstContextPack<ContextPackManifest>(manifestUrls);
  if (!loaded) throw new Error('Context-pack manifest module missing');
  if (loaded.sha256 !== ref.sha256) throw new Error('Context-pack manifest integrity mismatch');
  return loaded.data;
};

export interface ArchiveEntry {
  ref: ContextPackRef;
  pack: RaceDebriefContextPack;
}

const loadPack = async (ref: ContextPackRef): Promise<ArchiveEntry | null> => {
  const key = `../../${ref.path}`;
  const loaded = await loadContextPack<RaceDebriefContextPack>(packUrls, key);
  if (!loaded) return null;
  const { data: pack, sha256 } = loaded;
  if (sha256 !== ref.sha256 || pack.id !== ref.id) {
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

let latestSeasonPromise: Promise<ArchiveEntry[]> | null = null;

/** Only the most recently raced season's debriefs — for a surface (Home) that
 *  shows "this season" and has no reason to pay for every year the archive
 *  covers. `seasonYear` (and `roundIndex`, `eventStartDate`) already live on
 *  the manifest's own ref, so which packs belong to the latest season is
 *  knowable from ONE cheap manifest fetch, before loading any race pack at
 *  all — unlike `loadDebriefArchive`, this never fetches the other seasons'
 *  packs. Newest race first, same ordering contract as `loadDebriefArchive`. */
export const loadLatestSeasonDebriefs = (): Promise<ArchiveEntry[]> => {
  latestSeasonPromise ??= (async () => {
    const manifest = await loadManifest();
    const refs = manifest.packs.filter((pack) => pack.type === 'race_debrief');
    if (refs.length === 0) return [];
    const latestSeasonYear = Math.max(...refs.map((ref) => ref.seasonYear ?? 0));
    const latestRefs = refs.filter((ref) => ref.seasonYear === latestSeasonYear);
    const entries = await Promise.all(latestRefs.map((ref) => loadPack(ref)));
    return entries
      .filter((entry): entry is ArchiveEntry => entry !== null)
      .sort((a, b) => chronoCompare(b.pack, a.pack));
  })();
  return latestSeasonPromise;
};

export const loadDebriefBySessionId = async (sessionId: string): Promise<ArchiveEntry | null> => {
  const archive = await loadDebriefArchive();
  return archive.find((entry) => entry.pack.sessionId === sessionId) ?? null;
};
