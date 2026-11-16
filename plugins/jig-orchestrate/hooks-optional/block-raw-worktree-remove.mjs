if (process.argv[2] === '--help') { console.log('Usage: node hooks-optional/block-raw-worktree-remove.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Optional command backstop, not a shell interpreter or a security boundary.
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeAllowed, requestLine } from '../scripts/review-capabilities.mjs';
import { branchTip, cleanTrees, git } from '../scripts/review-merge.mjs';

export const refusal = `Use worktree.mjs close <name> to preserve private files and check merge state; raw removal blocked. Merge requires review.mjs merge and coordinator authority or a claimed grant. ${requestLine()} Agent pushes are refused.`;

// Keep quoted paths together; separate commands so a helper invocation never exempts a later delete.
function tokens(command) {
  const result = []; let word = '', quote = null;
  const flush = () => { if (word) result.push(word); word = ''; };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === '`' && command[i + 1] && quote !== "'") { word += command[++i]; continue; }
    if (char === '\\' && command[i + 1] && /[\s'";&|]/.test(command[i + 1]) && quote !== "'") { word += command[++i]; continue; }
    if (quote) { if (char === quote) quote = null; else word += char; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) { flush(); if (char === '\n') result.push(';'); }
    else if (/[;&|()]/.test(char)) { flush(); result.push(';'); }
    else word += char;
  }
  flush(); return result;
}
function physical(path) {
  path = resolve(path);
  if (existsSync(path)) return realpathSync.native(path);
  return dirname(path) === path ? path : join(physical(dirname(path)), basename(path));
}
const contains = (root, path) => {
  const rel = relative(root, path);
  return !rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
};
const executable = token => token.replaceAll('\\', '/').split('/').at(-1).replace(/\.exe$/i, '').toLowerCase();

// PowerShell -Recurse and every unambiguous prefix (-r is ambiguous there; treated as recursive).
const psRecurse = arg => /^-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?$/i.test(arg);
// POSIX short-flag bundles (-r, -R, -rf, -fr); capitalized words such as -Force are PowerShell parameters.
const shortRecursive = arg => /^-[a-zA-Z]+$/.test(arg) && /[rR]/.test(arg) && !/^-[A-Z][a-z]{2,}$/.test(arg);

// context is {cwd, trees} or a function returning it; it is resolved only when a recursive delete needs it.
export function shouldBlock(command, context) {
  if (typeof command !== 'string' || !command.trim()) return false;
  const getContext = typeof context === 'function' ? context : () => context;
  // Retain inner path quotes when unwrapping an explicitly quoted shell script.
  const wrapper = /^\s*(?:bash|sh|zsh|pwsh|powershell|cmd)(?:\.exe)?\s+(?:[-/][\w-]+\s+)*?(?:-[a-z]*c[a-z]*|-command|\/c)\s+([\s\S]+)$/i.exec(command);
  if (wrapper) {
    let script = wrapper[1].trim();
    if (['"', "'"].includes(script[0]) && script.at(-1) === script[0]) script = script.slice(1, -1);
    if (shouldBlock(script, getContext)) return true;
  }
  const words = tokens(command);
  for (let i = 0; i < words.length; i++) {
    const exe = executable(words[i]);
    const end = words.indexOf(';', i + 1);
    const args = words.slice(i + 1, end < 0 ? undefined : end);
    if (['bash', 'sh', 'zsh', 'pwsh', 'powershell', 'cmd'].includes(exe)) {
      const flag = args.findIndex(arg => /^(?:-[a-z]*c[a-z]*|-command|\/c)$/i.test(arg));
      if (flag >= 0 && shouldBlock(args.slice(flag + 1).join(' '), getContext)) return true;
    }
    if (exe === 'git') {
      let offset = 0;
      // Git global options taking a separate value; all remaining flags are single tokens.
      while (offset < args.length && args[offset].startsWith('-')) {
        const option = args[offset++];
        if (['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path'].includes(option)) offset++;
      }
      const gitArgs = args.slice(offset);
      if (gitArgs[0] === 'push') return true;
      if (gitArgs[0] === 'merge') {
        try {
          let cwd = getContext().cwd;
          for (let n = 0; n < offset; n++) {
            if (args[n] === '-C') cwd = resolve(cwd, args[++n]);
            else if (args[n] === '-c') n++;
            else throw new Error('Unsupported Git context for merge.');
          }
          if (gitArgs.includes('--abort') || gitArgs.includes('--quit')) continue;
          const mainCheckout = git(['worktree', 'list', '--porcelain'], cwd).split(/\r?\n/)[0].slice('worktree '.length);
          if (physical(git(['rev-parse', '--show-toplevel'], cwd)) !== physical(mainCheckout) && git(['branch', '--show-current'], cwd) !== 'main') continue;
          const refs = [];
          for (let n = 1; n < gitArgs.length; n++) {
            if (['-m', '--message'].includes(gitArgs[n])) { n++; continue; }
            if (['--no-edit', '--no-ff', '--ff-only', '--'].includes(gitArgs[n])) continue;
            refs.push(gitArgs[n]);
          }
          if (refs.length !== 1 || refs[0].startsWith('-')) return true;
          let branch = refs[0];
          if (/^[a-f0-9]{40,64}$/.test(branch)) {
            const branches = git(['for-each-ref', '--format=%(refname:short)', `--points-at=${branch}`, 'refs/heads'], cwd).split('\n').filter(x => x && x !== 'main');
            if (branches.length !== 1) return true;
            branch = branches[0];
          }
          const sha = branchTip(branch, cwd);
          cleanTrees(branch, cwd);
          if (!mergeAllowed(branch, sha)) return true;
        } catch { return true; }
      }
      if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') return true;
      if (gitArgs[0] === 'branch') {
        const flags = gitArgs.slice(1).filter(arg => arg.startsWith('-'));
        if (flags.some(arg => /^-[^-]*D/.test(arg)) || flags.some(arg => arg === '--delete' || /^-[^-]*d/.test(arg)) && flags.some(arg => arg === '--force' || /^-[^-]*f/.test(arg))) return true;
      }
    }
    if (['rm', 'remove-item', 'rmdir', 'rd'].includes(exe)) {
      const recursive = args.some(arg => /^--recursive$/i.test(arg) || psRecurse(arg) || exe === 'rm' && shortRecursive(arg) || /^\/s$/i.test(arg));
      if (!recursive) continue;
      const paths = args.filter(arg => !arg.startsWith('-') && !/^\/[sq]$/i.test(arg));
      if (!paths.length) continue;
      const { cwd, trees } = getContext();
      const roots = trees.map(tree => physical(tree));
      for (const path of paths) {
        // Unknown shell expansion is conservatively refused for recursive deletion.
        if (/[$%*?]/.test(path)) return true;
        // Block only a registered worktree root or an ancestor of one; work inside a worktree is routine.
        const candidate = resolve(cwd, path);
        if (roots.some(tree => contains(candidate, tree) || contains(physical(candidate), tree))) return true;
      }
    }
  }
  return false;
}

function worktreeContext(cwd) {
  let list;
  try { list = execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0'); }
  catch { list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split(/\r?\n/); } // git < 2.36
  const trees = list.filter(line => line.startsWith('worktree ')).map(line => line.slice('worktree '.length));
  if (!trees.length) throw new Error('no worktrees listed');
  // The first entry is the main checkout; every other registered worktree is protected.
  return { cwd, trees: trees.slice(1) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let needed = false;
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const cwd = resolve(input.cwd ?? process.cwd());
    const command = input.tool_input?.command;
    // Without a command there is nothing to judge; ordinary commands never depend on repository state.
    if (typeof command === 'string' && shouldBlock(command, () => { needed = true; return worktreeContext(cwd); })) { console.error(refusal); process.exitCode = 2; }
  } catch (error) {
    if (needed) { console.error(`Backstop could not resolve worktrees (${error.message}) for a delete command. ${refusal}`); process.exitCode = 2; }
    else if (error instanceof SyntaxError) { console.error(`Backstop could not read hook input: ${error.message}. ${refusal}`); process.exitCode = 2; }
    else console.error(`Backstop skipped: ${error.message}`);
  }
}
