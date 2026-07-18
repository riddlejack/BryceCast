# BryceCast repository consolidation audit

Audit and consolidation date: 2026-07-18  
Starting integrated commit: `5599bfc53ac34776f6cd40d582f0fffa60283815`  
Canonical branch after consolidation: `master`  
Pre-cleanup tag: `brycecast-pre-consolidation-20260718T184926Z`  
Post-consolidation tag: `brycecast-post-consolidation-20260718`  
External recovery root: `/Users/example/Documents/BryceCast-recovery-backups/2026-07-18T184926Z`

## Independent verdict

Consolidation was safe and proceeded. The decision was conditional on five facts that were independently established before cleanup:

1. `master` at `ce904af067ff40ce68ed3d9593cd8521815c1fc3` had zero unique commits relative to the integrated branch and was its exact ancestor.
2. Approved A2, B, C, and every F2-F6 implementation lane were present in the integrated content/history. Brief D was absent and remained excluded.
3. Every named branch, detached worktree commit, and reflog-only commit had an explicit archive ref or was contained by the promoted history.
4. Dirty, untracked, and meaningful ignored state had a verified external backup; the Bryce No. 9 work also became a build-passing reviewable commit.
5. The active runner, LaunchAgent, SQLite inode/size/counts, and runtime path could remain untouched while Git metadata and other worktrees were organized.

The repository kept the trunk name `master`. No executable repository code depends on `master` or `main`, so a rename was technically possible, but it offered no operational benefit without a remote or release convention. A verified fast-forward was smaller and easier to roll back.

## Before and after

| Measure | Before | After closeout |
|---|---:|---:|
| Local branch heads | 18 | 2 (`master` plus the dirty/runtime checkpoint branch) |
| Registered worktrees | 21 | 2 |
| Present worktrees | 20 | 2 |
| Stale registrations | 1 | 0 |
| Present-worktree disk use | 38.56 GiB | 10.13 GiB |
| Tags | 0 | 3 |
| Remotes | 0 | 0 |
| Stashes | 0 | 0 |

The retained worktrees are the canonical `master` checkout at `/Users/example/.codex/worktrees/ac78/Bryce POV access` and the operational ordinary checkout at `/Users/example/Documents/Bryce POV access`. The latter remains on `codex/brycecast-ui-v2-checkpoint` because its dirty state and live-runner path are intentionally preserved.

## Branch disposition

| Original branch | Original tip | Disposition | Preservation/containment |
|---|---|---|---|
| `master` | `ce904af` | Canonical trunk, fast-forwarded | Exact ancestor; promoted through the audited consolidation commits |
| `codex/integrate-brief-c-live-f6` | `5599bfc` | Superseded | Fully contained by `master`; original tip at `refs/archive/20260718T184926Z/heads/codex/integrate-brief-c-live-f6` |
| `live-page-replay` | `6a0007a` | Contained/retired | Exact ancestor plus archive ref |
| `codex/live-page-v2-f2` | `c207d07` | Contained/retired | Exact ancestor plus archive ref |
| `codex/brycecast-integrated-preview` | `dd68f19` | Contained/retired | Exact ancestor plus archive ref |
| `codex/live-f3-data-motion-audit` | `4245813` | Contained/retired | Exact ancestor plus archive ref |
| `codex/live-f4-chart-persistence-accuracy` | `d6e0a85` | Contained/retired | Exact ancestor plus archive ref |
| `codex/live-f5-battle-camera` | `b3725fc` | Contained/retired | Exact ancestor plus archive ref |
| `codex/live-f6-running-order` | `a7fcf7e` | Contained/retired | Exact ancestor plus archive ref |
| `codex/brief-a-recovered` | `d2c3d91` | Content-superseded/retired | Unique history preserved at matching archive ref |
| `codex/brief-a2-odometer-semantic-correction` | `b74a660` | Content-contained/retired | A2 package is byte-equivalent in integration; source history archived |
| `codex/brief-b-career-atlas` | `806382d` | Content-contained/retired | Atlas package and screen integration verified; source history archived |
| `codex/brief-c-named-moments` | `8fa8baa` | Content-contained/retired | Reapplied by canonical `95d280e`; source history archived |
| `codex/brief-d-points-pace-verification` | `c0baf64` | Intentionally excluded/retired | Analysis provenance archived; no Brief D website feature entered `master` |
| `codex/brycecast-ui-v2-checkpoint` | `8b0d422` | Uniquely preserved active branch | Ordinary dirty checkout retained; branch history and dirty state separately backed up |
| `codex/gb3-historic-analytics` | `d4d3ce1` | Uniquely preserved/retired | Archived branch and bundle; generated outputs were stale and were not merged |
| `codex/live-readiness-api` | `53856ba` | Superseded/retired | Unique commit archived; current readiness implementation/hardening controls |
| `rescue/main-tree-2026-07-12` | `b770c1e` | Uniquely preserved/retired | Rescue snapshot archived rather than treated as product code |

The recovered car branch created during the gate was retired after commit `51aa914658b64b615bfd32b8caa5ba71a587aaaa` was preserved at `refs/archive/20260718T184926Z/recovered/bryce-car-art` and tag `brycecast-car-art-recovered-20260718`.

## Worktree disposition

| Worktree/path | Starting state | Disposition |
|---|---|---|
| `/Users/example/Documents/Bryce POV access` | Dirty checkpoint branch; active runner and 5.99 GB SQLite archive | Retained exactly; no reset, checkout, schema, LaunchAgent, or runtime change |
| `/Users/example/.codex/worktrees/ac78/Bryce POV access` | Clean integrated branch | Retained and switched to canonical `master` |
| `/Users/example/.codex/worktrees/f00d/Bryce POV access` | Clean isolated audit checkout | Removed after its audited commits were fast-forwarded to `master` |
| `0e49`, `703b`, `8a78`, `c701`, `f775` | Clean detached commits | Removed without force after explicit archive refs and bundle verification |
| `259d`, `6bc1`, `a636` | Clean contained F6/F4/F3 branches | Removed without force |
| `3872` | Clean readiness branch with small ignored live proof files | Ignored proof files backed up; removed without force |
| `8b4a` | Clean Brief C with ignored QA artifacts | QA artifacts backed up; removed without force |
| `a305` | Clean F2 branch with ignored replay QA artifacts | QA artifacts backed up; removed without force |
| `daff` | Clean intentionally excluded Brief D | Removed without force after archive ref |
| `dd28` | Clean Brief B | Removed without force after content and archive verification |
| `f873` | Clean integrated preview | Removed without force |
| `live-f5-battle-camera` | One untracked dependency symlink | Symlink archived, then removed; clean worktree removed without force |
| `/Users/example/Documents/brycecast-brief-a2` | Clean A2 branch | Removed without force |
| `/Users/example/Documents/brycecast-live` | One untracked F2 brief, byte-identical to tracked checkpoint copy | File backed up and hash-matched, then clean worktree removed without force |
| `/private/tmp/brycecast-predictive-ui-review.2xKsA9` | Missing/stale registration | Metadata pruned only after full Git backup |
| Temporary generator and car-recovery worktrees | Created during this audit | Cleaned and removed without force after validation/preservation |

## Detached and reflog-only recovery

The five detached commits `d918fe8`, `0f6a974`, `26eac5a`, `fbb593d`, and `c78aec4` are under `refs/archive/20260718T184926Z/detached/*`.

The reflog-only commits `1a4040b4cd85c2adbdbe9e1aae3ae8a3c4c10ada`, `75494174dfe7286b3acce658a9253ef7ff7f5f7b`, and `b57bebb7e2344af1d14c719d37e33cf6a13ead3e` are under `refs/archive/20260718T184926Z/reflog/*`. Every original branch tip is mirrored under `refs/archive/20260718T184926Z/heads/*`.

## Backup gate

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `git/all-current-refs-before.bundle` | 282,945,536 | `17fcec8585eb8478eb26ee98725bdb2b4ae2b9170ae61158ce62e3d31efe63a7` |
| `git/all-archived-refs-before-cleanup.bundle` | 282,946,862 | `6e53bbab6111e43a4c122de840f8670fc0a90ed4c0076a892eaf13ccb7206f04` |
| `git/common-git-dir-before.tar` | 631,633,920 | `90ef006008b4b1a2a09a006bfa001d6bf05589283be24e9f3ac9f2518606197b` |

The external `MANIFEST.md` contains every dirty/untracked/ignored backup artifact,
byte size, and SHA-256, plus the final post-consolidation bundle. Its own final
hash is reported outside the repository to avoid a self-referential manifest
cycle. The initial bundle verified and cloned; `8b0d422` checked out in the
recovery clone; the binary-capable dirty patch passed `git apply --check`; `git
fsck --full` passed; all tar archives listed successfully; copied car/F2 files
hash-matched their sources.

## UI-package repair

The exact initial failure was:

`Predictive live_race_day_context sourceRefs[1] is stale for scripts/api-server.mjs`

The embedded API reference was 86,737 bytes at SHA-256 `4bb3b28044fb2f3f7d0e77098c682ef51eaff85d93d29e06fa77709330187e23`. The current file is 87,266 bytes at SHA-256 `c15f43bd89f36e6fd2a1b12638159de721128fa8a6bac9ca44e7b462dfb85a78`.

The predictive owner generator was run with `BRYCECAST_ANALYTICS_AS_OF_DATE=2026-07-13`. Its complete broad diff was inspected. Only the live pack's API source reference was semantic; all other changes were generation timestamps and derived hashes. Those unrelated timestamp rewrites were rejected. The regenerated live pack, its one manifest hash, and a `BRYCECAST_SKIP_UPSTREAM_REFRESH=1` aggregate package rebuild produced a three-file repair. Package validation then passed with five screens, seven career series, five upcoming-event packs, forty debrief packs, one Career Lab pack, and one live-race-day pack.

## Validation

| Gate | Result |
|---|---|
| Career life-stats validator | Pass: 145 race rows; 3,019 personal race laps; 6,032 physical-session floor laps |
| Career atlas validator | Pass: 34 venues; 145 races; byte-stable rebuild |
| UI data package validator | Pass |
| View-model validator | Pass: 24 manifest items across five surfaces |
| UI context adapter | Pass |
| Live motion | Pass: 56 assertions |
| Live camera | Pass: 39 assertions |
| Live running order | Pass: 44 assertions |
| Live replay | Pass: 16 assertions |
| Live readiness | Pass: 68 assertions |
| Live runner | Pass: 43 assertions |
| F4 archive consistency | Pass: 6,403 samples, zero violations; proof SHA `b4cd7d7d5e9ed5cb74b375083538044a5c9fe47758cdb40ef228e0cf327634e3` |
| F5 archive camera | Pass: 6,403 samples, zero violations; proof SHA `921428e762bd8bde06c236d7f31658068881ff62086220720928295305c50160` |
| F6 archive running order | Pass: 6,403 samples, zero violations; proof SHA `2a692cce1b310ac7ce9a941ba3294de352fa7cc2fc1b6d9d8cb7830991bc0665` |
| TypeScript | Pass |
| Production build | Pass; existing Vite chunk-size advisory only |
| API smoke | Pass on isolated port 8899 with temporary missing SQLite path; current upstream state correctly classified `wrong_series` |
| `git diff --check` and JSON parse | Pass |

Visual F6 replay QA was attempted twice against isolated ports 8895/5195 and the canonical database opened read-only. Each run rendered 17 expected state/startup/lapped/overtake screenshots, then the exact-timestamp harness skipped the 751 ms sample at `2026-07-04T17:22:05.680Z` and timed out. No product code was changed to make a timing-sensitive harness pass. This is a validation deviation; the deterministic 44-assertion F6 suite and full 6,403-sample archive audit both pass.

## Runtime invariants

Before and after organization, LaunchAgent `com.brycecast.live-runner` remained running as PID 62681, started `2026-07-18T17:13:56.153Z`, with child `caffeinate` PID 62683. Its working directory remained `/Users/example/Documents/Bryce POV access`. The runner stayed in its expected `IDLE` window before Nashville qualifying.

The canonical database remained inode `16776463`, 5,990,891,520 bytes, with 16,534 `race_snapshots` and 16,527 `bryce_samples`, both last written at `2026-07-18T16:35:02.107Z`. No LaunchAgent, live archive schema, capture process, deployment, remote, or upstream state was changed.

## Judgment log

| Decision | Evidence | Rollback handle |
|---|---|---|
| Proceed with consolidation | Feature containment, Git ancestry, dirty-state inventory, archive refs, verified recovery clone, passing gates | Pre tag, archive refs, both bundles, full Git tar |
| Keep `master` name | No executable branch coupling; no remote/release convention; rename added no value | Original master at archive ref and pre bundle |
| Keep checkpoint as one active feature branch | Ordinary checkout is dirty and is the hard-coded live runtime/archive path | Branch, dirty patch/car tar, full backup |
| Do not port car work into canonical UI | It changes the obsolete checkpoint shell and is a product decision, not consolidation | Commit `51aa914`, car tag, archive ref, raw backup |
| Do not merge GB3 generated output | Unique analysis is valuable but uses stale June data/counts | GB3 archive ref, snapshot ref, bundle |
| Exclude Brief D | Its verification never authorized a website feature | Brief D archive ref and bundle |
| Retire branches into archive refs rather than discard history | Several source branches were content-integrated rather than ancestry-integrated | One-to-one `refs/archive/.../heads/*` mapping |
| Remove only clean worktrees without force | Dirty and meaningful ignored state was backed up first | Artifact tar hashes and worktree/ref manifests |
| Selectively accept generator output | Full run proved only API source hash was semantic; other churn was timestamps | Pre tag and generated three-file diff |
| Leave active SQLite uncopied and untouched | A live multi-GB copy would be non-transactional and outside the Git organization task | Existing operational backup policy; inode/count evidence |
| Record visual QA timing failure instead of patching product | Exact sub-second marker skipped twice while deterministic and archive gates passed | `/tmp` screenshots during audit; test/audit outputs |

## Recovery

1. To restore every namespace, initialize a new directory and fetch the bundle
   with explicit refspecs: `git init recovered-brycecast`, then
   `git -C recovered-brycecast fetch /absolute/path/to/all-refs-post-consolidation.bundle 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*' 'refs/archive/*:refs/archive/*' 'refs/codex/*:refs/codex/*'`.
   Never fetch or extract over the live repository. A plain `git clone` restores
   normal heads/tags and all objects, but does not install the custom archive
   namespaces.
2. Set the recovered worktree to the approved trunk with `git -C recovered-brycecast symbolic-ref HEAD refs/heads/master` and `git -C recovered-brycecast reset --hard master`. Use `reset --hard` only inside this new recovery directory.
3. To restore the old trunk, resolve `refs/archive/20260718T184926Z/heads/master` or the pre-cleanup tag.
4. To restore any retired branch, create a new branch from its same-named `refs/archive/20260718T184926Z/heads/...` ref.
5. To restore the ordinary dirty checkout, check out `8b0d422dcd593192f78dd775b49dd04be1f1aa17`, apply `dirty/main-checkout/tracked-working-tree.patch`, and extract `dirty/main-checkout/bryce-aron-9.tar` under `src/assets/cars/`.
6. To recover reflog/detached history, use the explicit `refs/archive/20260718T184926Z/reflog/*` and `detached/*` refs.
7. Use `git/common-git-dir-before.tar` only in a new empty recovery directory if the exact pre-cleanup administrative state is required.
8. Verify every restored artifact against `/Users/example/Documents/BryceCast-recovery-backups/2026-07-18T184926Z/MANIFEST.md`.
