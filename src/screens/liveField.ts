/**
 * The other cars on the replay's track (round 7): which ones are drawn, and
 * how far ahead of or behind Bryce each one is, in seconds.
 *
 * The seconds are Race Control's own published intervals (`liveGap`, each car
 * to the car ahead of it on the road), added up from Bryce outwards: the same
 * frame the "cars around him" panel reads. liveMarker.ts turns them into
 * distance at his own pace. A car out of the race, or past a break in the
 * intervals, is not drawn.
 */
import { buildLiveBattleFrame, liveRowsOf, sortRowsForLiveDisplay, stableDriverId, type LiveRow } from '../data/livePageModel';
import type { LiveReadiness } from '../app/useReadiness';

/** Which cars the track draws besides Bryce (`?field=`). */
export type FieldMode = 'around' | 'all' | 'bryce';

/** Jack's pick, November 16: the whole field by default; `field=around` or `field=bryce` for the others. */
export const fieldModeOf = (raw: string | null): FieldMode => (raw === 'around' || raw === 'bryce' ? raw : 'all');

const runningRow = (row: LiveRow) => {
  const status = String(row.status ?? '').trim().toLowerCase();
  return !status || ['active', 'running', 'run'].includes(status);
};

/** The five rows the "cars around him" panel shows: two ahead and two behind,
 *  slid inward at either end of the order. */
export const aroundWindowOf = (rows: LiveRow[]): LiveRow[] => {
  const bryceIndex = rows.findIndex((row) => row.bryce === true);
  if (bryceIndex < 0 || rows.length < 2) return [];
  const from = Math.max(0, Math.min(bryceIndex - 2, rows.length - 5));
  return rows.slice(from, from + 5);
};

export interface FieldCar {
  id: string;
  no: string;
  surname: string;
  position: number | null;
  /** Seconds ahead of Bryce on the road (negative: behind). */
  offsetSeconds: number;
}

/** The cars to draw for a frame, with their offsets. */
export const fieldCarsOf = (payload: LiveReadiness | null, mode: FieldMode): FieldCar[] => {
  if (!payload || mode === 'bryce') return [];
  const frame = buildLiveBattleFrame(payload);
  if (!frame) return [];
  const rows = sortRowsForLiveDisplay(liveRowsOf(payload)) as LiveRow[];
  const byId = new Map(rows.map((row) => [stableDriverId(row), row]));
  const bryceLaps = Number(rows.find((row) => row.bryce === true)?.laps ?? NaN);
  const wanted = mode === 'around' ? new Set(aroundWindowOf(rows).map((row) => stableDriverId(row))) : null;
  const cars: FieldCar[] = [];
  for (const car of frame.cars) {
    if (wanted && !wanted.has(car.id)) continue;
    const row = byId.get(car.id);
    if (!row || !runningRow(row)) continue;
    // A car that never started a lap while the race is under way is parked.
    const laps = Number(row.laps ?? NaN);
    if (Number.isFinite(bryceLaps) && bryceLaps > 0 && Number.isFinite(laps) && laps === 0) continue;
    if (!Number.isFinite(car.offsetSeconds)) continue;
    cars.push({ id: car.id, no: car.carNo, surname: car.surname, position: car.rank, offsetSeconds: car.offsetSeconds });
  }
  return cars;
};
