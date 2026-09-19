> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# BryceCast Live Product and Operations Ideas

Updated: 2026-07-18. These are observation-gated ideas, not approved implementation work.

## Practice and qualifying mode

Status: observe Nashville Practice 1, qualifying, and the July 19 race before scoping.

The first official live-practice run proved that the transport and rendering paths work at one-second cadence, but it also exposed a semantic mismatch: the current Live page is race-shaped. During `SessionType=P`, the feed's rank is practice order by best lap rather than race running order, `totalLaps` is absent, and live gaps can reflect cars on different run cycles. The page therefore shows technically sourced values under race-specific labels such as “Race completion,” “If the race ended now,” “The battle,” and “Distance to the leader.” Those labels should not be treated as a truthful practice experience.

Candidate practice/qualifying treatment after the weekend review:

- Lead with session clock/status, practice or qualifying rank, completed laps, best lap, last lap, personal-best improvement, and pit/on-track status when sourced.
- Compare best-lap deltas to P1 and selected teammates/nearby qualifiers; do not imply an on-track battle from practice timing order.
- Replace or suppress race completion and projected-championship cards outside race sessions.
- Preserve the one-second feed and source/freshness trust state, but allow charts to update only when their underlying metric changes.
- Decide separately whether qualifying groups, combined qualifying, and oval heat sessions need distinct layouts.

## Eight-gigabyte Mac mini hosting

Status: technically viable; migration deferred.

Measured on the July 18 Nashville live feed with one browser polling once per second:

- Canonical one-second capture runner: about 114 MB RSS and under 1% CPU.
- Production-built combined app/API server: about 111 MB RSS and generally 0–4% CPU after warm-up.
- Total BryceCast server workload: about 225 MB RSS, leaving ample headroom on an 8 GB M4 Mac mini.
- Capture proof: 35 successful writes in 35 seconds with zero endpoint failures while the production page was polling.

The original multi-gigabyte API memory spike was not caused by one-second Race Control polling. The readiness route was reparsing the 306 MB canonical career dataset for weather metadata on every request. The live runtime now reads the compact track metadata and upcoming-event context packs instead.

Recommended eventual shape:

1. One LaunchAgent owns capture and SQLite writes.
2. One production Node process serves the built site and runner-backed API; do not run Vite on the mini.
3. A durable tunnel/reverse proxy provides TLS and the public hostname without opening the home router directly.
4. Add a per-source-timestamp response cache before inviting more than the small family audience, so viewer count does not multiply SQLite reads.
5. Keep replay/admin controls disabled on the public process and add rate limiting/health alerts before wider sharing.

## Storage retention

Status: required before a season-long unattended deployment.

The July 18 full-fidelity SQLite archive grew by about 12.7 MB over 35 seconds, roughly 1.3 GB/hour at the observed payload size. RAM and CPU are not the limiting resources; disk retention is. Before moving to the mini, define:

- how many raw one-second sessions remain hot in SQLite;
- whether older raw payloads are compressed and moved to external/cloud storage;
- a verified backup and restore path;
- a free-space alarm that never deletes the active session; and
- a bounded compaction job that cannot overlap live capture.

## Weekend review gate

After the July 18 qualifying and July 19 race, review the captured session behavior and decide:

- whether practice, qualifying, and race each get a dedicated mode;
- which non-race metrics were genuinely useful to watch live;
- whether the current one-second raw retention level is worth its disk cost; and
- whether to proceed with Mac mini migration or keep the laptop as the race-weekend host temporarily.
