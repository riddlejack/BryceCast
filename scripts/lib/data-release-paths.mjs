// The public contract for what a BryceCast data release contains.
//
// This list mirrors `ops/private-overlay.manifest` MINUS the deployment tooling
// (`ops` and `scripts/deploy-to-mini.mjs`), which names real hosts, users and
// absolute paths and is never published. It is hardcoded here, in a PUBLIC
// tracked file, on purpose: `scripts/data-restore.mjs` runs on a plain clone
// that has no `ops/` at all, and the set of paths a downloaded tarball is
// allowed to write must be readable and reviewable without the private repo.
//
// Keep it in sync by hand when the overlay manifest changes. The packer proves
// the two agree in one direction — it enumerates from the private index using
// exactly these pathspecs, so a path added to the overlay and not added here is
// simply not shipped, which is the safe failure.
//
// Pathspec semantics match the subset of git pathspecs actually used below:
//   - a literal file path       → that one file
//   - a directory path          → that file and everything beneath it
//   - a trailing `*` glob       → `*` matches within one path segment only
export const DATA_RELEASE_PATHSPECS = Object.freeze([
  'data/career/raw',
  'data/career/career.dataset.json.gz',
  'data/career/career.dataset.json.sha256',
  'analysis/replay-feeds/output/feeds',
  'analysis/semantic-layer/output/sessions',
  'analysis/semantic-layer/output/sessions-2026',
  'analysis/semantic-layer/output/timing-observations',
  'analysis/semantic-layer/output/live-captures/*.ndjson.gz',
  'analysis/semantic-layer/output/nashville/*.ndjson.gz',
  'analysis/track-position/output/races'
]);

// The canonical dataset ships gzipped: the raw JSON is ~364 MB, past GitHub's
// 100 MB hard block. `.sha256` is the digest of the UNCOMPRESSED file, so an
// expansion can be proven before it is installed.
export const CANONICAL_DATASET = Object.freeze({
  gz: 'data/career/career.dataset.json.gz',
  sha256: 'data/career/career.dataset.json.sha256',
  json: 'data/career/career.dataset.json'
});

const basename = (path) => path.slice(path.lastIndexOf('/') + 1);

// Nothing matching these may enter a release, whatever the pathspecs say. This
// is a second, independent gate: credentials, keys and operational databases
// are excluded by pattern even if a pathspec is ever widened by mistake.
const FORBIDDEN = Object.freeze([
  { label: 'dotenv file', test: (p) => basename(p).startsWith('.env') },
  { label: 'PEM certificate/key', test: (p) => p.endsWith('.pem') },
  { label: 'private key', test: (p) => p.endsWith('.key') },
  { label: 'PKCS#12 bundle', test: (p) => p.endsWith('.p12') || p.endsWith('.pfx') },
  { label: 'SQLite database', test: (p) => basename(p).includes('.sqlite') },
  { label: 'database file', test: (p) => p.endsWith('.db') },
  { label: 'deployment tooling', test: (p) => p === 'ops' || p.startsWith('ops/') },
  { label: 'deployment tooling', test: (p) => p === 'scripts/deploy-to-mini.mjs' }
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const matchers = DATA_RELEASE_PATHSPECS.map((spec) => {
  if (!spec.includes('*')) {
    return { spec, matches: (path) => path === spec || path.startsWith(`${spec}/`) };
  }
  const pattern = new RegExp(`^${spec.split('*').map(escapeRegExp).join('[^/]*')}$`);
  return { spec, matches: (path) => pattern.test(path) };
});

/** The pathspec a release path belongs to, or null when it belongs to none. */
export const matchingPathspec = (path) => matchers.find((m) => m.matches(path))?.spec ?? null;

export const isReleasePath = (path) => matchingPathspec(path) !== null;

/** A human-readable reason this path may never ship, or null when it may. */
export const forbiddenReason = (path) => FORBIDDEN.find((rule) => rule.test(path))?.label ?? null;

// A tar entry name may not escape the extraction root, and may not be absolute.
// Checked before extraction, not after: `tar` implementations differ in how
// loudly they sanitize, and a silently sanitized entry is still a red flag.
export const unsafeEntryReason = (entry) => {
  if (entry === '') return 'empty entry name';
  if (entry.startsWith('/') || /^[A-Za-z]:[\\/]/.test(entry)) return 'absolute path';
  if (entry.includes('\\')) return 'backslash in path';
  if (entry.split('/').includes('..')) return 'parent-directory segment';
  if (entry.startsWith('./') || entry.startsWith('~')) return 'non-canonical prefix';
  return null;
};
