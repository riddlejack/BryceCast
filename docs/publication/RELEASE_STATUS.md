# Publication status

Prepared September 19, 2026. This is a **private publication candidate**, not an authorization to redistribute every included third-party artifact.

## Ready for private review

- Maintained development history preserved, with raw/runtime artifacts filtered from every historical revision and personal Git email identities replaced by the owner's GitHub noreply identity.
- Source code, historical UI packages, an offline demo, synthetic method examples, schema, architecture, data dictionary, and eight engineering case studies.
- Dependency refresh, narrower API defaults, full-history secret review, build and publication checks. See [verification](RELEASE_VERIFICATION.md) for scope and limits.
- Headline statistics with dates, grains, source hashes, and caveats. The source corpus counts include data that is not shipped in this checkout.
- Future raw/SQLite release design and [permission requests](PERMISSIONS_OUTREACH.md). Exclusion from this checkout is temporary custody, not a decision to abandon that release.

## Owner decisions before public launch

1. **Source/data and media rights.** Obtain written permission or establish applicable redistribution terms, including normalized outputs, retained report extracts, embedded UI packages, photos, logos, and track-map assets. The existing online site and public Git redistribution are different uses. Record approvals by source family and artifact scope; retain or remove artifacts accordingly. Start with RaceTools, Timing71, and INDYCAR.
2. **AI-use narrative.** Review [AI_USE.md](../project/AI_USE.md), add the owner's examples of direction, iteration, disagreement, and validation, and confirm the portrayal of collaboration with Bryce. No chat transcripts were mined or published.
3. **Public launch.** After the first two decisions, review the resulting tree and history and deliberately change repository visibility. A private upload is not a public launch.

## Runtime boundary

The original working checkouts, production database, collectors, LaunchAgents, and deployed site are separate. Publication preparation does not deploy the candidate API changes. Before serving the operational API publicly, verify the real host's configuration, authentication, reverse proxy, rate limits, and dependency state. The local demo does not need any of those systems.

See [DATA_RELEASE.md](../../DATA_RELEASE.md) for the permissioned release plan and [THIRD_PARTY.md](THIRD_PARTY.md) for licensing boundaries. MIT applies to original software; it does not settle upstream data or asset rights.
