/**
 * Backward-compatible archive reader.
 *
 * The plan (docs/LIVE_ARCHIVE_V2_PLAN.md "API and replay changes") calls for ONE
 * reader abstraction that hydrates the current `{ summary, raw }` contract from
 * EITHER legacy `race_snapshots.payload_json` OR the V2 content-addressed sidecar,
 * so every consumer (latest snapshot, /api/readiness, /api/snapshot, replay,
 * source drawers) can route through it before any legacy payload is retired.
 *
 * This module is the abstraction. It is read-only and stateless-per-call. It is
 * NOT yet wired into api-server.mjs / replay-overlay.mjs — that promotion is a
 * gated step in the plan (run V2 in a bounded test session first). Wiring it in
 * now would mean editing live-read paths before the acceptance gates pass on a
 * real migration, which the plan forbids. Contract-equivalence is proven by
 * scripts/test-archive-v2.mjs instead.
 */

import { DatabaseSync } from 'node:sqlite';

import {
  detectArchiveFormat,
  hydrateV2Snapshot,
  parseLegacySnapshot,
  readMeta
} from './archive-v2.mjs';

/** Open an archive read-only and return a uniform reader over legacy OR V2. */
export const openArchive = (sqlitePath, { readOnly = true } = {}) => {
  const db = new DatabaseSync(sqlitePath, { readOnly });
  const detected = detectArchiveFormat(db);
  if (detected.format === 'unknown') {
    db.close();
    throw new Error(`Unrecognized archive at ${sqlitePath}: no race_snapshots or snapshots_v2 table.`);
  }
  const isV2 = detected.format === 'v2';
  const snapshotTable = isV2 ? 'snapshots_v2' : 'race_snapshots';

  /** Session index — identical column contract for both formats. */
  const listSessions = () =>
    db
      .prepare(
        `SELECT session_key AS sessionKey,
                COUNT(*) AS samples,
                MIN(checked_at) AS firstCheckedAt,
                MAX(checked_at) AS lastCheckedAt,
                MIN(event_id) AS eventId,
                MIN(event_session_id) AS eventSessionId,
                MIN(event_name) AS eventName,
                MIN(session_name) AS sessionName,
                MAX(total_laps) AS totalLaps,
                MIN(CASE WHEN UPPER(flag) = 'GREEN' THEN checked_at END) AS firstGreenAt
           FROM ${snapshotTable}
          GROUP BY session_key
          ORDER BY MIN(checked_at) ASC`
      )
      .all()
      .map((row) => ({ ...row, samples: Number(row.samples ?? 0) }));

  const hydrateRow = (row) => {
    if (!row) return null;
    return isV2 ? hydrateV2Snapshot(db, row) : parseLegacySnapshot(row);
  };

  // Prepare only the statements that match this archive's format — a V2-only
  // sidecar has no `race_snapshots` table, and vice-versa.
  const selectById = isV2
    ? db.prepare(`SELECT id, checked_at, session_key, summary_json FROM snapshots_v2 WHERE id = ?`)
    : db.prepare(`SELECT id, checked_at, session_key, payload_json FROM race_snapshots WHERE id = ?`);

  /** Hydrate one snapshot by primary key → `{ id, archiveCheckedAt, sessionKey, summary, raw }`. */
  const hydrateById = (id) => hydrateRow(selectById.get(id));

  const selectLatest = isV2
    ? db.prepare(
        `SELECT id, checked_at, session_key, summary_json
           FROM snapshots_v2
          WHERE session_key = ? AND checked_at <= ?
          ORDER BY checked_at DESC LIMIT 1`
      )
    : db.prepare(
        `SELECT id, checked_at, session_key, payload_json
           FROM race_snapshots
          WHERE session_key = ? AND checked_at <= ?
          ORDER BY checked_at DESC LIMIT 1`
      );

  /** Latest snapshot at/before a virtual timestamp — the replay resolve path. */
  const hydrateAt = (sessionKey, virtualNowIso) => hydrateRow(selectLatest.get(sessionKey, virtualNowIso));

  /** Every snapshot id in the archive, ascending — for full-archive equivalence sweeps. */
  const allSnapshotIds = () => db.prepare(`SELECT id FROM ${snapshotTable} ORDER BY id ASC`).all().map((r) => Number(r.id));

  return {
    format: detected.format,
    schemaVersion: detected.schemaVersion,
    meta: () => readMeta(db),
    listSessions,
    hydrateById,
    hydrateAt,
    allSnapshotIds,
    /** Escape hatch for consumers that need raw SQL against the underlying db. */
    db,
    close: () => db.close()
  };
};
