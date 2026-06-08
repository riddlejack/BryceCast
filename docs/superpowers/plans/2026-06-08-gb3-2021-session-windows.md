# GB3 2021 and Session Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import source-backed GB3 2021 career data and increase exact session-window coverage without promoting date-only facts into hour-level precision.

**Architecture:** Extend the existing canonical career dataset pipeline instead of adding a sidecar. GB3 2021 either uses the official GB3 JSON route if discoverable or a dedicated official PDF/source inventory path; session-window backfill uses a separate raw manifest with explicit precision and provenance.

**Tech Stack:** Node ESM scripts, JSON raw artifacts, existing validation and summary scripts.

---

### Task 1: Add Regression Tests

**Files:**
- Create: `scripts/test-career-data-regressions.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dataset = JSON.parse(await readFile('data/career/career.dataset.json', 'utf8'));
const report = JSON.parse(await readFile('data/career/reports/validation-report.json', 'utf8'));

const ids = (rows) => rows.map((row) => row.id);
const duplicateIds = (rows) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  }
  return [...duplicates];
};

assert.equal(report.ok, true, 'career validation report must be passing before regression checks');
assert.deepEqual(duplicateIds(dataset.sessions), [], 'sessions must not contain duplicate ids');
assert.deepEqual(duplicateIds(dataset.results), [], 'results must not contain duplicate ids');
assert.deepEqual(duplicateIds(dataset.sourceEvidence), [], 'sourceEvidence must not contain duplicate ids');
assert.ok(dataset.seasons.some((row) => row.id === 'season_gb3_2021_bryce_aron'), 'GB3 2021 Bryce season must be imported');
assert.ok(dataset.sessions.some((row) => row.id.startsWith('session_gb3_2021_')), 'GB3 2021 sessions must be imported');
assert.ok(dataset.results.some((row) => row.id.startsWith('result_gb3_2021_') && row.driverId === 'driver_bryce_aron'), 'GB3 2021 Bryce results must be imported');
assert.equal(dataset.gaps.some((row) => /GB3 2021/.test(row.description ?? '')), false, 'GB3 2021 must not remain in the broad open career gap after import');

const missingStart = dataset.sessions.filter((row) => !row.scheduledStart && !row.actualStart);
assert.ok(missingStart.length < 53, `session-window backfill should reduce missing starts below 53; got ${missingStart.length}`);

for (const session of dataset.sessions) {
  if (session.timePrecision === 'local_datetime' || session.timePrecision === 'source_datetime') {
    assert.ok(session.scheduledStart || session.actualStart, `${session.id} has precise timePrecision without a timestamp`);
    assert.ok(session.timezone, `${session.id} has precise timePrecision without timezone`);
    assert.ok((session.provenanceRefs ?? []).length > 0, `${session.id} has precise timePrecision without provenance`);
  }
}
```

- [ ] **Step 2: Verify red**

Run: `node scripts/test-career-data-regressions.mjs`

Expected: FAIL because `season_gb3_2021_bryce_aron` is not imported and missing-start count is still 53.

- [ ] **Step 3: Wire the test command**

Add `"career:test": "node scripts/test-career-data-regressions.mjs"` to `package.json`.

### Task 2: Import GB3 2021

**Files:**
- Modify: `scripts/import-gb3-career.mjs`
- Possibly create raw files under `data/career/raw/gb3/`

- [ ] **Step 1: Discover controlling sources**

Use official GB3 JSON first. If no 2021 JSON route is live, use official timing PDFs/pages and store every raw artifact path or URL in `sourceEvidence`.

- [ ] **Step 2: Generalize importer**

Change hard-coded 2022 constants into season configs. Preserve current 2022 row IDs exactly. Add 2021 rows with ids using `gb3_2021`.

- [ ] **Step 3: Remove stale broad gap text**

After import, broad career gap language must no longer list GB3 2021.

- [ ] **Step 4: Verify green for GB3**

Run: `npm run career:import:gb3 && npm run career:validate && npm run career:test`.

Expected: PASS or fail only on the session-window assertion before Task 3.

### Task 3: Backfill Exact Session Windows

**Files:**
- Create: `scripts/backfill-session-windows.mjs`
- Create: `data/career/raw/session-windows/session-windows.v1.json`
- Modify: `package.json`

- [ ] **Step 1: Add a conservative raw manifest**

Each row must include `sessionId`, `scheduledStart`, `timezone`, `precision`, `sourceName`, `sourceUrl`, `sourceEvidenceId`, and `confidenceTier`.

- [ ] **Step 2: Implement manifest validation and backfill**

The script should reject invalid timestamps, invalid timezones, missing evidence ids, and precision values outside the accepted vocabulary. It should update only sessions with exact source-backed windows.

- [ ] **Step 3: Wire pipeline**

Add `career:backfill:session-windows` and include it in `career:import:all` after source imports and before track metadata/weather readiness.

- [ ] **Step 4: Verify green**

Run: `npm run career:backfill:session-windows && npm run career:backfill:track-metadata && npm run career:validate && npm run career:test`.

Expected: PASS with missing session starts below 53 and no date-only rows marked precise.

### Task 4: Final Verification and Docs

**Files:**
- Modify: `docs/CAREER_DATA_FEASIBILITY_MATRIX.md`
- Modify: `docs/CAREER_RESEARCH_WORKSTREAMS.md`
- Modify: `docs/CODEX_HANDOFF_CURRENT.md`
- Modify: `data/career/README.md`

- [ ] **Step 1: Run full import chain**

Run: `npm run career:import:all`.

Expected: PASS and idempotent counts on immediate rerun unless new source rows were intentionally added.

- [ ] **Step 2: Run app build**

Run: `npm run build`.

Expected: PASS.

- [ ] **Step 3: Update docs with verified counts**

Only update counts after final verification.
