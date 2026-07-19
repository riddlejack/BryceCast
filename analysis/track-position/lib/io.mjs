// Shared IO: locate the semantic-layer output (this lane's INPUT), select the
// clean 2024-25 races, and write compact gzipped NDJSON packs (the house
// pattern shared with the semantic lane).

import {createWriteStream} from 'node:fs';
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';

export const LANE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const OUTPUT_DIR = join(LANE_DIR, 'output');

// The semantic layer lives one lane over; its committed output is our input.
export const SEMANTIC_DIR = join(dirname(LANE_DIR), 'semantic-layer', 'output');
export const SESSIONS_DIR = join(SEMANTIC_DIR, 'sessions');

// Known-defect masks that disqualify a race capture (per the semantic layer's
// validation policy): a full-day duplicate, a multi-session capture, or a
// header-only log. A heartbeat_gap alone is a valid race and kept.
const DEFECT_MASKS = new Set(['full_day_capture', 'mixed_session_requires_segmentation', 'log_header_only']);

export async function loadSemanticSummary() {
  return JSON.parse(await readFile(join(SEMANTIC_DIR, 'loop-crossings-summary.json'), 'utf8'));
}

export function cleanRaces(summary) {
  return summary.sessions.filter(
    (s) => s.sessionType === 'race' && !s.error && !(s.qualityMasks || []).some((m) => DEFECT_MASKS.has(m)),
  );
}

export function excludedRaces(summary) {
  return summary.sessions.filter(
    (s) => s.sessionType === 'race' && (s.error || (s.qualityMasks || []).some((m) => DEFECT_MASKS.has(m))),
  );
}

export async function writeGzipNdjson(path, rows) {
  await mkdir(dirname(path), {recursive: true});
  const gzip = createGzip({level: 9});
  const out = createWriteStream(path);
  gzip.pipe(out);
  for (const row of rows) if (!gzip.write(`${JSON.stringify(row)}\n`)) await once(gzip, 'drain');
  gzip.end();
  await once(out, 'finish');
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path);
}
