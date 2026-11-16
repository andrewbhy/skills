if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-verify/walk-kit.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep, posix, win32, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

export function precondition(condition, message) {
  if (!condition) throw Error(`precondition: ${message}`);
}
const inside = (parent, child) => { const rel = relative(parent, child); return !rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); };
const privatePath = path => path.split(/[\\/]/).some(part => part.toLowerCase() === 'private');
const pathStyle = path => /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/])/.test(path.toLowerCase()) ? win32 : posix;
const absolutePath = path => typeof path === 'string' && (posix.isAbsolute(path) || win32.isAbsolute(path));
function containsPath(root, path) {
  if (!absolutePath(root) || !absolutePath(path) || pathStyle(root) !== pathStyle(path)) return false;
  const api = pathStyle(root), rel = api.relative(api.normalize(root), api.normalize(path));
  return !rel || !api.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + api.sep);
}
function physicalPath(path) {
  precondition(!privatePath(path), 'served path is private');
  try { lstatSync(path); const physical = realpathSync(path); precondition(!privatePath(physical), 'served target is private'); return physical; }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A dangling link cannot be treated as a new ordinary file.
    try { precondition(!lstatSync(path).isSymbolicLink(), 'served path is a dangling link'); } catch (inner) { if (inner.code !== 'ENOENT') throw inner; }
    precondition(dirname(path) !== path, 'served path has no existing ancestor');
    return join(physicalPath(dirname(path)), basename(path));
  }
}
export function assertServedInside(copyRoot, paths) {
  precondition(absolutePath(copyRoot), 'copy root must be absolute');
  const values = Array.isArray(paths) ? paths : paths && typeof paths === 'object' ? Object.values(paths) : null;
  precondition(values?.length > 0, 'served paths must be a nonempty list or record');
  const root = physicalPath(resolve(copyRoot));
  for (const path of values) {
    precondition(absolutePath(path) && containsPath(root, path), `served path escape: ${path}`);
    precondition(containsPath(root, physicalPath(path)), `served path escape through a link: ${path}`);
  }
}

// Conservative config scanner: JSON strings/keys, quoted text values and bare
// absolute paths. External paths require an exact, explicit allowEscapes entry.
function isolateConfig(text, json, source, destination, file, allowEscapes, rewrites, escapes) {
  function relocate(path) {
    const url = path.startsWith('file://') ? new URL(path) : null;
    let value = url ? (url.hostname && url.hostname !== 'localhost' ? '//' + url.hostname : '') + decodeURIComponent(url.pathname).replace(/^\/([a-z]:\/)/i, '$1') : path;
    if (!absolutePath(value)) return path;
    const api = pathStyle(value); value = api.normalize(value);
    if (containsPath(source, value)) {
      const mapped = join(destination, ...api.relative(source, value).split(/[\\/]/));
      rewrites.push({ file, from: value, to: mapped });
      return url ? pathToFileURL(mapped).href : mapped;
    }
    if (containsPath(destination, value)) return path;
    const allowed = allowEscapes.some(item => pathStyle(item) === api && api.relative(api.normalize(item), value) === '');
    precondition(allowed, `copy escape in ${file}: ${value}`);
    escapes.push({ file, path: value, allowed: true }); return path;
  }
  function rewrite(value) {
    if (!/[\r\n]/.test(value) && (absolutePath(value) || value.startsWith('file://'))) return relocate(value);
    return value.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'|(^|[\s=,(\[])((?:file:\/\/\/|[a-z]:[\\/]|\\\\|\/)[^\s"',;#<>()[\]{}]*)/gim, (match, double, single, prefix, bare) => {
      if (bare) return prefix + relocate(bare);
      if (double !== undefined) {
        let decoded; try { decoded = JSON.parse(match); } catch { return '"' + rewrite(double) + '"'; }
        // INI/YAML may use literal Windows separators: JSON's \t or \n decoding
        // must not hide an absolute path from the escape gate.
        if (absolutePath(double) && !absolutePath(decoded)) return '"' + relocate(double) + '"';
        return JSON.stringify(rewrite(decoded));
      }
      return "'" + rewrite(single) + "'";
    });
  }
  function visit(value) {
    if (typeof value === 'string') return rewrite(value);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [rewrite(key), visit(val)]));
    return value;
  }
  if (json) {
    try { const original = JSON.parse(text), mapped = visit(original); return isDeepStrictEqual(original, mapped) ? text : JSON.stringify(mapped, null, 2) + '\n'; }
    catch (error) { if (error.message.includes('precondition:')) throw error; throw Error(`precondition: invalid JSON config ${file}`); }
  }
  return text.split('\n').map(line => {
    const assignment = line.match(/^(\s*[\w.-]+\s*[:=]\s*)(.*)$/);
    if (assignment && (absolutePath(assignment[2].trim()) || assignment[2].trim().startsWith('file://'))) return assignment[1] + relocate(assignment[2].trim());
    return rewrite(line);
  }).join('\n');
}
export const readJSON = path => {
  precondition(!privatePath(resolve(path)), 'JSON path is private');
  precondition(existsSync(path), 'JSON input must exist');
  precondition(!privatePath(realpathSync(path)), 'JSON target is private');
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
};

export function freeze(source, destination, { repo = process.cwd(), binaryLimit = 1024 * 1024, allowEscapes = [] } = {}) {
  source = resolve(source); destination = resolve(destination);
  precondition(!privatePath(source) && !privatePath(destination), 'freeze path is private');
  precondition(existsSync(source), 'freeze source must exist');
  precondition(!lstatSync(source).isSymbolicLink(), 'source cannot be a symlink or junction');
  source = realpathSync(source);
  precondition(!privatePath(source), 'source resolves to a private folder');
  precondition(lstatSync(source).isDirectory(), 'source must be a directory');
  precondition(!inside(source, destination) && !inside(destination, source), 'freeze must not overlap source');
  precondition(!inside(realpathSync(repo), destination), 'freeze output must be outside the repo');
  precondition(Number.isFinite(binaryLimit) && binaryLimit >= 0, 'binary limit must be nonnegative');
  precondition(Array.isArray(allowEscapes) && allowEscapes.every(absolutePath), 'allowEscapes must list absolute paths');
  // Do not follow any existing destination ancestor through a junction.
  let ancestor = destination;
  while (true) {
    try { precondition(!lstatSync(ancestor).isSymbolicLink(), 'destination ancestor is a symlink'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = resolve(ancestor, '..'); if (parent === ancestor) break; ancestor = parent;
  }
  mkdirSync(destination, { recursive: true });
  precondition(readdirSync(destination).length === 0, 'freeze destination must be empty');
  const skipped = [], copied = [], rewrites = [], escapes = [];
  const excluded = /credential|secret|token|password|service-account|^(?:private|sessions|coordination\.json|auth(?:\..*)?|\.git|\.ssh|\.aws|\.azure|\.gnupg|\.npmrc|\.netrc|\.pypirc|\.env.*|.*\.(?:pem|key|p12|pfx)|id_(?:rsa|ed25519).*)$/i;
  function walk(from, to, prefix = '') {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const label = prefix + entry.name;
      // Filter names before any stat/read; private directory contents are never visited.
      if (excluded.test(entry.name)) { skipped.push({ path: label, reason: 'sensitive or session data' }); continue; }
      const path = join(from, entry.name), target = join(to, entry.name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) { skipped.push({ path: label, reason: 'symlink or junction' }); continue; }
      if (stat.isDirectory()) { mkdirSync(target); walk(path, target, label + '/'); }
      else if (stat.isFile()) {
        if (stat.size > binaryLimit) {
          const header = Buffer.alloc(Math.min(stat.size, 8192)), fd = openSync(path, 'r');
          let count;
          try { count = readSync(fd, header, 0, header.length, 0); } finally { closeSync(fd); }
          const bytes = header.subarray(0, count);
          let binary = bytes.includes(0);
          try { new TextDecoder('utf8', { fatal: true }).decode(bytes, { stream: true }); } catch { binary = true; }
          if (binary) { skipped.push({ path: label, reason: 'over binary limit' }); continue; }
        }
        if (/\.(?:json|jsonc|ya?ml|toml|ini|conf|config|cfg|properties|txt)$/i.test(entry.name) || /(?:^|[._-])(?:config|settings|roots)(?:[._-]|$)/i.test(entry.name)) {
          const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
          const isolated = isolateConfig(text, /\.json$/i.test(entry.name), source, destination, label, allowEscapes, rewrites, escapes);
          writeFileSync(target, isolated);
        } else copyFileSync(path, target);
        copied.push(label);
      } else skipped.push({ path: label, reason: 'unsupported file type' });
    }
  }
  walk(source, destination);
  return { source, destination, copied, skipped, rewrites, escapes };
}

export async function typeKeys(target, text, { delay = 20 } = {}) {
  precondition(typeof text === 'string' && typeof target?.press === 'function', 'typing needs text and a keyboard target');
  for (const key of text) { await target.press(key === ' ' ? 'Space' : key); if (delay) await sleep(delay); }
}
export function assertRequestEqualsScreen(request, screen) {
  precondition(isDeepStrictEqual(request, screen), 'request-equals-screen mismatch');
}
export function assertNotLost(expected, observed) {
  precondition(expected.every(id => observed.includes(id)), 'lost item');
}
export function assertNotStuck({ since, now = Date.now(), limitMs, pending }) {
  precondition(Number.isFinite(since) && Number.isFinite(limitMs) && limitMs >= 0, 'stuck check needs a clock and limit');
  precondition(!pending || now - since <= limitMs, 'stuck pending operation');
}

export async function startServer({ command = process.execPath, args, cwd, port, fakeEnv = {}, readyPath = '/', timeoutMs = 5000 }) {
  precondition(Number.isInteger(port) && port > 0 && port < 65536 && Array.isArray(args), 'server needs args and a valid port');
  const url = `http://127.0.0.1:${port}`;
  // Refuse to mistake someone else's server for our fixture.
  const { createServer } = await import('node:http');
  await new Promise((resolveReady, reject) => {
    const probe = createServer(); probe.once('error', error => reject(Error(`precondition: port unavailable: ${error.code}`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolveReady));
  });
  const child = spawn(command, args, { cwd, env: { ...process.env, ...fakeEnv, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', failure;
  child.stdout.on('data', data => { output = (output + data).slice(-8000); });
  child.stderr.on('data', data => { output = (output + data).slice(-8000); });
  child.on('error', error => { failure = error; });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null || failure) return;
    const exited = new Promise(done => child.once('exit', done));
    child.kill();
    await Promise.race([exited, sleep(2000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
  };
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      precondition(!failure && child.exitCode === null, `fixture server exited: ${failure?.message ?? output}`);
      try { const response = await fetch(url + readyPath, { signal: AbortSignal.timeout(300), redirect: 'error' }); if (response.ok) return { child, url, stop }; } catch { /* bounded readiness retry */ }
      await sleep(25);
    }
    throw Error('precondition: fixture server readiness timed out');
  } catch (error) { await stop(); throw error; }
}
