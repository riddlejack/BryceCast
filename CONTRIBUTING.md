# Contributing

Start with [development](docs/DEVELOPMENT.md) and the [data dictionary](docs/DATA_DICTIONARY.md). Run `npm run build` and `npm run test:publication` for changes to the application or analytical adapters.

Preserve the distinction between observed, interpolated, modeled, and unavailable data. State the denominator and source date when adding a metric. Add a meaningful regression or negative-control check when fixing a data interpretation bug; do not manufacture missing observations to fill a chart.

Do not include credentials, raw upstream captures, personal runtime configuration, or production databases in a pull request. Discuss new source families and their redistribution terms before adding data. Report security issues privately as described in [SECURITY.md](SECURITY.md).

Historical source releases will have separate manifests and licenses. This software repository's MIT license does not authorize redistribution of third-party inputs.
