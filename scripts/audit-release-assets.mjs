// Read-only public release comparison; no environment files or credentials read.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const revision = execFileSync('git', ['rev-parse', '54d1122'], { shell: false })
  .toString()
  .trim();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const report = {
  checkedAt: new Date().toISOString(),
  operatorReportedVpsRevision: revision,
  assets: [],
};
for (const name of ['analytics.js', 'app.js', 'downloader.js']) {
  const filename = 'public/assets/js/' + name;
  const response = await fetch('https://tiksavemp4.online/assets/js/' + name, {
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Public asset unavailable');
  const live = Buffer.from(await response.arrayBuffer());
  const committed = execFileSync('git', ['show', revision + ':' + filename], {
    shell: false,
    maxBuffer: 2097152,
  });
  const local = await readFile(filename);
  report.assets.push({
    name,
    status: response.status,
    liveSha256: sha256(live),
    committedSha256: sha256(committed),
    localSha256: sha256(local),
    matchesReportedVpsCommit: live.equals(committed),
    matchesLocal: live.equals(local),
    cacheControl: response.headers.get('cache-control'),
    cacheAge: response.headers.get('age'),
  });
}
await writeFile(
  'docs/production-blockers/asset-revisions.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
