#!/usr/bin/env node
// Writes a gzip copy of each built 3D track model beside it in dist
// (dist/tracks-3d/models/<venue>.json.gz), the file the Tracks page fetches
// first (src/three/trackModelLoad.ts) and unpacks in the browser.
//
// Why: the models are the site's largest files (Laguna Seca 945 KB) and, as
// .json, Cloudflare neither caches them nor receives them compressed, so every
// visit pulls the raw bytes from the production host through the tunnel. The
// .gz copy is about a quarter of the size, and .gz is on Cloudflare's default
// list of cached extensions. The browser's DecompressionStream returns the
// exact JSON bytes; where it is missing, or the copy fails, the page falls
// back to the .json, which is unchanged.
//
// Deterministic: Node's gzip writes no timestamp or name, so the same model
// always gives the same .gz. The source models in public/ are not touched.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, constants } from 'node:zlib';

const dir = process.argv[2] ?? 'dist/tracks-3d/models';
const files = (await readdir(dir)).filter((name) => name.endsWith('.json') && name !== 'index.json');
let raw = 0;
let packed = 0;
for (const name of files) {
  const bytes = await readFile(join(dir, name));
  const gz = gzipSync(bytes, { level: constants.Z_BEST_COMPRESSION });
  await writeFile(join(dir, `${name}.gz`), gz);
  raw += bytes.length;
  packed += gz.length;
}
console.log(`Track models: ${files.length} gzip copies, ${(raw / 1e6).toFixed(2)} MB -> ${(packed / 1e6).toFixed(2)} MB`);
