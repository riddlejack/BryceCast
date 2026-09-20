# Security and runtime boundaries

This repository is a source/demo edition. It is not the production deployment configuration. The recommended `npm run demo` path serves a local historical snapshot: no database, upstream timing/weather requests, operator writes, or live capture.

## Safe defaults in this edition

- Local services bind to `127.0.0.1` by default.
- The full API defaults to runner-only cached mode; direct upstream polling requires an explicit configuration change.
- Operator POSTs and forced source/weather refreshes require operator authorization. An authorized request still cannot start competing Race Control polling in runner-only mode.
- Browser/proxy requests do not inherit local operator privilege merely because a tunnel connects over loopback.
- Native timing downloads are disabled unless `BRYCECAST_ENABLE_TIMING_DOWNLOADS=1` is explicitly set.
- Cross-origin API access is not enabled by default; configure an exact origin if needed.
- Secrets and environment files belong outside Git. `.env.example` contains no credentials.

The real-handler publication test launches a temporary API with upstream fetch disabled and proves that unauthorized refreshes and writes are refused before they can contact a source. It does not certify the deployed website, tunnel configuration, network perimeter, or resistance to every denial-of-service technique.

## Reporting

Please use GitHub's private vulnerability reporting feature if it is enabled. Otherwise contact the maintainer privately through the GitHub profile before posting reproduction details that expose credentials or affect the running website. Do not put secrets in public issues.

## Before deploying a fork

Configure authentication, network exposure, dependency updates, request budgets, logging, and data permissions for that deployment. Never load a production archive into the portfolio demo. Public CI has read-only repository permissions and no deployment credentials. Source publication does not authorize deployments or source polling.

See [release verification](docs/publication/RELEASE_VERIFICATION.md) for the exact checks performed and their limits. Any source-history credential finding must be triaged and, if genuinely exposed, revoked or rotated before publication; deleting its latest file is insufficient.
