import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const zeroOid = '0000000000000000000000000000000000000000';
let fixture;
let earlierPersonal;
let personalTip;
let publicFeature;
let cleanedTip;

function git(...args) {
  return execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
}

function write(relativePath, content) {
  const target = path.join(fixture, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function commit(message) {
  git('add', '-A');
  git('commit', '-m', message, '--quiet');
  return git('rev-parse', 'HEAD');
}

function runHook(lines) {
  return spawnSync(path.join(fixture, 'scripts/pre-push'), ['origin', 'synthetic://no-network'], {
    cwd: fixture,
    encoding: 'utf8',
    input: `${lines.join('\n')}\n`,
  });
}

function containsPrivateHistory(commitOid) {
  return spawnSync(
    'sh',
    [
      '-c',
      '. "$1"; ssb_commit_contains_private_history "$2" origin',
      'sh',
      path.join(fixture, 'scripts/git-privacy-guards.sh'),
      commitOid,
    ],
    {
      cwd: fixture,
      encoding: 'utf8',
    },
  );
}

beforeAll(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-git-privacy-'));
  fs.mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  for (const file of [
    'git-privacy-guards.sh',
    'install-git-hooks.sh',
    'pre-push',
    'pre-commit',
    'privacy-scan.sh',
  ]) {
    fs.copyFileSync(path.join(repoRoot, 'scripts', file), path.join(fixture, 'scripts', file));
  }
  fs.chmodSync(path.join(fixture, 'scripts/install-git-hooks.sh'), 0o755);
  fs.chmodSync(path.join(fixture, 'scripts/pre-push'), 0o755);
  fs.chmodSync(path.join(fixture, 'scripts/pre-commit'), 0o755);
  fs.chmodSync(path.join(fixture, 'scripts/privacy-scan.sh'), 0o755);

  git('init', '-b', 'main', '--quiet');
  git('config', 'user.name', 'Synthetic Test');
  git('config', 'user.email', 'synthetic@example.invalid');
  write('public.txt', 'public baseline\n');
  commit('public baseline');

  git('checkout', '-b', 'personal', '--quiet');
  write('personal-feature.txt', 'local-only feature one\n');
  earlierPersonal = commit('personal one');
  write('personal-feature.txt', 'local-only feature two\n');
  personalTip = commit('personal two');
  git('update-ref', 'refs/ssb/private/history/initial', personalTip);
  git('branch', '-m', 'private-renamed');

  git('checkout', 'main', '--quiet');
  git('checkout', '-b', 'public-feature', '--quiet');
  write('public-feature.txt', 'safe public feature\n');
  publicFeature = commit('public feature');
});

describe('Git privacy guards', () => {
  it('recognizes earlier personal-only history after the branch is renamed', () => {
    expect(containsPrivateHistory(earlierPersonal).status).toBe(0);
    const result = runHook([`refs/heads/alias ${earlierPersonal} refs/heads/alias ${zeroOid}`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/local-only personal history/i);
  });

  it('allows a normal public feature branch', () => {
    const result = runHook([
      `refs/heads/public-feature ${publicFeature} refs/heads/public-feature ${zeroOid}`,
    ]);
    expect(result.status).toBe(0);
  });

  it('rejects personal history even if local main becomes contaminated', () => {
    git('update-ref', 'refs/ssb/public/main', git('rev-parse', 'main'));
    git('update-ref', 'refs/heads/main', personalTip);

    const result = runHook([`refs/heads/main ${personalTip} refs/heads/main ${zeroOid}`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/local-only personal history/i);

    git('update-ref', 'refs/heads/main', git('rev-parse', 'refs/ssb/public/main'));
  });

  it('rejects private-only paths that were deleted before the pushed tip', () => {
    write('private-data/synthetic.txt', 'synthetic private record\n');
    commit('add synthetic private path');
    fs.unlinkSync(path.join(fixture, 'private-data/synthetic.txt'));
    cleanedTip = commit('delete synthetic private path');

    const result = runHook([
      `refs/heads/public-feature ${cleanedTip} refs/heads/public-feature ${zeroOid}`,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/outgoing history contains a private-only path/i);
  });

  it('rejects annotated commit tags with unsafe outgoing history', () => {
    git('tag', '-a', 'unsafe-release', cleanedTip, '-m', 'unsafe release');
    const tagOid = git('rev-parse', 'refs/tags/unsafe-release');
    const result = runHook([
      `refs/tags/unsafe-release ${tagOid} refs/tags/unsafe-release ${zeroOid}`,
    ]);
    expect(result.status).toBe(1);
  });

  it('rejects non-commit tag objects and permits cleanup deletions', () => {
    const blobOid = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: fixture,
      encoding: 'utf8',
      input: 'synthetic blob',
    }).trim();
    git('tag', '-a', 'blob-tag', blobOid, '-m', 'blob tag');
    const tagOid = git('rev-parse', 'refs/tags/blob-tag');
    const tagResult = runHook([`refs/tags/blob-tag ${tagOid} refs/tags/blob-tag ${zeroOid}`]);
    expect(tagResult.status).toBe(1);
    expect(tagResult.stderr).toMatch(/non-commit object/i);

    const deleteResult = runHook([`(delete) ${zeroOid} refs/heads/personal ${personalTip}`]);
    expect(deleteResult.status).toBe(0);
  });

  it('recognizes SHA-256-style deletion object IDs', () => {
    const sha256ZeroOid = '0'.repeat(64);
    const deleteResult = runHook([`(delete) ${sha256ZeroOid} refs/heads/personal ${personalTip}`]);
    expect(deleteResult.status).toBe(0);
  });

  it('pre-commit hook blocks staged private-looking files and allows normal ones', () => {
    const preCommit = () =>
      spawnSync(path.join(fixture, 'scripts/pre-commit'), [], { cwd: fixture, encoding: 'utf8' });
    fs.mkdirSync(path.join(fixture, 'exports'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'exports/synthetic.json'), '{}\n');
    git('add', '-f', 'exports/synthetic.json');
    const blocked = preCommit();
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toMatch(/private finance data/);
    git('rm', '--cached', '--quiet', 'exports/synthetic.json');
    fs.rmSync(path.join(fixture, 'exports'), { recursive: true, force: true });

    fs.writeFileSync(path.join(fixture, 'notes.txt'), 'synthetic public note\n');
    git('add', 'notes.txt');
    expect(preCommit().status).toBe(0);
    git('rm', '--cached', '--quiet', 'notes.txt');
    fs.rmSync(path.join(fixture, 'notes.txt'));
  });

  it('refuses first-install trust when private history exists without a public baseline', () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-first-install-'));
    fs.mkdirSync(path.join(isolated, 'scripts'), { recursive: true });
    for (const file of ['git-privacy-guards.sh', 'install-git-hooks.sh', 'pre-push']) {
      fs.copyFileSync(path.join(repoRoot, 'scripts', file), path.join(isolated, 'scripts', file));
    }
    fs.chmodSync(path.join(isolated, 'scripts/install-git-hooks.sh'), 0o755);

    const isolatedGit = (...args) =>
      execFileSync('git', args, { cwd: isolated, encoding: 'utf8' }).trim();
    isolatedGit('init', '-b', 'main', '--quiet');
    isolatedGit('config', 'user.name', 'Synthetic Test');
    isolatedGit('config', 'user.email', 'synthetic@example.invalid');
    fs.writeFileSync(path.join(isolated, 'public.txt'), 'public baseline\n');
    isolatedGit('add', 'public.txt');
    isolatedGit('commit', '-m', 'public baseline', '--quiet');
    isolatedGit('checkout', '-b', 'personal', '--quiet');
    fs.writeFileSync(path.join(isolated, 'personal.txt'), 'local-only\n');
    isolatedGit('add', 'personal.txt');
    isolatedGit('commit', '-m', 'personal', '--quiet');
    const isolatedPersonal = isolatedGit('rev-parse', 'HEAD');
    isolatedGit('update-ref', 'refs/heads/main', isolatedPersonal);

    const result = spawnSync(path.join(isolated, 'scripts/install-git-hooks.sh'), [], {
      cwd: isolated,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/refusing to guess a public baseline/i);
  });
});

describe('AI attribution policy', () => {
  let repo;
  const repoGit = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const runCommitMsg = (message) => {
    const file = path.join(repo, 'COMMIT_MSG_TEST');
    fs.writeFileSync(file, message);
    return spawnSync(path.join(repo, 'scripts/commit-msg'), [file], {
      cwd: repo,
      encoding: 'utf8',
    });
  };
  const runPush = (lines, env = {}) =>
    spawnSync(path.join(repo, 'scripts/pre-push'), ['origin', 'synthetic://no-network'], {
      cwd: repo,
      encoding: 'utf8',
      input: `${lines.join('\n')}\n`,
      env: { ...process.env, ...env },
    });
  const commitIn = (message) => {
    fs.writeFileSync(path.join(repo, 'f.txt'), `${message}\n${Math.random()}\n`);
    repoGit('add', '-A');
    repoGit('commit', '-m', message, '--quiet', '--no-verify');
    return repoGit('rev-parse', 'HEAD');
  };

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ssb-ai-attribution-'));
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    for (const file of ['git-privacy-guards.sh', 'pre-push', 'commit-msg', 'privacy-scan.sh']) {
      fs.copyFileSync(path.join(repoRoot, 'scripts', file), path.join(repo, 'scripts', file));
      fs.chmodSync(path.join(repo, 'scripts', file), 0o755);
    }
    repoGit('init', '-b', 'main', '--quiet');
    repoGit('config', 'user.name', 'Synthetic Test');
    repoGit('config', 'user.email', 'synthetic@example.invalid');
    commitIn('baseline');
  });

  const rejected = [
    'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
    'co-authored-by: Someone <bot@anthropic.com>',
    'Co-authored-by: GitHub Copilot <copilot@github.com>',
    'Co-Authored-By: ChatGPT <chatgpt@openai.com>',
    'Co-Authored-By: Codex <codex@openai.com>',
    'Co-Authored-By: Gemini <gemini@google.com>',
    '\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)',
    'Generated with Claude Code',
  ];

  it.each(rejected)('commit-msg rejects: %s', (line) => {
    const result = runCommitMsg(`Add feature\n\nBody text.\n\n${line}\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/AI\/assistant attribution/);
  });

  it('commit-msg accepts normal messages, human co-authors, and ignores comment lines', () => {
    expect(runCommitMsg('Fix rounding in budget totals\n\nDetails.\n').status).toBe(0);
    expect(
      runCommitMsg('Pair work\n\nCo-Authored-By: Ada Lovelace <ada@example.org>\n').status,
    ).toBe(0);
    expect(
      runCommitMsg('Normal\n\n# Co-Authored-By: Claude <noreply@anthropic.com>\n').status,
    ).toBe(0);
  });

  it('pre-push accepts a clean outgoing commit', () => {
    const clean = commitIn('Clean change');
    const result = runPush([`refs/heads/main ${clean} refs/heads/main ${zeroOid}`]);
    expect(result.status).toBe(0);
  });

  it('pre-push refuses outgoing history with the trailer and honours the escape hatch', () => {
    const base = repoGit('rev-parse', 'HEAD');
    const bad = commitIn('Add thing\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>');
    const tip = commitIn('Later clean change');
    const line = `refs/heads/main ${tip} refs/heads/main ${base}`;

    const result = runPush([line]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/AI attribution/);
    expect(result.stderr).toContain(bad.slice(0, 7));

    expect(runPush([line], { SSB_ALLOW_AI_ATTRIBUTION: '1' }).status).toBe(0);
    expect(runPush([`(delete) ${zeroOid} refs/heads/main ${tip}`]).status).toBe(0);
  });
});
