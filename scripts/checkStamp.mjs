// Records that `npm run check` passed on an exact, clean commit, so deploy.sh can refuse
// to ship anything else. The stamp lives inside .git (never tracked, per worktree).
//   node scripts/checkStamp.mjs write    after a successful check (skipped if the tree is dirty)
//   node scripts/checkStamp.mjs verify   exit 1 unless the stamp matches HEAD
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const stampFile = git('rev-parse', '--git-path', 'ssb-check-stamp');
const head = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no') !== '';

if (process.argv[2] === 'write') {
  if (dirty) {
    console.log(
      'Check passed, but tracked files have uncommitted changes: no deploy stamp written.',
    );
  } else {
    writeFileSync(stampFile, `${head}\n`);
    console.log(`Deploy stamp written for ${head.slice(0, 12)}.`);
  }
} else if (process.argv[2] === 'verify') {
  const stamped = existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : '';
  if (dirty || stamped !== head) {
    console.error(
      dirty
        ? 'Refusing: tracked files have uncommitted changes.'
        : `Refusing: npm run check has not passed on ${head.slice(0, 12)} (stamp: ${stamped.slice(0, 12) || 'none'}).`,
    );
    process.exitCode = 1;
  }
} else {
  console.error('Usage: node scripts/checkStamp.mjs write|verify');
  process.exitCode = 2;
}
