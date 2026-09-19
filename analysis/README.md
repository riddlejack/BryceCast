# Analysis

This directory contains analytical producers, validators, retained outputs, and dated research evidence. The included outputs support the historical demo; most builders require the separately permissioned career or timing corpus. Use the [root guide](../README.md) for the runnable public workflow and the [documentation index](../docs/README.md) for narrative case studies.

## Scientific and engineering modules

- **Timing semantics:** [`semantic-layer/`](semantic-layer/), [`track-position/`](track-position/), and [`replay-feeds/`](replay-feeds/) cover loop crossings, section times, identity joins, pass placement, and replay-ready tables.
- **Race and qualifying:** [`qualifying-layer/`](qualifying-layer/), [`quali-lab/`](quali-lab/), [`restart-report/`](restart-report/), [`caution-atlas/`](caution-atlas/), and [`race-story/`](race-story/) produce session-aware summaries without blending incompatible sources.
- **Career depth:** [`career-atlas/`](career-atlas/), [`career-life-stats/`](career-life-stats/), [`career-parity/`](career-parity/), [`career-dimension-context-layer/`](career-dimension-context-layer/), [`gb3-deep-dive/`](gb3-deep-dive/), [`formula-ford-lap-shape/`](formula-ford-lap-shape/), and [`imsa-daytona-stint-class-pace/`](imsa-daytona-stint-class-pace/) hold series and competitor analyses.
- **INDY NXT and models:** [`indy-nxt-discovery/`](indy-nxt-discovery/), the two `indy-nxt-*-section*` modules, and [`predictive-race-intelligence/`](predictive-race-intelligence/) contain discovery, lap/section engineering, diagnostics, and documented failed experiments.
- **Product boundary:** [`ui-contract/`](ui-contract/), [`ui-data-package/`](ui-data-package/), [`live-contract/`](live-contract/), and [`historical-data-lake/`](historical-data-lake/) connect analytical outputs to application contracts.

## Audits and snapshots

Directories ending in `-audit`, [`live-drill-2026-06-21/`](live-drill-2026-06-21/), `live-f3-audit` through `live-f6-audit`, [`integration-preview/`](integration-preview/), and [`external-review-pack/`](external-review-pack/) are dated evidence or review packets. Read their stated cutoff before citing them; they are not current runtime status.

Safe included-artifact checks are `npm run analytics:ui-data-package:validate` and `npm run analytics:view-models:validate`. Other `analytics:*` builders are maintainer workflows unless their README explicitly says they use synthetic or included inputs.
