> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# Mac Process Limits Plan - M5 Pro, 64 GB

## Current verified machine class

The already-running Node kernel can query host facts without spawning a new process. It reports:

- Platform: `darwin`
- Architecture: `arm64`
- Kernel release: `25.5.0`
- Memory: 64 GB
- CPU entries: 18
- CPU model: Apple M5 Pro
- Load average during investigation: about 3.7 / 2.9 / 2.5

The machine has ample CPU and RAM for the live-drill workload. The observed failure is still process-creation/resource-limit exhaustion: new shell commands and Computer Use both fail with `Resource temporarily unavailable (os error 35)`.

## What the M5 Pro hardware implies

Apple's 2026 MacBook Pro technical specs list M5 Pro configurations up to:

- 18-core CPU with 6 super cores and 12 performance cores
- 20-core GPU
- 64 GB unified memory
- 307 GB/s memory bandwidth

This hardware should not be naturally constrained to roughly 900 total processes. If we are failing around that region, the likely issue is one of:

1. inherited launchd/rlimit cap for the GUI/Codex process tree;
2. a user/session process cap lower than the kernel could support;
3. runaway helper/process-tree behavior consuming a low cap;
4. a specific tool bug causing spawn amplification;
5. less likely: thread/task/Mach-port pressure not visible as CPU/RAM pressure.

## Why no clean dynamic CPU/RAM process limit exists

macOS process creation is protected by process, task, thread, file, port, and launchd limits. Those limits are not interchangeable with CPU or RAM availability. A process can be cheap in CPU/RAM and still consume scarce kernel bookkeeping. A process storm can also consist of blocked or zombie processes that use little CPU.

There is no supported macOS switch that says "allow unlimited processes until CPU or RAM pressure rises." The closest supported mechanisms are:

- static boot/session ceilings: `kern.maxproc`, `kern.maxprocperuid`, and `launchctl limit maxproc`;
- per-job resource limits through `launchd.plist` `SoftResourceLimits` / `HardResourceLimits`;
- process classification through `launchd.plist` `ProcessType`;
- app-level guards that observe process pressure and kill known stale process families.

The clever version is not a dynamic kernel maxproc. The clever version is a long-running guard process that starts while the machine is healthy, caches process inventories, and can call `process.kill(pid)` without spawning a new command if the machine later enters `os error 35`.

## Recommended target envelope

These are target values to validate after a clean reboot, not values to apply blindly while the machine is currently failing to spawn processes.

For a 64 GB M5 Pro:

- Minimum acceptable `maxproc` family: 8192 process slots.
- Preferred system-wide process ceiling: about 16384.
- Preferred per-user process ceiling: about 12288, or 75% of system-wide ceiling.
- Do not set per-user ceiling equal to or above system-wide ceiling.
- Keep at least 25% system-wide headroom for root, WindowServer, launchd, loginwindow, and recovery tooling.

If current post-reboot values are already above this envelope, do not raise them. Focus on runaway process control.

If current post-reboot values are below this envelope, use a balanced `launchctl`/LaunchDaemon change and reboot. Do not set only `maxprocperuid`.

## Post-reboot findings

After reboot on 2026-06-21:

- `launchctl limit maxproc`: soft `10666`, hard `16000`
- `ulimit -u`: `10666`
- `kern.maxproc`: `16000`
- `kern.maxprocperuid`: `10666`
- `kern.num_tasks`: `16384`
- `kern.num_threads`: `81920`
- `kern.num_taskthreads`: `16384`
- user process count immediately after reboot: about `400`
- current process ratio under the guard: about `6%` of effective per-user process limit

These values are healthy. We should not raise kernel/process ceilings right now. The failure was not caused by an inherently too-low M5 Pro/macOS process limit.

Why reboot fixed it:

- reboot cleared stale process table entries;
- reboot reset launchd session state;
- reboot stopped stale Codex/helper/dev-server process trees;
- reboot reaped defunct children that could not be reaped while their leaking parent was still alive.

The key active leak found after reboot was `Petdex.app`: it accumulated defunct child processes within minutes. The guard now has an explicit zombie-parent trigger for that pattern.

## Codex app cleanup

Kept:

- `/Applications/Codex.app` - active signed Codex app, bundle id `com.openai.codex`, version `26.616.51431`, build `4212`
- `/Users/example/.codex/computer-use/Codex Computer Use.app` - signed Computer Use helper, bundle id `com.openai.sky.CUAService`

Moved to Trash quarantine:

- `/Users/example/Codex-reinstall-backup-20260602-152700`
- `/Users/example/Applications/_Archived Codex Launchers`
- `/Users/example/Downloads/Codex.dmg`

Trash quarantine:

```text
/Users/example/.Trash/Codex-redundant-copies-20260621-141628
```

Spotlight now sees only `/Applications/Codex.app` as the main Codex app outside Trash.

## Installed prevention

Installed user LaunchAgent:

```text
/Users/example/Library/LaunchAgents/com.brycecast.process-pressure-guard.plist
```

Repo template:

```text
ops/macos/com.brycecast.process-pressure-guard.plist
```

Runtime state/log directory:

```text
/Users/example/.codex/process-guard
```

The LaunchAgent runs:

```sh
node scripts/mac-process-pressure-guard.mjs \
  --enable-kill \
  --interval-ms=5000 \
  --zombie-parent-critical-count=50 \
  --min-age-seconds=300
```

It is intentionally narrow. It kills only known stale/live-drill/dev-server patterns and `Petdex` if it becomes a zombie parent. It does not kill arbitrary user apps just because process count is high.

## Why not Server Performance Mode first

Apple's current support page for Server Performance Mode says it applies only to Intel Macs. Older Intel measurements show it can raise maxproc-related ceilings substantially, but this Mac is Apple Silicon (`arm64`). On this machine, we should verify actual post-reboot limits and avoid assuming `serverperfmode=1` is supported.

## New repo-local tools

### Audit

Run after a clean reboot:

```sh
node scripts/mac-process-limit-audit.mjs
```

This writes:

```text
analysis/mac-process-limits/process-limit-audit-<timestamp>.json
```

It captures hardware, launchd limits, sysctl process/file counters, process families, zombie parents, and a recommendation.

### Guard

Dry-run mode:

```sh
node scripts/mac-process-pressure-guard.mjs
```

Kill-enabled mode:

```sh
PROCESS_GUARD_ENABLE_KILL=1 node scripts/mac-process-pressure-guard.mjs --enable-kill
```

Outputs:

```text
analysis/mac-process-limits/process-pressure-guard-status.json
analysis/mac-process-limits/process-pressure-guard-events.jsonl
```

The guard defaults to killing only stale repo/dev/live-drill process families, not arbitrary apps:

- `node ... scripts/race-poller.mjs`
- `node ... scripts/probe-onboards.mjs`
- `node ... scripts/live-source-pressure-test.mjs`
- `node ... scripts/api-server.mjs`
- `node ... scripts/api-smoke.mjs`
- `node ... scripts/live-weather.mjs`
- `node ... scripts/qa-render.mjs`
- `npm run dev|serve|poll|probe|audit`
- `vite`

It requires processes to be at least 300 seconds old by default. It never kills itself.

## Recovery design when `os error 35` appears

Once `os error 35` appears, Codex usually cannot start new shell commands. Computer Use may also fail because the automation client itself needs process creation.

So the recovery mechanism must already be running before the failure.

Best recovery stack:

1. Start `mac-process-pressure-guard.mjs` before high-risk work.
2. Guard continuously caches process inventories.
3. If `ps` starts failing because process creation is exhausted, guard uses its cached PIDs.
4. Guard sends `SIGTERM` through Node's already-running process, which does not require spawning `/bin/kill`.
5. If configured, guard can later escalate to `SIGKILL`.

For race weekends, the guard should run alongside exactly one live data runner. It should not replace architecture cleanup; it is an emergency brake.

## Post-reboot decision tree

1. Reboot or manually quit enough apps to restore shell spawning.
2. Run `node scripts/mac-process-limit-audit.mjs`.
3. If `which pgrep` is not `/usr/bin/pgrep`, investigate old Homebrew/proctools paths before changing kernel limits.
4. If process ceilings are under 8192, apply a balanced persistent limit change.
5. If ceilings are already high, do not raise them; identify process family growth and add guard patterns.
6. Before the next live drill, start the guard and use a single runner.

## Confidence

- M5 Pro / 64 GB hardware class verified from already-running Node: high.
- Current symptom is process creation exhaustion: high.
- CPU/RAM idleness is compatible with this failure: high.
- Dynamic CPU/RAM-bound maxproc is supported by macOS: low.
- Static balanced maxproc increase may be appropriate if post-reboot caps are low: medium-high.
- Existing guard process with cached PIDs is the right emergency recovery mechanism: high.
