> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# The Live Race Page — design pass (Fable, 2026-07-20; Brief R-c / task #24)

Jack's ask (§5.4c): "a LIVE race should have a race page DURING the race
with analytics building live." This doc is the binding design; the build
brief points here.

## The split (one question per surface — the load-bearing decision)

- **/live** answers *"what is happening right now?"* Ephemeral, poll-driven,
  now-focused: running position, the battle corridor, the ticking odometer,
  the speed line. Nothing here accumulates meaning after the flag.
- **/races/<sessionId>** answers *"what has this race been?"* Permanent URL,
  accumulating record. During a live race it EXISTS as a shell whose modules
  appear as their data becomes honest, and at roll-forward it becomes the
  ordinary debrief page with ZERO URL change — the link the family shares
  at lap 20 is the same link that holds the finished story forever.

Neither page duplicates the other's question. The live race page carries NO
battle corridor, NO speedometer, NO "if the race ended now" jumbotron —
those are /live's now-questions. /live gains one quiet link ("This race's
page — the story so far") and the live race page opens with one ("Watch
live") back to /live. Cross-links, never duplication.

## The page during LIVE, module by module (append-as-honest)

1. **Hero**: race label, venue outline, "LIVE · lap N of M" with the flag
   state, and Bryce's CURRENT running position labeled provisional
   ("running P6 · positions settle at the flag"). No result numeral, no
   gain/loss verdict — the race isn't a result yet. Red down-deltas and
   green up-deltas are for finished facts; the live hero states position
   only.
2. **The race so far — the lap chart, building.** Fed by the Brief O
   rank-series history endpoint (the archive's accumulated breakpoints),
   drawn with the SAME LapChart grammar as the debrief page, growing
   rightward. Newest point touches now (the startup-window law). Caution
   spans shade as they happen. This is the page's heart during the race.
3. **Battles so far**: the debrief's adjacency computation ("within one
   spot for N laps") run over the accumulated laps — appears once ≥10 laps
   exist; facts only, no projection.
4. **Cautions**: the atlas tile pattern ("1 caution so far · laps 4–7 ·
   contact") appearing at the first yellow, from the live flag record.
5. **Sections: honestly absent.** One line: "Section times arrive with the
   official reports after the race." No placeholder chart, no teasing.
6. **Replay affordance**: appears at COLD ("Watch this race unfold"), the
   existing per-client replay against our own capture. Between COLD and
   roll-forward, the hero flips to "finished · unofficial order" with the
   same provisional label until official results land.
7. **At roll-forward** the shell yields to the ordinary debrief modules
   (official result, weekend arc, sections when PDFs land, restart card,
   Ganassi module) — same URL, no redirect, no ceremony.

## Data honesty rules

- Everything renders from the SAME live/replay resolver params as /live
  (per-client replay laws intact; a replayed race gets a replayed race
  page — which also makes QA honest).
- Every number provisional until official: the word "provisional" appears
  once in the hero, not on every module (family copy, not legal boilerplate).
- The Races archive lists the live race at the TOP of the season card with
  a quiet LIVE dot the moment the shell exists (placeholder row upgrades).
- If the archive/history endpoint is unreachable mid-race, modules hold
  their last honest state with the standard stale treatment — never blank,
  never fabricated.

## Non-goals (v1)

No live section heat map (no source; the honest line in module 5). No
predicted finishing order anywhere. No push notifications. No special
mobile layout beyond the house responsive grammar. The Live page's
session-aware practice/quali mode does NOT get a session page — races only.

## QA gates for the build

Drive a full race replay through the page at 16×: the shell must appear
pre-green, the lap chart must build, battles must appear mid-race, the
caution tile must fire at the first yellow, COLD must surface the replay
affordance, and the SAME sessionId must render the ordinary debrief when
pointed at a completed race. Capture the shell at three moments (pre-green,
mid-race, post-COLD) at 1440+390. Race pages for COMPLETED races must be
byte-identical to today (zero regression).
