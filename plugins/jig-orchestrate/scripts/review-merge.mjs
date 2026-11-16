if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-merge.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { execFileSync } from 'node:child_process';
import { claimGrant, finishGrant, grantEnv, identity, mintGrant, requestLine } from './review-capabilities.mjs';

export function git(args, cwd = process.cwd(), env = process.env) {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
export function branchTip(branch, cwd = process.cwd()) {
  if (typeof branch !== 'string' || branch.startsWith('-') || branch === 'main') throw new Error('Name a local topic branch.');
  git(['check-ref-format', '--branch', branch], cwd);
  return git(['rev-parse', '--verify', `refs/heads/${branch}^{commit}`], cwd);
}
export function checkedTip(branch, sha, cwd = process.cwd()) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40,64}$/.test(sha) || branchTip(branch, cwd) !== sha) throw new Error('Expected SHA must equal the committed local branch tip.');
  return sha;
}
export function cleanTrees(branch, cwd) {
  if (git(['branch', '--show-current'], cwd) !== 'main') throw new Error('Run merge from the main checkout.');
  const trees = git(['worktree', 'list', '--porcelain', '-z'], cwd).split('\0\0');
  for (const block of trees) {
    const lines = block.split('\0');
    const name = lines.find(x => x.startsWith('branch '))?.slice(7);
    const path = lines.find(x => x.startsWith('worktree '))?.slice(9);
    if (path && (name === 'refs/heads/main' || name === `refs/heads/${branch}`) && git(['status', '--porcelain', '--untracked-files=all'], path)) throw new Error('Refusing merge: dirty worktree or uncommitted tip; commit or preserve changes first.');
  }
}
export function runMerge(branch, flags, { cwd = process.cwd(), out = console.log, finish = finishGrant } = {}) {
  const source = flags.grant ?? branch;
  const caller = identity();
  const id = flags['grant-id'] ?? process.env[grantEnv];
  if (flags.grant) {
    if (caller.kind !== 'coordinator') throw new Error(`Coordinator required to mint a grant. ${requestLine(flags.item, source)}`);
    checkedTip(source, flags.sha, cwd);
    const grant = mintGrant(source, flags.sha, flags.authority);
    out(`${grantEnv}=${grant}`);
    return grant;
  }
  if (caller.kind !== 'coordinator' && !id) throw new Error(`Merge refused for ${caller.kind}. ${requestLine(flags.item, source)}`);
  checkedTip(source, flags.sha, cwd);
  cleanTrees(source, cwd);
  // Claim before executing Git. Even a failed merge consumes the grant.
  let claimed = false;
  let authority = flags.authority?.trim() || `coordinator ${caller.id}`;
  if (id) { authority = claimGrant(id, source, flags.sha).authority; claimed = true; }
  let result;
  try {
    checkedTip(source, flags.sha, cwd);
    const message = `Merge ${source} at ${flags.sha.slice(0, 7)} (authority: ${authority})`;
    result = git(['merge', '--no-ff', '-m', message, '--', flags.sha], cwd, { ...process.env, ...(id ? { [grantEnv]: id } : {}) });
  } catch (error) {
    if (claimed) {
      try { finish(id, 'failed'); }
      catch (finishError) { throw new AggregateError([error, finishError], `${error.message}\nGrant finalization also failed: ${finishError.message}`); }
    }
    throw error;
  }
  if (claimed) finish(id, 'merged');
  out(result);
  return { branch: source, sha: flags.sha, grant: id ?? null, state: 'merged' };
}
