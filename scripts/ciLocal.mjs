// Local pipeline: runs what GitHub CI runs, in the same order (except the Docker job), so
// "green locally" means the same as "green in CI".
//   npm run ci:local                 everything
//   SSB_CI_SKIP_AUDIT=1 npm run ...  skip the steps that need the network (npm/cargo audit)
import { spawnSync } from 'node:child_process';

const skipAudit = process.env.SSB_CI_SKIP_AUDIT === '1';

const steps = [
  ['lint', 'npm run lint'],
  ['format', 'npm run format:check'],
  ['privacy scan', 'npm run privacy:scan'],
  ['unit + coverage', 'npm run test:coverage'],
  ['git privacy guards', 'npm run test:git-privacy'],
  ['contract', 'npm run test:contract'],
  ['build', 'npm run build'],
  ['bundle budget', 'npm run check:bundle'],
  ['e2e (Chromium + WebKit)', 'npm run test:e2e'],
  ...(skipAudit
    ? []
    : [
        ['audit (root)', 'npm audit --omit=dev --audit-level=high'],
        ['audit (backend)', 'npm audit --omit=dev --audit-level=high --prefix backend'],
      ]),
];

const results = [];
for (const [name, command] of steps) {
  const started = Date.now();
  console.log(`\n▶ ${name}: ${command}`);
  const run = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, TZ: 'UTC' },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  results.push([name, run.status === 0, seconds]);
  if (run.status !== 0) break;
}

console.log('\nci:local summary');
for (const [name, ok, seconds] of results) console.log(`  ${ok ? '✓' : '✗'} ${name} (${seconds}s)`);
const skipped = steps.length - results.length;
if (skipped) console.log(`  … ${skipped} later step(s) not run`);
if (skipAudit) console.log('  (audit skipped: SSB_CI_SKIP_AUDIT=1)');
const passed = results.every(([, ok]) => ok) && !skipped;
// ci:local is a superset of check, so it may also stamp the commit for deploy.sh.
if (passed) spawnSync('node scripts/checkStamp.mjs write', { shell: true, stdio: 'inherit' });
process.exitCode = passed ? 0 : 1;
