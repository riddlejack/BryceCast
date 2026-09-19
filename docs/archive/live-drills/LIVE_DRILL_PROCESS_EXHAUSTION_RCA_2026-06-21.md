> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# Live Drill Process Exhaustion RCA

Date: 2026-06-21
Scope: BryceCast Road America Race 2 live drill

## Question

Why did local execution fail with `Resource temporarily unavailable (os error 35)` when CPU and memory were not exhausted?

## Conclusion

The failure was a process creation limit, not CPU or RAM pressure.

macOS was refusing new `fork/exec` work before commands could start. That is why trivial commands such as `date`, `git status`, `ps`, `sysctl`, and validation scripts sometimes failed before producing any output, while already-running processes such as the Node REPL and Activity Monitor could still operate.

## Evidence

- Error reproduced on trivial commands:
  - `date -u +%Y-%m-%dT%H:%M:%SZ`
  - `git status --short`
  - `launchctl limit maxproc; sysctl ...; ps ...`
  - Failure text: `Resource temporarily unavailable (os error 35)`

- Activity Monitor showed CPU and memory were not the bottleneck:
  - CPU idle observed around 90 percent after cleanup.
  - Memory pressure was green.
  - Physical memory: 64 GB.
  - Memory used: 27.33 GB.
  - Cached files: 23.27 GB.
  - Swap used: 0 bytes.

- Activity Monitor showed process pressure:
  - All-process count was around 897 at the worst observed points.
  - After quitting MagicPath and LM Studio, process count dropped to about 880 and shell execution temporarily recovered.
  - Shell failures later returned while process count remained high.

- High-process / high-thread local app families visible during recovery included:
  - MagicPath plus multiple MagicPath helpers.
  - LM Studio plus helpers.
  - Chrome crashpad leftovers after Chrome quit.
  - Codex app/service/renderers.
  - Code Helper processes.
  - Logi Options+ / LogiPluginService.
  - Several long-running `node` processes.

## Why This Can Happen With Low CPU And Free RAM

Process creation has separate kernel limits. A Mac can have idle CPU, free RAM, and no swap, while still refusing new processes because one of these resources is near its limit:

- Total process slots.
- Per-user process limit.
- Threads/tasks associated with processes.
- Mach ports and launch services pressure.
- File descriptors or subprocess supervision handles.

`os error 35` is consistent with the OS returning an EAGAIN-style failure for process creation. It is not evidence that Race Control, Node, SQLite, or the API were inherently overloaded.

## Immediate Trigger

The live drill used too many concurrent local orchestration surfaces:

- Race pollers.
- External-source watcher.
- API server.
- API summary logger.
- API read pressure.
- Source pressure tests.
- Emergency Node REPL capture.
- Computer Use / Activity Monitor.
- Browser/Chrome attempts.
- Multiple terminal/PTY sessions with verbose output.

The individual pieces were reasonable; the combined operator pattern was not. The process table had too little headroom, so a normal restart/recovery attempt could not create even a trivial shell process.

## Impact On Race Data

The upstream data source did not fail.

Validated:

- Primary Race Control 1s pressure: 300/300 successful requests.
- All-source live 1s pressure: 270/270 successful requests.
- All-source post-race 1s pressure: 135/135 successful requests.
- Emergency 1s capture: 599 snapshots, 0 endpoint failures, max cadence gap 1.31s.
- API read pressure: 720 route requests, 0 errors.
- Subsecond local reads: 500ms and 250ms phases, 0 errors.
- SQLite Race 2 archive: 1,175 Race 2 rows, 0 source probe failures.
- Final Race Control state captured: COLD lap 18/18, Bryce P11.

Main data gap:

- Combined archive gap from `2026-06-21T16:46:17.880Z` lap 17 live to `2026-06-21T17:00:28.958Z` final COLD snapshot: 851.078 seconds.
- This means we do not have a continuous 1s final-lap micro-timeline.
- We do have the final COLD state and official public corroboration of Race 2 season updates.

## Can The System Work Live Next Race Weekend?

Yes for the data-source and ingestion model, with high confidence.

No for the current ad hoc operator setup, with high confidence.

The evidence supports that BryceCast can collect and ingest Race Control data live at 1s cadence, persist it, replay it, and serve it through the API. The evidence does not support continuing to run multiple independent monitors and pressure tests from Codex terminal sessions during the race.

## Required Prevention Plan

1. Build one live drill runner.
   - One Node process owns source polling, raw payload capture, snapshot normalization, SQLite writes, JSONL writes, status writes, and basic health metrics.
   - It multiplexes endpoints internally instead of spawning separate watchers.

2. Make API routes cache-backed by default.
   - `/api/readiness`, `/api/bryce`, `/api/timing`, and `/api/sources` should read latest/archive state by default.
   - Direct upstream refresh should require an explicit admin/debug flag.
   - Client polling must not multiply Race Control upstream calls.

3. Add a preflight process-budget gate.
   - Record `launchctl limit maxproc`, `kern.maxproc`, `kern.maxprocperuid`, total process count, user process count, and thread count.
   - Fail the live drill if process count is too close to the limit.
   - Suggested threshold: keep at least 150-200 spare process slots before green.

4. Use quiet logging only.
   - No verbose 1s JSON to terminal.
   - Write JSONL and compact status JSON.
   - Tail only status files manually if needed.

5. Add a watchdog file.
   - Include PID, startedAt, updatedAt, row counts, endpoint failure counts, latest event/session, latest source state, latest Bryce rank/lap, and last successful write.
   - Make this readable without attaching to the process.

6. Add a lockfile.
   - Prevent two ingestors from running for the same race/session.
   - Include stale-lock detection based on heartbeat age.

7. Pre-race app cleanup.
   - Quit Chrome, MagicPath, LM Studio, and other nonessential Electron/helper-heavy apps.
   - Keep Activity Monitor available, but do not use several browser/automation tools at once.

8. Use bounded tests during the race.
   - Pressure tests should be finite and scheduled.
   - Continuous capture should be handled by the one ingestor.
   - Do not run open-ended terminal monitors alongside it.

9. Keep an emergency fallback, but without short wrapper timeout.
   - The emergency REPL capture saved the drill, but it stopped after the wrapper timeout.
   - Future fallback should be file-backed and independently supervised.

10. Rehearse before Mid-Ohio.
   - Run the exact preflight and a simulated/offline replay test before July 4.
   - Run one short live-source probe near session start, then let the single ingestor own the race.

## Confidence

- Root-cause class: high.
- Exact OS limit hit: medium until `launchctl limit maxproc`, `sysctl kern.maxproc kern.maxprocperuid`, and user process counts can be captured while shell is stable.
- Race Control live data viability: high.
- Current operator workflow viability: low until the prevention plan is implemented.
