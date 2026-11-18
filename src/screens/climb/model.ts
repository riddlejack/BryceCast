import { useEffect, useMemo, useState } from 'react';
import { asNumber, asString } from '../../app/format';
import { uiDataPackage, type UiCareerMoment } from '../../data/uiDataPackage';
import { chapterTint, seriesShort, useCareerRows } from '../careerExplorer';
import { raceName } from '../careerRaceNames';

/* ============================================================================
 * The climb's model (career round 2, November 17, 2026).
 *
 * Every race of the record, all 173, in the order he ran them: the 165 with a
 * classified finish from the conversion table (uiDataPackage resultConversion,
 * the rows every other career chart reads) and the 8 with none (a DNF, DNS or
 * DSQ with no finishing position) from careerLab.unclassifiedRaces. Both come
 * from the canonical result rows; nothing here is computed except the order
 * and which step of the climb a series sits on.
 *
 * The steps are the series in the order he reached them. The three 2019
 * Formula F series (SCCA Super Tour, F1600, Right Coast) are one step, as
 * they share a car class. USF Pro 2000 (one race, May 2024) and IMSA (the
 * 2025 Rolex 24) ran inside his INDY NXT years, so they are one-offs drawn on
 * that step in their own colour rather than steps of their own.
 * ==========================================================================*/

export interface ClimbRace {
  sessionId: string;
  seriesName: string;
  seriesShort: string;
  seasonYear: number | null;
  /** "Castle Combe · Race 2": the place or meeting, then which race. */
  title: string;
  trackName: string;
  date: string;
  start: number | null;
  /** Classified finishing position; null for a DNF/DNS/DSQ with none. */
  finish: number | null;
  /** Cars in the race's result, from the canonical result row. */
  field: number | null;
  /** Share of the field beaten, as the conversion table has it; null when unclassified. */
  percentile: number | null;
  /** running · contact · mechanical · dnf · dns · dsq */
  status: string;
  wetDry: string | null;
  /** A race page exists (every classified race; the 8 unclassified have none). */
  hasPage: boolean;
  step: number;
  /** A race in a series that is not a step of its own (USF Pro 2000, IMSA). */
  oneOff: boolean;
  index: number;
}

export interface ClimbStep {
  key: string;
  /** What the step is called on the chart. */
  name: string;
  /** Its tint: the chapter colour of its main series. */
  tint: string;
  /** Index of its first and last race in the whole record. */
  from: number;
  to: number;
  years: string;
  /** Races on this step, the one-offs excluded. */
  count: number;
  /** Of those, how many had a classified finish. */
  classified: number;
  wins: number;
  best: number | null;
}

export interface ClimbMoment extends UiCareerMoment {
  index: number;
}

export interface ClimbModel {
  races: ClimbRace[];
  steps: ClimbStep[];
  moments: ClimbMoment[];
  total: number;
}

const STEPS: Array<{ key: string; name: string; tintSeries: string; series: string[] }> = [
  { key: 'formula-f', name: 'Formula F', tintSeries: 'F1600 Championship Series', series: ['Hoosier SCCA Super Tour', 'F1600 Championship Series', 'Right Coast Formula F Series'] },
  { key: 'formula-ford', name: 'Formula Ford', tintSeries: 'Formula Ford', series: ['Formula Ford'] },
  { key: 'gb3', name: 'GB3', tintSeries: 'GB3 Championship', series: ['GB3 Championship'] },
  { key: 'euroformula', name: 'Euroformula', tintSeries: 'Euroformula Open', series: ['Euroformula Open'] },
  { key: 'fr-oceania', name: 'FR Oceania', tintSeries: 'Castrol Toyota Formula Regional Oceania Championship', series: ['Castrol Toyota Formula Regional Oceania Championship'] },
  { key: 'indy-nxt', name: 'INDY NXT', tintSeries: 'INDY NXT', series: ['INDY NXT'] }
];
const ONE_OFF_STEP: Record<string, string> = {
  'USF Pro 2000 Championship': 'indy-nxt',
  'IMSA WeatherTech SportsCar Championship': 'indy-nxt'
};

const stepIndexOf = (seriesName: string): { step: number; oneOff: boolean } => {
  const direct = STEPS.findIndex((step) => step.series.includes(seriesName));
  if (direct !== -1) return { step: direct, oneOff: false };
  const host = ONE_OFF_STEP[seriesName];
  return { step: host ? STEPS.findIndex((step) => step.key === host) : STEPS.length - 1, oneOff: true };
};

const yearSpan = (a: number | null, b: number | null): string => {
  if (a === null || b === null) return '';
  return a === b ? String(a) : `${a}–${String(b).slice(2)}`;
};

interface UnclassifiedRow {
  sessionId: string;
  seriesName: string | null;
  seasonYear: number | null;
  eventName: string | null;
  trackName: string | null;
  eventStartDate: string | null;
  raceNumber: number | null;
  startPosition: number | null;
  fieldSize: number | null;
  status: string | null;
}

type CareerLabExtras = {
  unclassifiedRaces?: UnclassifiedRow[];
};

export const useClimbModel = (): ClimbModel | null => {
  const rows = useCareerRows();
  return useMemo(() => {
    const lab = uiDataPackage.screens.careerLab;
    const raw = new Map<string, Record<string, string | number | null>>();
    for (const entry of lab.resultConversion ?? []) {
      const id = asString(entry.sessionId);
      if (id) raw.set(id, entry);
    }
    type Draft = Omit<ClimbRace, 'title' | 'step' | 'oneOff' | 'index'> & { eventName: string; order: number };
    const drafts: Draft[] = rows.map((row) => {
      const source = raw.get(row.sessionId) ?? {};
      return {
        sessionId: row.sessionId,
        seriesName: row.seriesName,
        seriesShort: row.seriesShort,
        seasonYear: row.seasonYear,
        eventName: asString(source.eventName) ?? row.raceLabel,
        trackName: row.trackName,
        date: row.date,
        start: row.start,
        finish: row.finish,
        field: asNumber(source.fieldSize),
        percentile: row.percentile,
        status: row.status,
        wetDry: row.wetDry,
        hasPage: true,
        order: Number(row.sessionId.match(/race[_-]?(\d+)/i)?.[1] ?? 0)
      };
    });
    for (const u of (lab as typeof lab & CareerLabExtras).unclassifiedRaces ?? []) {
      if (!u.eventStartDate || !u.seriesName) continue;
      drafts.push({
        sessionId: u.sessionId,
        seriesName: u.seriesName,
        seriesShort: seriesShort(u.seriesName),
        seasonYear: u.seasonYear,
        eventName: u.eventName ?? u.trackName ?? '',
        trackName: u.trackName ?? '',
        date: u.eventStartDate,
        start: u.startPosition,
        finish: null,
        field: u.fieldSize,
        percentile: null,
        status: (u.status ?? 'dnf').toLowerCase(),
        wetDry: null,
        hasPage: false,
        order: u.raceNumber ?? Number(u.sessionId.match(/race[_-]?(\d+)/i)?.[1] ?? 0)
      });
    }
    /* Date, then the race's number within its meeting. The conversion rows
     * arrive in the order they ran (useCareerRows sorts stably by date), so
     * a meeting without numbers keeps that order. */
    const position = new Map(drafts.map((draft, i) => [draft, i]));
    drafts.sort((a, b) => a.date.localeCompare(b.date) || (a.order && b.order ? a.order - b.order : 0) || position.get(a)! - position.get(b)!);

    /* Which race of its meeting, where the session id has no number (GB3 2022). */
    const seenInEvent = new Map<string, number>();
    const races: ClimbRace[] = drafts.map((draft, index) => {
      const meeting = `${draft.seasonYear}|${draft.eventName}`;
      const k = (seenInEvent.get(meeting) ?? 0) + 1;
      seenInEvent.set(meeting, k);
      const { step, oneOff } = stepIndexOf(draft.seriesName);
      const sameEvent = drafts.filter((other) => other.eventName === draft.eventName && other.seasonYear === draft.seasonYear).length;
      const name = raceName({ eventName: draft.eventName, sessionId: draft.sessionId, trackName: draft.trackName, raceInRound: sameEvent > 1 ? k : null });
      const { eventName: _e, order: _o, ...rest } = draft;
      return { ...rest, title: name.title, step, oneOff, index };
    });

    const steps: ClimbStep[] = STEPS.map((def, s) => {
      const on = races.filter((race) => race.step === s && !race.oneOff);
      const all = races.filter((race) => race.step === s);
      const finishes = on.flatMap((race) => (race.finish !== null ? [race.finish] : []));
      return {
        key: def.key,
        name: def.name,
        tint: chapterTint(def.tintSeries),
        from: all.length ? all[0].index : 0,
        to: all.length ? all[all.length - 1].index : 0,
        years: yearSpan(on[0]?.seasonYear ?? null, on[on.length - 1]?.seasonYear ?? null),
        count: on.length,
        classified: finishes.length,
        wins: finishes.filter((finish) => finish === 1).length,
        best: finishes.length ? Math.min(...finishes) : null
      };
    }).filter((step) => step.count > 0);

    const moments: ClimbMoment[] = (lab.moments ?? []).flatMap((moment) => {
      const index = races.findIndex((race) => race.sessionId === moment.sessionId);
      return index === -1 ? [] : [{ ...moment, index }];
    });

    const lifeTotal = lab.lifeStats?.figures.find((figure) => figure.id === 'races')?.value;
    return races.length >= 10 ? { races, steps, moments, total: typeof lifeTotal === 'number' ? lifeTotal : races.length } : null;
  }, [rows]);
};

/* ---------- shared drawing helpers ---------- */

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const ease = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** The load clock: 0 → 1 over `ms` once `play` turns true; 1 at once under reduced motion. */
export const usePlayClock = (play: boolean, reduced: boolean, ms: number): number => {
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setP(1);
      return undefined;
    }
    if (!play) return undefined;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, reduced, ms]);
  return p;
};

export const statusWords: Record<string, string> = {
  contact: 'ended early: contact',
  mechanical: 'ended early: mechanical',
  dnf: 'did not finish',
  dns: 'did not start',
  dsq: 'disqualified'
};

/** "P4 → P2 · beat 92% of the field", or "started P5 · did not finish". */
export const raceNumbers = (race: ClimbRace): string => {
  if (race.finish === null) {
    return [race.start !== null ? `started P${race.start}` : null, statusWords[race.status] ?? race.status, race.field ? `${race.field} cars` : null]
      .filter(Boolean)
      .join(' · ');
  }
  const move = race.start !== null ? `P${race.start} → P${race.finish}` : `finished P${race.finish}`;
  const of = race.field ? ` of ${race.field}` : '';
  return `${move}${of}`;
};
