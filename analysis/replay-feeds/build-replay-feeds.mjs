#!/usr/bin/env node
// Brief L slice 2 — the replay reducer.
//
// Normalizes the historical data lake's per-session semantic-layer tables into
// the capture-shaped snapshot feeds the Time Machine plays, so "Watch this race
// unfold" can appear on 2024-2026 races, not just our own captures.
//
// Inputs (READ-ONLY): the committed semantic-layer outputs. Never the raw lake,
// never the live sqlite.
//   - finishing-order.json            -> 28 clean 2024-25 RaceTools races + canonicalSessionId
//   - crosswalk-validation.json       -> 12 Timing71 2026 races + canonicalSessionId + winner check
//   - identity-crosswalk-2026.json    -> per-session eventId + per-car driverIds
//   - capture-final-states.json       -> our own capture final field (two-source diff)
//   - sessions/*.ndjson.gz            -> RaceTools per-session tables
//   - sessions-2026/*.ndjson.gz       -> Timing71 per-session tables
//
// Outputs:
//   - output/feeds/<canonicalSessionId>.ndjson.gz   (capture-shaped snapshot rows)
//   - output/replay-feeds-manifest.json             (what is in / excluded and why)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSessionPack, writeFeedPack } from './lib/pack-reader.mjs';
import { reduceRaceTools, reduceTiming71, BRYCE_DRIVER_ID } from './lib/reduce.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const semanticOut = join(__dirname, '..', 'semantic-layer', 'output');
const feedsDir = join(__dirname, 'output', 'feeds');
const manifestPath = join(__dirname, 'output', 'replay-feeds-manifest.json');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const TIER_LABEL = {
  racetools_capture: 'RaceTools race-weekend capture',
  timing71_normalized: 'third-party normalized (Timing71)'
};

const numericSuffix = (id) => {
  const m = String(id ?? '').match(/_(\d+)$/);
  return m ? m[1] : null;
};

const MIN_WATCHABLE_SAMPLES = 120; // mirrors scripts/lib/replay-overlay.mjs

// --- Load validation references ------------------------------------------------
const finishingOrder = readJson(join(semanticOut, 'validation', 'finishing-order.json'));
const crosswalkValidation = readJson(join(semanticOut, 'crosswalk', 'crosswalk-validation.json'));
const identityCrosswalk = readJson(join(semanticOut, 'crosswalk', 'identity-crosswalk-2026.json'));
const captureFinalStates = readJson(join(semanticOut, 'cross-check', 'capture-final-states.json'));

const crosswalkBySession = new Map(identityCrosswalk.sessions.map((s) => [s.t71SessionId, s]));
const captureByEventSessionId = new Map(
  (captureFinalStates.sessions ?? []).map((s) => [String(s.officialEventSessionId), s])
);

// --- Validation helpers --------------------------------------------------------
const flagSanity = (snapshots) => {
  const flags = snapshots.map((s) => s.raw.timing.timing_results.heartbeat.currentFlag);
  const first = flags[0];
  const last = flags[flags.length - 1];
  const distinct = [...new Set(flags)];
  const validStates = distinct.every((s) => ['GREEN', 'YELLOW', 'RED', 'CHECKERED', 'WHITE'].includes(s));
  const hasGreen = flags.includes('GREEN');
  return {
    startsGreen: first === 'GREEN',
    endsCheckered: last === 'CHECKERED',
    states: distinct,
    // A race is flag-sane when green racing occurs, it ends checkered, and every
    // state is a real flag. The very first virtual second can read YELLOW when the
    // green flips a fraction of a second later (floor() catches the prior caution);
    // that is not a defect, so `startsGreen` is informational only.
    ok: hasGreen && last === 'CHECKERED' && validStates
  };
};

// Two-source diff: reduced final on-road order vs our own capture's final field.
const twoSourceDiff = (eventSessionId, finalOrder) => {
  const capture = captureByEventSessionId.get(String(eventSessionId));
  if (!capture || !Array.isArray(capture.finalField) || capture.finalField.length === 0) return null;
  const captureOrder = [...capture.finalField]
    .filter((r) => Number.isFinite(r.rank))
    .sort((a, b) => a.rank - b.rank)
    .map((r) => String(r.car));
  const n = Math.min(captureOrder.length, finalOrder.length);
  let agree = 0;
  for (let i = 0; i < n; i += 1) if (captureOrder[i] === finalOrder[i]) agree += 1;
  return {
    captureSessionKey: capture.sessionKey,
    captureSnapshots: capture.snapshotCount ?? null,
    thinCapture: (capture.snapshotCount ?? 0) < MIN_WATCHABLE_SAMPLES,
    checked: n,
    agree,
    agreementFraction: n ? Number((agree / n).toFixed(4)) : null,
    captureFinalOrder: captureOrder,
    reducedFinalOrder: finalOrder
  };
};

const reduced = [];
const excluded = [];

// --- (a) 2024-25 RaceTools races ----------------------------------------------
for (const race of finishingOrder.results) {
  if (!race.canonicalSessionId || !race.matched) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId ?? null, sourceTier: 'racetools_capture', reason: 'no canonicalSessionId or unmatched to canonical' });
    continue;
  }
  const packPath = join(semanticOut, 'sessions', `${race.id}.ndjson.gz`);
  let pack;
  try {
    pack = readSessionPack(packPath);
  } catch (err) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'racetools_capture', reason: `pack unreadable: ${err.message}` });
    continue;
  }
  const eventSessionId = numericSuffix(race.canonicalSessionId);
  const out = reduceRaceTools(pack, { canonicalSessionId: race.canonicalSessionId, eventSessionId, seasonYear: race.year });
  if (!out.snapshots.length) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'racetools_capture', reason: out.reason ?? 'reducer produced no snapshots' });
    continue;
  }

  const winner = out.finalOrder[0];
  const podium = out.finalOrder.slice(0, 3);
  const winnerMatch = winner === race.derivedWinner && winner === race.canonicalWinner;
  const podiumMatch = JSON.stringify(podium) === JSON.stringify(race.canonicalPodium);
  const flags = flagSanity(out.snapshots);
  const bryceSamples = out.snapshots.filter((s) => s.raw.timing.timing_results.Item.some((r) => r.DriverID === BRYCE_DRIVER_ID)).length;
  const validationOk = winnerMatch && podiumMatch && flags.ok && out.bryceSeen && bryceSamples >= MIN_WATCHABLE_SAMPLES;

  const entry = {
    id: race.id,
    canonicalSessionId: race.canonicalSessionId,
    sessionKey: race.canonicalSessionId,
    eventSessionId,
    seasonYear: race.year,
    sourceTier: out.sourceTier,
    tierLabel: TIER_LABEL[out.sourceTier],
    venue: race.venue,
    sessionName: out.meta?.sessionLabel ?? 'Race',
    eventName: out.meta?.event ?? race.venue,
    date: race.date,
    totalLaps: out.totalLaps,
    samples: out.snapshots.length,
    bryceSamples,
    firstCheckedAt: out.snapshots[0].checkedAt,
    lastCheckedAt: out.snapshots[out.snapshots.length - 1].checkedAt,
    firstGreenAt: out.firstGreenIso,
    durationSeconds: Math.round((Date.parse(out.snapshots[out.snapshots.length - 1].checkedAt) - Date.parse(out.snapshots[0].checkedAt)) / 1000),
    validation: {
      winner,
      winnerMatch,
      podium,
      podiumMatch,
      finalOrder: out.finalOrder,
      lapCountWithin1: `${race.lapCountWithin1}/${race.lapCountChecked}`,
      flags,
      asRacedVsCanonical: 'match',
      twoSource: twoSourceDiff(eventSessionId, out.finalOrder)
    },
    excludedFromAvailable: !validationOk,
    watchable: validationOk
  };
  if (!validationOk) {
    entry.excludeReason = [
      !winnerMatch && 'winner mismatch',
      !podiumMatch && 'podium mismatch',
      !flags.ok && 'flag intervals not sane',
      bryceSamples < MIN_WATCHABLE_SAMPLES && 'too few Bryce samples'
    ].filter(Boolean).join('; ');
  }
  writeFeedPack(join(feedsDir, `${race.canonicalSessionId}.ndjson.gz`), out.snapshots);
  reduced.push(entry);
  process.stdout.write(`RT ${race.year} ${race.venue.padEnd(34)} -> ${race.canonicalSessionId}  ${out.snapshots.length}r  win#${winner} ${validationOk ? 'OK' : 'EXCLUDED:' + entry.excludeReason}\n`);
}

// --- (b) 2026 Timing71 GO races ------------------------------------------------
for (const race of crosswalkValidation.raceClassificationChecks) {
  if (!race.canonicalSessionId || !race.matched) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId ?? null, sourceTier: 'timing71_normalized', reason: 'no canonicalSessionId or unmatched' });
    continue;
  }
  const cw = crosswalkBySession.get(race.id);
  const goNoGo = crosswalkValidation.goNoGo.find((g) => g.t71SessionId === race.id);
  const verdict = goNoGo?.verdict ?? 'UNKNOWN';
  if (verdict === 'NO-GO') {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'timing71_normalized', reason: `crosswalk verdict NO-GO` });
    continue;
  }
  const packPath = join(semanticOut, 'sessions-2026', `${race.id}.ndjson.gz`);
  let pack;
  try {
    pack = readSessionPack(packPath);
  } catch (err) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'timing71_normalized', reason: `pack unreadable: ${err.message}` });
    continue;
  }
  const eventSessionId = cw?.canonicalOfficialSessionId ?? numericSuffix(race.canonicalSessionId);
  const eventId = numericSuffix(cw?.canonicalEventId);
  const crosswalkMap = {};
  for (const m of cw?.mappings ?? []) crosswalkMap[String(m.car)] = { driverId: m.driverId };
  const out = reduceTiming71(pack, { canonicalSessionId: race.canonicalSessionId, eventSessionId, seasonYear: 2026, eventId, crosswalk: crosswalkMap });
  if (!out.snapshots.length) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'timing71_normalized', reason: out.reason ?? 'reducer produced no snapshots' });
    continue;
  }

  const winner = out.finalOrder[0];
  const podium = out.finalOrder.slice(0, 3);
  // As-raced vs canonical: raceClassificationChecks.winnerMatch is canonical.
  // The CONDITIONAL (Road America R2) diverges by design (post-race DQ).
  const asRaced = verdict === 'CONDITIONAL' ? 'as_raced_diverges_from_canonical' : 'match';
  const flags = flagSanity(out.snapshots);
  const bryceSamples = out.snapshots.filter((s) => s.raw.timing.timing_results.Item.some((r) => r.DriverID === BRYCE_DRIVER_ID)).length;
  // Watchable requires a sane replay with Bryce present. Canonical winner match
  // is NOT required (as-raced replays are legitimate); the honesty line carries it.
  const validationOk = flags.ok && out.bryceSeen && bryceSamples >= MIN_WATCHABLE_SAMPLES && winner != null;

  const entry = {
    id: race.id,
    canonicalSessionId: race.canonicalSessionId,
    sessionKey: race.canonicalSessionId,
    eventSessionId: String(eventSessionId),
    seasonYear: 2026,
    sourceTier: out.sourceTier,
    tierLabel: TIER_LABEL[out.sourceTier],
    verdict,
    venue: out.meta?.venue ?? cw?.venue,
    sessionName: 'Race',
    eventName: out.meta?.event ?? out.meta?.venue,
    date: cw?.date ?? out.meta?.date,
    totalLaps: out.totalLaps,
    samples: out.snapshots.length,
    bryceSamples,
    firstCheckedAt: out.snapshots[0].checkedAt,
    lastCheckedAt: out.snapshots[out.snapshots.length - 1].checkedAt,
    firstGreenAt: out.firstGreenIso,
    durationSeconds: Math.round((Date.parse(out.snapshots[out.snapshots.length - 1].checkedAt) - Date.parse(out.snapshots[0].checkedAt)) / 1000),
    validation: {
      winner,
      canonicalWinnerMatch: race.winnerMatch,
      canonicalPositionExact: `${race.positionExact}/${race.checked}`,
      podium,
      finalOrder: out.finalOrder,
      flags,
      asRacedVsCanonical: asRaced,
      twoSource: twoSourceDiff(eventSessionId, out.finalOrder)
    },
    excludedFromAvailable: !validationOk,
    watchable: validationOk
  };
  if (!validationOk) {
    entry.excludeReason = [
      !flags.ok && 'flag intervals not sane',
      bryceSamples < MIN_WATCHABLE_SAMPLES && 'too few Bryce samples',
      winner == null && 'no final order'
    ].filter(Boolean).join('; ');
  }
  writeFeedPack(join(feedsDir, `${race.canonicalSessionId}.ndjson.gz`), out.snapshots);
  reduced.push(entry);
  process.stdout.write(`T71 2026 ${(out.meta?.venue ?? '').padEnd(20)} -> ${race.canonicalSessionId}  ${out.snapshots.length}r  win#${winner} ${verdict} ${asRaced === 'match' ? '' : '(as-raced)'} ${validationOk ? 'OK' : 'EXCLUDED'}\n`);
}

// --- Manifest ------------------------------------------------------------------
const watchable = reduced.filter((r) => r.watchable);
const manifest = {
  artifact: 'replay-feeds-manifest',
  generatedAt: new Date().toISOString(),
  note: 'Lake-fed replay feeds for the Time Machine. Every session is source-tiered and validated; failing sessions are excluded from available() with the reason recorded. Classification/final order shown is as-raced (the honesty line at the checkered); canonical is the validation reference.',
  clockCaveat: 'RaceTools feeds carry a session-local virtual clock (seconds-of-day on the session date, labelled Z) — correct year/date, NOT UTC-accurate; the replay uses it only as a relative virtual clock. Timing71 feeds carry real UTC epoch timestamps.',
  scope: {
    racetools_2024_25_races: reduced.filter((r) => r.sourceTier === 'racetools_capture').length,
    timing71_2026_races: reduced.filter((r) => r.sourceTier === 'timing71_normalized').length,
    practiceQualifyingShipped: 0,
    practiceQualifyingNote: 'Practice/qualifying (slice c) intentionally not shipped: a validated race subset over an unvalidated sweep.'
  },
  counts: {
    reduced: reduced.length,
    watchable: watchable.length,
    excluded: reduced.length - watchable.length + excluded.length
  },
  tierLabels: TIER_LABEL,
  sessions: reduced,
  excludedSessions: excluded
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
process.stdout.write(`\nmanifest: ${reduced.length} reduced, ${watchable.length} watchable, ${excluded.length} non-race/excluded upstream -> ${manifestPath}\n`);
