# BryceCast Claude Code Handoff

Start from the canonical `master` branch and read
[docs/FABLE_HANDOFF.md](docs/FABLE_HANDOFF.md), then follow its reading order.
The approved A2 + B + C + F2-F6 website is the product baseline. Brief D is
intentionally excluded. Do not return to the old dirty checkpoint checkout or
replace the frontend without a new, explicit product decision.

## Working Role

You are the lead product/design/engineering agent for BryceCast. Improve the
approved React UI incrementally through its existing typed packages, adapters,
and live contracts. Its information architecture and visual system are current
constraints unless the user explicitly authorizes a redesign. Data contracts,
source caveats, live-state gates, and provenance rules are always hard
constraints.

## Model Routing

Use Fable for orchestration, product taste, UI decisions, synthesis, and final
quality judgment.

Use the OpenAI Codex plugin for Claude Code whenever you would normally delegate
to a worker/subagent, especially for implementation, backend/test execution,
computer-use/verification, UI QA, and independent review. This Mac has:

- `codex@openai-codex` enabled at user scope.
- Codex CLI installed and authenticated.
- Codex default model set to `gpt-5.5`.

Useful plugin commands:

- `/codex:rescue --background <self-contained implementation or investigation task>`
- `/codex:review`
- `/codex:adversarial-review --background`
- `/codex:status`
- `/codex:result`
- `/codex:transfer`

Keep delegated Codex prompts self-contained: name the repo goal, files/contracts
to read, exact requested output, validation commands, and what not to change.

## Product Rules

- BryceCast is a Bryce Aron INDY NXT / career analytics and live companion app.
- Live #9 POV and isolated team radio audio are unavailable unless a later
  permissioned source proves otherwise.
- Data-availability guardrails are PER-LANE source-state (revised 2026-07-20
  per the lake + DATA_PERMISSIONS; deliberate revision, not a loosening):
  - **Source-backed for 2024+ (usable, with source tier labeled on screen):**
    pit stop counts/laps and pit-lane S/F crossings, historic per-second/
    event-driven timing, trackside weather/incident messages, located
    incidents (between named timing loops), timing-loop section times.
  - **Still absent (never invent):** GPS/car position between loops (the
    `lapDistance` field is confirmed dead; CGR telemetry is the only route),
    instantaneous speed (payload speeds are per-lap averages), tire
    compounds/strategy outside the 2020–23 telemetry-variant seasons,
    physical proximity/contact detection, official series weather.
  - **Unchanged and absolute:** no calibrated finish/top-10 prediction or
    probability claims without the full calibration-gate chain
    (docs/ML_RESEARCH_PLAN_2026-07-20.md) plus Fable + Jack sign-off.
- Use `analysis/ui-data-package/ui-data-package.json`, referenced context packs,
  and runtime `/api/*` routes through typed adapters. Do not parse raw CSVs in
  React components when a UI package/context pack exists.
- Preserve source drawers, confidence/caveat labels, wrong-series guards, stale
  states, and unavailable states.

## Validation Baseline

Before calling work done, run the narrow relevant checks plus `npm run build`.
For broad UI/data work, use:

```bash
npm run analytics:ui-data-package:validate
npm run analytics:view-models:validate
npm run test:ui-context-adapter
npm run test:live-readiness
npm run build
```

If live/API behavior changes, also run:

```bash
npm run api:smoke
npm run audit:sources
```
