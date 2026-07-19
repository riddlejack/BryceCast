// Read a per-session gzipped NDJSON pack back into grouped canonical tables.
// Validators read the COMMITTED packs (not the parser) so they check the
// lane's actual output end-to-end.

import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'output');

export async function loadSummary() {
  return JSON.parse(await readFile(join(OUTPUT_DIR, 'loop-crossings-summary.json'), 'utf8'));
}

export async function loadPack(packRelPath) {
  const text = gunzipSync(await readFile(join(OUTPUT_DIR, packRelPath))).toString('utf8');
  const grouped = {session_meta: null, geometry: null, flag: [], classification: [], lap: [], loop_crossing: []};
  for (const line of text.split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.record === 'session_meta') grouped.session_meta = row;
    else if (row.record === 'geometry') grouped.geometry = row;
    else grouped[row.record]?.push(row);
  }
  return grouped;
}

export {OUTPUT_DIR};
