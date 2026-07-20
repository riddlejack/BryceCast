#!/usr/bin/env node
/**
 * archive-v2-migrate — migrate a legacy live archive (a COPY) into a V2
 * content-addressed sidecar, and (optionally) run the offline acceptance gates.
 *
 * SAFETY: this NEVER runs against the live runtime's SQLite. It hard-refuses any
 * source whose directory looks like an active runner home (a `live-runner.lock`
 * or `live-runner-status.json` sibling), and any source on the known live paths.
 * The plan (docs/LIVE_ARCHIVE_V2_PLAN.md "Safe migration") requires building the
 * sidecar from a COPY / extracted session, never mutating the active database.
 * The source is opened read-only; the sidecar is a brand-new file.
 *
 * Usage:
 *   node scripts/archive-v2-migrate.mjs --source=<copy.sqlite> --sidecar=<out.sqlite> [--gates] [--json]
 *   node scripts/archive-v2-migrate.mjs --source=<archive.sqlite> --extract-session=<key> --to=<copy.sqlite>
 *
 * The `--extract-session` mode copies one session out of a (read-only) source
 * archive into a small standalone legacy DB "to /tmp", per the plan's step 2.
 */

import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import {
  detectArchiveFormat,
  extractSessionToLegacyDb,
  migrateLegacyToV2,
  readMeta
} from './lib/archive-v2.mjs';
import { runAcceptanceGates } from './lib/archive-v2-gates.mjs';

const argValue = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

const die = (message) => {
  console.error(`archive-v2-migrate: ${message}`);
  process.exit(1);
};

/** Known live-archive locations across this fleet (MacBook runtime + mini). */
const KNOWN_LIVE_PATHS = [
  join(homedir(), 'Documents/Bryce POV access/data/live/brycecast.sqlite'),
  join(homedir(), 'BryceCast/site/data/live/brycecast.sqlite')
].map((p) => resolve(p));

/** Refuse anything that looks like a live runtime archive. */
const assertNotLiveRuntime = (sourcePath) => {
  const resolved = resolve(sourcePath);
  if (KNOWN_LIVE_PATHS.includes(resolved)) {
    die(`refusing to read the known live runtime archive:\n  ${resolved}\nMigrate a COPY instead (see --extract-session, or cp the file to /tmp).`);
  }
  const dir = dirname(resolved);
  for (const sentinel of ['live-runner.lock', 'live-runner-status.json']) {
    if (existsSync(join(dir, sentinel))) {
      die(
        `refusing: ${basename(resolved)} sits beside ${sentinel} — that directory is an active live-runner home.\n` +
          `Copy the session out first:  node scripts/archive-v2-migrate.mjs --source=<archive> --extract-session=<key> --to=/tmp/<copy>.sqlite`
      );
    }
  }
  return resolved;
};

const main = () => {
  const source = argValue('source');
  if (!source) die('--source=<path> is required.');
  const resolvedSource = assertNotLiveRuntime(source);
  if (!existsSync(resolvedSource)) die(`source not found: ${resolvedSource}`);
  if (!statSync(resolvedSource).isFile()) die(`source is not a file: ${resolvedSource}`);

  // --- Extraction mode: copy one session out to a standalone legacy DB. -------
  const extractSession = argValue('extract-session');
  if (extractSession) {
    const to = argValue('to');
    if (!to) die('--extract-session requires --to=<dest.sqlite>');
    const resolvedTo = resolve(to);
    if (existsSync(resolvedTo)) die(`--to already exists (refusing to overwrite): ${resolvedTo}`);
    const sourceDb = new DatabaseSync(resolvedSource, { readOnly: true });
    const destDb = new DatabaseSync(resolvedTo);
    try {
      const { copied } = extractSessionToLegacyDb({ sourceDb, destDb, sessionKey: extractSession });
      console.log(JSON.stringify({ ok: true, mode: 'extract', sessionKey: extractSession, copied, dest: resolvedTo }, null, 2));
    } finally {
      sourceDb.close();
      destDb.close();
    }
    return;
  }

  // --- Migration mode. --------------------------------------------------------
  const sidecar = argValue('sidecar');
  if (!sidecar) die('--sidecar=<path> is required for migration (or use --extract-session).');
  const resolvedSidecar = resolve(sidecar);
  if (existsSync(resolvedSidecar)) die(`--sidecar already exists (refusing to overwrite): ${resolvedSidecar}`);

  const sourceDb = new DatabaseSync(resolvedSource, { readOnly: true });
  const format = detectArchiveFormat(sourceDb).format;
  if (format !== 'legacy') {
    sourceDb.close();
    die(`--source is not a legacy archive (detected "${format}"). Nothing to migrate.`);
  }

  const sidecarDb = new DatabaseSync(resolvedSidecar);
  let stats;
  try {
    const startedMs = Date.now();
    stats = migrateLegacyToV2({
      sourceDb,
      sidecarDb,
      onProgress: (s) => {
        if (s.snapshots % 5000 === 0 && s.snapshots > 0) {
          process.stderr.write(`  … migrated ${s.snapshots}/${s.total} snapshots\n`);
        }
      }
    });
    stats.elapsedMs = Date.now() - startedMs;
  } finally {
    sourceDb.close();
    sidecarDb.close();
  }

  const report = {
    ok: true,
    mode: 'migrate',
    source: resolvedSource,
    sidecar: resolvedSidecar,
    snapshots: stats.snapshots,
    payloadRefs: stats.payloadRefs,
    distinctPayloadVersions: stats.distinctVersions,
    legacyEmbeddedBytes: stats.legacyEmbeddedBytes,
    v2EmbeddedBytes: stats.v2EmbeddedTotalBytes,
    compressionRatio: stats.compressionRatio,
    reductionPct: stats.reductionRatio === null ? null : Number((stats.reductionRatio * 100).toFixed(2)),
    perEndpoint: stats.perEndpoint,
    elapsedMs: stats.elapsedMs
  };

  let gates = null;
  if (hasFlag('gates')) {
    gates = runAcceptanceGates({ legacyPath: resolvedSource, v2Path: resolvedSidecar });
    report.gates = gates;
  }

  if (hasFlag('json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Migrated ${report.snapshots} snapshots → ${resolvedSidecar}`);
    console.log(`  distinct payload versions: ${report.distinctPayloadVersions} (from ${report.payloadRefs} refs)`);
    console.log(`  embedded bytes: ${report.legacyEmbeddedBytes} → ${report.v2EmbeddedBytes} (${report.reductionPct}% reduction)`);
    console.log(`  V2 embedded footprint is ${(report.compressionRatio * 100).toFixed(2)}% of legacy`);
    for (const [endpoint, ep] of Object.entries(report.perEndpoint)) {
      console.log(`    ${endpoint}: ${ep.versions} distinct / ${ep.refs} refs`);
    }
    if (gates) {
      console.log('');
      console.log(`Acceptance gates: ${gates.pass ? 'PASS' : 'FAIL'}`);
      for (const gate of gates.gates) {
        console.log(`  [${gate.pass ? 'PASS' : 'FAIL'}] ${gate.name} — ${gate.detail}`);
      }
    }
  }

  if (gates && !gates.pass) process.exit(1);
};

main();
