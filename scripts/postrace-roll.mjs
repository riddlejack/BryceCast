#!/usr/bin/env node
/**
 * postrace:roll — one guarded command for the post-race roll-forward (Brief T).
 *
 * Wraps scripts/lib/postrace-roll-core.mjs. See that module for the pipeline
 * order and the hard rules. This CLI just parses flags, runs it against the real
 * `npm run` step runner, and exits with the pipeline's exit code.
 *
 *   npm run postrace:roll            # run the full chain (hard-stops on failure)
 *   npm run postrace:roll:dry        # validate preflight only, run nothing
 *
 * Requires BRYCECAST_SQLITE_PATH pointed at a capture archive so standings bake.
 * Sets BRYCECAST_ALLOW_EVENT_ROLL=1 for the package step only, after preflight.
 * Never deploys, never touches LaunchAgents.
 */

import { runPostraceRoll } from './lib/postrace-roll-core.mjs';

const dryRun = process.argv.includes('--dry-run');

const { exitCode, report } = runPostraceRoll({ dryRun });

if (report.reportPaths) {
  process.stdout.write(`\nRun report:\n  ${report.reportPaths.json}\n  ${report.reportPaths.human}\n`);
}

process.exit(exitCode);
