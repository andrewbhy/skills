import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Compare active installations, never every cached version.
// Codex's active selection: local first, otherwise greatest semver (lexical fallback).
// https://github.com/openai/codex/blob/main/codex-rs/core-plugin-common/src/installed.rs
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const names = ['jig-tower', 'jig-orchestrate'];
const safe = path => !resolve(path).split(/[\\/]/).some(part => part.toLowerCase() === 'private');
const manifest = root => join(root, '.claude-plugin', 'plugin.json');
function publicPhysical(path) {
  if (!safe(path)) throw new Error('path is private');
  const physical = realpathSync(path);
  if (!safe(physical)) throw new Error('path is private');
  return physical;
}
function readJson(path) { return JSON.parse(readFileSync(publicPhysical(path), 'utf8')); }
function readManifest(root) {
  const data = readJson(manifest(publicPhysical(root)));
  if (!names.includes(data.name) || typeof data.version !== 'string' || !data.version) throw new Error('invalid manifest');
  return data;
}
function compareVersions(a, b) {
  const pattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
  const left = a.match(pattern), right = b.match(pattern);
  if (!left || !right) return a < b ? -1 : a > b ? 1 : 0;
  for (let i = 1; i <= 3; i++) {
    if (BigInt(left[i]) !== BigInt(right[i])) return BigInt(left[i]) < BigInt(right[i]) ? -1 : 1;
  }
  if (!left[4] || !right[4]) return left[4] ? -1 : right[4] ? 1 : 0;
  const x = left[4].split('.'), y = right[4].split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    if (x[i] === y[i]) continue;
    const nx = /^\d+$/.test(x[i]), ny = /^\d+$/.test(y[i]);
    if (nx && ny) return BigInt(x[i]) < BigInt(y[i]) ? -1 : 1;
    return nx ? -1 : ny ? 1 : x[i] < y[i] ? -1 : 1;
  }
  return 0;
}
function inProject(project) {
  if (!safe(project)) return false;
  const rel = relative(resolve(project), resolve(process.env.JIG_PROJECT_ROOT || process.cwd()));
  return rel === '' || !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'));
}
export function pluginVersions(script = fileURLToPath(import.meta.url), { readDirectory = readdirSync } = {}) {
  const versions = {}, notes = [], issues = [];
  let root = dirname(resolve(script));
  while (safe(root) && !existsSync(manifest(root))) {
    if (root === dirname(root)) return { versions, issues, notes: ['plugin version check skipped: running outside an installed plugin'] };
    root = dirname(root);
  }
  if (!safe(root)) return { versions, issues, notes: ['plugin version check skipped: path is private'] };
  let own;
  try { own = readManifest(root); versions[own.name] = own.version; }
  catch { return { versions, issues: ['cannot read running jig plugin version; record writes refused'], notes }; }
  const peer = names.find(name => name !== own.name);
  let active, recordedVersion;
  try {
    if (basename(dirname(dirname(dirname(root)))) === 'cache') {
      const market = basename(dirname(dirname(root))), plugins = dirname(dirname(dirname(dirname(root))));
      const hostHome = dirname(plugins);
      if (basename(hostHome) === '.codex' || process.env.CODEX_HOME && resolve(process.env.CODEX_HOME) === resolve(hostHome)) {
        const select = name => {
          const base = publicPhysical(join(plugins, 'cache', market, name));
          const dirs = readDirectory(base, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && /^[A-Za-z0-9_.+-]+$/.test(entry.name) && safe(join(base, entry.name)))
            .map(entry => entry.name).sort(compareVersions);
          const version = dirs.includes('local') ? 'local' : dirs.at(-1);
          if (!version) throw new Error('no active version');
          return join(base, version);
        };
        // The running process must retain its actual version, even after an update.
        active = select(peer);
      } else {
        const record = readJson(join(plugins, 'installed_plugins.json')).plugins;
        const ownRows = record?.[own.name + '@' + market] ?? [];
        const scope = ownRows.find(entry => typeof entry.installPath === 'string' && resolve(entry.installPath) === root);
        const ownActive = scope ?? ownRows.filter(entry => entry.scope === 'user')[0] ?? { scope: 'user' };
        const rows = (record?.[peer + '@' + market] ?? []).filter(entry => !entry.projectPath || inProject(entry.projectPath));
        const matching = rows.filter(entry => entry.scope === ownActive.scope && entry.projectPath === ownActive.projectPath);
        const choices = matching.length ? matching : rows.filter(entry => entry.scope === 'user');
        if (choices.length !== 1) throw new Error('active sibling unknown');
        active = choices[0].installPath; recordedVersion = choices[0].version;
      }
    } else {
      const adjacent = join(dirname(root), peer);
      if (safe(adjacent) && existsSync(manifest(adjacent))) active = adjacent;
    }
    if (!active) throw new Error('active sibling not found');
    const sibling = readManifest(active);
    if (sibling.name !== peer || recordedVersion && recordedVersion !== sibling.version) throw new Error('invalid active sibling');
    versions[peer] = sibling.version;
    if (sibling.version !== own.version) issues.push('plugin version mismatch: ' + own.name + ' ' + own.version + ', ' + peer + ' ' + sibling.version + '; record writes refused');
  } catch { notes.push('plugin version check skipped for ' + peer + ': active sibling installation unavailable or unreadable'); }
  return { versions, notes, issues };
}
export function requireCompatiblePlugins() {
  const { issues } = pluginVersions();
  if (issues.length) throw Object.assign(new Error(issues.join('; ')), { exitCode: 2 });
}
