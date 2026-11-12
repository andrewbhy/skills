// Move personal jig state from repos' .jig/ folders into the personal store (~/.jig/<project>/).
// Safe by construction: dry run by default; --apply only COPIES, verifies every copy by hash, writes projects.json,
// and prints the removal commands. It never deletes or edits anything in a repo.
// Usage: node scripts/jig-migrate-state.mjs --project <name>=<repo> [--project ...] [--home <dir>] [--apply]
// Without --project it migrates the current folder under its folder name. Repeat after a first run to pick up lines
// agents appended meanwhile: a jsonl file whose copy is a prefix of the source is refreshed; any other difference is a conflict.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectsMap, repoOwned, storeRoot } from './jig-store.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const slash = (p) => p.split(sep).join('/');
const transient = (name) => name.endsWith('.lock') || name.endsWith('.tmp') || name.endsWith('.lockdir');

function trackedFiles(repo) {
  const r = spawnSync('git', ['-C', repo, 'ls-files', '-z', '--', '.jig'], { encoding: 'utf8' });
  return new Set(r.status === 0 ? r.stdout.split('\0').filter(Boolean) : []);
}
function walk(dir, base, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (!transient(e.name)) walk(full, base, out); }
    else if (e.isFile() && !transient(e.name)) out.push(slash(relative(base, full)));
  }
  return out;
}

// review-roots.json names the queue file by absolute path; follow it to the new place.
function transform(rel, buf, { oldDir, newDir }) {
  if (rel !== 'review-roots.json') return { buf };
  try {
    const data = JSON.parse(buf.toString('utf8'));
    if (typeof data.queue === 'string' && resolve(data.queue).toLowerCase().startsWith(resolve(oldDir).toLowerCase())) {
      const moved = join(newDir, relative(resolve(oldDir), resolve(data.queue)));
      return { buf: Buffer.from(JSON.stringify({ ...data, queue: moved.split(sep).join('/') }, null, 2) + '\n'), note: `queue path rewritten to ${slash(moved)}` };
    }
  } catch { /* copied unchanged */ }
  return { buf };
}

export function planMigration({ project, repo }, home) {
  const oldDir = join(resolve(repo), '.jig'); const newDir = join(resolve(home), project);
  const result = { project, repo: resolve(repo), oldDir, newDir, copy: [], same: [], refresh: [], conflicts: [], stays: [], rewrites: [], bytes: 0 };
  if (!existsSync(oldDir)) return { ...result, missing: true };
  const tracked = trackedFiles(resolve(repo));
  for (const rel of walk(oldDir, oldDir).sort()) {
    if (tracked.has(`.jig/${rel}`) || repoOwned.includes(rel)) { result.stays.push(rel); continue; }
    const src = join(oldDir, rel); const dest = join(newDir, rel);
    const raw = readFileSync(src);
    const { buf, note } = transform(rel, raw, { oldDir, newDir });
    const item = { rel, src, dest, bytes: buf.length, hash: sha(buf), buf };
    if (note) result.rewrites.push(`${rel}: ${note}`);
    if (!existsSync(dest)) { result.copy.push(item); result.bytes += buf.length; continue; }
    const have = readFileSync(dest);
    if (sha(have) === item.hash) result.same.push(item);
    else if (rel.endsWith('.jsonl') && buf.length > have.length && buf.subarray(0, have.length).equals(have)) { result.refresh.push(item); result.bytes += buf.length; }
    else result.conflicts.push(item);
  }
  return result;
}

export function applyMigration(plans, home) {
  const failures = [];
  for (const p of plans) {
    if (p.missing) continue;
    for (const item of [...p.copy, ...p.refresh]) {
      mkdirSync(dirname(item.dest), { recursive: true });
      writeFileSync(item.dest, item.buf);
      if (sha(readFileSync(item.dest)) !== item.hash) failures.push(`${p.project}/${item.rel}: copy does not match`);
    }
    // Verify: everything planned now exists in the store with the planned hash.
    for (const item of [...p.copy, ...p.refresh, ...p.same]) {
      if (!existsSync(item.dest) || sha(readFileSync(item.dest)) !== item.hash) failures.push(`${p.project}/${item.rel}: missing or different after copy`);
    }
  }
  const map = projectsMap(home);
  for (const p of plans) if (!p.missing) map[p.project] = p.repo;
  mkdirSync(resolve(home), { recursive: true });
  writeFileSync(join(resolve(home), 'projects.json'), JSON.stringify(map, null, 2) + '\n');
  return failures;
}

export function removalCommands(plans) {
  const out = [];
  for (const p of plans) {
    if (p.missing || p.conflicts.length) continue;
    const names = new Set([...p.copy, ...p.refresh, ...p.same].map((i) => i.rel.split('/')[0]));
    for (const name of [...names].sort()) out.push(`node -e "require('fs').rmSync(process.argv[1],{recursive:true,force:true})" ${JSON.stringify(join(p.oldDir, name))}`);
  }
  return out;
}

export function report(plans, { apply, failures = [], home }) {
  const lines = [`${apply ? 'APPLY' : 'DRY RUN'}: personal state -> ${resolve(home)}${apply ? '' : ' (nothing written; pass --apply to copy)'}`];
  for (const p of plans) {
    lines.push('', `[${p.project}] ${p.oldDir} -> ${p.newDir}`);
    if (p.missing) { lines.push('  no .jig folder: nothing to move'); continue; }
    const top = (list) => [...new Set(list.map((i) => i.rel.split('/')[0]))].sort().join(', ') || '-';
    lines.push(`  copy: ${p.copy.length} files, ${p.bytes} bytes (${top(p.copy)})`);
    if (p.refresh.length) lines.push(`  refresh (appended since last copy): ${p.refresh.map((i) => i.rel).join(', ')}`);
    lines.push(`  already in the store, identical: ${p.same.length}`);
    for (const c of p.conflicts) lines.push(`  CONFLICT (store copy differs, left alone): ${c.rel}`);
    for (const r of p.rewrites) lines.push(`  rewrite: ${r}`);
    lines.push(`  stays in the repo (the repo's own tooling or tracked): ${p.stays.join(', ') || '-'}`);
  }
  for (const f of failures) lines.push(`VERIFY FAILED: ${f}`);
  if (apply && !failures.length && !plans.some((p) => p.conflicts.length)) {
    lines.push('', 'Copied and verified. Nothing was deleted. After restarting the dashboard and agents on the new code, remove the old copies with:');
    lines.push(...removalCommands(plans).map((c) => '  ' + c));
  } else if (!apply) lines.push('', 'Next: stop writers (dashboard, agents), run with --apply, restart on the new code, then remove the old copies (commands are printed after a verified apply).');
  return lines.join('\n');
}

export function run(argv, { out = console.log } = {}) {
  const specs = []; let home = storeRoot(); let apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') apply = true;
    else if (argv[i] === '--dry-run') apply = false;
    else if (argv[i] === '--home') home = resolve(argv[++i]);
    else if (argv[i] === '--project') {
      const m = String(argv[++i] ?? '').match(/^([A-Za-z0-9][\w.-]*)=(.+)$/);
      if (!m) throw new Error('--project needs <name>=<repo path>');
      specs.push({ project: m[1], repo: m[2] });
    } else throw new Error(`Unknown option ${argv[i]}`);
  }
  if (!home) throw new Error('No store root: set JIG_HOME or pass --home.');
  if (!specs.length) specs.push({ project: basename(process.cwd()), repo: process.cwd() });
  const plans = specs.map((s) => planMigration(s, home));
  const failures = apply ? applyMigration(plans, home) : [];
  out(report(plans, { apply, failures, home }));
  return { plans, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const { plans, failures } = run(process.argv.slice(2), { out: (l) => process.stdout.write(l + '\n') }); process.exitCode = failures.length || plans.some((p) => p.conflicts.length) ? 1 : 0; }
  catch (e) { console.error(e.message); process.exit(1); }
}
