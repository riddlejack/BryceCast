# Live F3 audit artifacts

- [AUDIT_REPORT.md](AUDIT_REPORT.md) — root causes, implementation decision, product recommendation, performance/accessibility, and limitations.
- [FIELD_DICTIONARY.md](FIELD_DICTIONARY.md) — complete readiness/timing/profile/source field dictionary and cadence matrix.
- [traces/manifest.json](traces/manifest.json) — six 60–121 sample Mid-Ohio windows and their paths.
- [traces/cadence-summary.json](traces/cadence-summary.json) — machine-readable cadence and `liveGap` validation.
- `before-motion-dom.json` / `after-motion-dom.json` — baseline and final desktop SVG/DOM time series.
- `after-motion-mobile.json` — final 30-second responsive motion/layout trace.
- `api-arrivals.json` — 45 one-second readiness/timing arrivals.
- `motion-proof-summary.json` / `reduced-motion-check.json` — machine-readable acceptance and accessibility checks.
- `screenshots/` — desktop and mobile before/after evidence.

Regenerate the archived traces from the canonical SQLite file without mutation:

```sh
NODE_NO_WARNINGS=1 node scripts/audit-live-f3.mjs \
  --sqlite='/Users/example/Documents/Bryce POV access/data/live/brycecast.sqlite' \
  --out=analysis/live-f3-audit/traces
```
