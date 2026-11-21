import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isBryceTimingRow } from '../live-source-endpoints.mjs';

// The newest archived Race Control sample that carries Bryce's timing row: the
// live path's stand-in when a live frame has timing rows but no Bryce row.
//
// It used to be one query: a LIKE over every payload_json in race_snapshots,
// ORDER BY checked_at DESC LIMIT 500. No index serves that, so every call read
// the whole archive (19.3 GB in production, ~26 s on the event loop), uncached.
//
// Same answer, bounded cost:
//  - The first call walks sessions newest-first by MAX(checked_at), which the
//    (session_key, checked_at) index covers. Within each session it reads rows
//    newest-first by that index and stops at the first valid Bryce sample. It
//    stops entirely once the best sample found is at least as new as the next
//    session's newest row, since no row there can beat it.
//  - race_snapshots is append-only (the poller only INSERTs) with increasing
//    ids. Later calls therefore reuse the result and examine only rows with an
//    id above the last one seen. A replaced archive file (new inode), or a
//    maximum id that went down, starts over.
// "Newest" is by checked_at, exactly as before, and a tie goes to the lowest id
// (the old query's sort kept scan order). The one difference is that the
// old query gave up (null) when its 500 newest LIKE matches held no valid Bryce
// row; this keeps looking.

export const bryceLikeClause = `(
  payload_json LIKE '%"DriverID":"2143"%'
  OR payload_json LIKE '%"DriverID":2143%'
  OR (
    payload_json LIKE '%"firstName":"Bryce"%'
    AND payload_json LIKE '%"lastName":"Aron"%'
    AND (payload_json LIKE '%"no":"9"%' OR payload_json LIKE '%"no":9%')
  )
)`;

/** A row's payload, if it carries a valid INDY NXT Bryce timing row. */
const validSample = (row) => {
  if (!row?.payload_json) return null;
  const payload = JSON.parse(row.payload_json);
  const timing = payload.raw?.timing?.timing_results;
  const heartbeat = timing?.heartbeat;
  const timingRows = Array.isArray(timing?.Item) ? timing.Item : [];
  if (!timingRows.some((item) => isBryceTimingRow(item, heartbeat))) return null;
  return { id: Number(row.id), rowCheckedAt: row.checked_at, payloadJson: row.payload_json, checkedAt: row.checked_at ?? payload.summary?.checkedAt ?? null };
};

const newer = (candidate, best) => {
  if (!candidate) return false;
  if (!best) return true;
  const a = String(candidate.rowCheckedAt);
  const b = String(best.rowCheckedAt);
  return a > b || (a === b && candidate.id < best.id);
};

const fullSearch = (db) => {
  const sessions = db
    .prepare(
      `SELECT session_key AS sessionKey, MAX(checked_at) AS lastCheckedAt
         FROM race_snapshots
        GROUP BY session_key
        ORDER BY lastCheckedAt DESC`
    )
    .all();
  const sessionRows = db.prepare(
    `SELECT id, checked_at, payload_json
       FROM race_snapshots
      WHERE session_key = ? AND ${bryceLikeClause}
      ORDER BY checked_at DESC, id ASC`
  );
  let best = null;
  for (const { sessionKey, lastCheckedAt } of sessions) {
    if (best && String(best.rowCheckedAt) > String(lastCheckedAt)) break;
    for (const row of sessionRows.iterate(sessionKey)) {
      const sample = validSample(row);
      if (!sample) continue;
      if (newer(sample, best)) best = sample;
      break;
    }
  }
  return best;
};

const searchAfter = (db, afterId, best) => {
  const rows = db.prepare(
    `SELECT id, checked_at, payload_json
       FROM race_snapshots
      WHERE id > ? AND ${bryceLikeClause}
      ORDER BY id DESC`
  );
  let result = best;
  for (const row of rows.iterate(afterId)) {
    const sample = validSample(row);
    if (newer(sample, result)) result = sample;
  }
  return result;
};

export const createArchivedBryceSampleReader = ({ sqlitePath }) => {
  let memo = null; // { identity, maxId, sample }

  /** `{ raw, checkedAt }` freshly parsed per call (callers may mutate it), or null. */
  const read = () => {
    try {
      const file = statSync(sqlitePath);
      const identity = `${file.dev}:${file.ino}`;
      const db = new DatabaseSync(sqlitePath, { readOnly: true });
      try {
        const maxId = db.prepare('SELECT MAX(id) AS id FROM race_snapshots').get()?.id ?? null;
        let sample;
        if (memo && memo.identity === identity && maxId !== null && memo.maxId !== null && maxId >= memo.maxId) {
          sample = maxId === memo.maxId ? memo.sample : searchAfter(db, memo.maxId, memo.sample);
        } else {
          sample = fullSearch(db);
        }
        memo = { identity, maxId, sample };
        if (!sample) return null;
        return { raw: JSON.parse(sample.payloadJson).raw ?? null, checkedAt: sample.checkedAt };
      } finally {
        db.close();
      }
    } catch {
      return null;
    }
  };

  return { read, reset: () => (memo = null) };
};
