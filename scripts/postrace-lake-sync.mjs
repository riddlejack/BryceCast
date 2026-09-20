#!/usr/bin/env node
/**
 * postrace:lake-sync — pull the latest Timing71 recordings into the historical
 * data lake and promote newly posted INDY NXT sessions through the audited
 * canonical list, with every existing validation gate left in force.
 *
 * Why this exists: Timing71's public archive posts a race's normalized replay
 * hours-to-days after the checkered flag (Music City 2026 posted on July 21 for
 * a July 19 race). The results roll-forward (`postrace:roll`) is official-data
 * only; this command is the lake half. Run it whenever the archive has posted
 * the weekend's sessions — it is safe to run repeatedly (acquisition is
 * content-addressed and resumable; promotion is idempotent).
 *
 * The chain, in order (any nonzero step hard-stops the run):
 *   1. archive-sync acquire      — auto-discovers every IndyCar replay via the
 *                                  Timing71 archive API; downloads only what is
 *                                  missing, content-addressed by SHA-256.
 *   2. build-catalog             — re-enumerates the lake's session catalog.
 *   3. analyze-timing71-sessions — decodes every replay; per-session quality.
 *   4. PROMOTION GATE            — new INDY NXT sessions absent from the audited
 *                                  canonical list (timing71-2026-coverage.json)
 *                                  are appended ONLY if the decode passes the
 *                                  stop-gates from TIMING71_2026_DISCOVERY.md:
 *                                  usable status, Bryce present, race/full-field
 *                                  roster proof or qualifying group/sequential-run
 *                                  proof, and (races) a checkered flag. Every
 *                                  promotion carries a validation note. Anything
 *                                  failing a gate is reported and NOT promoted.
 *   5. build-coverage            — regenerates the coverage matrix through today.
 *   6. copy-back                 — the regenerated catalog/manifest artifacts are
 *                                  copied into this repo's committed
 *                                  data/historical-data-lake/ tree.
 *   7. semantic layer            — build-timing71-2026 (cross-artifact invariant:
 *                                  CSV rows === audited list), identity
 *                                  crosswalk, validate-crosswalk (winner /
 *                                  classification / two-source checks).
 *   8. replay feeds              — build + validate (finishing-order gate).
 *
 * What it deliberately does NOT do:
 *   - never touches the live runner, LaunchAgents, or the live sqlite;
 *   - never edits validator pins — the semantic builder's invariant reads the
 *     audited list, so a gated promotion is the only way a new session enters;
 *   - never rebuilds the UI data package (run
 *     `npm run analytics:ui-data-package:refresh-validate` with the usual pins
 *     afterwards, then commit — surfaced in the run summary);
 *   - never deploys.
 *
 * Usage:
 *   npm run postrace:lake-sync            # full chain
 *   npm run postrace:lake-sync:dry       # discover + report candidates, no writes
 *
 * Env:
 *   BRYCECAST_LAKE_DATA_ROOT — durable lake root (default:
 *   ~/.brycecast/data-lake, same as analysis/semantic-layer/lib/lake.mjs).
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_LAKE_DATA_ROOT =
  join(homedir(), '.brycecast', 'data-lake');
const lakeRoot = process.env.BRYCECAST_LAKE_DATA_ROOT || DEFAULT_LAKE_DATA_ROOT;
const dryRun = process.argv.includes('--dry-run');

const AUDIT_PATH = join(REPO_ROOT, 'analysis/historical-high-frequency-data-audit/timing71-2026-coverage.json');
const LAKE_SCRIPTS = join(REPO_ROOT, 'analysis/historical-data-lake');
const SEMANTIC = join(REPO_ROOT, 'analysis/semantic-layer');
const REPLAY_FEEDS = join(REPO_ROOT, 'analysis/replay-feeds');

/** Committed lake artifacts the repo tree carries (the semantic layer reads
 *  these, never the regenerating lake root). Copied back after regeneration. */
const COMMITTED_ARTIFACTS = [
  'manifests/source-files.json',
  'catalog/session-catalog.json',
  'catalog/catalog-summary.json',
  'catalog/timing71-session-quality-all.json',
  'catalog/coverage-2024-through-today.csv',
  'catalog/coverage-summary.json',
  'catalog/coverage-reconciliation.json',
  'catalog/track-map-catalog.json'
];

const todayIso = new Date().toISOString().slice(0, 10);

const run = (label, cmd, args, opts = {}) => {
  process.stdout.write(`\n=== ${label}\n`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: REPO_ROOT, ...opts });
  if (res.status !== 0) {
    process.stderr.write(`\npostrace:lake-sync HARD-STOP at "${label}" (exit ${res.status ?? 'signal'})\n`);
    process.exit(res.status || 1);
  }
};

// A new host may have no durable lake directory yet. Initializing the skeleton
// is safe: archive-sync will content-address and fetch every missing object. Seed
// only the source manifest when absent so discovery retains the committed source
// inventory without replacing any durable manifest already present.
for (const rel of ['raw', 'manifests', 'catalog']) mkdirSync(join(lakeRoot, rel), {recursive: true});
const durableManifest = join(lakeRoot, 'manifests/source-files.json');
const committedManifest = join(REPO_ROOT, 'data/historical-data-lake/manifests/source-files.json');
if (!existsSync(durableManifest) && existsSync(committedManifest)) {
  copyFileSync(committedManifest, durableManifest);
  process.stdout.write(`Initialized durable lake manifest from ${committedManifest}\n`);
}
if (!existsSync(AUDIT_PATH)) {
  process.stderr.write(`Audited canonical list missing: ${AUDIT_PATH}\n`);
  process.exit(2);
}

// ---- 1-3: acquire + catalog + analyze (all against the lake root) ----------
if (dryRun) {
  run('archive-sync plan (dry run)', 'node', [join(LAKE_SCRIPTS, 'archive-sync.mjs'), 'plan', '--data-root', lakeRoot]);
} else {
  run('archive-sync acquire', 'node', [join(LAKE_SCRIPTS, 'archive-sync.mjs'), 'acquire', '--data-root', lakeRoot, '--concurrency', '2']);
  run('build-catalog', 'node', [join(LAKE_SCRIPTS, 'build-catalog.mjs'), 'build', '--data-root', lakeRoot]);
  run('analyze-timing71-sessions', 'node', [join(LAKE_SCRIPTS, 'analyze-timing71-sessions.mjs'), '--data-root', lakeRoot, '--concurrency', '4']);
}

// ---- 4: gated promotion into the audited canonical list --------------------
const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
// This file is committed and published. The roll carries `localAcquisition`
// forward verbatim, so normalise the staging path here rather than letting an
// absolute home path from an earlier run survive every future rewrite.
if (audit.localAcquisition?.path?.startsWith(`${homedir()}/`)) {
  audit.localAcquisition.path = audit.localAcquisition.path.replace(`${homedir()}/`, '~/');
}
const audited = new Set(
  [...(audit.raceReplays ?? []), ...(audit.nonRaceSessionCandidates ?? []), ...(audit.excludedFalsePositives ?? [])]
    .map((r) => r.replayId)
    .filter(Boolean)
);

const qualityPath = join(dryRun ? join(REPO_ROOT, 'data/historical-data-lake') : lakeRoot, 'catalog/timing71-session-quality-all.json');
const quality = JSON.parse(readFileSync(qualityPath, 'utf8'));
const isVerifiedUnlabelledNxtSession = (session) =>
  /^Grand Prix of Monterey Doubleheader\b/i.test(String(session.sessionLabel ?? ''));
const candidates = quality.sessions.filter(
  // Keep Bryce-bearing INDYCAR rows in the gate report so an identity mismatch
  // is explicit rather than silently skipped. Only the verified Monterey
  // doubleheader label is eligible for the narrow archive-metadata exception.
  // The inverse trap (Milwaukee's NXT-labelled Scott Dixon recording) enters
  // through its label and is rejected below because it has no Bryce run.
  (s) =>
    s.year === 2026 &&
    (s.series === 'INDY_NXT' || Boolean(s.analysis?.content?.bryce?.driver)) &&
    !audited.has(s.replayId)
);

// The coverage CSV's `event` value becomes the semantic session's venue join
// key. Archive descriptions often contain series sponsors and session suffixes,
// so store a stable track label instead of copying that description verbatim.
const canonicalEventLabel = (session) => {
  const label = String(session.sessionLabel ?? '');
  if (/portland/i.test(label)) return 'Portland International Raceway';
  if (/milwaukee/i.test(label)) return 'The Milwaukee Mile';
  if (/monterey/i.test(label)) {
    const race = /race\s*(\d+)/i.exec(label)?.[1];
    return `WeatherTech Raceway Laguna Seca${race ? ` Race ${race}` : ''}`;
  }
  return label.replace(/\s+-\s+(?:Practice|Qualifications?|Qualifying|Race).*$/i, '').trim() || label;
};

const eligiblePromotions = [];
const held = [];
for (const s of candidates) {
  const seg = s.analysis?.content?.bryceSegment;
  const isQualifying = s.sessionType === 'qualifying';
  const raceRosterProof = (seg?.minCars ?? 0) >= 20 && (seg?.uniqueDriverCount ?? 0) >= 20;
  // Road-course groups can contain only half the field; oval qualifying can be
  // one car at a time. Require an actual Bryce run plus enough observed frames,
  // while retaining the full reconstructed roster when it is present.
  const qualifyingRunProof =
    isQualifying &&
    (seg?.frameCount ?? 0) >= 120 &&
    (seg?.maxLap ?? 0) >= 1 &&
    ((seg?.uniqueDriverCount ?? 0) >= 7 || (seg?.minCars ?? 0) >= 1);
  const gates = {
    seriesIdentity: s.series === 'INDY_NXT' || isVerifiedUnlabelledNxtSession(s),
    usable: s.analysis?.quality?.status === 'usable',
    rosterOrQualifyingRun: isQualifying ? qualifyingRunProof : raceRosterProof,
    bryce: Boolean(s.analysis?.content?.bryce?.driver),
    checkered: s.sessionType !== 'race' || seg?.hasCheckered === true
  };
  const failed = Object.entries(gates).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length > 0) {
    held.push({ replayId: s.replayId, label: s.sessionLabel, sessionType: s.sessionType, failedGates: failed });
    continue;
  }
  const note =
    `${todayIso} postrace:lake-sync auto-promotion: ${seg.minCars}-car NXT roster incl. ${s.analysis.content.bryce.driver}; ` +
    `${s.analysis.frames.count} frames over ${s.analysis.frames.observedSpanSeconds}s ` +
    `(median gap ${s.analysis.frames.updateGapMedianSeconds}s, max ${s.analysis.frames.updateGapMaxSeconds}s); ` +
    `max lap ${seg.maxLap}; checkered=${seg.hasCheckered}. ` +
    'Downstream semantic/crosswalk/replay-feed validators must confirm against canonical before this session reaches any surface.';
  if (s.sessionType === 'race') {
    eligiblePromotions.push({ source: s, kind: 'race', row: { event: canonicalEventLabel(s), replayId: s.replayId, discovery: s.series === 'INDY_NXT' ? 'nxt_labelled' : 'verified_event_roster', maxLap: seg.maxLap, checkered: seg.hasCheckered, validationNote: note } });
  } else {
    eligiblePromotions.push({ source: s, kind: 'nonRace', row: { event: canonicalEventLabel(s), sessionType: s.sessionType, replayId: s.replayId, validationNote: note } });
  }
}

// Archive searches can return both a partial recording and a longer recording
// for one logical session. Promote only the strongest observed span, while
// reporting the other replay ID as an explicit superseded duplicate.
const bestPromotionBySession = new Map();
const promotionScore = (promotion) => {
  const seg = promotion.source.analysis?.content?.bryceSegment;
  return [Number(seg?.frameCount) || 0, Number(seg?.observedSpanSeconds) || 0, promotion.row.replayId];
};
const outranks = (candidate, incumbent) => {
  const left = promotionScore(candidate);
  const right = promotionScore(incumbent);
  return left[0] > right[0] || (left[0] === right[0] && (left[1] > right[1] || (left[1] === right[1] && left[2] > right[2])));
};
for (const promotion of eligiblePromotions) {
  const key = `${promotion.kind}|${String(promotion.source.sessionLabel).trim().toLowerCase()}|${promotion.source.sessionType}`;
  const incumbent = bestPromotionBySession.get(key);
  if (!incumbent) {
    bestPromotionBySession.set(key, promotion);
    continue;
  }
  const loser = outranks(promotion, incumbent) ? incumbent : promotion;
  if (loser === incumbent) bestPromotionBySession.set(key, promotion);
  held.push({ replayId: loser.row.replayId, label: loser.source.sessionLabel, sessionType: loser.source.sessionType, failedGates: ['superseded_duplicate'] });
}
const promoted = [...bestPromotionBySession.values()].map(({kind, row}) => ({kind, row}));

process.stdout.write(`\n=== promotion gate\nnew candidates: ${candidates.length}, promotable: ${promoted.length}, held: ${held.length}\n`);
for (const p of promoted) process.stdout.write(`  PROMOTE ${p.kind} ${p.row.replayId} — ${p.row.event}\n`);
for (const h of held) process.stdout.write(`  HELD    ${h.replayId} — ${h.label} (failed: ${h.failedGates.join(', ')})\n`);

if (dryRun) {
  process.stdout.write('\nDry run: nothing written. Re-run without --dry-run to promote and rebuild.\n');
  process.exit(0);
}

if (promoted.length > 0) {
  for (const p of promoted) {
    if (p.kind === 'race') audit.raceReplays.push(p.row);
    else audit.nonRaceSessionCandidates.push(p.row);
  }
  const races = promoted.filter((p) => p.kind === 'race').length;
  const nonRaces = promoted.length - races;
  audit.auditedAt = todayIso;
  audit.coverage.completedRaces = (audit.coverage.completedRaces ?? 0) + races;
  audit.coverage.completeRaceCandidates = (audit.coverage.completeRaceCandidates ?? 0) + races;
  audit.coverage.futureRacesNotYetHistorical = Math.max(0, (audit.coverage.futureRacesNotYetHistorical ?? 0) - races);
  if (nonRaces > 0) {
    audit.coverage.completedPracticeAndQualifyingSessionsThroughNashvilleQualifying =
      (audit.coverage.completedPracticeAndQualifyingSessionsThroughNashvilleQualifying ?? 0) + nonRaces;
    audit.coverage.practiceAndQualifyingReplayCandidates = (audit.coverage.practiceAndQualifyingReplayCandidates ?? 0) + nonRaces;
  }
  writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  process.stdout.write(`Audited canonical list updated: +${races} race(s), +${nonRaces} non-race session(s).\n`);
}

// ---- 5: coverage matrix through today --------------------------------------
run('build-coverage', 'node', [join(LAKE_SCRIPTS, 'build-coverage.mjs'), '--data-root', lakeRoot, '--through-date', todayIso]);

// ---- 6: copy regenerated artifacts into the committed repo tree ------------
const repoLake = join(REPO_ROOT, 'data/historical-data-lake');
if (resolve(lakeRoot) !== resolve(repoLake)) {
  for (const rel of COMMITTED_ARTIFACTS) {
    const src = join(lakeRoot, rel);
    if (existsSync(src)) copyFileSync(src, join(repoLake, rel));
  }
  process.stdout.write(`\n=== copy-back\nCommitted lake artifacts refreshed from ${lakeRoot}\n`);
}

// ---- 7-8: semantic layer + replay feeds (all validators in force) ----------
run('semantic: build-timing71-2026', 'node', [join(SEMANTIC, 'build-timing71-2026.mjs')]);
run('semantic: build-identity-crosswalk', 'node', [join(SEMANTIC, 'build-identity-crosswalk.mjs')]);
run('semantic: validate-crosswalk', 'node', [join(SEMANTIC, 'validate-crosswalk.mjs')]);
run('replay feeds: build', 'node', [join(REPLAY_FEEDS, 'build-replay-feeds.mjs')]);
run('replay feeds: validate', 'node', [join(REPLAY_FEEDS, 'validate-replay-feeds.mjs')]);

process.stdout.write(
  '\npostrace:lake-sync complete.\nRemaining manual steps (deliberate):\n' +
    '  1. npm run analytics:ui-data-package:refresh-validate (with BRYCECAST_ANALYTICS_AS_OF_DATE + BRYCECAST_SQLITE_PATH pins)\n' +
    '  2. Review `git diff` (audit list + coverage + semantic outputs), then commit.\n' +
    '  3. Deploy via the usual reviewed flow.\n'
);
