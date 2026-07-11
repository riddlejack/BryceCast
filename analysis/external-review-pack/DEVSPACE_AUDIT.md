# DevSpace Preinstall Audit

Evidence generated: 2026-06-19T20:57:01Z

Package audited: `@waishnav/devspace@1.0.1` from npm.

Audit commands run before this file was generated:

```bash
npm view @waishnav/devspace --json
npm pack @waishnav/devspace@1.0.1 --pack-destination /tmp/devspace-audit-20260619
tar -xzf /tmp/devspace-audit-20260619/waishnav-devspace-1.0.1.tgz -C /tmp/devspace-audit-20260619/unpacked
npm install --ignore-scripts --omit=dev /tmp/devspace-audit-20260619/waishnav-devspace-1.0.1.tgz
npm audit --omit=dev --json
git ls-remote https://github.com/Waishnav/devspace.git HEAD refs/heads/main "refs/tags/*"
```

Findings:

- npm metadata: latest at audit time was 1.0.1, published 2026-06-16T21:28:50.761Z, one maintainer, MIT license, README links to `https://github.com/Waishnav/devspace`.
- Published package has no `preinstall`, `install`, or `postinstall` script in its own `package.json`.
- Published tarball `gitHead` is `342af0fbeaa160e72d85a94fd87cde9001223233`, matching the peeled `v1.0.1` GitHub tag from `git ls-remote`.
- Local dependency install with `--ignore-scripts --omit=dev` installed 332 production packages and `npm audit` reported 0 known vulnerabilities.
- Runtime design is intentionally powerful: it exposes local file read/write/edit tools and a shell tool through MCP after owner-password OAuth approval.
- File tools path-check against opened workspaces/allowed roots, but shell commands run as the local user from the workspace directory. A shell command can read outside the allowed root unless the whole DevSpace process is constrained by an OS/container sandbox.
- Post-review finding: no verified first-party `DEVSPACE_*` flag in `@waishnav/devspace@1.0.1` disables shell-tool registration. `DEVSPACE_TOOL_MODE=minimal` still registers shell.
- Token exposure risk: if `DEVSPACE_OAUTH_OWNER_TOKEN` is supplied in the DevSpace process environment, an approved MCP shell session can inspect that inherited environment. Treat public-tunnel use as gated unless shell is disabled by patching DevSpace, the owner token is not inherited by shell, or DevSpace runs inside a disposable environment where that exposure is acceptable.
- DevSpace stores config/auth under `~/.devspace` by default; use `DEVSPACE_CONFIG_DIR` and `DEVSPACE_STATE_DIR` for an isolated setup.
- It does not create the public tunnel itself. Any tunnel URL should be treated as exposed internet surface and protected separately.

Sandbox tests run locally:

- Strict deny-default allowlist profile: failed with exit 134 even for simple `ls`/`node` probes in this macOS environment. Do not rely on that profile until it is tuned separately.
- Practical deny-home profile: passed. The pack was copied to `/tmp/brycecast-external-review-pack`; sandbox allowed reading that copy, blocked `/Users/example/Documents`, and `devspace doctor` reported SQLite ok.
- Local server smoke: passed from `/tmp` with `DEVSPACE_ALLOWED_ROOTS=/private/tmp/brycecast-external-review-pack`, `DEVSPACE_SKILLS=0`, `DEVSPACE_WIDGETS=off`, and `DEVSPACE_LOG_SHELL_COMMANDS=0`. Unauthenticated `/mcp` returned 401 with OAuth metadata as expected.
- Public tunnel started: false. ChatGPT authentication flow started: false.

Recommendation:

- Do not expose the full BryceCast repo through plain DevSpace over an internet tunnel.
- Do not start a public DevSpace tunnel for this review with the package as-is unless you also solve the shell/token exposure boundary. The review pack is ready; the live connector is not cleared for full-trust use.
- Safer options: upload/copy the generated review pack directly into GPT-5.5 Pro, run DevSpace in a disposable macOS user/container/VM with no sensitive files, or patch/wrap DevSpace so the shell tool is disabled and verify that `/env`/`printenv` cannot reveal owner credentials.
- If using DevSpace anyway, expose only a `/tmp` copy of this external-review pack, run under deny-home sandbox or stronger containment, set `DEVSPACE_SKILLS=0`, `DEVSPACE_WIDGETS=off` or `changes`, a narrow `DEVSPACE_ALLOWED_ROOTS`, isolated config/state dirs, and leave `DEVSPACE_LOG_SHELL_COMMANDS=0`.
- If the sandbox, shell, token, or tunnel setup changes, rerun the local read-block, token-noninheritance, and endpoint smoke tests before connecting ChatGPT.

Current status: package audit and local sandbox smoke passed for exposing the copied review pack only, but public DevSpace use remains gated by shell/token exposure. No public tunnel or ChatGPT authentication flow has been started.
