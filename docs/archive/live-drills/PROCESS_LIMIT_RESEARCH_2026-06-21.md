> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# macOS Process Exhaustion Research - 2026-06-21

## Short conclusion

The Road America failure pattern matches macOS process-creation exhaustion, not CPU or RAM exhaustion. Other macOS users report the same symptom: terminals, browser tabs, and child-process spawns fail with `fork`, `forkpty`, `posix_spawn`, `EAGAIN`, `errno -35`, or `Resource temporarily unavailable` while Activity Monitor still shows idle CPU and available memory.

The right fix is not only "increase maxproc." It is a three-part fix:

1. Measure the actual kernel and launchd limits while the machine is healthy.
2. Raise system/process limits only in a balanced way, keeping `kern.maxproc`, `kern.maxprocperuid`, launchd soft/hard limits, and open-file limits coherent.
3. Bound high-risk tool process trees so Codex/dev-server/live-monitor failures cannot consume the entire machine's process budget.

## What other people ran into

### 1. Near per-user process limit even with idle CPU/RAM

Ask Different report:

- Symptoms: `-bash: fork: retry: Resource temporarily unavailable`, `error: cannot spawn`, and inability to run a `ps | wc` command because even that needed new processes.
- Local limit example: `ulimit -u` showed 709, and the user process count was about 706.
- Important warning: simply setting user maxproc higher than the system-wide maxproc is dangerous because one UID can then consume the system process table.

Source: https://apple.stackexchange.com/questions/373035/fix-fork-resource-temporarily-unavailable-on-os-x-macos

### 2. AI coding tool process explosion on macOS

Shivan Kaul Sahib documented a closely analogous AI-tool failure:

- Symptom: `EAGAIN: resource temporarily unavailable, posix_spawn '/usr/local/bin/pgrep'`, `errno: -35`, then `forkpty: Resource temporarily unavailable`.
- Root cause: an AI coding tool repeatedly spawned process-inspection commands; a broken `/usr/local/bin/pgrep` from old Homebrew/proctools ignored `-P`, returning far too many PIDs and multiplying the process spawn loop.
- Recovery: kill the parent AI tool process, remove the broken Homebrew `pgrep`/`proctools`, ensure `pgrep` resolves to `/usr/bin/pgrep`.
- Prevention: wrap the AI tool with a lower process cap so a runaway tree cannot exhaust the whole user budget.

Source: https://shivankaul.com/blog/claude-code-process-exhaustion

This is highly relevant to our incident because Codex/live monitoring uses many shells, node processes, browser helpers, and process-management routines. Even without the exact `pgrep` bug, the architectural class is the same: a tool stack with many subprocesses can exhaust process slots while CPU and RAM look fine.

### 3. Server Performance Mode raises multiple kernel ceilings together

Apple documents "performance mode" for macOS Server. On OS X El Capitan 10.11 and later, Apple says it is enabled with:

```sh
sudo nvram boot-args="serverperfmode=1 $(nvram boot-args 2>/dev/null | cut -f 2-)"
```

and requires restart. Apple currently says the article applies only to Intel Macs.

Source: https://support.apple.com/en-us/101992

Ask Different users measured the effect on older systems:

- `kern.maxproc` increased from about 1064 to about 5000.
- `kern.maxprocperuid` increased from about 709 to about 3750.
- Open-file and network backlog ceilings also increased.

Source: https://apple.stackexchange.com/questions/264958/what-does-serverperfmode-1-actually-do-on-macos

This is a better model than manually raising only one limit because it adjusts a family of related kernel parameters. The caveat is important: Apple now labels this Intel-only, and on Apple Silicon we should verify rather than assume it applies.

### 4. LaunchDaemon plist fixes can persist launchd limits, but they must be balanced

Common macOS guidance for persistent limits uses `/Library/LaunchDaemons/limit.maxproc.plist` and `/Library/LaunchDaemons/limit.maxfiles.plist`, then reboot. `launchctl limit` reports and sets soft/hard resource limits, and launchd plist resource-limit keys can influence related `sysctl` values.

Sources:

- `launchctl limit` behavior: https://leopard-adc.pepas.com/documentation/Darwin/Reference/ManPages/man1/launchctl.1.html
- `launchd.plist` `NumberOfProcesses` and `NumberOfFiles`: https://leancrew.com/all-this/man/man5/launchd.plist.html
- modern persistent plist approach: https://unix.stackexchange.com/questions/108174/how-to-persistently-control-maximum-system-resource-consumption-on-mac

The risk is setting `maxprocperuid` above the real system-wide `maxproc`. That can make the user session able to consume all process slots, which can make the whole OS unstable.

## Why CPU/RAM cannot be the only policy

macOS cannot safely bind process count only to current CPU/RAM headroom. Each process also consumes kernel bookkeeping, PID table entries, VM maps, Mach ports, file descriptors, task/thread structures, launchd state, and IPC resources. A process storm can break the system while CPU is idle, especially if processes are short-lived, blocked, zombie/defunct, or waiting on IO.

The right mental model is:

- CPU/RAM pressure answers "can existing work run fast?"
- process/table/UID limits answer "can the OS safely create and track more tasks?"

Those are related, but not interchangeable.

## Recommended local policy for this Mac

### Immediate recovery path

When `exec` starts failing with `os error 35`, do not launch more terminals or browsers. Use Activity Monitor or an already-running session to kill the biggest process-tree offender first.

Likely first targets from the Road America incident pattern:

- extra Codex windows/sessions/renderers
- Chrome/browser helpers
- LM Studio/local model servers
- MagicPath/design tooling
- orphaned Node pollers/dev servers
- any large family of defunct/zombie processes

### Healthy-machine audit commands

Run these after reboot or after the machine can spawn processes again:

```sh
date
uname -a
uname -m
launchctl limit maxproc
launchctl limit maxfiles
ulimit -a
sysctl kern.maxproc kern.maxprocperuid kern.num_proc kern.maxfiles kern.num_files
ps -axo user= | sort | uniq -c | sort -nr | head -20
ps -u "$USER" -o pid=,ppid=,stat=,comm= | wc -l
ps -u "$USER" -o comm= | sort | uniq -c | sort -nr | head -30
ps -A -o ppid=,stat= | awk '$2 ~ /Z/ {print $1}' | sort | uniq -c | sort -nr | head -20
which pgrep
pgrep -P $$ >/dev/null; echo $?
```

Specific thing to check because of the AI-tool analogue:

```sh
which pgrep
ls -l "$(which pgrep)"
```

Expected healthy result on modern macOS should normally be `/usr/bin/pgrep`, not an old `/usr/local/bin/pgrep` from Homebrew/proctools.

### Safer limit increase strategy

1. First capture current values.
2. If this is an Intel Mac, evaluate Apple Server Performance Mode before custom one-off plist tuning.
3. If this is Apple Silicon, do not assume Server Performance Mode works; prefer explicit measured `launchctl`/LaunchDaemon changes if current caps are actually low.
4. Never set per-user `maxproc` higher than the system-wide process ceiling.
5. Keep a reserve: the logged-in user should not be able to consume every system process slot.
6. Validate after reboot with `launchctl limit maxproc`, `ulimit -u`, and `sysctl kern.maxproc kern.maxprocperuid`.

### App-scoped protection

For Codex/live-race tooling, the more robust fix is to put each high-risk tool family in a bounded process tree.

Example wrapper pattern:

```sh
#!/usr/bin/env bash
set -euo pipefail

# Cap this tool tree below the machine-wide user limit so it cannot take down the session.
ulimit -u "${BRYCECAST_TOOL_MAXPROC:-300}" 2>/dev/null || true

exec "$@"
```

The live drill runner should not spawn a new process per request or per monitor. It should be one long-running Node process with:

- one upstream polling loop
- cache-backed API reads
- JSONL file logging
- SQLite writes
- a watchdog heartbeat file
- bounded concurrency
- no verbose terminal streaming during a race

## Proposed answer to the user's intuition

The intuition is directionally right: a 64 GB Mac with idle CPU should not hit a ~700-1000 user process ceiling during normal development work. We should raise a too-low ceiling if verified. But the stronger fix is not to bind process count dynamically to CPU/RAM. It is to:

- raise the ceiling in a balanced OS-supported way;
- keep enough kernel/process reserve for the system;
- prevent Codex/live-monitor process trees from becoming the thing that consumes the new ceiling.

If we only raise the global cap, a broken monitor can still eventually consume the larger budget. If we only add app wrappers but leave an artificially low system cap, legitimate dev/race tooling can still fail too early. We need both.

## Confidence

- Symptom class is process/table exhaustion: high.
- "CPU/RAM idle is compatible with this failure": high.
- Exact local limit hit on this Mac: medium until shell can run `launchctl/sysctl/ps`.
- Raising limits will help: medium-high if current caps are low.
- Raising limits alone is sufficient: low.
- Bounded single-runner architecture is required for next race weekend reliability: high.
