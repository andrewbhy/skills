import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { commandFor } from '../scripts/command-line.mjs';
// Optional command backstop, not a shell interpreter or a security boundary.
import { readFileSync, realpathSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeAllowed, requestLine } from '../scripts/capabilities.mjs';
// The guard also ships with the standalone tower. Merge checks stay optional.
const mergeHelper = (import.meta.url.includes('/hooks-optional/') ? '../scripts/' : '../') + 'orchestrate-merge.mjs';
const merge = existsSync(new URL(mergeHelper, import.meta.url)) ? await import(mergeHelper) : null;
const needsMerge = () => { if (!merge) throw new Error('merge needs jig-orchestrate installed'); return merge; };
const branchTip = (...args) => needsMerge().branchTip(...args);
const cleanTrees = (...args) => needsMerge().cleanTrees(...args);
const git = (...args) => needsMerge().git(...args);
import { mainCheckout, projectName, projectsMap, statePath, storeRoot } from '../scripts/jig-store.mjs';

function optionalCommand(name, args) {
  const prefix = import.meta.url.includes('/hooks-optional/') ? '../scripts/' : '../';
  const file = name === 'merge' ? 'orchestrate-merge.mjs' : 'worktree.mjs';
  const target = new URL(prefix + file, import.meta.url);
  return existsSync(target) ? (name === 'merge' ? commandFor(new URL(prefix + 'tower.mjs', import.meta.url), ['merge', ...args]) : commandFor(target, args)) : 'needs jig-orchestrate installed: ' + name;
}
export const refusal = `Raw removal blocked to preserve private files and check merge state. Close command: ${optionalCommand('worktree close', ['close', '<name>'])}. Merge: ${optionalCommand('merge', [])}; coordinator authority or a claimed grant is required. ${requestLine()}`;

// Match layers.mjs: ancestors and linked checkouts share the registered/store config.
function protectedBranches(cwd) {
  const safe = path => {
    const isPrivate = value => resolve(value).split(/[\\/]/).some(part => part.toLowerCase() === 'private');
    if (isPrivate(path)) throw Error('path is private');
    const real = realpathSync(path);
    if (isPrivate(real)) throw Error('path is private');
    return real;
  };
  const home = storeRoot();
  if (!home || !existsSync(home)) return undefined;
  safe(home);
  const registered = new Map();
  for (const [name, entry] of Object.entries(projectsMap(home))) {
    const path = typeof entry === 'string' ? entry : entry?.path;
    if (typeof path !== 'string' || path.split(/[\\/]/).some(part => part.toLowerCase() === 'private') || !existsSync(path)) continue;
    const canonical = safe(path);
    if (!registered.has(canonical)) registered.set(canonical, name);
  }
  const projects = new Set();
  for (const start of [safe(cwd), safe(mainCheckout(cwd))]) {
    for (let dir = start; ; dir = dirname(dir)) {
      if (existsSync(join(dir, '.git')) || registered.has(dir)) projects.add(dir);
      if (dir === dirname(dir)) break;
    }
  }
  const result = new Set();
  let configured = false;
  for (const project of projects) {
    const resolved = statePath(project, 'config.json', { home });
    const rel = relative(home, resolved);
    const expected = join(home, registered.get(project) ?? projectName(project, { home }), 'config.json');
    const path = registered.has(project) || rel.startsWith('..') || isAbsolute(rel) ? expected : resolved;
    if (!existsSync(path)) continue;
    safe(path);
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('invalid project config');
    if (data.protectedBranches === undefined) continue;
    if (!Array.isArray(data.protectedBranches) || data.protectedBranches.some(branch => typeof branch !== 'string' || !branch.trim())) throw Error('invalid protectedBranches');
    configured = true;
    for (const branch of data.protectedBranches) result.add(branch.replace(/^refs\/heads\//, ''));
  }
  return configured ? [...result] : undefined;
}

function pushRefusal(args, globals, getContext) {
  try {
    let cwd = getContext().cwd;
    for (let n = 0; n < globals.length; n++) {
      if (globals[n] !== '-C' || !globals[n + 1]) return 'unsupported Git context';
      cwd = resolve(cwd, globals[++n]);
    }
    if (resolve(cwd).split(/[\\/]/).some(part => part.toLowerCase() === 'private')) return 'path is private';
    cwd = realpathSync(cwd);
    if (cwd.split(/[\\/]/).some(part => part.toLowerCase() === 'private')) return 'path is private';
    const run = argv => execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, windowsHide: true }).trim();
    const config = (key, boolean = false) => {
      try { return run(['config', ...(boolean ? ['--bool'] : []), '--get', key]); }
      catch (error) { if (error.status === 1) return undefined; throw error; }
    };
    const positional = [];
    let options = true;
    for (const arg of args) {
      if (options && arg === '--') { options = false; continue; }
      if (options && ['-u', '--set-upstream'].includes(arg)) continue;
      if (options && arg.startsWith('-')) return `${arg} is not allowed for sessions`;
      if (arg.startsWith('+')) return '+ refspec is not allowed for sessions';
      if (arg.startsWith(':')) return 'delete refspec is not allowed for sessions';
      if (/[$%*?`\r\n]/.test(arg)) return 'unresolved shell expansion or wildcard';
      positional.push(arg);
    }
    const branch = () => run(['symbolic-ref', '--short', 'HEAD']);
    let remote = positional.shift();
    let refs = positional;
    if (!refs.length) {
      const current = branch();
      const upstream = run(['for-each-ref', '--format=%(upstream:remotename)%00%(upstream:remoteref)', `refs/heads/${current}`]).split('\0');
      if (!upstream[0] || upstream[1] !== `refs/heads/${current}`) return 'bare push requires an upstream with the same branch name';
      remote ||= config(`branch.${current}.pushRemote`) || config('remote.pushDefault') || upstream[0];
      if (remote !== upstream[0]) return 'push remote differs from upstream';
      const mode = config('push.default');
      if (mode && !['simple', 'current', 'upstream'].includes(mode)) return 'unresolved push.default';
      if (config(`remote.${remote}.push`) !== undefined) return 'configured push refspec is not allowed for bare pushes';
      refs = [`${current}:${current}`];
    }
    if (!remote || remote.startsWith('-') || !run(['remote']).split(/\r?\n/).includes(remote)) return 'unknown remote';
    run(['remote', 'get-url', '--push', remote]);
    for (const key of ['push.followTags', `remote.${remote}.mirror`]) {
      const value = config(key, true);
      if (value !== undefined && value !== 'false') return `${key} is not allowed for sessions`;
    }
    const configured = protectedBranches(run(['rev-parse', '--show-toplevel']));
    const protectedNames = new Set((configured ?? ['main', 'master']).map(name => name.toLowerCase()));
    if (configured === undefined) {
      let head;
      try { head = run(['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`]); }
      catch (error) { if (error.status !== 1) throw error; /* no symbolic remote HEAD */ }
      if (head) {
        if (!head.startsWith(`${remote}/`)) return 'unresolved remote default branch';
        protectedNames.add(head.slice(remote.length + 1).toLowerCase());
      }
    }
    for (const ref of refs) {
      const parts = ref.split(':');
      if (parts.length > 2 || !parts[0]) return 'unresolved refspec';
      const source = parts[0];
      const destination = (parts.length === 2 ? parts[1] : source === 'HEAD' ? branch() : source).replace(/^refs\/heads\//, '').replace(/^heads\//, '');
      if (destination.startsWith('refs/')) return `destination ${destination} is not a branch`;
      if (protectedNames.has(destination.toLowerCase())) return `destination ${destination} is protected (${configured === undefined ? 'main, master, default branch' : 'protectedBranches'}). Push a task branch and open a pull request; the person merges`;
      run(['check-ref-format', `refs/heads/${destination}`]);
      if (source.startsWith('-') || source.startsWith('+')) return 'unresolved branch refspec';
      // Accept local branches and HEAD only; tags, patterns and revision expressions are ambiguous push sources.
      run(['rev-parse', '--verify', source === 'HEAD' ? 'HEAD' : `refs/heads/${source.replace(/^refs\/heads\//, '')}`]);
    }
    return null;
  } catch { return 'could not resolve push context, configuration or Git refs'; }
}

// Keep quoted paths together; separate commands so a helper invocation never exempts a later delete.
function tokens(command, keepSeparators = false) {
  const result = []; let word = '', quote = null;
  const flush = () => { if (word) result.push(word); word = ''; };
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === '`' && command[i + 1] && quote !== "'") { word += command[++i]; continue; }
    if (char === '\\' && command[i + 1] && /[\s'";&|]/.test(command[i + 1]) && quote !== "'") { word += command[++i]; continue; }
    if (quote) { if (char === quote) quote = null; else word += char; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) { flush(); if (char === '\n') result.push(';'); }
    else if (/[;&|()]/.test(char)) {
      flush();
      const operator = /[&|]/.test(char) && command[i + 1] === char ? char + command[++i] : char;
      result.push(keepSeparators ? operator : ';');
    }
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

export function mapShellPath(path, platform = process.platform, home = homedir()) {
  if (platform !== 'win32') return path;
  if (path === '~') return home;
  if (path.startsWith('~/')) return `${home.replace(/[\\/]$/, '')}/${path.slice(2)}`;
  const drive = /^\/(?:cygdrive\/)?([a-z])(?:\/(.*))?$/i.exec(path);
  return drive ? `${drive[1].toUpperCase()}:/${drive[2] ?? ''}` : path;
}

// context is {cwd, trees} or a function returning it; resolve only for repository-dependent commands.
export function shouldBlock(command, context, onRefusal = () => {}) {
  if (typeof command !== 'string' || !command.trim()) return false;
  const getContext = typeof context === 'function' ? context : () => context;
  // Retain inner path quotes when unwrapping an explicitly quoted shell script.
  const wrapper = /^\s*(?:bash|sh|zsh|pwsh|powershell|cmd)(?:\.exe)?\s+(?:[-/][\w-]+\s+)*?(?:-[a-z]*c[a-z]*|-command|\/c)\s+([\s\S]+)$/i.exec(command);
  if (wrapper) {
    let script = wrapper[1].trim();
    if (['"', "'"].includes(script[0]) && script.at(-1) === script[0]) script = script.slice(1, -1);
    if (shouldBlock(script, getContext, onRefusal)) return true;
  }
  const words = tokens(command, true);
  const separator = word => [';', '&&', '||', '&', '|', '(', ')'].includes(word);
  let segmentStart = 0, pushCwd, pushCwdError = false;
  const pushContext = () => ({ cwd: pushCwd ?? getContext().cwd });
  for (let i = 0; i < words.length; i++) {
    if (separator(words[i])) { segmentStart = i + 1; continue; }
    const exe = executable(words[i]);
    const end = words.findIndex((word, n) => n > i && separator(word));
    const args = words.slice(i + 1, end < 0 ? undefined : end);
    if (i === segmentStart && ['cd', 'chdir', 'set-location', 'sl', 'pushd', 'popd'].includes(exe)) {
      try {
        if (pushCwdError || !['cd', 'chdir', 'set-location', 'sl'].includes(exe) || args.length !== 1
            || /[$%*?`]/.test(args[0]) || args[0].startsWith('-')
            || ['|', '||', '&', '('].includes(words[i - 1]) || ['|', '||', '&', ')'].includes(words[end])) throw Error();
        const path = resolve(pushContext().cwd, mapShellPath(args[0]));
        const isPrivate = value => value.split(/[\\/]/).some(part => part.toLowerCase() === 'private');
        if (isPrivate(path)) throw Error();
        const real = realpathSync(path);
        if (isPrivate(real) || !statSync(real).isDirectory()) throw Error();
        pushCwd = real;
      } catch { pushCwdError = true; }
    }
    if (['bash', 'sh', 'zsh', 'pwsh', 'powershell', 'cmd'].includes(exe)) {
      const flag = args.findIndex(arg => /^(?:-[a-z]*c[a-z]*|-command|\/c)$/i.test(arg));
      const shellContext = () => {
        if (pushCwdError) throw Error('unresolved shell working directory');
        return { cwd: pushContext().cwd, get trees() { return getContext().trees; } };
      };
      if (flag >= 0 && shouldBlock(args.slice(flag + 1).join(' '), shellContext, onRefusal)) return true;
    }
    if (exe === 'git') {
      let offset = 0;
      // Git global options taking a separate value; all remaining flags are single tokens.
      while (offset < args.length && args[offset].startsWith('-')) {
        const option = args[offset++];
        if (['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--exec-path'].includes(option)) offset++;
      }
      const gitArgs = args.slice(offset);
      if (gitArgs[0] === 'push') {
        if (pushCwdError) {
          onRefusal('Push refused: unresolved shell working directory.'); return true;
        }
        const reason = pushRefusal(gitArgs.slice(1), args.slice(0, offset), pushContext);
        if (reason) { onRefusal(`Push refused: ${reason.replace(/[\r\n]+/g, ' ')}.`); return true; }
      }
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
    let pushMessage;
    if (typeof command === 'string' && shouldBlock(command, () => ({ cwd, get trees() { needed = true; return worktreeContext(cwd).trees; } }), message => { pushMessage = message; })) { console.error(pushMessage ?? refusal); process.exitCode = 2; }
  } catch (error) {
    if (needed) { console.error(`Backstop could not resolve worktrees (${error.message}) for a delete command. ${refusal}`); process.exitCode = 2; }
    else if (error instanceof SyntaxError) { console.error(`Backstop could not read hook input: ${error.message}. ${refusal}`); process.exitCode = 2; }
    else console.error(`Backstop skipped: ${error.message}`);
  }
}
