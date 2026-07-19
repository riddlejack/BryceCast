# Phase 3 Briefs O–T — Jack's post-race requests, scoped (2026-07-19)

Written by Fable (director) the evening after Music City. Source: the §5 brain
dump in `docs/PHASE3_HANDOFF_2026-07-19.md`, shaped per the house rule — data
gates before promises, taste gates before renders. Letters continue the
charter's sequence (G–N are taken). Every worker on these briefs is bound by
the July 12 charter's Global Rules + Reading Order and `docs/DESIGN_TASTE.md`.

Data gates were run against the MacBook capture archive on 2026-07-19
(read-only; session 5538-6755, 2,744 race snapshots, 21,798 total samples):

- **Section fields: ABSENT from the live Race Control payload.** No
  `LastSection`/section keys in any race snapshot. Jack's live section heat
  map cannot be honest from our current live source (verdict below).
- **Speed fields: per-LAP only.** `last_speed` / `best_speed` /
  `average_speed` hold steady within a lap (176.005 constant across lap 30's
  seconds) — these are lap-average speeds from timing, not velocity.
- **`lap_distance`: zero in all 21,798 samples** — the audit's "dead field"
  verdict confirmed on our own capture. True telemetry stays a CGR-channel
  ask.

---

## Brief O — The server remembers the race (running-order history endpoint)

**Jack's ask (§5.1):** mid-race joiners see a blank battle history that only
fills as their client accumulates polls. The server should hold the
session-so-far and hand it to every joiner.

**Shape:** a stateless, cache-backed history endpoint (e.g.
`/api/history/rank-series?session=…`) serving the accumulated per-car rank
series for the active (or replayed) session, downsampled to chart grain —
rank-change breakpoints, not raw 1s samples. The client seeds the chart from
one history fetch, then appends its live polls. Replay clients pass their
existing `replay`+`rt` params and get history windowed to their virtual now —
same resolver, one code path, per-client replay laws intact.

**Laws that bite:** no server-global mutable state (compute per request from
the archive; cache per (session, time-bucket) — cache-backed like every live
route). Live-guard semantics identical to the live routes. Id resolvers trip
on empty/whitespace (the `''` RaceTools lesson). QA drives the exact user
path: join mid-race (or mid-replay), the chart is full to "now" on first
paint, newest point touches now (the F5 startup-window gate), and an
append-through-data-degradation test.

**Kills:** the blank-join problem, per-client recompute, and the same
problem in replay. Highest-leverage item in the dump — do this first.

## Brief P — The battle axis breathes (dynamic number-line scale)

**Jack's ask (§5.2):** the fixed ±4s battle axis wastes the frame when the
pack is within 1s.

**Spec:** the axis fits the actual gaps of the N nearest cars, with house
motion discipline — scale targets come from a quantized ladder (±1s, ±2s,
±4s, ±8s), rescale only when content occupies <55% or >90% of the frame
(hysteresis so it never wobbles), eased transitions ≤300ms strong ease-out,
GPU-only transforms, reduced-motion renders the ladder step instantly.
Currency declared on screen (seconds — this chart never speaks in places).
Gate: a caution-bunching capture replayed through the component — the axis
must tighten smoothly as the pack compresses, never jump.

## Brief Q — The odometer ticks live

**Jack's ask (§5.3):** career miles/laps counting up during a race.

**Spec:** during LIVE, the odometer card increments by lap × venue length as
Bryce's lap count moves, labeled provisional in family copy ("counting
today's laps as they run — official after the flag"). Post-race, the
roll-forward reconciles to official; the provisional line disappears. Keep
Jack's beloved flight-path caption intact. Cheap, delightful, zero new
sources.

## Brief R — No empty seats on the Races page

**Jack's ask (§5.4):** the remaining 2026 season should be visible as
placeholder cards (outline, date, listed-not-clickable); the just-run race
appears promptly; a LIVE race gets a page during the race.

**Data gate: CLOSED (2026-07-19).** Canonical already carries the full
remaining season — `upcomingPrep.events` lists Portland (Aug 7), Milwaukee
(Aug 30), and the Laguna Seca double-header (Sep 5 + 6). No new ingest lane
needed; the placeholder cards read straight from the package.

**Three slices:** (a) placeholder cards — outline + date + "race N of 14",
unclickable by design, honest about what doesn't exist yet; (b) prompt
appearance of the just-run race = Brief T's automation; (c) the live race
page — a race-page shell that exists during LIVE with modules appearing as
their data becomes honest (running order via Brief O, lap chart building
live; sections stay absent until PDFs — no placeholder promises). Slice (c)
is a real product-design pass: the Live page answers "what's happening",
the live race page answers "what has this race been" — one question per
surface, and the director gates the split before any render.

## Brief S — The lap-speed line (was "live speed gauge")

**Jack's ask (§5.6):** a live speedometer from the polling payload's speed.

**Gate verdict:** the payload's speed is per-lap average, updating once per
lap — a speedometer dial would claim instantaneous velocity we do not have.
**Honest surface:** a quiet lap-speed line in the live hero or Bryce strip —
"last lap 176.0 mph average · best 177.3" — updating on lap change, labeled
"lap average speed — official timing". House ticker, no dial. The true
speedometer needs CGR telemetry; it stays on the first-party ask list.

## Jack's #5 — live section heat map: the honest verdict

The live Race Control payload carries no section fields (verified across
today's full race capture). A live section heat map from current sources
would be invented data. The honest offering: the existing post-race section
lane (PDF sections, 3-section + derived remainder for 2026 races) lands
automatically via Brief T, and Race Week keeps the multi-year shapes.

**Never-accept-limitations probes before this verdict goes final:**
(1) at Portland, spot-check whether live Timing71 frames carry section/loop
fields our RC poll lacks (read-only probe, one session); (2) the CGR
first-party channel — Bryce's own timing/telemetry — remains the route that
turns section intelligence live and line-grained. Both queued, neither
promised.

## Brief T — The pipeline runs itself (guarded)

**Jack's ask (§5.7):** the post-race roll-forward should be one command,
eventually automatic.

**Spec:** wrap today's §4.2 chain in one guarded script
(`npm run postrace:roll`): sets `BRYCECAST_ALLOW_EVENT_ROLL=1`, runs
import → backfills → validations → predictive → package → history, STOPS
hard on any validation failure, writes a human-readable run report (what
rolled, what's absent-yet like unpublished PDFs, what changed), and never
deploys on its own — deploy stays `deploy:mini` + mini update, gated.
Phase 2 (later): trigger on race-went-COLD + official results detected,
same gates, notification to Jack either way. Today's manual run is the
spec; its report becomes the script's checklist.

---

**Sequencing recommendation:** O first (unlocks R-c and improves replay),
P + Q as bounded single-worker slices alongside, S folded into the next
Live-page touch, R-a after its schedule-source gate, T once this manual
roll-forward's report exists. R-c is the big one — design pass before any
worker brief.
