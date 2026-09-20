#!/usr/bin/env node
// Public-facing. Downloads the BryceCast data release and unpacks it into the
// git-ignored paths this codebase expects, so a plain clone can run the
// full-corpus lanes instead of only the offline demo.
//
//   npm run data:restore                       latest data-* release
//   npm run data:restore -- --tag=data-2026-09-20
//   npm run data:restore -- --dry-run
//   node scripts/data-restore.mjs --from=<tarball> --manifest=<manifest.json>
//
// Flags: --tag --from --manifest --force --dry-run --root --repo --no-expand-dataset
//
// Nothing is extracted before the downloaded tarball's sha256 matches the
// manifest, no tar entry may escape the checkout or land outside the declared
// data pathspecs, every extracted file is checked against its own recorded
// digest in a temporary directory, and only then is anything moved into place.
// An existing file whose content differs is never overwritten without --force.
//
// Requires Node 24 and a system `tar` (GNU tar, bsdtar, or Windows' bundled
// bsdtar — the last is best-effort).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createGunzip } from 'node:zlib';
import {
  CANONICAL_DATASET,
  forbiddenReason,
  isReleasePath,
  unsafeEntryReason
} from './lib/data-release-paths.mjs';

const DEFAULT_REPO = 'riddlejack/brycecast';
const TAG_PREFIX = 'data-';

const sha256File = async (path) => {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
};

const exists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

class FriendlyError extends Error {}

// ---------------------------------------------------------------- GitHub ---

const githubHeaders = () => {
  const headers = { 'user-agent': 'brycecast-data-restore', accept: 'application/vnd.github+json' };
  // The repository may still be private while publication review is open; a
  // token with read access is the only way to see its releases until it is not.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
};

const githubJson = async (url) => {
  const response = await fetch(url, { headers: githubHeaders() });
  if (response.status === 404) {
    throw new FriendlyError(
      `GitHub returned 404 for ${url}.\n` +
        'If the repository is still private, set GITHUB_TOKEN to a token that can read it.'
    );
  }
  if (response.status === 403 || response.status === 429) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const when = Number.isFinite(reset) && reset > 0 ? ` Try again after ${new Date(reset * 1000).toISOString()}.` : '';
    throw new FriendlyError(
      `GitHub rate-limited this request (HTTP ${response.status}).${when}\n` +
        'Set GITHUB_TOKEN to raise the limit, or download the release assets by hand and use --from/--manifest.'
    );
  }
  if (!response.ok) throw new FriendlyError(`GitHub request failed (HTTP ${response.status}) for ${url}`);
  return response.json();
};

const resolveRelease = async ({ repo, tag, log }) => {
  if (tag) {
    log(`Looking up release ${tag} in ${repo}…`);
    return githubJson(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  }
  log(`Looking up the latest ${TAG_PREFIX}* release in ${repo}…`);
  const releases = await githubJson(`https://api.github.com/repos/${repo}/releases?per_page=100`);
  const candidates = releases.filter((r) => typeof r.tag_name === 'string' && r.tag_name.startsWith(TAG_PREFIX) && !r.draft);
  if (candidates.length === 0) {
    throw new FriendlyError(
      `No release tagged ${TAG_PREFIX}* was found in ${repo}.\n` +
        'The data release may not be published yet. Pass --tag to name one explicitly, or --from/--manifest for a local copy.'
    );
  }
  // Releases come back newest-first; sort by tag anyway so a date-stamped tag
  // wins over publication order if a release was ever edited late.
  candidates.sort((a, b) => (a.tag_name < b.tag_name ? 1 : a.tag_name > b.tag_name ? -1 : 0));
  return candidates[0];
};

const pickAsset = (release, suffix) => {
  const asset = (release.assets ?? []).find((a) => typeof a.name === 'string' && a.name.endsWith(suffix));
  if (!asset) {
    throw new FriendlyError(
      `Release ${release.tag_name} has no ${suffix} asset (found: ${(release.assets ?? []).map((a) => a.name).join(', ') || 'none'}).`
    );
  }
  return asset;
};

const downloadAsset = async (asset, destination, log) => {
  log(`  ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)…`);
  // The asset API endpoint honours the token; browser_download_url does not.
  const url = process.env.GITHUB_TOKEN ? asset.url : asset.browser_download_url;
  const response = await fetch(url, {
    headers: { ...githubHeaders(), accept: 'application/octet-stream' },
    redirect: 'follow'
  });
  if (!response.ok || !response.body) {
    throw new FriendlyError(`Downloading ${asset.name} failed (HTTP ${response.status}).`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  return destination;
};

// ----------------------------------------------------------------- core ---

const readManifest = async (path) => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new FriendlyError(`Could not read the release manifest at ${path}: ${error.message}`);
  }
  if (manifest?.schemaVersion !== 'brycecast-data-release.v1') {
    throw new FriendlyError(`Unexpected manifest schemaVersion: ${manifest?.schemaVersion ?? '(missing)'}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new FriendlyError('The release manifest lists no files.');
  }
  return manifest;
};

const listTarEntries = (tarballPath) =>
  execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);

const verifyEntries = (entries, manifest) => {
  const declared = new Set(manifest.files.map((f) => f.path));
  const problems = [];
  for (const raw of entries) {
    // Some tar implementations emit explicit directory members with a trailing
    // slash. They carry no content, so they only have to be safe, not declared.
    const isDirectory = raw.endsWith('/');
    const entry = isDirectory ? raw.slice(0, -1) : raw;
    const unsafe = unsafeEntryReason(entry);
    if (unsafe) problems.push(`${raw}: ${unsafe}`);
    else if (isDirectory) continue;
    else if (forbiddenReason(entry)) problems.push(`${entry}: ${forbiddenReason(entry)} may never be restored`);
    else if (!isReleasePath(entry)) problems.push(`${entry}: outside the declared data pathspecs`);
    else if (!declared.has(entry)) problems.push(`${entry}: present in the tarball but absent from the manifest`);
  }
  if (problems.length > 0) {
    throw new FriendlyError(
      `Refusing to extract ${problems.length} unsafe or undeclared tar entr${problems.length === 1 ? 'y' : 'ies'}:\n  ${problems
        .slice(0, 20)
        .join('\n  ')}`
    );
  }
};

const moveInto = async (from, to) => {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await copyFile(from, to);
    await rm(from, { force: true });
  }
};

// The canonical dataset cannot ship raw (364 MB, past GitHub's 100 MB block), so
// the release carries the gzip plus the sha256 of the UNCOMPRESSED file. Expand
// it here through that recorded digest — the same check the private overlay's
// `pull` performs. Nothing is installed that does not match.
const expandCanonicalDataset = async ({ root, tempDir, dryRun, force, log }) => {
  const gzPath = join(root, CANONICAL_DATASET.gz);
  const shaPath = join(root, CANONICAL_DATASET.sha256);
  const jsonPath = join(root, CANONICAL_DATASET.json);
  if (!(await exists(gzPath)) || !(await exists(shaPath))) return { status: 'absent' };

  const expected = (await readFile(shaPath, 'utf8')).trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new FriendlyError(`${CANONICAL_DATASET.sha256} does not contain a sha256 digest.`);
  }
  if (await exists(jsonPath)) {
    if ((await sha256File(jsonPath)) === expected) return { status: 'already-current', path: jsonPath };
    if (!force) return { status: 'differs', path: jsonPath };
  }
  if (dryRun) return { status: 'would-expand', path: jsonPath };

  log(`Expanding ${CANONICAL_DATASET.gz} → ${CANONICAL_DATASET.json}…`);
  const staged = join(tempDir, 'career.dataset.json');
  await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(staged));
  const actual = await sha256File(staged);
  if (actual !== expected) {
    await rm(staged, { force: true });
    throw new FriendlyError(
      `Expanded ${CANONICAL_DATASET.json} is sha256 ${actual}, but ${CANONICAL_DATASET.sha256} records ${expected}. Not installing it.`
    );
  }
  await moveInto(staged, jsonPath);
  return { status: 'expanded', path: jsonPath, bytes: (await stat(jsonPath)).size };
};

/**
 * Verify and install a data release. Exported with an explicit `root` so the
 * tests can drive a full round trip against a synthetic checkout.
 */
export const restoreData = async ({
  root,
  tarballPath,
  manifestPath,
  force = false,
  dryRun = false,
  expandDataset = true,
  log = console.log
}) => {
  const manifest = await readManifest(manifestPath);

  log(`Verifying ${manifest.tarball?.name ?? 'tarball'} against the manifest…`);
  const actual = await sha256File(tarballPath);
  if (actual !== manifest.tarball?.sha256) {
    throw new FriendlyError(
      `Checksum mismatch — nothing was extracted.\n  expected ${manifest.tarball?.sha256}\n  actual   ${actual}\n` +
        'Re-download the release assets; a truncated or tampered archive is never unpacked.'
    );
  }

  verifyEntries(listTarEntries(tarballPath), manifest);

  // artifacts/ is git-ignored and lives on the same filesystem as the targets,
  // so the final install is a rename rather than a second full copy.
  const tempRoot = join(root, 'artifacts');
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await mkdtemp(join(tempRoot, 'data-restore-'));
  const extractDir = join(tempDir, 'extract');
  await mkdir(extractDir, { recursive: true });

  try {
    execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir, '--no-same-owner'], { stdio: 'inherit' });

    const planned = [];
    for (const file of manifest.files) {
      const staged = join(extractDir, file.path);
      // Belt and braces: prove the extracted path really is under extractDir
      // and really is a regular file (a symlink would fail here, not later).
      const rel = relative(extractDir, staged);
      if (rel.startsWith('..') || rel.startsWith(`..${sep}`) || resolve(extractDir, rel) !== staged) {
        throw new FriendlyError(`Extracted path escaped the staging directory: ${file.path}`);
      }
      const info = await lstat(staged).catch(() => null);
      if (!info) throw new FriendlyError(`The manifest lists ${file.path}, but the tarball did not contain it.`);
      if (!info.isFile()) throw new FriendlyError(`${file.path} is not a regular file in the tarball.`);
      if (info.size !== file.bytes) {
        throw new FriendlyError(`${file.path}: extracted ${info.size} bytes, manifest says ${file.bytes}.`);
      }
      const digest = await sha256File(staged);
      if (digest !== file.sha256) {
        throw new FriendlyError(`${file.path}: sha256 ${digest} does not match the manifest's ${file.sha256}.`);
      }

      const target = join(root, file.path);
      if (await exists(target)) {
        if ((await sha256File(target)) === file.sha256) planned.push({ ...file, staged, target, action: 'skip' });
        else planned.push({ ...file, staged, target, action: force ? 'overwrite' : 'conflict' });
      } else {
        planned.push({ ...file, staged, target, action: 'write' });
      }
    }

    const conflicts = planned.filter((p) => p.action === 'conflict');
    if (conflicts.length > 0) {
      throw new FriendlyError(
        `${conflicts.length} existing file(s) differ from the release and were left untouched:\n  ${conflicts
          .slice(0, 10)
          .map((p) => p.path)
          .join('\n  ')}${conflicts.length > 10 ? `\n  …and ${conflicts.length - 10} more` : ''}\n` +
          'Re-run with --force to replace them.'
      );
    }

    const counts = {
      write: planned.filter((p) => p.action === 'write').length,
      overwrite: planned.filter((p) => p.action === 'overwrite').length,
      skip: planned.filter((p) => p.action === 'skip').length
    };

    if (dryRun) {
      log(`Dry run: ${counts.write} new, ${counts.overwrite} replaced, ${counts.skip} already identical. Nothing written.`);
    } else {
      for (const item of planned) {
        if (item.action === 'skip') continue;
        await moveInto(item.staged, item.target);
      }
      log(`Restored ${counts.write + counts.overwrite} file(s); ${counts.skip} already identical.`);
    }

    const dataset = expandDataset
      ? await expandCanonicalDataset({ root, tempDir, dryRun, force, log })
      : { status: 'not-attempted' };

    return { manifest, counts, dataset, dryRun };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

// -------------------------------------------------------------- summary ---

// Only commands that exist in package.json / docs/engineering/DEVELOPMENT.md.
const nextCommands = (dataset) => {
  const lines = [
    '',
    'Next:',
    '  npm ci --ignore-scripts                     install dependencies',
    '  npm run career:validate                     referential integrity of the canonical dataset',
    '  npm run career:coverage                     source coverage against the raw corpus',
    '  npm run analytics:replay-feeds:validate     replay feed packs against their committed manifest',
    '  npm run build && BRYCECAST_REPLAY=1 npm run serve:app',
    '                                              serve the app with lake-fed replay enabled',
    '',
    'The offline path (npm run demo, npm run test:publication) needs none of this data and still works.'
  ];
  // The full-corpus lanes read the expanded JSON, not the gzip. Say so whenever
  // this run did not leave a verified copy in place.
  if (!['expanded', 'already-current', 'absent'].includes(dataset?.status)) {
    lines.splice(
      2,
      0,
      `  gunzip -c ${CANONICAL_DATASET.gz} > ${CANONICAL_DATASET.json}`,
      `  shasum -a 256 ${CANONICAL_DATASET.json}   # must equal ${CANONICAL_DATASET.sha256}`,
      ''
    );
  }
  return lines.join('\n');
};

// ----------------------------------------------------------------- main ---

const flag = (name, fallback = null) => {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit === undefined) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};

const main = async () => {
  const root = resolve(flag('root', process.cwd()));
  const force = flag('force', false) !== false;
  const dryRun = flag('dry-run', false) !== false;
  const expandDataset = flag('no-expand-dataset', false) === false;
  const log = console.log;

  if ((await exists(join(root, '.private.git'))) && !force) {
    console.log(
      'A private overlay is attached at .private.git — it already provides this data and keeps it current.\n' +
        "Nothing to do. Use `ops/private-overlay.sh pull` to update it, or --force if you really want to restore over it."
    );
    return;
  }

  const local = flag('from', null);
  let tarballPath;
  let manifestPath;
  let downloadDir = null;

  if (local && local !== true) {
    const manifestFlag = flag('manifest', null);
    if (!manifestFlag || manifestFlag === true) {
      throw new FriendlyError('--from also needs --manifest=<path to the release .manifest.json>.');
    }
    tarballPath = resolve(root, local);
    manifestPath = resolve(root, manifestFlag);
    for (const path of [tarballPath, manifestPath]) {
      if (!(await exists(path))) throw new FriendlyError(`No such file: ${path}`);
    }
  } else {
    const repo = flag('repo', DEFAULT_REPO);
    const tagFlag = flag('tag', null);
    const release = await resolveRelease({ repo, tag: tagFlag === true ? null : tagFlag, log });
    log(`Release ${release.tag_name}${release.name && release.name !== release.tag_name ? ` — ${release.name}` : ''}`);
    await mkdir(join(root, 'artifacts'), { recursive: true });
    downloadDir = await mkdtemp(join(root, 'artifacts', 'data-download-'));
    const tarAsset = pickAsset(release, '.tar.gz');
    const manifestAsset = pickAsset(release, '.manifest.json');
    tarballPath = await downloadAsset(tarAsset, join(downloadDir, tarAsset.name), log);
    manifestPath = await downloadAsset(manifestAsset, join(downloadDir, manifestAsset.name), log);
  }

  try {
    const result = await restoreData({ root, tarballPath, manifestPath, force, dryRun, expandDataset, log });
    const { manifest, dataset } = result;
    log(
      `\n${manifest.totals.files} files · ${(manifest.totals.bytes / 1e9).toFixed(2)} GB uncompressed · ` +
        `packed ${manifest.createdAt?.slice(0, 10) ?? 'unknown'} from public ${manifest.publicCommit?.slice(0, 7) ?? 'unknown'}`
    );
    if (dataset?.status === 'expanded') log(`Canonical dataset expanded and verified: ${CANONICAL_DATASET.json}`);
    if (dataset?.status === 'already-current') log(`Canonical dataset already matches its recorded sha256.`);
    if (dataset?.status === 'would-expand') log(`Dry run: ${CANONICAL_DATASET.json} would be expanded and verified.`);
    if (dataset?.status === 'differs') {
      log(`${CANONICAL_DATASET.json} exists and does not match the recorded sha256; left untouched (use --force).`);
    }
    if (!dryRun) log(nextCommands(dataset));
  } finally {
    if (downloadDir) await rm(downloadDir, { recursive: true, force: true });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof FriendlyError ? `\n${error.message}` : `\ndata:restore failed — ${error.stack ?? error.message}`);
    process.exitCode = 1;
  }
}
