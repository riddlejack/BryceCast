# BryceCast integrated preview

## Outcome

- Branch: `codex/brycecast-integrated-preview`
- Final integration commit: this report is part of the single integration commit; use `git rev-parse codex/brycecast-integrated-preview` for its immutable hash.
- F2 baseline: `c207d07006c82ad146c6a9be89a4a9fbc1982c69`
- Brief B source: `806382d387ef554094c807ab2cc0ae30ab2b8ce6`
- Common ancestor: `b1a518bfce265c8d91f91701ba09e1358630b1ae`
- Preview URL: <http://127.0.0.1:8798/>
- Preview session: archived Road America Race 2, `5537-6754`
- Handoff state: green replay from `2026-06-21T16:15:02.760Z` at 1x. The control endpoint advances from that virtual time while the preview is running.

The final Brief B tree was squash-integrated onto the exact F2 baseline. The merge probe found 123 textual conflicts, all in generated analytical outputs. The conflicts were resolved from the final Brief B side and the merged source builders were rerun. There were no hand-spliced source conflicts. The final Career atlas component and A2 builders/validators are byte-identical to Brief B; F2 routing, replay overlay, and single-ingestor code remain byte-identical to F2 except for the narrow replay-label integration correction described below.

## Integration correction

Browser QA exposed one semantic defect: replay-fed payloads retained live-compatible shapes, so the F2 trust rail displayed the archived feed as official live data. The API now adds explicit `replay.simulation` metadata, and the Live screen renders:

- `Simulated replay`
- `archived session · simulated clock`
- `source archived Race Control`
- `Archived Race Control replay — not official live data.`
- `simulated · archived Race Control values`

The replay still reads the archived Race Control capture through the existing read-only overlay. It does not mutate SQLite, start an ingestor, or change the live-runner architecture.

## Semantic audit

- Personal race mileage: `6,924.4` miles, `3,019` personal race laps, `145` race rows, `observed_exact`.
- Physical-session floor: `14,048.9` miles and `6,032` laps, `observed_lower_bound` where required.
- Exact physical-session subtotal: `13,688.4` miles and `5,883` laps across `319` sessions.
- Unknown physical sessions: `16`, retained as `unknown`.
- Minimum venue-to-venue displacement: `54,649.3` miles, explicitly a minimum displacement, never actual travel.
- Actual travel remains `unknown`, blocked by `seasonBase` and `returnHomeFrequency`.
- Modeled route-adjusted minimum remains a `modeled_range` of `57,547.1–64,664.1` miles.
- All four confidence classes remain distinct: `observed_exact`, `observed_lower_bound`, `modeled_range`, `unknown`.
- The discredited `9,137.7` value has no match in the generated Career/atlas package or shipped UI source.
- Atlas: `34` sourced venues, `145` canonical races, Natural Earth `127`-feature full-world texture.
- No GPS, POV, radio, pit, or tire entitlement was added or inferred.

## Validation record

| Command | Exact result |
| --- | --- |
| `npm run analytics:ui-data-package` | PASS; rebuilt context narrative, predictive packs, section/race outputs, Career life stats, atlas, and UI package from source. |
| `npm run analytics:career-life-stats:validate` | PASS; 145 race rows, 3,019 personal race laps, 6,032 physical-session floor laps, 16 unknown sessions, 30 aggregate qualifying summaries excluded. |
| `npm run analytics:career-atlas:validate` | PASS; 34 sourced venues, 145 canonical races, 127-feature full-world texture, byte-stable rebuild. |
| `npm run career:validate` | PASS; 0 errors and one retained warning for 9 physical sessions missing start time. |
| `npm run career:test` | PASS; canonical career assertions passed, including 483 sessions, 8,494 results, and 70,061 lap samples. |
| `npm run analytics:ui-data-package:validate` | PASS; 5 screens, 5 upcoming events, 10 live fixtures, 3 debrief seeds, 7 career series, context packs 5/40/1/1. |
| `npm run analytics:view-models:validate` | PASS; 24 manifest items across 5 UI view-model surfaces. |
| `npm run test:ui-context-adapter` | PASS; UI context adapter hydration tests passed. |
| `NODE_NO_WARNINGS=1 npm run test:live-replay` | PASS; 15 assertions, live-compatible payload shape. `NODE_NO_WARNINGS=1` suppresses Node 24's experimental SQLite warning because this harness asserts clean child stderr. |
| `npm run test:live-readiness` | PASS; 63 assertions. |
| `npm run test:live-runner` | PASS; 43 assertions. |
| `npm run build` | PASS; TypeScript and Vite, 2,473 modules transformed. Existing >500 kB chunk warning only; main bundle 1,150.95 kB / 251.63 kB gzip. |
| Replay-mode `npm run api:smoke -- --port=8899` | PASS; static app served, GREEN Road America snapshot, Bryce P11, 24 timing rows, readiness `ready`; 13 API endpoints checked. Port 8899 was released afterward. |
| `git diff --check` | PASS. |

The package validator intentionally failed once after the replay-label source change because its embedded `scripts/api-server.mjs` source hash was stale. The package was regenerated from source and the final validator run above passed. The replay test initially encountered only Node 24's experimental SQLite warning on stderr; the warning-suppressed command above passed and is the recorded result.

## Browser QA and screenshots

The combined navigation was exercised from Career to Live. Career and Live routes rendered in the same app, the mobile tab bar exposed both, and no framework error overlay or horizontal overflow was observed. The requested viewport emulation was 1440×900 desktop and 390×844 mobile; the in-app browser reported effective CSS client widths of 1,781 and 469 respectively. Green, mid-race, and caution replay states were checked at both sizes. Caution showed `Field bunched under caution — gaps compress until the restart`.

Screenshots:

- `analysis/integration-preview/screenshots/career-atlas--desktop.png`
- `analysis/integration-preview/screenshots/career-atlas--mobile.png`
- `analysis/integration-preview/screenshots/live-replay-green--desktop.png`
- `analysis/integration-preview/screenshots/live-replay-green--mobile.png`
- `analysis/integration-preview/screenshots/live-replay-mid-race--desktop.png`
- `analysis/integration-preview/screenshots/live-replay-mid-race--mobile.png`
- `analysis/integration-preview/screenshots/live-replay-caution--desktop.png`
- `analysis/integration-preview/screenshots/live-replay-caution--mobile.png`

## Durable preview operations

- URL: <http://127.0.0.1:8798/>
- Listener: `127.0.0.1:8798` only
- tmux session: `brycecast-integrated-preview-f873`
- Process at report time: PID `99835`
- Log: `analysis/integration-preview/preview.log`
- Archive: `/Users/example/Documents/Bryce POV access/data/live/brycecast.sqlite`, opened read-only by the replay overlay
- Production app-server `:8787` and existing Brief B Vite `:5173` remained untouched.
- `BRYCECAST_REPLAY` is enabled by `scripts/live-replay.mjs` only inside this preview process. No `BRYCECAST_REPLAY` entry exists under `~/Library/LaunchAgents`.

Inspect:

```sh
tmux list-panes -t brycecast-integrated-preview-f873 -F 'session=#{session_name} pane_pid=#{pane_pid} command=#{pane_current_command} dead=#{pane_dead}'
curl -fsS http://127.0.0.1:8798/api/replay/control
```

Stop:

```sh
tmux kill-session -t brycecast-integrated-preview-f873
```

Restart from this worktree:

```sh
tmux new-session -d -s brycecast-integrated-preview-f873 \
  "env NODE_NO_WARNINGS=1 \
  BRYCECAST_SQLITE_PATH='/Users/example/Documents/Bryce POV access/data/live/brycecast.sqlite' \
  BRYCECAST_RUNNER_STATUS_PATH='/Users/example/Documents/Bryce POV access/data/live/live-runner-status.json' \
  BRYCECAST_REPLAY_SESSION='5537-6754' \
  BRYCECAST_REPLAY_T0='2026-06-21T16:15:02.760Z' \
  BRYCECAST_REPLAY_SPEED='1' \
  node scripts/live-replay.mjs --host=127.0.0.1 --port=8798 --static=dist \
  >> analysis/integration-preview/preview.log 2>&1"
```

The first durability attempt used a detached `nohup` process, which this execution environment reaped immediately. The dedicated detached tmux session is the successful safe alternative and remains healthy.

## Promotion plan after Jack/Fable approves F

The deployed source should be the exact final commit on `codex/brycecast-integrated-preview`, not either parent branch and not a cherry-pick of only Brief B's atlas commits. Preserve that tree exactly on the approved deployment branch/release ref.

In `/Users/example/Documents/Bryce POV access`, after approval only:

1. Move the deployed source to the approved integration commit and verify `git rev-parse HEAD` equals that hash.
2. Run `npm ci && npm run build`.
3. Confirm `BRYCECAST_REPLAY` is absent from `com.brycecast.app-server.plist` and `launchctl getenv BRYCECAST_REPLAY` is empty. If a transient launchd environment value exists, run `launchctl unsetenv BRYCECAST_REPLAY` before restart. Do not launch `scripts/live-replay.mjs` in production.
4. Restart only the app server with `launchctl kickstart -k gui/$(id -u)/com.brycecast.app-server`.
5. Verify `curl -fsS http://127.0.0.1:8787/api/health` and `curl -fsS http://127.0.0.1:8787/api/readiness`, then exercise `/career` and `/live` in the deployed build.

Do not restart or alter `com.brycecast.live-runner`; the integration does not change its architecture.
