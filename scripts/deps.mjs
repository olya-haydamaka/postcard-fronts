// Whether node_modules was installed from the dependencies in package-lock.json, for the run-local scripts.
// Every commit's version bump rewrites the lockfile without changing a dependency, so the lockfile's own version is
// left out: comparing file dates reinstalled everything after each commit.
//   node scripts/deps.mjs check   exit 0 when node_modules matches the lockfile, 1 when it needs `npm ci`
//   node scripts/deps.mjs stamp   record the match, after `npm ci`
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const STAMP = 'node_modules/.run-local-deps';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
delete lock.version;
delete lock.packages?.['']?.version;
const digest = createHash('sha256').update(JSON.stringify(lock)).digest('hex');

if (process.argv[2] === 'stamp') {
  writeFileSync(STAMP, `${digest}\n`);
} else {
  const installed = existsSync('node_modules/.package-lock.json') && existsSync(STAMP);
  process.exit(installed && readFileSync(STAMP, 'utf8').trim() === digest ? 0 : 1);
}
