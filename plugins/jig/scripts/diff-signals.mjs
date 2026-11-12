// Canonical source; sync-skills.mjs ships a standalone copy with jig-review.
import { execFileSync } from 'node:child_process';
import { resolve, posix } from 'node:path';
import { pathToFileURL } from 'node:url';

export const classes = ['trivial', 'mechanical', 'refactor', 'behaviour', 'risky'];
export const seats = ['qa', 'product', 'visual-craft', 'fidelity', 'content-stress', 'motion', 'security', 'accessibility', 'architecture'];
const defaultPaths = ['pricing', 'billing', 'payment', 'invoice', 'checkout', 'discount'].flatMap(name =>
  [`**/*${name}*`, `**/*${name}*/**`].map(pattern => ({ pattern, class: 'risky', seats: ['product'] })));
const maxClass = (a, b) => classes[Math.max(classes.indexOf(a), classes.indexOf(b))];
const git = (cwd, args) => execFileSync('git', ['--literal-pathspecs', ...args], {
  cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
});

// Small portable glob language: * within a segment, ** across segments, ? one character.
function glob(pattern, path) {
  let source = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { source += '(?:.*/)?'; i++; }
      else source += '.*';
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(source + '$').test(path);
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Review configuration must be an object');
  const allowed = ['rules', 'vision', 'reportDirectory', 'largeDiff', 'paths', 'fileTypes'];
  for (const key of Object.keys(config)) if (!allowed.includes(key)) throw new Error(`Unknown review configuration field: ${key}`);
  for (const key of ['rules', 'vision']) {
    if (config[key] !== undefined && (!Array.isArray(config[key]) || config[key].some(p => !projectPath(p)))) {
      throw new Error(`${key} must contain project-relative paths`);
    }
  }
  if (config.reportDirectory !== undefined && !projectPath(config.reportDirectory)) throw new Error('Invalid reportDirectory');
  if (config.largeDiff !== undefined) {
    if (!config.largeDiff || typeof config.largeDiff !== 'object' || Array.isArray(config.largeDiff)
      || Object.keys(config.largeDiff).some(k => !['files', 'lines'].includes(k))
      || Object.values(config.largeDiff).some(n => !Number.isInteger(n) || n < 1)) throw new Error('Invalid largeDiff thresholds');
  }
  for (const key of ['paths', 'fileTypes']) {
    if (config[key] === undefined) continue;
    if (!Array.isArray(config[key])) throw new Error(`${key} must be an array`);
    for (const rule of config[key]) {
      const selector = key === 'paths' ? 'pattern' : 'extension';
      if (!rule || Object.keys(rule).some(k => ![selector, 'class', 'seats'].includes(k))
        || typeof rule[selector] !== 'string' || !rule[selector]
        || (key === 'paths' && !projectPath(rule.pattern))
        || (key === 'fileTypes' && !/^\.[a-zA-Z0-9.]+$/.test(rule.extension))
        || !classes.includes(rule.class) || !Array.isArray(rule.seats) || !rule.seats.length
        || rule.seats.some(s => s !== 'design' && !seats.includes(s))) throw new Error(`Invalid ${key} mapping`);
      // Older project mappings keep their floor while moving to rendered seats.
      rule.seats = [...new Set(rule.seats.flatMap(s => s === 'design' ? ['visual-craft', 'fidelity', 'content-stress', 'motion'] : [s]))];
    }
  }
  return config;
}

function projectPath(p) {
  return typeof p === 'string' && p.length > 0 && !/^(?:\/|[a-z]:)|\\|\0/i.test(p) && !p.split('/').includes('..');
}

function manifestKind(path) {
  const name = posix.basename(path);
  if (name === 'package.json') return 'npm';
  if (name === 'composer.json') return 'composer';
  if (/^(?:Cargo|pyproject|Pipfile)\.toml$/.test(name) || name === 'Pipfile') return 'toml';
  if (/^requirements[^/]*\.txt$/.test(name)) return 'requirements';
  if (name === 'go.mod') return 'go';
  if (name === 'Gemfile' || name.endsWith('.gemspec')) return 'ruby';
  if (name === 'pom.xml' || name.endsWith('.csproj')) return 'xml';
  if (/^build\.gradle(?:\.kts)?$/.test(name)) return 'gradle';
  if (/^(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum|packages\.lock\.json)$/.test(name)) return 'lock';
  return null;
}

// Compare dependency declarations rather than arbitrary metadata in manifests.
function dependencies(text, kind) {
  if (!text) return new Map();
  if (kind === 'npm' || kind === 'composer') {
    const object = JSON.parse(text);
    const groups = kind === 'npm'
      ? ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides', 'resolutions']
      : ['require', 'require-dev'];
    return new Map(groups.flatMap(group => Object.entries(object[group] ?? {}).map(([name, version]) => [group + ':' + name, JSON.stringify(version)])));
  }
  const records = [];
  let section = '', block = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    if (kind === 'toml') {
      if (/^\[/.test(line)) section = line;
      if (/dependencies|packages|dependency-groups/.test(section)) records.push(section + line);
      else if (/^(?:dependencies|optional-dependencies)\s*=/.test(line)) {
        records.push(section + line); block = !line.endsWith(']');
      } else if (block) { records.push(line); if (line.endsWith(']')) block = false; }
    } else if (kind === 'go') {
      if (/^require\s*\(/.test(line)) block = true;
      else if (line === ')') block = false;
      else if (block || /^require\s/.test(line)) records.push(line);
    } else if (kind === 'requirements' || kind === 'ruby' && /\b(?:gem|add_(?:development_)?dependency)\b/.test(line)
      || kind === 'gradle' && /\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation|classpath)\b/.test(line)) records.push(line);
  }
  if (kind === 'xml') records.push(...(text.match(/<dependency\b[\s\S]*?<\/dependency>|<PackageReference\b[^>]*(?:\/>|>[\s\S]*?<\/PackageReference>)/g) ?? []).map(s => s.replace(/\s+/g, ' ')));
  return new Map(records.map(line => [line, line]));
}

export function diffSignals(cwd, base, revision) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const commit = ref => {
    if (typeof ref !== 'string' || !ref || ref.startsWith('-')) throw new Error('Expected a base and revision');
    return git(root, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}']).trim();
  };
  const baseId = commit(base), revisionId = commit(revision);
  const blob = (ref, path) => {
    // ls-tree distinguishes a missing file from a failed Git command.
    if (!git(root, ['ls-tree', '-z', ref, '--', path])) return null;
    return git(root, ['show', `${ref}:${path}`]);
  };
  const configText = blob(baseId, '.jig/review.json');
  const config = { paths: defaultPaths, ...validateConfig(configText === null ? {} : JSON.parse(configText)) };
  const required = new Set(), signals = [], files = [];
  let minimumClass = 'trivial';
  const add = (id, path, floor, requiredSeats, reason, details) => {
    minimumClass = maxClass(minimumClass, floor);
    requiredSeats.forEach(s => required.add(s));
    const signal = { id, path, minimumClass: floor, seats: requiredSeats, reason };
    if (details) signal.details = details;
    signals.push(signal);
    return signal;
  };
  // No rename heuristics: both sides of a move retain their path-based signals.
  const stats = git(root, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', '-z', baseId, revisionId, '--']);
  for (const record of stats.split('\0').filter(Boolean)) {
    const match = record.match(/^([^\t]+)\t([^\t]+)\t([\s\S]+)$/);
    if (!match) throw new Error('Unexpected git numstat output');
    const [, plus, minus, path] = match;
    const binary = plus === '-';
    const size = { additions: binary ? null : Number(plus), deletions: binary ? null : Number(minus), changedLines: binary ? null : Number(plus) + Number(minus), binary };
    const file = { path, size, signals: [] };
    files.push(file);
    const emit = (...args) => file.signals.push(add(args[0], path, ...args.slice(1)));
    for (const rule of config.paths ?? []) if (glob(rule.pattern, path)) emit('path', rule.class, rule.seats, `Path matches ${rule.pattern}`);
    for (const rule of config.fileTypes ?? []) if (path.toLowerCase().endsWith(rule.extension.toLowerCase())) emit('file-type', rule.class, rule.seats, `File type matches ${rule.extension}`);
    if (/(?:^|\/)(?:migrations?|schema)(?:[/.]|$)|\.sql$|schema\.prisma$/i.test(path)) emit('migration', 'risky', ['architecture', 'qa'], 'Data schema or migration changed');
    const patch = binary ? '' : git(root, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--output-indicator-new=+', '--output-indicator-old=-', '--unified=0', baseId, revisionId, '--', path]);
    const changed = patch.split('\n').filter(line => /^[+-](?![+-])/.test(line)).map(line => line.slice(1)).join('\n');
    if (/(?:^|[\/_.-])(?:auth(?:entication|orization)?|permissions?|rbac|acl|oauth|sessions?|login|logout|credentials?|passwords?|access-control)(?:[\/_.-]|$)/i.test(path)
      || /\b(?:authorize|authenticate|checkPermission|hasPermission|requireRole|isAdmin|access_token|jwt\.verify)\b|\.permissions?\b/i.test(changed)) emit('auth', 'risky', ['security', 'qa'], 'Authentication or permission path/code changed');
    if (/\b(?:mutex|semaphore|compareExchange|Atomics|synchronized|FOR UPDATE)\b/i.test(changed)) emit('concurrency', 'risky', ['architecture', 'qa'], 'Concurrency primitive changed');
    if (/\.(?:jsx|tsx|vue|svelte|html|css|scss|sass|less)$/i.test(path)) emit('ui', 'behaviour', ['visual-craft', 'fidelity', 'content-stress', 'motion', 'accessibility', 'qa'], 'UI file changed; motion seat may record no changed motion with evidence');
    if (path.startsWith('.agents/skills/')) emit('skill', 'refactor', ['architecture', 'qa'], 'Skill source or supporting file changed');
    if (path === '.jig/review.json') emit('review-config', 'risky', ['architecture'], 'Review policy changed; base policy still supplies this floor');
    const kind = manifestKind(path);
    if (kind) {
      const before = blob(baseId, path), after = blob(revisionId, path);
      let changes = [], uncertain = kind === 'lock';
      if (!uncertain) {
        try {
          const a = dependencies(before, kind), b = dependencies(after, kind);
          changes = [...new Set([...a.keys(), ...b.keys()])].filter(k => a.get(k) !== b.get(k)).map(name => ({ name, before: a.get(name) ?? null, after: b.get(name) ?? null }));
        } catch { uncertain = true; }
      }
      if (uncertain || changes.length) {
        const patchOnly = kind === 'npm' && !uncertain && changes.every(c => {
          const a = /^"(\d+)\.(\d+)\.(\d+)"$/.exec(c.before ?? '');
          const b = /^"(\d+)\.(\d+)\.(\d+)"$/.exec(c.after ?? '');
          return a && b && a[1] === b[1] && a[2] === b[2] && Number(b[3]) > Number(a[3]);
        });
        emit('dependency', patchOnly ? 'mechanical' : 'risky', ['security', 'architecture'],
          patchOnly ? 'Exact patch dependency bump' : uncertain ? 'Lockfile or unreadable manifest changed; inspect dependency delta' : 'New, removed or changed dependency declaration', changes);
      }
    }
  }
  const lines = files.reduce((sum, f) => sum + (f.size.changedLines ?? 0), 0);
  const limits = { files: 30, lines: 1000, ...config.largeDiff };
  if (files.length >= limits.files || lines >= limits.lines) add('large-diff', null, 'risky', ['architecture', 'qa'], `Diff meets ${limits.files}-file or ${limits.lines}-line threshold`);
  return { base: baseId, revision: revisionId, configuration: { source: configText === null ? 'defaults' : 'base:.jig/review.json', ...config }, files, signals, minimumClass, requiredSeats: seats.filter(s => required.has(s)) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [base, revision, ...extra] = process.argv.slice(2);
    if (!base || !revision || extra.length) throw new Error('Usage: node diff-signals.mjs <base> <revision> (from the project repository)');
    console.log(JSON.stringify(diffSignals(process.cwd(), base, revision), null, 2));
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Invalid JSON in review configuration' : error.status !== undefined ? 'Git could not read the repository, revisions or diff' : error.message);
    process.exitCode = 1;
  }
}
