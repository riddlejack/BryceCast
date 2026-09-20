#!/usr/bin/env node
// Exercises the data-release pack/restore pair against a synthetic checkout in a
// temporary directory. It never touches the real corpus, needs no overlay and no
// network: the fixture is a handful of invented files under the real release
// pathspecs, tracked by a throwaway git repository standing in for .private.git.
//
// What it proves: a pack→restore round trip reinstalls byte-identical files and
// is idempotent; a corrupted tarball is rejected before anything is extracted; a
// tar entry that escapes the checkout or lands outside the declared pathspecs is
// refused; an existing file that differs is never overwritten without --force;
// and packing without an overlay fails clearly instead of producing an empty
// release.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { packData } from './data-pack.mjs';
import { restoreData } from './data-restore.mjs';
import { CANONICAL_DATASET } from './lib/data-release-paths.mjs';

const quiet = () => {};
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const temp = (label) => mkdtemp(join(tmpdir(), `brycecast-data-release-${label}-`));

const present = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const DATASET_JSON = `${JSON.stringify({ synthetic: true, drivers: [{ id: 'driver_test' }] })}\n`;

// Invented content under the real release pathspecs. No real corpus file, no
// real session id, nothing derived from a third-party source.
const FIXTURE = {
  'data/career/raw/synthetic/results-001.json': '{"syntheticResults":[1,2,3]}\n',
  'data/career/raw/synthetic/nested/results-002.json': '{"syntheticResults":[4,5,6]}\n',
  'data/career/career.dataset.json.sha256': `${sha256(Buffer.from(DATASET_JSON))}\n`,
  'analysis/replay-feeds/output/feeds/synthetic_session.ndjson.gz': gzipSync(Buffer.from('{"synthetic":"feed"}\n')),
  'analysis/track-position/output/races/synthetic.passes.ndjson.gz': gzipSync(Buffer.from('{"synthetic":"passes"}\n')),
  [CANONICAL_DATASET.gz]: gzipSync(Buffer.from(DATASET_JSON))
};

const write = async (root, path, content) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
};

// A throwaway repo whose git dir is <root>/.private.git and whose work tree is
// <root> — the same "two git dirs, one set of files" topology the real overlay
// uses, so `ls-files` behaves exactly as it does in production.
const makeFixtureRoot = async () => {
  const root = await temp('src');
  for (const [path, content] of Object.entries(FIXTURE)) await write(root, path, content);
  const git = (...args) =>
    execFileSync('git', [`--git-dir=${join(root, '.private.git')}`, `--work-tree=${root}`, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
    });
  git('init', '--quiet');
  git('add', '--', ...Object.keys(FIXTURE));
  git('-c', 'user.email=test@example.invalid', '-c', 'user.name=Test', 'commit', '--quiet', '-m', 'fixture');
  return root;
};

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('pack enumerates from the private index and restore round-trips byte-identically', async () => {
  const root = await makeFixtureRoot();
  const target = await temp('dst');
  const fresh = await temp('dry');
  try {
    // A stray untracked file next to the real data must never be swept in.
    await write(root, 'data/career/raw/synthetic/UNTRACKED.json', '{"strays":"must not ship"}\n');

    const { manifest, tarballPath, manifestPath } = await packData({
      root,
      outDir: join(root, 'artifacts/data-release'),
      date: '2000-01-01',
      log: quiet
    });

    assert.equal(manifest.schemaVersion, 'brycecast-data-release.v1');
    assert.equal(manifest.totals.files, Object.keys(FIXTURE).length, 'fixture file count');
    assert.ok(!manifest.files.some((f) => f.path.endsWith('UNTRACKED.json')), 'an untracked stray was packed');
    assert.ok(manifest.privateCommit, 'private commit not recorded');
    assert.equal(manifest.tarball.sha256, sha256(await readFile(tarballPath)), 'tarball digest recorded incorrectly');
    assert.deepEqual([...manifest.files].map((f) => f.path).sort(), manifest.files.map((f) => f.path), 'manifest not sorted');

    const result = await restoreData({ root: target, tarballPath, manifestPath, log: quiet });
    assert.equal(result.counts.write, manifest.totals.files);
    assert.equal(result.counts.skip, 0);
    for (const file of manifest.files) {
      assert.equal(sha256(await readFile(join(target, file.path))), file.sha256, `${file.path} did not round-trip`);
    }

    // The canonical dataset ships gzipped (the raw JSON is past GitHub's 100 MB
    // block); restore expands it through the recorded sha256 of the plain file.
    assert.equal(result.dataset.status, 'expanded');
    assert.equal(await readFile(join(target, CANONICAL_DATASET.json), 'utf8'), DATASET_JSON);

    // A second restore is a no-op: identical files are skipped silently.
    const again = await restoreData({ root: target, tarballPath, manifestPath, log: quiet });
    assert.equal(again.counts.skip, manifest.totals.files);
    assert.equal(again.counts.write + again.counts.overwrite, 0);
    assert.equal(again.dataset.status, 'already-current');

    // --dry-run reports without writing.
    const dry = await restoreData({ root: fresh, tarballPath, manifestPath, dryRun: true, log: quiet });
    assert.equal(dry.counts.write, manifest.totals.files);
    assert.equal(dry.dataset.status, 'absent', 'dry run materialized the gzip it claims not to have written');
    assert.ok(!(await present(join(fresh, manifest.files[0].path))), 'a dry run wrote a file');
  } finally {
    for (const dir of [root, target, fresh]) await rm(dir, { recursive: true, force: true });
  }
});

test('a tarball whose sha256 does not match the manifest is rejected before extraction', async () => {
  const root = await makeFixtureRoot();
  const target = await temp('bad');
  try {
    const { manifestPath, tarballPath } = await packData({
      root,
      outDir: join(root, 'artifacts/data-release'),
      date: '2000-01-01',
      log: quiet
    });
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.tarball.sha256 = 'f'.repeat(64);
    await writeFile(manifestPath, JSON.stringify(manifest));

    await assert.rejects(
      restoreData({ root: target, tarballPath, manifestPath, log: quiet }),
      /Checksum mismatch/,
      'a mismatched tarball was accepted'
    );
    assert.ok(!(await present(join(target, manifest.files[0].path))), 'a rejected tarball still wrote files');
  } finally {
    for (const dir of [root, target]) await rm(dir, { recursive: true, force: true });
  }
});

test('tar entries that escape the checkout or leave the declared pathspecs are refused', async () => {
  const stage = await temp('hostile');
  const target = await temp('hostile-dst');
  try {
    const good = 'data/career/raw/synthetic/results-001.json';
    const goodBody = FIXTURE[good];
    const inner = join(stage, 'inner');
    await write(inner, good, goodBody);
    await write(stage, 'escape.json', '{"payload":"traversal"}\n');
    await write(stage, 'etc/authorized_keys', 'ssh-rsa SYNTHETIC-NOT-A-REAL-KEY\n');

    // -P stops tar from sanitizing the hostile member names for us; the point is
    // that data-restore refuses them on its own, whatever tar would have done.
    const hostile = [
      ['traversal', ['-czPf', '@', '-C', inner, '--no-recursion', good, '../escape.json'], /parent-directory segment/],
      ['absolute', ['-czPf', '@', '-C', inner, '--no-recursion', good, join(stage, 'etc/authorized_keys')], /absolute path/],
      ['undeclared', ['-czPf', '@', '-C', stage, '--no-recursion', 'escape.json'], /outside the declared data pathspecs/]
    ];

    for (const [label, args, expected] of hostile) {
      const tarballPath = join(stage, `${label}.tar.gz`);
      execFileSync('tar', args.map((a) => (a === '@' ? tarballPath : a)));
      const manifestPath = `${tarballPath}.manifest.json`;
      await writeFile(
        manifestPath,
        JSON.stringify({
          schemaVersion: 'brycecast-data-release.v1',
          tarball: { name: `${label}.tar.gz`, sha256: sha256(await readFile(tarballPath)) },
          totals: { files: 1, bytes: goodBody.length },
          files: [{ path: good, bytes: goodBody.length, sha256: sha256(Buffer.from(goodBody)) }]
        })
      );
      await assert.rejects(
        restoreData({ root: target, tarballPath, manifestPath, log: quiet }),
        expected,
        `a tarball with a ${label} entry was accepted`
      );
    }
    assert.ok(!(await present(join(target, 'escape.json'))), 'a hostile tarball wrote outside the pathspecs');
    assert.ok(!(await present(join(target, good))), 'a hostile tarball installed its decoy payload');
  } finally {
    for (const dir of [stage, target]) await rm(dir, { recursive: true, force: true });
  }
});

test('an existing file that differs is never overwritten without --force', async () => {
  const root = await makeFixtureRoot();
  const target = await temp('clash');
  try {
    const { manifest, tarballPath, manifestPath } = await packData({
      root,
      outDir: join(root, 'artifacts/data-release'),
      date: '2000-01-01',
      log: quiet
    });
    const clash = manifest.files.find((f) => f.path.endsWith('results-001.json'));
    const sibling = manifest.files.find((f) => f.path.endsWith('results-002.json'));
    const local = '{"local":"edit that must survive"}\n';
    await write(target, clash.path, local);

    await assert.rejects(
      restoreData({ root: target, tarballPath, manifestPath, log: quiet }),
      /Re-run with --force/,
      'a differing file was overwritten without --force'
    );
    assert.equal(await readFile(join(target, clash.path), 'utf8'), local, 'the local edit was clobbered');
    // The refusal is all-or-nothing: no sibling file was installed either.
    assert.ok(!(await present(join(target, sibling.path))), 'a conflicting restore installed part of the release');

    const forced = await restoreData({ root: target, tarballPath, manifestPath, force: true, log: quiet });
    assert.equal(forced.counts.overwrite, 1);
    assert.equal(forced.counts.write, manifest.totals.files - 1);
    assert.equal(sha256(await readFile(join(target, clash.path))), clash.sha256, '--force did not replace the file');
  } finally {
    for (const dir of [root, target]) await rm(dir, { recursive: true, force: true });
  }
});

test('data:pack fails clearly when no private overlay is attached', async () => {
  const root = await temp('nooverlay');
  try {
    await assert.rejects(
      packData({ root, outDir: join(root, 'out'), log: quiet }),
      /No private overlay found/,
      'packing without an overlay did not fail clearly'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

let failed = 0;
for (const { name, fn } of cases) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}
if (failed > 0) {
  console.error(`FAIL: ${failed}/${cases.length} data-release checks failed`);
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${cases.length} data-release checks — index-driven pack, byte-identical round trip, idempotent re-restore, checksum rejection, path-traversal rejection, overwrite protection`
  );
}
