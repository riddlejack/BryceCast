/**
 * Live Archive V2 — content-addressed payload storage.
 *
 * Design and acceptance gates live in docs/LIVE_ARCHIVE_V2_PLAN.md. The problem
 * this solves: the live runner's `writeStorage` (scripts/lib/race-poller-core.mjs)
 * serializes the full `{ summary, raw }` object into every `race_snapshots.payload_json`
 * row. The `raw` object embeds the timing payload plus four enrichment payloads
 * (drivers_nxt, config, schedule_nxt, trackactivity_nxt) that almost never change
 * — a read-only audit measured 94.15% of the embedded bytes as duplicate content.
 *
 * V2 keeps one immutable row per distinct endpoint payload (deduped by SHA-256
 * content hash) and references it from each observation, so a repeated enrichment
 * payload is stored once instead of once per second.
 *
 * This module is PURE STORAGE MACHINERY. It NEVER touches the live runner, its
 * LaunchAgents, or the active `data/live/brycecast.sqlite`. Migrations run against
 * a COPY (see scripts/archive-v2-migrate.mjs, which hard-refuses a live runtime
 * directory). The retention policy at the bottom is inert config — no code path
 * activates it.
 */

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const ARCHIVE_V2_SCHEMA_VERSION = 2;

/** SHA-256 hex of the canonical serialization of one endpoint payload. */
export const contentHash = (canonicalJson) => createHash('sha256').update(canonicalJson, 'utf8').digest('hex');

/** Canonical serialization of a single endpoint payload. `JSON.stringify` is
 *  context-free: a value serializes identically standalone or nested inside the
 *  legacy `raw` object, which is what makes byte-identical reconstruction work.
 *  A failed fetch stores `payload: null` → 'null'. */
export const canonicalPayload = (payload) => JSON.stringify(payload ?? null);

const LEGACY_INDEX_COLUMNS = [
  'checked_at',
  'session_key',
  'event_id',
  'event_session_id',
  'event_name',
  'session_name',
  'flag',
  'lap',
  'total_laps',
  'source_state',
  'bryce_rank',
  'bryce_status',
  'bryce_laps',
  'bryce_gap',
  'bryce_best_lap_time'
];

/** Create the V2 sidecar schema. Idempotent (IF NOT EXISTS). */
export const createV2Schema = (db) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS archive_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS source_payload_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      is_null INTEGER NOT NULL DEFAULT 0,
      payload_bytes INTEGER NOT NULL,
      first_seen_at TEXT,
      last_seen_at TEXT,
      UNIQUE(endpoint_id, content_hash)
    );
    CREATE TABLE IF NOT EXISTS snapshots_v2 (
      id INTEGER PRIMARY KEY,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      event_id TEXT,
      event_session_id TEXT,
      event_name TEXT,
      session_name TEXT,
      flag TEXT,
      lap TEXT,
      total_laps TEXT,
      source_state TEXT NOT NULL,
      bryce_rank INTEGER,
      bryce_status TEXT,
      bryce_laps TEXT,
      bryce_gap TEXT,
      bryce_best_lap_time TEXT,
      summary_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_v2_session_checked ON snapshots_v2(session_key, checked_at);
    CREATE TABLE IF NOT EXISTS snapshot_payload_refs (
      snapshot_id INTEGER NOT NULL,
      ordinal INTEGER NOT NULL,
      endpoint_id TEXT NOT NULL,
      payload_version_id INTEGER NOT NULL,
      PRIMARY KEY (snapshot_id, endpoint_id),
      FOREIGN KEY (snapshot_id) REFERENCES snapshots_v2(id),
      FOREIGN KEY (payload_version_id) REFERENCES source_payload_versions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshot_payload_refs_version ON snapshot_payload_refs(payload_version_id);
    CREATE TABLE IF NOT EXISTS source_probes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      endpoint_id TEXT NOT NULL,
      url TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      last_modified TEXT,
      etag TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS bryce_samples (
      id INTEGER PRIMARY KEY,
      snapshot_id INTEGER NOT NULL,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      rank INTEGER,
      live_rank INTEGER,
      start_position INTEGER,
      laps TEXT,
      status TEXT,
      comment TEXT,
      gap TEXT,
      live_gap TEXT,
      diff TEXT,
      best_lap_time TEXT,
      best_lap TEXT,
      last_lap_time TEXT,
      best_speed TEXT,
      last_speed TEXT,
      average_speed TEXT,
      passes INTEGER,
      passed INTEGER,
      pit_stops INTEGER,
      last_pit_lap INTEGER,
      since_pit_lap INTEGER,
      tire TEXT,
      overtake_remain INTEGER,
      overtake_active TEXT,
      lap_distance REAL,
      live_diff_ahead TEXT,
      live_diff_behind TEXT,
      total_driver_points INTEGER,
      total_entrant_points INTEGER,
      running_driver_points INTEGER,
      radiofrequency TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bryce_samples_snapshot ON bryce_samples(snapshot_id);
  `);
};

const tableExists = (db, name) =>
  Boolean(db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name));

const tableColumns = (db, name) => db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);

/** Detect an archive's storage format from its schema. */
export const detectArchiveFormat = (db) => {
  if (tableExists(db, 'snapshots_v2') && tableExists(db, 'source_payload_versions')) {
    const meta = tableExists(db, 'archive_meta')
      ? db.prepare(`SELECT value FROM archive_meta WHERE key = 'schema_version'`).get()
      : null;
    return { format: 'v2', schemaVersion: meta ? Number(meta.value) : ARCHIVE_V2_SCHEMA_VERSION };
  }
  if (tableExists(db, 'race_snapshots')) {
    return { format: 'legacy', schemaVersion: 1 };
  }
  return { format: 'unknown', schemaVersion: null };
};

/** Parse one legacy `race_snapshots` row into the reader's `{ summary, raw }`
 *  contract. Mirrors `parseSnapshot` in scripts/lib/replay-overlay.mjs. */
export const parseLegacySnapshot = (row) => {
  if (!row?.payload_json) return null;
  const payload = JSON.parse(row.payload_json);
  return {
    id: Number(row.id),
    archiveCheckedAt: row.checked_at,
    sessionKey: row.session_key,
    summary: payload.summary ?? null,
    raw: payload.raw ?? null
  };
};

/**
 * Reconstruct the exact legacy `payload_json` STRING for a V2 snapshot.
 *
 * Byte-identity is the strongest form of the plan's contract-equivalence gate.
 * The legacy string is `JSON.stringify({ summary, raw })` where
 * `raw = { <endpoint_id>: <payload>, ... }` in fetch order. Because JSON
 * serialization is context-free, `JSON.stringify(payload)` for one endpoint is
 * byte-identical whether the value stands alone or is nested. We stored those
 * canonical strings verbatim in `source_payload_versions`, and the summary's
 * canonical string in `snapshots_v2`, so we can splice the original string back
 * together without a single re-serialization ambiguity.
 */
export const reconstructPayloadJson = (db, snapshotId) => {
  const snap = db
    .prepare(`SELECT summary_json FROM snapshots_v2 WHERE id = ?`)
    .get(snapshotId);
  if (!snap) return null;
  const refs = db
    .prepare(
      `SELECT r.ordinal AS ordinal, r.endpoint_id AS endpointId, v.payload_json AS payloadJson
         FROM snapshot_payload_refs r
         JOIN source_payload_versions v ON v.id = r.payload_version_id
        WHERE r.snapshot_id = ?
        ORDER BY r.ordinal ASC`
    )
    .all(snapshotId);
  const rawParts = refs.map((ref) => `${JSON.stringify(ref.endpointId)}:${ref.payloadJson}`);
  return `{"summary":${snap.summary_json},"raw":{${rawParts.join(',')}}}`;
};

/** Hydrate a V2 snapshot into the reader's `{ summary, raw }` contract object. */
export const hydrateV2Snapshot = (db, row) => {
  if (!row) return null;
  const refs = db
    .prepare(
      `SELECT r.ordinal AS ordinal, r.endpoint_id AS endpointId, v.payload_json AS payloadJson
         FROM snapshot_payload_refs r
         JOIN source_payload_versions v ON v.id = r.payload_version_id
        WHERE r.snapshot_id = ?
        ORDER BY r.ordinal ASC`
    )
    .all(row.id);
  const raw = {};
  for (const ref of refs) raw[ref.endpointId] = JSON.parse(ref.payloadJson);
  return {
    id: Number(row.id),
    archiveCheckedAt: row.checked_at,
    sessionKey: row.session_key,
    summary: JSON.parse(row.summary_json),
    raw
  };
};

/**
 * Migrate a legacy archive (COPY) into a V2 content-addressed sidecar.
 *
 * Streams `race_snapshots` by primary key in bounded batches (never loads the
 * whole DB — the live archive is multi-GB, though this only ever runs on a copy).
 * `bryce_samples` and `source_probes` are copied verbatim: they carry no embedded
 * payloads, and preserving them makes the sidecar a complete drop-in candidate
 * for every reader the plan lists. Snapshot ids are preserved 1:1 so those
 * foreign-key references stay valid.
 *
 * Idempotent: re-running against a fresh sidecar path reproduces the same
 * content. (The sidecar path must not already exist; the CLI enforces this.)
 */
export const migrateLegacyToV2 = ({
  sourceDb,
  sidecarDb,
  batchSize = 500,
  onProgress = null
} = {}) => {
  const detected = detectArchiveFormat(sourceDb);
  if (detected.format !== 'legacy') {
    throw new Error(`migrateLegacyToV2 expects a legacy archive; got format "${detected.format}".`);
  }

  createV2Schema(sidecarDb);

  const totalRow = sourceDb.prepare(`SELECT COUNT(*) AS n, MIN(id) AS minId, MAX(id) AS maxId FROM race_snapshots`).get();
  const total = Number(totalRow?.n ?? 0);

  const selectBatch = sourceDb.prepare(
    `SELECT * FROM race_snapshots WHERE id > ? ORDER BY id ASC LIMIT ?`
  );
  const insertSnapshot = sidecarDb.prepare(
    `INSERT INTO snapshots_v2 (id, ${LEGACY_INDEX_COLUMNS.join(', ')}, summary_json)
     VALUES (?, ${LEGACY_INDEX_COLUMNS.map(() => '?').join(', ')}, ?)`
  );
  const insertVersion = sidecarDb.prepare(
    `INSERT INTO source_payload_versions (endpoint_id, content_hash, payload_json, is_null, payload_bytes, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const touchVersion = sidecarDb.prepare(
    `UPDATE source_payload_versions SET last_seen_at = ? WHERE id = ?`
  );
  const insertRef = sidecarDb.prepare(
    `INSERT INTO snapshot_payload_refs (snapshot_id, ordinal, endpoint_id, payload_version_id) VALUES (?, ?, ?, ?)`
  );

  // In-memory index (endpoint_id \0 content_hash) → version id, so a repeated
  // enrichment payload never triggers a per-row SELECT during migration.
  const versionIndex = new Map();

  const stats = {
    snapshots: 0,
    payloadRefs: 0,
    distinctVersions: 0,
    legacyEmbeddedBytes: 0,
    v2EmbeddedBytes: 0,
    v2SummaryBytes: 0,
    perEndpoint: {},
    total
  };

  sidecarDb.exec('BEGIN');
  try {
    let cursor = -1;
    for (;;) {
      const rows = selectBatch.all(cursor, batchSize);
      if (rows.length === 0) break;
      for (const row of rows) {
        cursor = Number(row.id);
        const parsed = JSON.parse(row.payload_json);
        const summary = parsed.summary ?? null;
        const raw = parsed.raw ?? {};
        const summaryJson = JSON.stringify(summary);
        stats.legacyEmbeddedBytes += Buffer.byteLength(row.payload_json, 'utf8');
        stats.v2SummaryBytes += Buffer.byteLength(summaryJson, 'utf8');

        insertSnapshot.run(
          row.id,
          ...LEGACY_INDEX_COLUMNS.map((column) => row[column] ?? null),
          summaryJson
        );

        let ordinal = 0;
        for (const [endpointId, payload] of Object.entries(raw)) {
          const canonical = canonicalPayload(payload);
          const hash = contentHash(canonical);
          const key = `${endpointId} ${hash}`;
          let versionId = versionIndex.get(key);
          if (versionId === undefined) {
            const bytes = Buffer.byteLength(canonical, 'utf8');
            const res = insertVersion.run(
              endpointId,
              hash,
              canonical,
              payload === null || payload === undefined ? 1 : 0,
              bytes,
              row.checked_at,
              row.checked_at
            );
            versionId = Number(res.lastInsertRowid);
            versionIndex.set(key, versionId);
            stats.distinctVersions += 1;
            stats.v2EmbeddedBytes += bytes;
            const ep = (stats.perEndpoint[endpointId] ??= { versions: 0, refs: 0, versionBytes: 0 });
            ep.versions += 1;
            ep.versionBytes += bytes;
          } else {
            touchVersion.run(row.checked_at, versionId);
          }
          insertRef.run(row.id, ordinal, endpointId, versionId);
          ordinal += 1;
          stats.payloadRefs += 1;
          const ep = (stats.perEndpoint[endpointId] ??= { versions: 0, refs: 0, versionBytes: 0 });
          ep.refs += 1;
        }
        stats.snapshots += 1;
        if (onProgress && stats.snapshots % 1000 === 0) onProgress({ ...stats });
      }
    }

    // Carry forward the lightweight derived tables verbatim (no embedded payloads).
    copyVerbatimIfPresent(sourceDb, sidecarDb, 'bryce_samples', batchSize);
    copyVerbatimIfPresent(sourceDb, sidecarDb, 'source_probes', batchSize);

    const nowIso = new Date().toISOString();
    // v2 embedded footprint = distinct payload version bytes + inline summaries.
    const v2Embedded = stats.v2EmbeddedBytes + stats.v2SummaryBytes;
    const compressionRatio = stats.legacyEmbeddedBytes > 0 ? v2Embedded / stats.legacyEmbeddedBytes : null;
    setMeta(sidecarDb, {
      schema_version: String(ARCHIVE_V2_SCHEMA_VERSION),
      migrated_at: nowIso,
      snapshot_count: String(stats.snapshots),
      distinct_payload_versions: String(stats.distinctVersions),
      payload_refs: String(stats.payloadRefs),
      legacy_embedded_bytes: String(stats.legacyEmbeddedBytes),
      v2_embedded_bytes: String(v2Embedded),
      compression_ratio: compressionRatio === null ? '' : compressionRatio.toFixed(6)
    });

    sidecarDb.exec('COMMIT');
    stats.v2EmbeddedTotalBytes = v2Embedded;
    stats.compressionRatio = compressionRatio;
    stats.reductionRatio = compressionRatio === null ? null : 1 - compressionRatio;
    if (onProgress) onProgress({ ...stats });
    return stats;
  } catch (error) {
    sidecarDb.exec('ROLLBACK');
    throw error;
  }
};

const copyVerbatimIfPresent = (sourceDb, sidecarDb, table, batchSize) => {
  if (!tableExists(sourceDb, table)) return 0;
  const sourceCols = tableColumns(sourceDb, table);
  const destCols = tableColumns(sidecarDb, table);
  const cols = sourceCols.filter((c) => destCols.includes(c));
  if (cols.length === 0) return 0;
  const insert = sidecarDb.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  );
  const select = sourceDb.prepare(`SELECT ${cols.join(', ')} FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT ?`);
  let cursor = -1;
  let copied = 0;
  for (;;) {
    const rows = select.all(cursor, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      cursor = Number(row.id);
      insert.run(...cols.map((c) => row[c] ?? null));
      copied += 1;
    }
  }
  return copied;
};

const setMeta = (db, entries) => {
  const upsert = db.prepare(
    `INSERT INTO archive_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  for (const [key, value] of Object.entries(entries)) upsert.run(key, value);
};

export const readMeta = (db) => {
  if (!tableExists(db, 'archive_meta')) return {};
  const rows = db.prepare(`SELECT key, value FROM archive_meta`).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};

/**
 * Extract a single session from a source archive into a small standalone LEGACY
 * database (same schema as the live writer). This is how a session is copied out
 * of a large archive "to /tmp" for safe offline migration testing, per the plan's
 * safe-migration step 2 (build from copied/raw archives, never mutate the active
 * database). Read-only against the source; writes a fresh legacy DB.
 */
export const extractSessionToLegacyDb = ({ sourceDb, destDb, sessionKey, batchSize = 500 }) => {
  createLegacySchema(destDb);
  const idMap = new Set();
  const insertSnapshot = destDb.prepare(
    `INSERT INTO race_snapshots (id, ${LEGACY_INDEX_COLUMNS.join(', ')}, payload_json)
     VALUES (?, ${LEGACY_INDEX_COLUMNS.map(() => '?').join(', ')}, ?)`
  );
  const select = sourceDb.prepare(
    `SELECT * FROM race_snapshots WHERE session_key = ? AND id > ? ORDER BY id ASC LIMIT ?`
  );
  destDb.exec('BEGIN');
  let cursor = -1;
  let copied = 0;
  for (;;) {
    const rows = select.all(sessionKey, cursor, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      cursor = Number(row.id);
      idMap.add(Number(row.id));
      insertSnapshot.run(row.id, ...LEGACY_INDEX_COLUMNS.map((c) => row[c] ?? null), row.payload_json);
      copied += 1;
    }
  }
  copyChildRowsForSnapshots(sourceDb, destDb, 'bryce_samples', idMap, batchSize);
  copyChildRowsForSnapshots(sourceDb, destDb, 'source_probes', idMap, batchSize);
  destDb.exec('COMMIT');
  return { copied };
};

const copyChildRowsForSnapshots = (sourceDb, destDb, table, idSet, batchSize) => {
  if (!tableExists(sourceDb, table)) return 0;
  const sourceCols = tableColumns(sourceDb, table);
  const destCols = tableColumns(destDb, table);
  const cols = sourceCols.filter((c) => destCols.includes(c));
  const insert = destDb.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  const select = destDb ? sourceDb.prepare(`SELECT ${cols.join(', ')} FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT ?`) : null;
  let cursor = -1;
  let copied = 0;
  for (;;) {
    const rows = select.all(cursor, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      cursor = Number(row.id);
      if (!idSet.has(Number(row.snapshot_id))) continue;
      insert.run(...cols.map((c) => row[c] ?? null));
      copied += 1;
    }
  }
  return copied;
};

/** The legacy schema, matching scripts/lib/race-poller-core.mjs `openDb`. Used by
 *  session extraction and by the offline test fixture builder. */
export const createLegacySchema = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS race_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      event_id TEXT,
      event_session_id TEXT,
      event_name TEXT,
      session_name TEXT,
      flag TEXT,
      lap TEXT,
      total_laps TEXT,
      source_state TEXT NOT NULL,
      bryce_rank INTEGER,
      bryce_status TEXT,
      bryce_laps TEXT,
      bryce_gap TEXT,
      bryce_best_lap_time TEXT,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_race_snapshots_session_checked ON race_snapshots(session_key, checked_at);
    CREATE TABLE IF NOT EXISTS source_probes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      endpoint_id TEXT NOT NULL,
      url TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      last_modified TEXT,
      etag TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS bryce_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      checked_at TEXT NOT NULL,
      session_key TEXT NOT NULL,
      rank INTEGER,
      live_rank INTEGER,
      start_position INTEGER,
      laps TEXT,
      status TEXT,
      comment TEXT,
      gap TEXT,
      live_gap TEXT,
      diff TEXT,
      best_lap_time TEXT,
      best_lap TEXT,
      last_lap_time TEXT,
      best_speed TEXT,
      last_speed TEXT,
      average_speed TEXT,
      passes INTEGER,
      passed INTEGER,
      pit_stops INTEGER,
      last_pit_lap INTEGER,
      since_pit_lap INTEGER,
      tire TEXT,
      overtake_remain INTEGER,
      overtake_active TEXT,
      lap_distance REAL,
      live_diff_ahead TEXT,
      live_diff_behind TEXT,
      total_driver_points INTEGER,
      total_entrant_points INTEGER,
      running_driver_points INTEGER,
      radiofrequency TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bryce_samples_snapshot ON bryce_samples(snapshot_id);
  `);
};

/**
 * ============================================================================
 * Retention policy — INERT CONFIG. Not wired into any runtime code path.
 * ============================================================================
 *
 * The plan (docs/LIVE_ARCHIVE_V2_PLAN.md "Safe migration" step 8 + the automation
 * decision) leaves the long-term-immutable-copy question open and explicitly does
 * NOT authorize deleting or compacting the live archive. This config exists so the
 * retention shape is code-reviewable and versioned, but NOTHING calls `planRetention`
 * in production, and it never issues a DELETE. Activation is a separate, gated
 * decision after the acceptance gates pass on a real migration.
 */
export const DEFAULT_RETENTION_POLICY = Object.freeze({
  /** Number of most-recent sessions kept "hot" (fully hydratable, uncompacted). */
  hotSessionCount: 8,
  /** Sessions older than the hot window are candidates for compaction, not deletion. */
  compaction: Object.freeze({
    /** Never touch a session younger than this many days. */
    minAgeDays: 30,
    /** After compaction, keep timing observations only at change breakpoints
     *  (rank / flag / status / comment / pit transitions), not every 1s row. */
    keepTimingBreakpointsOnly: true,
    /** Enrichment payload versions are already deduped; compaction never removes
     *  a version still referenced by a retained observation. */
    dropUnreferencedVersions: true
  }),
  /** Hard guardrails that any future activation MUST honor. */
  guardrails: Object.freeze({
    neverDeleteRawTimingJsonl: true,
    neverMutateLiveArchive: true,
    requireContentEquivalenceGatePass: true
  })
});

/**
 * Pure planner: given a session index (newest first) and a policy, describe what
 * WOULD be kept hot / compacted. Returns a plan object only — it performs NO I/O
 * and issues NO deletes. Provided for tests and future gated tooling.
 */
export const planRetention = (sessions, policy = DEFAULT_RETENTION_POLICY, nowMs = Date.now()) => {
  const ordered = [...sessions].sort((a, b) => {
    const at = Date.parse(a.lastCheckedAt ?? a.firstCheckedAt ?? '') || 0;
    const bt = Date.parse(b.lastCheckedAt ?? b.firstCheckedAt ?? '') || 0;
    return bt - at;
  });
  const hot = ordered.slice(0, policy.hotSessionCount);
  const rest = ordered.slice(policy.hotSessionCount);
  const minAgeMs = policy.compaction.minAgeDays * 24 * 60 * 60 * 1000;
  const compactCandidates = [];
  const withheld = [];
  for (const session of rest) {
    const lastMs = Date.parse(session.lastCheckedAt ?? session.firstCheckedAt ?? '') || 0;
    const ageMs = nowMs - lastMs;
    if (ageMs >= minAgeMs) compactCandidates.push(session);
    else withheld.push(session);
  }
  return {
    policy,
    hotSessions: hot,
    compactCandidates,
    withheldTooYoung: withheld,
    activated: false,
    note: 'Inert plan. No deletion or compaction is performed. Activation is a separate gated decision.'
  };
};
