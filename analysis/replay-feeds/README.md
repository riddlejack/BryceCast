# analysis/replay-feeds — the lake learns to replay

Brief L slice 2, the reducer. This lane turns the semantic layer's per-session
timing tables into the **capture-shaped snapshot feeds the Time Machine plays**, so
"Watch this race unfold" can appear on all 45 canonical 2024–2026 races.

The output is byte-shape-compatible with the live runner's archive rows
(`raw.timing.timing_results = { heartbeat, Item[] }` + the enrichment endpoints), so
the existing api-server replay path serves a lake feed with **no per-source branch**.

## Inputs (READ-ONLY)

Only the committed semantic-layer outputs — never the raw lake, never the live
sqlite:

| input | role |
| --- | --- |
| `../semantic-layer/output/validation/finishing-order.json` | the 28 clean 2024-25 RaceTools races + their `canonicalSessionId` + the winner/podium/lap validation |
| `../semantic-layer/output/crosswalk/crosswalk-validation.json` | validated Timing71 2026 races + `canonicalSessionId` + GO/NO-GO + canonical winner check |
| `../semantic-layer/output/crosswalk/identity-crosswalk-2026.json` | per-2026-session eventId + per-car driverIds |
| `../semantic-layer/output/cross-check/capture-final-states.json` | our own capture's final field, for the two-source diff |
| `../semantic-layer/output/sessions/*.ndjson.gz` | RaceTools loop-crossing / lap / flag / classification tables |
| `../semantic-layer/output/sessions-2026/*.ndjson.gz` | Timing71 event-grain tables |
| `../semantic-layer/output/live-captures/*.ndjson.gz` | observed Race Control rows for the latest four races |

## How the reduction works

Per derived session, one capture-shaped snapshot row per **1-second virtual
second** from the green flag to the checker. Direct Race Control feeds retain
their observed cadence and are not interpolated:

- **Running order** — a step function. Cars are ranked by on-track progress derived
  from loop-crossing timestamps; **positions change only at crossings** (no invented
  between-loop precision). Among cars sharing the same most-recent loop, the earlier
  crossing leads.
- **Gaps** — timestamp differences at the **most recent common loop**; a lapped car
  reads `+N L`.
- **Flags / laps** — the flag state at each second comes from the flags table; lap
  counters from the authoritative `lap` records (not `isLapBoundary`, which double-
  counts at venues with an alternate S/F line such as Barber).
- **Bryce's row** — resolved by NAME (semantic layer) / crosswalk driverId, carrying
  his **TRUE season car number** (#27 in 2024, #39 at St Pete 2025, then #9) while
  stamping the stable BryceCast identity (`DriverID 2143`) the frontend keys on.
- **The checker frame** — the **as-raced final classification order** (the honesty
  line at the checkered). Classification is validated against canonical separately;
  Road America R2 2026 diverges by design (post-race DQ of the on-road winner).

### The clocks

- RaceTools feeds carry a **session-local virtual clock** — seconds-of-day on the
  session date, labelled `Z`. Correct year/date, **not** UTC-accurate (the semantic
  layer's date anchor timezone is unvalidated). The replay uses it only as a relative
  virtual clock.
- Timing71 feeds carry **real UTC epoch** timestamps.
- Race Control capture feeds carry **real UTC capture** timestamps.

Interpolation is a bounded five-second step hold. When the underlying source
has a longer gap, the reducer emits no rows after that bound and the runtime
returns a structured `source_gap` with `nextObservedAt`/`resumeAt`; it never
holds the previous car state across the missing interval.

## Commands

```bash
npm run analytics:replay-feeds            # reduce all scoped races -> output/feeds + manifest
npm run analytics:replay-feeds:validate   # lane gate (exits non-zero on failure)
```

## Outputs

```
output/
  feeds/<canonicalSessionId>.ndjson.gz    # capture-shaped snapshot rows, gzipped NDJSON (level 9)
  replay-feeds-manifest.json              # what is in / excluded and why + per-session validation
```

Feeds are deterministically regenerable from semantic-layer packs and observed
capture archives.

## Serving

- `scripts/lib/replay-lake-feeds.mjs` — a source adapter with the sqlite overlay's
  interface (`available / start / stop / status / currentRecord`) that reads these
  feeds instead of the runner archive, enforces the same live-guard, and keeps a
  three-session LRU for parsed rows.
- `scripts/lib/replay-router.mjs` — merges our own captures with the lake feeds in
  `available()`, **source-tiered**; a lake session is suppressed when a watchable
  capture already covers the same event session, so our own capture stays
  authoritative and a race page never shows two replay modules.
- The Live page's trust rail and the race-page provenance block name the tier
  ("RaceTools race-weekend capture" / "third-party normalized (Timing71)" / our own
  capture) — never "official", never confusable with live.

## Scope

Ship a validated subset over an unvalidated sweep. The manifest is the record of what
is in and what is out and why.

- **(a) 2024-25 RaceTools races** — 28/28 clean, all watchable.
- **(b) 2026 Timing71 races** — 13 watchable (the Road America R2 CONDITIONAL is
  served as-raced with the honesty line).
- **(c) latest 2026 direct captures** — Portland, Milwaukee, and both Monterey
  races are observed Race Control rows with no interpolation.

## Validation (per session, in the manifest + gate)

- Checker-frame on-road order equals the semantic layer's validated finishing order;
  RaceTools winner/podium match canonical (28/28).
- Lap counts within the semantic layer's known ±1.
- Flag intervals sane (green present, ends checkered, valid states).
- Bryce present ≥120 frames (identity guard).
- Two-source diff vs our own capture where it exists (4 races): order agreement ≥99%.
