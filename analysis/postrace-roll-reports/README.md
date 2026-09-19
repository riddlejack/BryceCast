# postrace:roll run reports

`npm run postrace:roll` (Brief T) writes a JSON + human-markdown report here for
every run, named `postrace-roll-<mode>-<timestamp>.{json,md}`. The reports are
ignored by git (see `.gitignore`) — they are run logs, not tracked artifacts.

Each report records: the preflight checks, the roll intent (committed asOfDate,
next event, what rolls out today), each pipeline step's status and exit code,
what the upcoming-event set rolled to, the MANUAL follow-ups the script did not
perform (the live-readiness upcoming-fixture migration; deploy), and an explicit
"never did" list (deploy, LaunchAgent changes, iCloud writes, live-runner
interaction).

See `docs/operations/POSTRACE_ROLL.md` for the pipeline order and the guard rules.
