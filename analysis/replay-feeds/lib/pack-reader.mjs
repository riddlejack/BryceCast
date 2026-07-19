import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Read a semantic-layer session pack (gzipped NDJSON) into records grouped by
 * their `record` discriminator. This is the reducer's read side: the inputs are
 * the committed semantic-layer outputs, never the raw lake or the live sqlite.
 */
export const readSessionPack = (path) => {
  const text = gunzipSync(readFileSync(path)).toString('utf8').trim();
  const grouped = {
    session_meta: null,
    geometry: null,
    roster: null,
    flags: [],
    classification: [],
    laps: [],
    loop_crossings: []
  };
  if (!text) return grouped;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    switch (row.record) {
      case 'session_meta':
        grouped.session_meta = row;
        break;
      case 'geometry':
        grouped.geometry = row;
        break;
      case 'roster':
        grouped.roster = row;
        break;
      case 'flag':
        grouped.flags.push(row);
        break;
      case 'classification':
        grouped.classification.push(row);
        break;
      case 'lap':
        grouped.laps.push(row);
        break;
      case 'loop_crossing':
        grouped.loop_crossings.push(row);
        break;
      default:
        break;
    }
  }
  return grouped;
};

/** Write an array of snapshot records as gzipped NDJSON (house pack pattern, level 9). */
export const writeFeedPack = (path, rows) => {
  const ndjson = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  const gz = gzipSync(Buffer.from(ndjson, 'utf8'), { level: 9 });
  writeFileSync(path, gz);
  return { bytes: gz.length, rows: rows.length };
};
