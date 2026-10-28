// Read-only verification of the reviewed release tree or the operator's staged index.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';

const indexed = process.argv.includes('--index');
if (process.argv.slice(2).some((arg) => arg !== '--index'))
  throw Error('Usage: node scripts/verify-release.mjs [--index]');
const git = (...args) =>
  execFileSync('git', args, {
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const list = (bytes) => bytes.toString('utf8').split('\0').filter(Boolean).sort();
const get = (name) => (indexed ? git('show', ':' + name) : readFileSync(name));
const inventoryPath = 'docs/release/inventory.json';
const manifestPath = 'docs/release/files.txt';
const inventory = JSON.parse(get(inventoryPath).toString('utf8'));
const manifest = get(manifestPath).toString('utf8').trim().split(/\r?\n/).sort();
const expected = inventory.files.map((file) => file.path).sort();
if (JSON.stringify(manifest) !== JSON.stringify(expected))
  throw Error('Release manifest and inventory disagree.');
for (const [name, deleted] of [
  ['docs/release/stage-files.txt', false],
  ['docs/release/deletions.txt', true],
]) {
  const paths = get(name).toString('utf8').trim().split(/\r?\n/).filter(Boolean).sort();
  const selected = inventory.files
    .filter((file) => (file.status === 'D') === deleted)
    .map((file) => file.path)
    .sort();
  if (JSON.stringify(paths) !== JSON.stringify(selected))
    throw Error('Release staging/deletion manifest disagrees: ' + name);
}
if (git('remote', 'get-url', 'origin').toString().trim() !== inventory.origin)
  throw Error('Unexpected release repository.');
const actual = indexed
  ? list(git('diff', '--cached', '--name-only', '-z', inventory.baseline))
  : [
      ...new Set([
        ...list(git('diff', '--name-only', '-z', inventory.baseline)),
        ...list(git('ls-files', '--others', '--exclude-standard', '-z')),
      ]),
    ].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw Error('Release paths changed. Re-review the inventory before staging.');
const forbidden = (name) =>
  /(^|\/)(?:node_modules|dist|\.data|test-results|playwright-report|blob-report|coverage|\.cache|backups|\.backups)(\/|$)/i.test(
    name,
  ) ||
  (/(^|\/)(?:\.env(?:\..*)?|[^/]+\.env)$/i.test(name) && name !== '.env.example') ||
  /\.(?:db|sqlite3?|key|pem|pfx|p12|mp4|mp3|zip|webm|log|tmp|bak|pid)(?:-(?:wal|shm))?$/i.test(
    name,
  ) ||
  /(?:^|\/)playwright\/(?:\.auth|\.cache)(?:\/|$)/i.test(name) ||
  (/^config\/monetag\//.test(name) &&
    !/^config\/monetag\/(?:in-page-push|vignette-banner)\.example\.json$/.test(name)) ||
  /^docs\/(?:screenshots\/browser-|screenshots\/advertising\/|blocker-fixes\/|cleanup\/|final-audit\/|production-blockers\/)/.test(
    name,
  );
const normalize = (bytes) =>
  bytes.includes(0) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
for (const file of inventory.files) {
  if (file.status === 'D') {
    // Confirmed generated evidence may be removed from the old baseline, but
    // must never be added back as release content.
    const generatedEvidence = /^docs\/screenshots\/(?:browser-[^/]+|advertising)\//.test(
      file.path,
    );
    if (forbidden(file.path) && !generatedEvidence)
      throw Error('Forbidden release deletion: ' + file.path);
    if (!indexed && existsSync(file.path))
      throw Error('Expected deletion still exists: ' + file.path);
    if (indexed && git('ls-files', '-z', '--', file.path).length)
      throw Error('Expected deletion missing: ' + file.path);
    continue;
  }
  if (forbidden(file.path)) throw Error('Forbidden release path: ' + file.path);
  if (!indexed && !lstatSync(file.path).isFile())
    throw Error('Release entries must be regular files: ' + file.path);
  const bytes = get(file.path);
  if (
    file.sha256 &&
    createHash('sha256').update(normalize(bytes)).digest('hex') !== file.sha256
  )
    throw Error('Reviewed content changed: ' + file.path);
}
// Scan the whole prospective tree, including unchanged baseline files, for unsafe
// paths and high-confidence credential material. Never print matching values.
const tree = indexed
  ? list(git('ls-files', '-z'))
  : list(git('ls-tree', '-r', '--name-only', '-z', inventory.baseline));
for (const name of new Set([...tree, ...expected])) {
  if (inventory.files.some((file) => file.path === name && file.status === 'D')) continue;
  if (forbidden(name)) throw Error('Unsafe file in release tree: ' + name);
  const bytes = get(name);
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /"private_key"\s*:\s*"-----BEGIN/.test(text) ||
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/.test(
      text,
    )
  )
    throw Error('Credential material requires review: ' + name);
}
const example = get('.env.example').toString('utf8');
for (const flag of [
  'ADVERTISING_ENABLED',
  'MONETAG_IPP_ENABLED',
  'MONETAG_VIGNETTE_ENABLED',
  'MONETAG_MOBILE_ENABLED',
])
  if (!new RegExp('^' + flag + '=false\\r?$', 'm').test(example))
    throw Error('Advertising must remain disabled: ' + flag);
for (const format of ['in-page-push', 'vignette-banner']) {
  const value = JSON.parse(
    get('config/monetag/' + format + '.example.json').toString('utf8'),
  );
  if (
    value.reviewed !== false ||
    value.tag.src !== '' ||
    Object.values(value.csp).some((origins) => origins.length)
  )
    throw Error('Publisher configuration must not ship in examples.');
}
console.log(
  JSON.stringify({
    passed: true,
    scope: indexed ? 'staged index' : 'working candidate',
    baseline: inventory.baseline,
    reviewedPaths: expected.length,
    realIndexModified: false,
  }),
);
