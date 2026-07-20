/**
 * Archive V2 offline acceptance gates.
 *
 * Implements the runnable-offline subset of docs/LIVE_ARCHIVE_V2_PLAN.md
 * "Acceptance gates":
 *   - Every legacy observation timestamp is represented in V2.
 *   - Every distinct endpoint payload is hash-addressable and reconstructable.
 *   - Hydrated latest/replay payloads are contract-equivalent to legacy output
 *     (here: byte-identical reconstruction of payload_json).
 *   - DNF/mechanical/status/comment/pit/flag/session-transition events survive.
 *   - Compression ratio measured and reported against the plan's ≤15% target.
 *
 * The live-only gates (one-second capture continuity, browser/readiness routes,
 * recovery from a stopped writer) are NOT run here — they require the runner and
 * a live session and are handled by the plan's shadow-dual-write / test-session
 * steps. Idempotency (a proxy for the recovery gate's "no duplicate ownership")
 * is covered by scripts/test-archive-v2.mjs.
 */

import { DatabaseSync } from 'node:sqlite';

import { contentHash, detectArchiveFormat, reconstructPayloadJson } from './archive-v2.mjs';

const COMPRESSION_TARGET = 0.15; // V2 embedded bytes must be ≤ 15% of legacy.

const norm = (value) => (value === null || value === undefined ? '' : String(value));

/** Rows whose rare-transition columns differ from the previous row in the same
 *  session — DNF/status/comment/pit/flag/session boundaries. These must survive. */
const transitionSignature = (row) =>
  [norm(row.session_key), norm(row.source_state), norm(row.flag), norm(row.bryce_status), norm(row.bryce_laps)].join('|');

export const runAcceptanceGates = ({ legacyPath, v2Path, sampleEvery = 1 } = {}) => {
  const legacy = new DatabaseSync(legacyPath, { readOnly: true });
  const v2 = new DatabaseSync(v2Path, { readOnly: true });
  const gates = [];
  try {
    if (detectArchiveFormat(legacy).format !== 'legacy') throw new Error('legacyPath is not a legacy archive');
    if (detectArchiveFormat(v2).format !== 'v2') throw new Error('v2Path is not a V2 sidecar');

    // ---- Gate 1: every legacy observation timestamp is represented in V2. -----
    const legacyCount = Number(legacy.prepare(`SELECT COUNT(*) AS n FROM race_snapshots`).get().n);
    const v2Count = Number(v2.prepare(`SELECT COUNT(*) AS n FROM snapshots_v2`).get().n);
    const legacyIdTs = legacy.prepare(`SELECT id, checked_at FROM race_snapshots ORDER BY id ASC`).all();
    const v2ById = new Map(
      v2.prepare(`SELECT id, checked_at FROM snapshots_v2`).all().map((r) => [Number(r.id), r.checked_at])
    );
    let missingTs = 0;
    for (const row of legacyIdTs) {
      const t = v2ById.get(Number(row.id));
      if (t === undefined || t !== row.checked_at) missingTs += 1;
    }
    gates.push({
      name: 'timestamp-survival',
      pass: legacyCount === v2Count && missingTs === 0,
      detail: `legacy=${legacyCount} v2=${v2Count} mismatchedTimestamps=${missingTs}`,
      metrics: { legacyCount, v2Count, missingTs }
    });

    // ---- Gate 2: payload versions hash-addressable & every ref resolves. ------
    const refIntegrity = Number(
      v2
        .prepare(
          `SELECT COUNT(*) AS n FROM snapshot_payload_refs r
             LEFT JOIN source_payload_versions v ON v.id = r.payload_version_id
            WHERE v.id IS NULL`
        )
        .get().n
    );
    const distinctVersions = Number(v2.prepare(`SELECT COUNT(*) AS n FROM source_payload_versions`).get().n);
    const hashRehashMismatch = (() => {
      // Sanity: every stored content_hash actually addresses its payload bytes.
      const rows = v2.prepare(`SELECT content_hash, payload_json FROM source_payload_versions`).all();
      let bad = 0;
      for (const row of rows) {
        if (contentHash(row.payload_json) !== row.content_hash) bad += 1;
      }
      return bad;
    })();
    gates.push({
      name: 'payload-addressable',
      pass: refIntegrity === 0 && distinctVersions > 0 && hashRehashMismatch === 0,
      detail: `distinctVersions=${distinctVersions} danglingRefs=${refIntegrity} hashMismatch=${hashRehashMismatch}`,
      metrics: { distinctVersions, danglingRefs: refIntegrity, hashMismatch: hashRehashMismatch }
    });

    // ---- Gate 3: contract-equivalence — byte-identical payload_json. ----------
    const legacyPayloadStmt = legacy.prepare(`SELECT payload_json FROM race_snapshots WHERE id = ?`);
    let compared = 0;
    let byteMismatch = 0;
    const mismatchSamples = [];
    for (const { id } of legacyIdTs) {
      if (sampleEvery > 1 && id % sampleEvery !== 0) continue;
      const legacyStr = legacyPayloadStmt.get(id).payload_json;
      const reconstructed = reconstructPayloadJson(v2, Number(id));
      compared += 1;
      if (reconstructed !== legacyStr) {
        byteMismatch += 1;
        if (mismatchSamples.length < 3) mismatchSamples.push(Number(id));
      }
    }
    gates.push({
      name: 'contract-equivalence',
      pass: byteMismatch === 0 && compared > 0,
      detail: `compared=${compared} byteIdenticalMismatches=${byteMismatch}${mismatchSamples.length ? ` (e.g. ids ${mismatchSamples.join(', ')})` : ''}`,
      metrics: { compared, byteMismatch, mismatchSamples }
    });

    // ---- Gate 4: rare-transition event survival. ------------------------------
    const legacyRows = legacy
      .prepare(`SELECT id, session_key, source_state, flag, bryce_status, bryce_laps FROM race_snapshots ORDER BY session_key ASC, checked_at ASC, id ASC`)
      .all();
    const transitionIds = [];
    let prevSig = null;
    let prevSession = null;
    for (const row of legacyRows) {
      const sig = transitionSignature(row);
      if (row.session_key !== prevSession || sig !== prevSig) {
        transitionIds.push(Number(row.id)); // session boundary or a state change
      }
      prevSig = sig;
      prevSession = row.session_key;
    }
    let transitionMissing = 0;
    for (const id of transitionIds) {
      const legacyStr = legacyPayloadStmt.get(id).payload_json;
      const reconstructed = reconstructPayloadJson(v2, id);
      if (reconstructed !== legacyStr) transitionMissing += 1;
    }
    gates.push({
      name: 'event-survival',
      pass: transitionMissing === 0,
      detail: `transitionRows=${transitionIds.length} survivedIdentically=${transitionIds.length - transitionMissing}`,
      metrics: { transitionRows: transitionIds.length, transitionMissing }
    });

    // ---- Gate 5: compression ratio measured & reported. -----------------------
    let legacyEmbedded = 0;
    const legacyBytesStmt = legacy.prepare(`SELECT payload_json FROM race_snapshots WHERE id = ?`);
    for (const { id } of legacyIdTs) legacyEmbedded += Buffer.byteLength(legacyBytesStmt.get(id).payload_json, 'utf8');
    const versionBytes = Number(v2.prepare(`SELECT COALESCE(SUM(payload_bytes),0) AS n FROM source_payload_versions`).get().n);
    const summaryBytes = Number(
      v2.prepare(`SELECT COALESCE(SUM(LENGTH(summary_json)),0) AS n FROM snapshots_v2`).get().n
    );
    const v2Embedded = versionBytes + summaryBytes;
    const ratio = legacyEmbedded > 0 ? v2Embedded / legacyEmbedded : null;
    gates.push({
      name: 'compression-ratio',
      pass: ratio !== null && ratio <= COMPRESSION_TARGET,
      detail:
        ratio === null
          ? 'no legacy embedded bytes to measure'
          : `legacy=${legacyEmbedded}B v2=${v2Embedded}B ratio=${(ratio * 100).toFixed(2)}% (target ≤ ${COMPRESSION_TARGET * 100}%)`,
      metrics: { legacyEmbedded, v2Embedded, versionBytes, summaryBytes, ratio, target: COMPRESSION_TARGET }
    });
  } finally {
    legacy.close();
    v2.close();
  }

  return { pass: gates.every((g) => g.pass), gates };
};
