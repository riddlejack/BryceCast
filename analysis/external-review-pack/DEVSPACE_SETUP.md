# DevSpace Setup For GPT-5.5 Pro Review

Use this only if you want ChatGPT/5.5 Pro to access the review pack through DevSpace. This setup intentionally exposes a copied review pack, not the BryceCast repo.

Already staged by the audit:

- Local DevSpace runtime: `/tmp/devspace-audit-20260619/runtime-install`
- npm tarball audit dir: `/tmp/devspace-audit-20260619`
- Safe pack copy target: `/tmp/brycecast-external-review-pack`
- Deny-home sandbox profile: `/tmp/devspace-audit-20260619/devspace-deny-home.sb`

Refresh the pack copy before starting DevSpace:

```bash
PACK_SRC="/Users/example/Documents/Bryce POV access/analysis/external-review-pack"
PACK_COPY="/tmp/brycecast-external-review-pack"
rm -rf "$PACK_COPY"
cp -R "$PACK_SRC" "$PACK_COPY"
```

Create or refresh the deny-home sandbox profile:

```bash
cat > /tmp/devspace-audit-20260619/devspace-deny-home.sb <<\EOF
(version 1)
(allow default)
(deny file-read* (subpath "/Users/example"))
(deny file-write* (subpath "/Users/example"))
EOF
```

Local smoke check:

```bash
sandbox-exec -f /tmp/devspace-audit-20260619/devspace-deny-home.sb /bin/cat /private/tmp/brycecast-external-review-pack/README.md | head -1
sandbox-exec -f /tmp/devspace-audit-20260619/devspace-deny-home.sb /bin/ls /Users/example/Documents
# The first command should print the pack title; the second should fail with Operation not permitted.
```

Public tunnel gate:

Do not start a public DevSpace tunnel for this review until one of these is true:

- DevSpace is patched or configured so the MCP shell tool is unavailable, and a smoke test proves no shell tool is advertised.
- The owner token is not inherited by shell commands, and a smoke test proves `env`/`printenv` cannot reveal DevSpace credentials.
- DevSpace runs inside a disposable user/container/VM that contains only `/tmp/brycecast-external-review-pack` and no reusable credentials.

Reason: `@waishnav/devspace@1.0.1` registers a shell tool, and the audited shell layer inherits the process environment. A public reviewer session that can invoke shell can read any owner token provided in that environment.

Residual risk: this deny-home sandbox is not a full container. It is acceptable for local smoke testing the review-pack boundary, but it is not by itself enough to clear a public DevSpace tunnel with shell enabled.
