import { useEffect, useMemo, useState } from 'react';
import conversionCsv from '../../../analysis/qualifying-layer/output/tables/quali_race_conversion.csv?raw';
import type { VenueTip } from '../../app/venueCard';
import { uiDataPackage } from '../../data/uiDataPackage';
import { chapterTint, seriesShort, useCareerRows } from '../careerExplorer';
import { placeLine } from '../../app/raceFacts';
import { raceFieldOf, raceTitleOf } from '../raceCardFacts';

/* Qualifying to the flag: the 77 races and the shared reading (moved out of
 * qualifying.tsx in round 3 so every version draws from one place). */

export type Outcome = 'ahead' | 'held' | 'behind';

export interface QualiRace {
  sessionId: string;
  seriesId: string;
  seriesName: string;
  seasonYear: number;
  label: string;
  trackName: string | null;
  date: string;
  grid: number;
  gridField: number;
  finish: number;
  finishField: number;
  outcome: Outcome;
}

/* A small quote-aware CSV reader: one event name carries a comma. */
const parseCsv = (text: string): Array<Record<string, string>> => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((cells) => Object.fromEntries(head.map((key, index) => [key, cells[index] ?? ''])));
};

export const OUTCOMES: Outcome[] = ['ahead', 'held', 'behind'];

/** The 77 races, joined to the career rows for their names and dates, or null when they disagree with the package. */
export const useQualiRaces = (): QualiRace[] | null => {
  const careerRows = useCareerRows();
  return useMemo(() => {
    const layer = uiDataPackage.screens.careerLab.qualifyingLayer;
    const nameById = new Map((layer.bySeries ?? []).map((row) => [row.seriesId, row.seriesName]));
    const careerById = new Map(careerRows.map((row) => [row.sessionId, row]));
    const races: QualiRace[] = [];
    for (const raw of parseCsv(conversionCsv)) {
      const grid = Number(raw.qualiRank);
      const finish = Number(raw.finish);
      const outcome = raw.conversionOutcome as Outcome;
      if (!Number.isFinite(grid) || !Number.isFinite(finish) || !OUTCOMES.includes(outcome)) return null;
      const career = careerById.get(raw.raceSessionId);
      races.push({
        sessionId: raw.raceSessionId,
        seriesId: raw.seriesId,
        seriesName: nameById.get(raw.seriesId) ?? raw.seriesName,
        seasonYear: Number(raw.seasonYear),
        label: career?.raceLabel ?? `${raw.eventName} · ${raw.raceLabel}`,
        trackName: career?.trackName ?? null,
        date: career?.date ?? `${raw.seasonYear}-01-01`,
        grid,
        gridField: Number(raw.qualiFieldSize),
        finish,
        finishField: Number(raw.raceFieldSize),
        outcome
      });
    }
    // The checks: career totals, then every series' totals, exactly as the package has them.
    const career = layer.career;
    const count = (list: QualiRace[], outcome: Outcome) => list.filter((race) => race.outcome === outcome).length;
    if (races.length !== career.conversionRaces) return null;
    if (count(races, 'ahead') !== career.finishedAhead || count(races, 'held') !== career.held || count(races, 'behind') !== career.finishedBehind) return null;
    for (const row of layer.bySeries ?? []) {
      const mine = races.filter((race) => race.seriesId === row.seriesId);
      if (mine.length !== row.conversionRaces) return null;
      if (count(mine, 'ahead') !== row.finishedAhead || count(mine, 'held') !== row.held || count(mine, 'behind') !== row.finishedBehind) return null;
    }
    // the outcome agrees with the two positions it is read from
    for (const race of races) {
      const read: Outcome = race.finish < race.grid ? 'ahead' : race.finish === race.grid ? 'held' : 'behind';
      if (read !== race.outcome) return null;
    }
    return races.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  }, [careerRows]);
};

export const placesWord = (n: number) => `${n} place${n === 1 ? '' : 's'}`;

export const tipOf = (race: QualiRace): Omit<VenueTip, 'x' | 'y'> => {
  const delta = race.grid - race.finish;
  return {
    venue: { sessionId: race.sessionId, trackName: race.trackName },
    meta: `${seriesShort(race.seriesName)} · ${race.seasonYear}`,
    tint: chapterTint(race.seriesName),
    title: raceTitleOf(race.sessionId, race.label),
    detail: `qualified ${placeLine(race.grid, race.gridField) ?? `P${race.grid}`} · finished ${placeLine(race.finish, raceFieldOf(race.sessionId)) ?? `P${race.finish}`}`,
    note: delta > 0 ? `made up ${placesWord(delta)}` : delta < 0 ? `gave back ${placesWord(-delta)}` : 'held his slot',
    action: 'open the race'
  };
};

export const easeOutCubic = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** Milliseconds since the chart first came into view (Infinity when motion is off or done). */
export const useRevealClock = (active: boolean, reduced: boolean, totalMs: number): number => {
  const [elapsed, setElapsed] = useState(reduced ? Number.POSITIVE_INFINITY : 0);
  useEffect(() => {
    if (reduced) {
      setElapsed(Number.POSITIVE_INFINITY);
      return undefined;
    }
    if (!active) return undefined;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const ms = now - start;
      if (ms >= totalMs) {
        setElapsed(Number.POSITIVE_INFINITY);
        return;
      }
      setElapsed(ms);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, totalMs]);
  return elapsed;
};

export const posTicks = (max: number) => [1, 5, 10, 15, 20, 25, 30, 35].filter((p) => p <= max);

/* ---------- each chapter's own count ---------- */

export interface SeriesTally {
  seriesId: string;
  seriesName: string;
  races: QualiRace[];
  ahead: number;
  held: number;
  behind: number;
}

export const tallies = (races: QualiRace[]): SeriesTally[] => {
  const order = (uiDataPackage.screens.careerLab.qualifyingLayer.bySeries ?? []).filter((row) => row.conversionRaces > 0);
  return order.map((row) => ({
    seriesId: row.seriesId,
    seriesName: row.seriesName,
    races: races.filter((race) => race.seriesId === row.seriesId),
    ahead: row.finishedAhead,
    held: row.held,
    behind: row.finishedBehind
  }));
};
