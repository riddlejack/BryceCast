#!/usr/bin/env node
/* Fold duplicate driver records into one (proxy review 3, November 18, 2026).
 *
 * Reads data/career/identity/driver-aliases.json: each row names a `from` record that
 * is the same person as `to` (a second spelling, a series' old profile, a parse error or
 * a placeholder name), with the reason from the sheets. Every result and qualifying row
 * of `from` moves to `to`, keeps a note of the record it came from, and cites the alias
 * table; the `from` driver record is removed and kept on `to` as a merged record. So the
 * people counts, shared races and head-to-heads downstream all see one driver.
 *
 * Idempotent: a `from` already folded is skipped. A pair that ever shared a session is
 * refused, since one person can't be two cars in one race. Run it after the importers
 * (career:import:all does). */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = join(root, 'data/career/career.dataset.json');
const tablePath = join(root, 'data/career/identity/driver-aliases.json');
const reportPath = join(root, 'data/career/reports/driver-identity-backfill-report.json');
const evidenceId = 'source_driver_identity_aliases';

const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
const table = JSON.parse(await readFile(tablePath, 'utf8'));

const drivers = new Map(dataset.drivers.map((row) => [row.id, row]));
const sessionsOf = (id) => new Set(dataset.results.filter((row) => row.driverId === id).map((row) => row.sessionId));
const report = { table: 'data/career/identity/driver-aliases.json', foldedThisRun: [], aliases: [], heldApart: table.heldApart ?? [] };

for (const alias of table.aliases) {
  const from = drivers.get(alias.from);
  const to = drivers.get(alias.to);
  if (!to) throw new Error(`Alias target ${alias.to} is not a driver record`);
  if (!from) continue; /* already folded */
  const shared = [...sessionsOf(alias.from)].filter((id) => sessionsOf(alias.to).has(id));
  if (shared.length) throw new Error(`${alias.from} and ${alias.to} share sessions ${shared.join(', ')}; not one driver`);

  let results = 0;
  let qualifying = 0;
  const move = (row) => ({
    ...row,
    driverId: alias.to,
    raw: { ...(row.raw ?? {}), identityAlias: { fromDriverId: alias.from, fromDisplayName: from.displayName, kind: alias.kind } },
    provenanceRefs: Array.from(new Set([...(row.provenanceRefs ?? []), evidenceId]))
  });
  dataset.results = dataset.results.map((row) => (row.driverId === alias.from ? (results++, move(row)) : row));
  dataset.qualifyingResults = (dataset.qualifyingResults ?? []).map((row) => (row.driverId === alias.from ? (qualifying++, move(row)) : row));

  const merged = [...(to.mergedRecords ?? []), { id: from.id, displayName: from.displayName, externalIds: from.externalIds ?? {}, kind: alias.kind, reason: alias.reason }];
  drivers.set(alias.to, {
    ...to,
    mergedRecords: merged,
    provenanceRefs: Array.from(new Set([...(to.provenanceRefs ?? []), ...(from.provenanceRefs ?? []), evidenceId]))
  });
  drivers.delete(alias.from);
  report.foldedThisRun.push({ from: alias.from, to: alias.to, results, qualifying });
}

dataset.drivers = Array.from(drivers.values()).sort((a, b) => a.id.localeCompare(b.id));
/* What the dataset now carries, run after run: rows moved under each alias. */
const movedFrom = (rows, id) => rows.filter((row) => row.raw?.identityAlias?.fromDriverId === id).length;
report.aliases = table.aliases.map((alias) => ({
  from: alias.from,
  to: alias.to,
  kind: alias.kind,
  results: movedFrom(dataset.results, alias.from),
  qualifying: movedFrom(dataset.qualifyingResults ?? [], alias.from)
}));
const evidence = {
  id: evidenceId,
  sourceType: 'curated_identity_table',
  sourceName: 'BryceCast driver identity aliases',
  url: null,
  retrievedAt: `${table.checkedAt}T00:00:00.000Z`,
  publishedAt: null,
  accessedBy: 'scripts/backfill-driver-identities.mjs',
  licenseNotes: 'Derived from the official timing sheets and series JSON already cited on each row.',
  confidenceTier: 'derived',
  coverage: `${table.aliases.length} driver records folded into the record of the same person, each with the reason from the sheets.`,
  parser: 'scripts/backfill-driver-identities.mjs',
  rawArtifactPath: 'data/career/identity/driver-aliases.json',
  notes: 'Merges need the same car number or the same uncommon chassis, the same series and seasons, and no shared session. Lookalikes the sheets do not tie are held apart in the table.',
  provenanceRefs: []
};
dataset.sourceEvidence = [...dataset.sourceEvidence.filter((row) => row.id !== evidenceId), evidence].sort((a, b) => a.id.localeCompare(b.id));

await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ foldedThisRun: report.foldedThisRun.length, aliases: report.aliases.length, drivers: dataset.drivers.length }));
