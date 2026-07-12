import { uiDataPackage, type UiSeasonIndexRow } from './uiDataPackage';

/** One row per completed race (chronological), straight from the validated
 *  package — the archive renders synchronously from this. */
export const getSeasonIndex = (): UiSeasonIndexRow[] => uiDataPackage.screens.raceDebrief.seasonIndex ?? [];
