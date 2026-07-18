# Permissions and source-use record

Updated: 2026-07-18

This is an operational provenance record, not legal advice.

## RaceTools

The user reported receiving direct telephone approval from the RaceTools contact
on 2026-07-18 for this educational, non-commercial BryceCast use case: a private
site for the racer, friends, and family. RaceTools also publishes the replay and
map download links openly from its [Downloads page](https://racetools.com/downloads/).

The approval should be treated as covering the described use, not as a blanket
right to resell, publicly redistribute, or sublicense the raw archive. The raw
objects therefore remain Git-ignored. Committed manifests contain URLs, hashes,
coverage, and derived quality metadata rather than the source payloads.

If this use becomes commercial or the raw files are to be redistributed, obtain
written confirmation from `info@racetools.com`, `sales@racetools.com`, or
`support@racetools.com` and attach it to this record.

## Timing71

Timing71 exposes a public [replay archive](https://archive.timing71.org/) and
documents its [display-oriented state format](https://info.timing71.org/reference/state.html)
and lists its recording format in the [format reference](https://info.timing71.org/reference.html).
No explicit archive-data reuse license was found during this audit. The public
URLs are retained as provenance; raw Timing71 payloads stay Git-ignored and are
used for private analytical reconstruction.

Timing71's open-source libraries are AGPL-licensed. BryceCast's replay reader is
an independently written, small interpreter for the archive's generic
`add`/`change`/`remove` operations; no Timing71 source file was copied into this
repository. Reassess license obligations before substituting or vendoring a
Timing71 library.

## Official INDYCAR / Race Control material

Official API responses and reports already present elsewhere in BryceCast keep
their existing source-state and confidence treatment. A public endpoint or CDN
object is not, by itself, evidence of redistribution rights. This historical
data lake does not alter the deployed site, expose a bulk-download endpoint, or
republish raw archives.
