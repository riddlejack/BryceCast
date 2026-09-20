#!/usr/bin/env node
// Operator-side. Builds the tarball + manifest that ship as a GitHub Release
// asset on the public repository, so an outsider can restore the data this
// codebase needs without that data ever entering public Git history.
//
// A release asset can be withdrawn in one click if a source asks for a takedown;
// Git history cannot. That asymmetry is the whole reason this script exists.
//
//   npm run data:pack                  → artifacts/data-release/
//   npm run data:pack -- --out=<dir>
//
// The file list comes from the PRIVATE companion repo's index
// (`git --git-dir=.private.git --work-tree=. ls-files -- <pathspecs>`), never
// from a directory walk: a stray untracked file next to the real data must not
// be swept into a published asset. The pathspecs themselves live in the public
// scripts/lib/data-release-paths.mjs and exclude the deployment tooling.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { DATA_RELEASE_PATHSPECS, forbiddenReason, isReleasePath } from './lib/data-release-paths.mjs';

export const sha256File = async (path) => {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
};

const gitOutput = (gitDir, workTree, args) =>
  execFileSync('git', [`--git-dir=${gitDir}`, `--work-tree=${workTree}`, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // Captured, not inherited: `headOf` probes for a .git that may not exist and
    // its "fatal: not a git repository" is expected, not a message for the user.
    stdio: ['ignore', 'pipe', 'pipe']
  });

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Enumerate the release file set from the private index and prove it is clean.
 * Exported so the tests can drive it against a synthetic root.
 */
export const collectReleaseFiles = async ({ root, gitDir }) => {
  if (!(await exists(gitDir))) {
    throw new Error(
      `No private overlay found at ${gitDir}.\n` +
        'data:pack is an operator command: it packs the data the private companion repo tracks.\n' +
        'Attach the overlay first (see ops/README.md), or pass --git-dir=<path>.'
    );
  }
  let listed;
  try {
    listed = gitOutput(gitDir, root, ['ls-files', '-z', '--', ...DATA_RELEASE_PATHSPECS]).split('\0').filter(Boolean);
  } catch (error) {
    throw new Error(`git ls-files failed against ${gitDir}: ${(error.stderr || error.message).toString().trim()}`);
  }
  if (listed.length === 0) throw new Error(`The private index lists no files under the release pathspecs (${gitDir}).`);

  const rejected = [];
  for (const path of listed) {
    const reason = forbiddenReason(path);
    if (reason) rejected.push(`${path} (${reason})`);
    else if (!isReleasePath(path)) rejected.push(`${path} (outside the declared release pathspecs)`);
  }
  if (rejected.length > 0) {
    throw new Error(`Refusing to pack ${rejected.length} file(s) that may not be published:\n  ${rejected.join('\n  ')}`);
  }

  const missing = [];
  for (const path of listed) if (!(await exists(join(root, path)))) missing.push(path);
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} file(s) are in the private index but absent from the work tree; run the overlay's pull first:\n  ${missing
        .slice(0, 10)
        .join('\n  ')}${missing.length > 10 ? `\n  …and ${missing.length - 10} more` : ''}`
    );
  }
  // Sorted, so the tar member order is a property of the content and not of the
  // order git happened to print. Byte order, not locale order.
  return listed.sort();
};

const headOf = (gitDir, root) => {
  try {
    return gitOutput(gitDir, root, ['rev-parse', 'HEAD']).trim();
  } catch {
    return null;
  }
};

// A release ships the WORK TREE, because that is what an operator's checkout
// actually serves. Say so loudly when the work tree has drifted from the private
// repo's HEAD: the asset would then carry bytes no private commit records, and
// nobody could reproduce it from `privateCommit` alone.
const releasePathDrift = (gitDir, root) => {
  try {
    return gitOutput(gitDir, root, ['diff', '--name-only', 'HEAD', '--', ...DATA_RELEASE_PATHSPECS])
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
};

export const packData = async ({ root, gitDir = join(root, '.private.git'), outDir, date, log = console.log }) => {
  const files = await collectReleaseFiles({ root, gitDir });

  let bytes = 0;
  const entries = [];
  for (const path of files) {
    const info = await stat(join(root, path));
    bytes += info.size;
    entries.push({ path, bytes: info.size, sha256: await sha256File(join(root, path)) });
  }
  log(`Packing ${files.length} files, ${(bytes / 1e9).toFixed(2)} GB uncompressed…`);

  const stamp = date ?? new Date().toISOString().slice(0, 10);
  const tarballName = `brycecast-data-${stamp}.tar.gz`;
  const manifestName = `brycecast-data-${stamp}.manifest.json`;
  await mkdir(outDir, { recursive: true });
  const tarballPath = join(outDir, tarballName);
  const manifestPath = join(outDir, manifestName);

  // `-T <list>` with `--no-recursion` gives deterministic member ordering from
  // the sorted list above and guarantees tar adds nothing we did not name.
  const listDir = await mkdtemp(join(tmpdir(), 'brycecast-data-pack-'));
  const listPath = join(listDir, 'files.txt');
  await writeFile(listPath, `${files.join('\n')}\n`);
  try {
    execFileSync('tar', ['-czf', tarballPath, '-C', root, '--no-recursion', '-T', listPath], { stdio: 'inherit' });
  } finally {
    await rm(listDir, { recursive: true, force: true });
  }

  const drift = releasePathDrift(gitDir, root);
  if (drift && drift.length > 0) {
    console.warn(
      `WARNING: ${drift.length} release file(s) differ from the private repo's HEAD and are packed as they are on disk:\n  ${drift
        .slice(0, 10)
        .join('\n  ')}${drift.length > 10 ? `\n  …and ${drift.length - 10} more` : ''}\n` +
        "Commit them with `ops/private-overlay.sh commit` first if this release is meant to be reproducible from privateCommit."
    );
  }

  const tarballBytes = (await stat(tarballPath)).size;
  const manifest = {
    schemaVersion: 'brycecast-data-release.v1',
    createdAt: new Date().toISOString(),
    tarball: { name: tarballName, bytes: tarballBytes, sha256: await sha256File(tarballPath) },
    publicCommit: headOf(join(root, '.git'), root),
    privateCommit: headOf(gitDir, root),
    privateDirty: drift === null ? null : drift.length > 0,
    pathspecs: [...DATA_RELEASE_PATHSPECS],
    totals: { files: entries.length, bytes },
    files: entries
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  log(`  ${tarballPath}  ${(tarballBytes / 1e6).toFixed(1)} MB  sha256 ${manifest.tarball.sha256}`);
  log(`  ${manifestPath}  ${entries.length} files, ${bytes.toLocaleString('en-US')} bytes uncompressed`);
  log(`  public ${manifest.publicCommit ?? 'unknown'} · private ${manifest.privateCommit ?? 'unknown'}`);
  return { manifest, tarballPath, manifestPath };
};

const flag = (name, fallback = null) => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit === undefined) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(flag('root', process.cwd()));
  try {
    await packData({
      root,
      gitDir: resolve(root, flag('git-dir', join(root, '.private.git'))),
      outDir: resolve(root, flag('out', 'artifacts/data-release')),
      date: flag('date', null)
    });
  } catch (error) {
    console.error(`data:pack failed — ${error.message}`);
    process.exitCode = 1;
  }
}
