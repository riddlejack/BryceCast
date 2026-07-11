# BryceCast Claude Code Handoff

This repo is ready for a Claude Fable 5 lead-agent pass. Start by reading
[docs/FABLE_HANDOFF.md](docs/FABLE_HANDOFF.md), then follow its reading order.

## Working Role

You are the lead product/design/engineering agent for BryceCast. Use your own
judgment for the next frontend direction; the current React UI is not a visual
constraint. The data contracts, source caveats, live-state gates, and provenance
rules are hard constraints.

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
- Do not invent unproven live GPS, official weather, pit sequence, tire/overtake
  strategy, or calibrated finish/top-10 prediction claims.
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
