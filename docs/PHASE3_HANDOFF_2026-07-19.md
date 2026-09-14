# Phase 3 Handoff — 2026-07-19, post-race (Music City)

Historical handoff written minutes after the Music City checkered flag. Every
branch, SHA, URL, host state, pending action, reading order, and model assignment
below describes the July 19 snapshot. It is not current operating authority.
Start from `../AGENTS.md`, resolve Git state directly, and verify production and
runtime state before acting. Do not execute the historical pipeline or starter
prompt merely because this filename is referenced by an older handoff.

## 1. What the site is, as of the checkered flag

Everything Bryce asked for on July 18 — plus most of the expanded vision —
shipped TODAY, validated at every step:

- **Section Intelligence everywhere it can be honest**: heat maps + numbers
  drawer + lap scopes + YoY shapes on nine venues (Nashville 8-loop measured
  100%, Iowa/Milwaukee 100% measured, WWTR, Mid-Ohio ~94%, Portland, Laguna,
  Road America, Barber). Pass marks (Brief I extraction, 25 GO races,
  ≥97% closure bar, 99.16% lap-chart concordance) drawn on the shapes.
- **Replay everywhere**: all 40 races watchable (28 RaceTools-fed + 12
  Timing71-fed lake feeds, each validated against official finishing order;
  own captures authoritative where they exist). **Per-client replay** merged
  on master @ `40a75d0` — each viewer carries their own virtual clock via
  request params; plain requests never touch replay code; runner-live ⇒
  params ignored. Verdict machine-checked: ISOLATED.
- **Race Week = the venue's analytical home** (venue-generic): shaded hero,
  full section suite w/ year toggle, YoY shapes, dossier w/ inline deltas,
  restart prior, weather window (one home per timeframe, observed-age,
  race-hour + "▲N° vs last year's race").
- **Landing page rebuilt**: story-of-now hero (TrackArt + one action),
  calmed season card w/ sparkline (gold = season best, ○ = ended early).
- **GB3 depth layer** on Career (within-team gold-where-led, grid→finish
  2021, six venues, conditions; hash-verified pack lane).
- **Restart report card**, venue dossier + wind (flow-arrow + north tick,
  "calm" at 0mph), source-aware footers, mixed-tier provenance in every
  SourcePill, GB3 tamper-tested loader.

## 2. Infrastructure state (CRITICAL — changed today)

- **Production host: the Mac mini** (always-on, at Jack's home).
  `~/BryceCast/site` @ commit `4693c76`; three LaunchAgents:
  `com.brycecast.live-runner` (own fresh sqlite at `site/data/live/`),
  `com.brycecast.app-server` (:5181, `BRYCECAST_API_RUNNER_ONLY=1`,
  `BRYCECAST_REPLAY=1`), `com.brycecast.cloudflared` (quick tunnel).
  **Mini URL: https://oops-plymouth-wto-generated.trycloudflare.com**
  (EPHEMERAL — changes if the tunnel restarts; named-tunnel upgrade is
  queued). **The mini captured today's race on its own archive** — that
  capture is canonical for Music City 2026.
- **The MacBook is a redirect relay**: the original family URL
  (https://publish-cons-developments-royal.trycloudflare.com) 302s every
  path to the mini via `~/.brycecast/redirect-server.mjs` (flip script:
  `flip-to-redirect.sh`, undo: `unflip-serve.sh`). Its cloudflared must
  keep running for the old link to work. The MacBook's runner also
  captured a partial race (Jack drove mid-race; mini's capture is whole).
- **Deploy pipeline (MacBook → mini)**: `npm run deploy:mini` writes a
  verified git bundle + KIT-VERSION.txt to the iCloud folder
  (`~/Library/Mobile Documents/com~apple~CloudDocs/BryceCast-mini-kit/`);
  on the mini, `bash ~/mini-kit/update-mini.sh` (waits for iCloud
  size-stability, fetch→reset→build→restart app-server only). Codex runs
  on the mini and executes these when asked.
  **PENDING: the `40a75d0` bundle (per-client replay) was mid-iCloud-sync
  at race time — confirm it landed and have Codex-on-mini run the update.
  This is action #1.**
- **Canonical repo**: worktree `/Users/example/.codex/worktrees/ac78/
  Bryce POV access`, master @ `40a75d0`. NO git remote exists (GitHub
  private repo = queued). Backups: `~/.brycecast/mini-kit/
  cloud-backup-staging/` (all-branches bundle + 7.45GB sqlite snapshot
  gz) — Jack should drag to cloud storage.
- **The live-runtime checkout** (`~/Documents/Bryce POV access`) is still
  the pinned old-branch runner home on the MacBook — untouchable until
  the chartered relocation/consolidation (now includes merging BOTH
  capture archives per `docs/LIVE_ARCHIVE_V2_PLAN.md`).
- The MacBook serve watchdog + relay are nohup'd; the lake raw (7.1GB,
  only copy) lives in the a534 worktree's `data/historical-data-lake/`.

## 3. Unmerged branches (all gate-passed unless noted)

- `phase3/outlines-from-maps` — Detroit (18 sections, anchored) +
  Arlington (23, anchored) + St. Pete (approximate, honestly withheld) +
  Toronto (outline only; NO NXT data by design — Bryce never raced there).
  **Needed in the July snapshot: rebase onto then-current master + re-run race-page QA** (master's
  RaceDetailScreen/sectionIntelligence moved under it), then director
  overlay gate, then merge. Also fixes wrong lengthMi on 2 old outlines.
- `phase3/stale-regen` — the four quarantined lanes regenerated (2
  material: career-dimension grew with 2026; data-utilization now honest).
  Merge whenever; re-run the utilization audit on the merged tree.
- Historical branches (integration, anchors-*, etc.) are merged; keep for
  archaeology until the GitHub push, then prune.

## 4. Historical post-race pipeline planned for the next session

1. **Mini update to 40a75d0** (per-client replay live for the family).
2. **The roll-forward** — Music City 2026 results into canonical:
   `BRYCECAST_ALLOW_EVENT_ROLL=1` + unpinned (the fail-closed guard in
   `build-ui-data-package.mjs` requires the override to roll the
   upcoming venue — this is the DELIBERATE roll it was built for).
   Chain per memory/runbooks: career import:refresh → backfills →
   validate/summary/coverage → predictive → ui-data-package
   refresh-validate (with `BRYCECAST_SQLITE_PATH` pointed at a capture
   archive so standings bake correctly — the loud warning added today
   fires if absent) → ingest:history. Race Week rolls to Portland;
   Music City debrief card + race page appear; Career Lab charts absorb
   race 41. Then `deploy:mini` + mini update.
3. **Today's race replay**: the mini's own capture should surface in its
   `/api/replay/available` automatically (verify `bryce_rank` stamping on
   the mini's schema); the race-page module appears once the debrief page
   exists (roll-forward). Sections for Music City 2026: PDF section
   results when published; our capture has no loop events (honest:
   3-section PDF + derived remainder, like other 2026 races).
4. **Year toggle** for replays (2025·2024 on race pages + "watch last
   year's race" on Race Week) — join via venue dossier visits +
   `watchableCaptureForRace`; the naive event-name join is proven unsafe.
5. Merge the two branches above (§3).
6. **Semantic-layer lap-numbering alignment** — promotes the 3
   CONDITIONAL pass-placement races (Iowa ×2, Portland 2025).
7. **Durable infra night**: named Cloudflare tunnel (+ domain) → permanent
   family URL, retire the relay; private GitHub remote + push all
   branches; archive consolidation (V2 sidecar plan; MacBook historical +
   mini go-forward + partial race merge); worktree relocation off the
   Codex-managed path; move the lake data root somewhere durable.
   RaceTools confirming email (Jack) + the IMS 2.44-mi map ask +
   Mid-Ohio/Nashville richer-map ask (one email, three wins).

## 5. JACK'S POST-RACE BRAIN DUMP (verbatim intent, my annotations)

Captured 2026-07-19 immediately post-race. Not yet scoped/briefed — the
the next July director was expected to shape these with the then-current gates:

1. **Server-built running-order history.** The rank-space overtake chart
   starts blank for mid-race joiners and accumulates client-side. Want:
   the server maintains/serves the session-so-far history so every
   joiner sees the full race instantly (also kills per-client recompute).
   [Annotation: the capture archive already holds every sample; a
   history endpoint serving the accumulated rank series + client seeding
   is the natural shape. Applies to replay too.]
2. **Battle number-line dynamic scale.** The ±4s fixed axis wastes the
   frame when the pack is within 1s. Want: axis grows/shrinks to fit the
   N nearest cars / actual gaps. [Annotation: house motion rules — scale
   changes must be smooth, never jumpy; hysteresis needed.]
3. **Live odometer.** Career miles/laps (the odometer card) ticking up
   live per lap during a race. [Annotation: derivable live from lap
   count × track length; label it provisional until official.]
4. **Races page completeness**: placeholder cards for the REMAINING 2026
   season (track outline, date, unclickable-but-listed); the just-run
   race must appear promptly (roll-forward automation); and a LIVE race
   should have a race page DURING the race with analytics building live.
5. **Live section heat map.** During a race, compute section performance
   vs field live and show the heat map on the Live page/live race page.
   [Annotation: DATA GATE FIRST — our capture is 1s state snapshots, not
   loop crossings; check whether the live RC payload carries section/
   LastSection fields (Brief I's original note) before promising. If
   absent, the honest ceiling is post-race PDF sections.]
6. **Live speed gauge.** The polling payload carries Bryce's speed —
   want a live speedometer during races. [Annotation: verify the field's
   presence/cadence in the capture schema (`bryce_samples`); a quiet
   house gauge, not a dial-slop widget.]
7. **Automate the post-race pipeline** — the roll-forward (§4.2) should
   eventually run itself (or one-command) after each race so debrief
   cards/Career/atlas/everything appear without manual work. [Annotation:
   the pin/roll guard was built for exactly this; automation = a guarded
   script + validation gates, never silent.]

## 6. Historical laws and gotchas recorded for context transfer

- **Regeneration pin law**: `BRYCECAST_ANALYTICS_AS_OF_DATE` reproduces
  the committed package; rolling the venue requires
  `BRYCECAST_ALLOW_EVENT_ROLL=1` (fail-closed guard, message names both).
  Package builds need `BRYCECAST_SQLITE_PATH` for standings (loud warning
  added; worktrees without it bake "unavailable").
- **Empty-string ids**: RaceTools-derived feeds carry `''` EventID/rival
  DriverIDs; `??` treats `''` as present. Id resolvers must trip on
  empty/whitespace (fixed in liveMotionModel/liveHistoryModel — keep the
  pattern for new code).
- **Workers lie about committing** (twice today): verify `git log` +
  assertion-count deltas before merging. Trust, but count.
- **QA drives the exact user path** — the replay-start breakage passed 51
  assertions because the harness hand-rolled its params. End-to-end means
  the button's literal request shape.
- **No server-global mutable state on the family site** — the replay
  singleton lesson; per-request/stateless first.
- **iCloud transport**: big files show `.lock`/placeholders mid-transit;
  `update-mini.sh` waits for size-stability by design; never build inside
  the iCloud dir.
- **Map packages**: join by INI Track.Name + SHA-256, never filename;
  `[GPS]` origins untrusted until per-venue validated; measured section
  lengths (time × speed) are the anchor ground truth; wrong-config guard
  (IMS: the archive's 3.41-mi map ≠ the 2.44-mi NXT layout — do not force).
- **Full-page composition review** after module-level gates — it caught
  the stale footer claim and the race-date-off-by-one that module gates
  structurally could not.
- All prior laws stand: editorial (no negative framing, denominators,
  Bryce-first), provenance ledger source tiers in drawers, classification
  always from canonical (as-raced replays carry the honesty line),
  raw data never ships, the DESIGN_TASTE blacklist.

## 7. Retired starter prompt

The July starter prompt is retired. It made this dated handoff controlling,
fixed model roles, and assigned obsolete deployment and roll-forward actions.
Use `../AGENTS.md` and its conditional task map.

---

## RECONCILIATION NOTE (2026-07-20, the full-vision run — read before trusting state claims above)

This handoff's state claims are historical. As of 2026-07-20: the family
URL is **https://brycecast.com** (named tunnel; quick tunnels + the
MacBook relay retired as primary); deploys are two commands over SSH
(docs/DEPLOY_RUNBOOK.md production-truth section); §3's two branches and
§4's pipeline items 1–6 are ALL merged/shipped; §5's brain dump became
Briefs O–T (docs/PHASE3_BRIEFS_O_T_2026-07-19.md) and shipped through
the 2026-07-20 execution charter run. The July-18 charter's body text is
superseded by its own Addenda 1–4 wherever they disagree (I =
extraction not reconstruction; H anchors increasingly data-derived —
see the timing-map probe verdict in the task board; J3 unblocked but
REWRITTEN as docs/ML_RESEARCH_PLAN_2026-07-20.md). The atlas's "2 per
race median at Nashville" example above is WRONG — the counted answer
is 1 (validator-pinned). Whimsy parking lot (unbuilt, deliberate):
hover car-dot on outlines; further team-tricolor placements (decide
with Jack; red already means down).
