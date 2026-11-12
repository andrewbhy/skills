import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { acquireBrowserSlot, browserSlotsBusy, checkMemory, readBrowserConfig, ResourceGuardError } from './resource-guard.mjs';
import { addSignal } from './signals.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { docsPath, statePath, resolveStateRef } from './jig-store.mjs';

const nonempty = v => typeof v === 'string' && v.trim().length > 0 && !/[\r\n\0]/.test(v);
const positive = v => Number.isFinite(v) && v > 0;
const completed = item => ['done', 'review'].includes(item?.state);
const states = ['pending', 'starting', 'running', 'done', 'failed', 'stopped', 'review', 'parked'];
const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function queuePath(root = process.env.JIG_QUEUE_ROOT || process.cwd()) { return statePath(resolve(root), 'queue.json'); }
export function withQueueLock(path, action) {
  mkdirSync(dirname(path), { recursive: true });
  let fd;
  try { fd = openSync(`${path}.lock`, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw Object.assign(Error('Queue lock busy'), { exitCode: 2 }); throw error; }
  try { return action(); }
  finally { closeSync(fd); unlinkSync(`${path}.lock`); }
}
export function validateProgress(p) {
  if (!p || p.version !== 1 || !timestamp(p.startedAt) || !timestamp(p.updatedAt) || Date.parse(p.updatedAt) < Date.parse(p.startedAt) || !positive(p.timeboxMinutes)
    || !Array.isArray(p.steps) || !p.steps.length || p.steps.some(s => !s || !nonempty(s.label) || typeof s.done !== 'boolean')) throw Error('Invalid progress: require version, timestamps, timeboxMinutes and steps');
  if (p.result !== undefined && (!p.result || !['passed', 'failed', 'stopped', 'incomplete'].includes(p.result.outcome) || typeof p.result.complete !== 'boolean')) throw Error('Invalid progress result');
  return p;
}
export function validateQueue(q) {
  if (!q || q.version !== 1 || !Array.isArray(q.items)) throw Error('Invalid queue version or items');
  const ids = new Set();
  for (const item of q.items) {
    if (!item || !['id', 'item', 'plan', 'worktree', 'provider', 'area'].every(k => nonempty(item[k])) || ids.has(item.id)
      || !states.includes(item.state) || !Array.isArray(item.dependsOn) || item.dependsOn.some(id => !nonempty(id))
      || !Array.isArray(item.touches) || !item.touches.length || item.touches.some(p => !nonempty(p))) throw Error('Invalid queue item or duplicate id');
    if (item.waitsFor !== undefined && (!Array.isArray(item.waitsFor) || item.waitsFor.some(v => !nonempty(v)))) throw Error('Invalid waitsFor');
    if (item.progressFile !== undefined && !nonempty(item.progressFile)) throw Error('Invalid progressFile');
    if (item.browser !== undefined && typeof item.browser !== 'boolean') throw Error('Invalid browser flag');
    if (item.nextDecision !== undefined && typeof item.nextDecision !== 'boolean') throw Error('Invalid nextDecision flag');
    if (item.state === 'starting' && (!nonempty(item.reservationId) || !nonempty(item.progressFile))) throw Error('Starting job needs reservation and progress file');
    if (item.state === 'running' && (!nonempty(item.taskId) || !nonempty(item.progressFile))) throw Error('Running job needs tracked task and progress file');
    ids.add(item.id);
  }
  for (const item of q.items) if (item.dependsOn.some(id => !ids.has(id) || id === item.id)) throw Error('Unknown or self dependency');
  const visit = (id, stack = new Set()) => {
    if (stack.has(id)) throw Error('Dependency cycle');
    for (const dep of q.items.find(i => i.id === id).dependsOn) visit(dep, new Set([...stack, id]));
  };
  for (const id of ids) visit(id);
  return q;
}
export function readQueue(root) {
  try { return validateQueue(JSON.parse(readFileSync(queuePath(root), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, items: [] }; throw error; }
}
export function updateQueue(root, action) {
  const path = queuePath(root);
  return withQueueLock(path, () => {
    const q = readQueue(root), result = action(q);
    validateQueue(q);
    const temp = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temp, JSON.stringify(q, null, 2) + '\n', { mode: 0o600 }); renameSync(temp, path); }
    finally { if (existsSync(temp)) unlinkSync(temp); }
    return result;
  });
}
export function addItem(root, input) {
  return updateQueue(root, q => {
    const item = { dependsOn: [], state: 'pending', ...input };
    if (item.state !== 'pending') throw Error('Add only pending jobs');
    q.items.push(item); return item;
  });
}
export function readyItems(q) { return q.items.filter(i => i.state === 'pending' && i.dependsOn.every(id => completed(q.items.find(d => d.id === id)))); }
export function readProgress(root, item) {
  if (!item.progressFile) throw Error('Missing progress file');
  return validateProgress(JSON.parse(readFileSync(resolveStateRef(root, item.progressFile), 'utf8')));
}
export function progressSummary(p, now = Date.now()) {
  validateProgress(p);
  const done = p.steps.filter(s => s.done).length, total = p.steps.length;
  const finished = p.result !== undefined;
  const elapsed = Math.max(0, ((finished ? Date.parse(p.updatedAt) : now) - Date.parse(p.startedAt)) / 60000);
  const success = p.result?.outcome === 'passed' && p.result.complete && done === total;
  return { done, total, elapsed, stale: !finished && now - Date.parse(p.updatedAt) >= 600000,
    overTimebox: !finished && elapsed > p.timeboxMinutes, finished, success,
    failed: finished && !success, timeboxMinutes: p.timeboxMinutes };
}
export function presentationReasons(item, feedback = []) {
  const evidence = item.evidence;
  const reasons = [];
  for (const key of ['gate', 'reviewer', 'presentation']) if (evidence?.[key]?.passed !== true || !nonempty(evidence[key].by) || !nonempty(evidence[key].revision) || evidence[key].revision !== item.revision) reasons.push(`${key} pending`);
  if (!nonempty(item.revision) || evidence?.reviewer?.by === item.builder || evidence?.reviewer?.by === item.coordinator) reasons.push('fresh reviewer required');
  if (feedback.some(f => f.item === item.id && f.state !== 'closed')) reasons.push('open feedback');
  return reasons;
}
export function readFeedback(root) {
  try {
    const ledger = JSON.parse(readFileSync(statePath(root, 'feedback.json'), 'utf8'));
    if (ledger.version !== 1 || !Array.isArray(ledger.items) || ledger.items.some(f => !nonempty(f.item) || !['open', 'closed'].includes(f.state))) throw Error('Invalid feedback ledger');
    return ledger.items;
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export function statusLines(root, { now = Date.now(), feedback = [] } = {}) {
  root = resolve(root || process.env.JIG_QUEUE_ROOT || process.cwd());
  const q = readQueue(root), context = schedulingContext(root);
  feedback = [...readFeedback(root), ...feedback];
  return q.items.map(item => {
    const flags = [], waits = [];
    let bar = '[----------] 0/?', elapsed = '?/?m';
    if (item.progressFile) {
      try {
        const s = progressSummary(readProgress(root, item), now), n = Math.round(s.done / s.total * 10);
        bar = `[${'#'.repeat(n)}${'-'.repeat(10 - n)}] ${s.done}/${s.total}`; elapsed = `${s.elapsed.toFixed(1)}/${s.timeboxMinutes}m`;
        if (s.stale) flags.push('STALE: wait, stop or re-plan');
        if (s.overTimebox) flags.push('OVER-TIMEBOX: wait, stop or re-plan');
        if (s.failed || item.state === 'done' && !s.success) flags.push('FAILED (incomplete or stopped)');
        if (s.success && item.state === 'running') flags.push('FINISHED: reconcile result');
      } catch (error) { flags.push(`PROGRESS GAP: ${error.message}`); }
    } else if (['starting', 'running', 'done', 'review'].includes(item.state)) flags.push('PROGRESS GAP');
    for (const dep of item.dependsOn) if (!completed(q.items.find(i => i.id === dep))) waits.push(`dependency ${dep}`);
    if (item.waitsFor && item.state !== 'pending') waits.push(...item.waitsFor);
    if (item.state === 'pending') waits.push(...hardGates(q, item, [], context).filter(r => !r.startsWith('dependency ')));
    if (item.state === 'review') waits.push(...presentationReasons(item, feedback));
    if (item.state === 'stopped') waits.push('person decision / re-plan');
    const dependents = q.items.filter(i => i.state === 'pending' && i.dependsOn.includes(item.id)).map(i => i.id);
    return `${item.id} ${bar} ${elapsed} ${item.state}${flags.length ? ' ' + flags.join('; ') : ''}${waits.length ? ' waits: ' + waits.join(', ') : ''}${dependents.length ? ' unblocks: ' + dependents.join(', ') : ''}`;
  });
}
export function reserveJob(root, id, { progressFile, context } = {}) {
  if (!nonempty(progressFile)) throw Error('Progress file and timebox required before launch');
  return updateQueue(root, q => {
    const item = q.items.find(i => i.id === id);
    if (!item || !readyItems(q).includes(item)) throw Error('Job is not ready');
    const reasons = hardGates(q, item, [], schedulingContext(root, context));
    if (reasons.length) throw Error(reasons.join(', '));
    const p = readProgress(root, { progressFile });
    if (p.result || p.steps.some(s => s.done)) throw Error('Launch requires fresh progress');
    Object.assign(item, { state: 'starting', reservationId: randomUUID(), progressFile }); return item;
  });
}
export function launchJob(root, id, { taskId, reservationId } = {}) {
  if (!nonempty(taskId) || !nonempty(reservationId)) throw Error('Tracked taskId and reservationId required; detached launch refused');
  return updateQueue(root, q => {
    const item = q.items.find(i => i.id === id);
    if (!item || item.state !== 'starting' || item.reservationId !== reservationId) throw Error('Launch requires matching reservation');
    Object.assign(item, { state: 'running', taskId }); delete item.reservationId; return item;
  });
}
export function finishJob(root, id) {
  return updateQueue(root, q => {
    const item = q.items.find(i => i.id === id);
    if (!item || item.state !== 'running') throw Error('Job is not running');
    const summary = progressSummary(readProgress(root, item));
    if (!summary.finished) throw Error('Result missing; incomplete is not done');
    item.state = summary.success ? 'done' : 'failed'; return item;
  });
}
export function markReview(root, id, { evidence, revision, builder, coordinator, feedback = [] }) {
  return updateQueue(root, q => {
    const item = q.items.find(i => i.id === id);
    if (!item || item.state !== 'done' || !progressSummary(readProgress(root, item)).success) throw Error('Only complete passed work can be presented');
    if (!nonempty(builder) || !nonempty(coordinator)) throw Error('Builder and coordinator identities required');
    const candidate = { ...item, evidence, revision, builder, coordinator };
    const reasons = presentationReasons(candidate, [...readFeedback(root), ...feedback]);
    if (reasons.length) throw Error(reasons.join(', '));
    Object.assign(item, candidate, { state: 'review' }); return item;
  });
}
export function availableProviders(env = process.env) {
  const extensions = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  return ['codex', 'claude'].filter(name => (env.PATH || '').split(delimiter).filter(Boolean).some(dir => extensions.some(ext => existsSync(join(dir, name + ext.toLowerCase())) || existsSync(join(dir, name + ext.toUpperCase())))));
}
export function schedulingContext(root, overrides = {}) {
  let config = {};
  try { config = JSON.parse(readFileSync(statePath(root, 'config.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const settings = config.orchestration ?? {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('Invalid orchestration settings');
  const concurrency = settings.concurrency ?? 1, providers = settings.providers ?? availableProviders();
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || !Array.isArray(providers) || providers.some(p => !nonempty(p))) throw Error('Invalid orchestration concurrency/providers');
  let incidents = [];
  try { incidents = readFileSync(docsPath(root, 'docs/missed-problems.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const browserConfig = readBrowserConfig(root);
  return { root: resolve(root), concurrency, providers, incidents, browserConfig, browserBusy: browserSlotsBusy(browserConfig), ...overrides };
}
function pathsOverlap(a, b) {
  // Touches may be files, directories or globs; unknown glob suffixes reserve
  // their whole prefix. False positives serialize work rather than risk a clash.
  const canonical = p => {
    const prefix = p.replaceAll('\\', '/').split(/[?*[]/)[0].replace(/\/$/, '');
    let absolute = resolve(prefix), suffix = [];
    while (true) {
      try { absolute = join(realpathSync(absolute), ...suffix); break; }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const parent = dirname(absolute);
        if (parent === absolute) break;
        suffix.unshift(basename(absolute)); absolute = parent;
      }
    }
    const result = absolute.replaceAll('\\', '/');
    return process.platform === 'win32' ? result.toLowerCase() : result;
  };
  a = canonical(a); b = canonical(b);
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}
export function overlap(a, b) {
  if (pathsOverlap(a.worktree, b.worktree)) return 'worktree overlap';
  for (const p of a.touches) for (const r of b.touches) if (pathsOverlap(resolve(a.worktree, p), resolve(b.worktree, r))) return 'file overlap';
  return undefined;
}
function repeatBlock(item, context) {
  const area = context.incidents.filter(i => i.area === item.area && i.class);
  return area.some(i => area.filter(j => j.class === i.class).length > 1 && (!i.ruleReview || !existsSync(resolve(context.root, i.ruleReview)) || !readFileSync(resolve(context.root, i.ruleReview), 'utf8').includes(i.id)));
}
export function hardGates(q, item, reserved, context) {
  const reasons = [...(item.waitsFor ?? [])];
  if (item.state !== 'pending') reasons.push(`state ${item.state}`);
  for (const dep of item.dependsOn) if (!completed(q.items.find(i => i.id === dep))) reasons.push(`dependency ${dep}`);
  if (!context.providers.includes(item.provider)) reasons.push(`provider ${item.provider} unavailable`);
  const active = [...q.items.filter(i => ['starting', 'running'].includes(i.state)), ...reserved];
  if (active.length >= context.concurrency) reasons.push('concurrency cap');
  for (const other of active) { const conflict = overlap({ ...item, worktree: resolve(context.root, item.worktree) }, { ...other, worktree: resolve(context.root, other.worktree) }); if (conflict) reasons.push(`${conflict}: ${other.id}`); }
  if (repeatBlock(item, context)) reasons.push('repeat missed problem: rule review required');
  try { checkMemory({ ...context.browserConfig, ...(context.freeBytes === undefined ? {} : { freeBytes: context.freeBytes }) }); }
  catch (error) { if (!(error instanceof ResourceGuardError)) throw error; reasons.push(error.message); }
  if (item.browser) {
    const held = active.filter(i => i.browser).length;
    if (held >= context.browserConfig.slots) reasons.push('browser slot reserved');
    if (context.browserBusy) reasons.push('browser slot busy');
  }
  return reasons;
}
export function criticalPathOrder(q) {
  const descendants = id => {
    const children = q.items.filter(i => i.dependsOn.includes(id) && i.state === 'pending');
    return children.flatMap(i => [i, ...descendants(i.id)]);
  };
  const distance = id => {
    const children = q.items.filter(i => i.dependsOn.includes(id) && i.state === 'pending');
    return children.length ? 1 + Math.max(...children.map(i => distance(i.id))) : 0;
  };
  const decisionIndex = item => Math.min(...[item, ...descendants(item.id)].filter(i => i.nextDecision).map(i => q.items.indexOf(i)), Infinity);
  return q.items.filter(i => i.state === 'pending').sort((a, b) => {
    const da = decisionIndex(a), db = decisionIndex(b);
    return (da === db ? 0 : da < db ? -1 : 1) || distance(b.id) - distance(a.id) || q.items.indexOf(a) - q.items.indexOf(b);
  });
}
export async function suggest(root, overrides) {
  const q = readQueue(root), context = schedulingContext(root, overrides);
  const selected = [], waiting = [];
  let resourceBlocked = false;
  for (const item of criticalPathOrder(q)) {
    const reasons = hardGates(q, item, selected, context);
    if (item.browser && !reasons.length) {
      try { const release = await (context.acquireBrowserSlot ?? acquireBrowserSlot)(context.browserConfig); release(); }
      catch (error) { if (!(error instanceof ResourceGuardError)) throw error; reasons.push(error.message); }
    }
    if (reasons.some(r => /^(memory:|slots:|browser slot)/.test(r))) resourceBlocked = true;
    if (reasons.length) waiting.push({ id: item.id, reasons });
    else selected.push({ ...item, reason: 'hard gates pass; critical path to next decision' });
  }
  return { selected, waiting, resourceBlocked };
}
export const triggers = ['job-finished', 'plan-check-ok', 'merge-landed', 'memory-available', 'person-answered'];
export async function dispatchReady(root, trigger, { launch, prepare = item => item.progressFile, context } = {}) {
  if (!triggers.includes(trigger) || typeof launch !== 'function') throw Error('Known trigger and tracked launcher required');
  const proposals = await suggest(root, context), lines = [];
  for (const item of proposals.selected) {
    const progressFile = await prepare(item);
    // Reserve under the queue lock before invoking the external tracked tool.
    // Competing coordinators therefore cannot start work in the same worktree.
    const reservation = reserveJob(root, item.id, { progressFile, context });
    const receipt = await launch(reservation);
    try { launchJob(root, item.id, { ...receipt, reservationId: reservation.reservationId }); }
    catch (error) { await receipt?.stop?.(); throw error; }
    lines.push(`${item.id}: launched (${trigger}); ${item.reason}`);
  }
  return { lines, waiting: proposals.waiting };
}
export function recordFailure(root, id, kind, { caughtBy, ownErrorShare, home } = {}) {
  if (!['gate', 'review'].includes(kind) || !nonempty(caughtBy) || !['none', 'part', 'all'].includes(ownErrorShare)) throw Error('Failure needs gate/review, caughtBy and ownErrorShare');
  return updateQueue(root, q => {
    const item = q.items.find(i => i.id === id);
    if (!item || item.state === 'stopped') throw Error('Unknown or stopped slice');
    item.failures = (item.failures ?? 0) + 1;
    item.state = item.failures >= 2 ? 'stopped' : 'failed';
    if (item.failures >= 2) {
      const signal = addSignal({ project: 'queue', level: 'project', kind: 'escalation', area: item.area, item: item.id, caughtBy, ownErrorShare, planLink: item.plan }, { root, ...(home ? { home } : {}) });
      item.escalation = signal.id;
    }
    return item;
  });
}
export function checkApply(q, { action, baseHead, head, testsPassed, claims = [], changedFiles = [] }) {
  const reasons = [];
  if (action === 'sync' && q.items.some(i => ['starting', 'running'].includes(i.state))) reasons.push('No sync while jobs run');
  if (action === 'patch' && (!nonempty(head) || baseHead !== head)) reasons.push('Patch must be built against HEAD');
  if (action === 'commit') {
    if (testsPassed !== true) reasons.push('Tests must pass before commit');
    for (const file of claims) if (!changedFiles.includes(file)) reasons.push(`Unsupported commit claim: ${file}`);
  }
  if (!['sync', 'patch', 'commit'].includes(action)) reasons.push('Unknown apply action');
  if (reasons.length) throw Error(reasons.join('; '));
  return true;
}
export function checkReply({ questions = [], reviewLists = [], text = '' }) {
  if (!Array.isArray(questions) || questions.length > 1) throw Error('At most one question per reply');
  for (const q of questions) if (!nonempty(q.prompt) || !Array.isArray(q.choices) || q.choices.length < 2 || !q.choices.includes(q.recommendation)) throw Error('Question needs choices and recommendation');
  if (!Array.isArray(reviewLists) || reviewLists.some(list => !Array.isArray(list) || list.some(i => !nonempty(i.label) || !nonempty(i.link)))) throw Error('Review items need labels and links');
  const seen = new Set(), items = reviewLists.flat().filter(i => { if (seen.has(i.link)) return false; seen.add(i.link); return true; });
  return [items.length ? 'Needs your review\n' + items.map(i => `- [${i.label}](${i.link})`).join('\n') : '', text,
    ...questions.map(q => `${q.prompt}\n${q.choices.join(' / ')}; recommended: ${q.recommendation}`)].filter(Boolean).join('\n\n');
}
export function reportDuty(root, { duty, owner, misguided, skill, what, proposedFix, home }) {
  if (owner && !misguided) return { line: `${duty}: ${owner}` };
  if (![duty, skill, proposedFix].every(nonempty) || misguided && !nonempty(what)) throw Error('Signal requires duty, skill, proposedFix and misguided evidence');
  const kind = misguided ? 'skill-misguided' : 'skill-gap';
  const signal = addSignal({ project: 'queue', level: 'project', kind, area: 'orchestration', item: duty, caughtBy: 'coordinator', skill, proposedFix, ...(what ? { what } : {}) }, { root, ...(home ? { home } : {}) });
  return { signal, line: misguided ? `Skill misguided: ${skill}: ${what}; proposed fix: ${proposedFix}` : `Not covered by a skill: ${duty}` };
}

export async function followStatus(root, { now = Date.now, intervalMs = 1000, signal, emit = line => console.log(line), wait = sleep } = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 20) throw Error('follow interval must be at least 20ms');
  let previous;
  while (!signal?.aborted) {
    const current = statusLines(root, { now: now() }).join('\n') || '(queue empty)';
    if (current !== previous) { emit(current); previous = current; }
    try { await wait(intervalMs, undefined, { signal }); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
  }
}
export async function queueCLI(argv) {
  let root = process.env.JIG_QUEUE_ROOT || process.cwd();
  const args = [...argv];
  const pos = args.indexOf('--root');
  if (pos >= 0) { if (!args[pos + 1]) throw Error('--root needs a path'); root = resolve(args[pos + 1]); args.splice(pos, 2); }
  const [command, ...rest] = args;
  if (command === 'add' && rest.length === 2 && rest[0] === '--file') return { text: JSON.stringify(addItem(root, JSON.parse(readFileSync(resolve(root, rest[1]), 'utf8')))), code: 0 };
  if (command === 'add' && rest.length === 1) return { text: JSON.stringify(addItem(root, JSON.parse(rest[0]))), code: 0 };
  if (command === 'ready' && !rest.length) return { text: readyItems(readQueue(root)).map(i => i.id).join('\n'), code: 0 };
  if (command === 'status' && rest[0] === '--follow' && (rest.length === 1 || rest.length === 3 && rest[1] === '--interval-ms')) {
    const controller = new AbortController(), stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try { await followStatus(root, { signal: controller.signal, intervalMs: rest.length === 3 ? Number(rest[2]) : 1000 }); }
    finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
    return { text: '', code: 0 };
  }
  if (command === 'status' && !rest.length) return { text: statusLines(root).join('\n'), code: 0 };
  if (command === 'suggest' && !rest.length) {
    const result = await suggest(root);
    return { text: [...result.selected.map(i => `${i.id}: ready; ${i.reason}`), ...result.waiting.map(i => `${i.id}: waits: ${i.reasons.join(', ')}`)].join('\n'), code: result.selected.length ? 0 : result.resourceBlocked ? 2 : 3 };
  }
  if (command === 'reserve' && rest.length === 2) return { text: JSON.stringify(reserveJob(root, rest[0], JSON.parse(rest[1]))), code: 0 };
  if (command === 'launch' && rest.length === 2) return { text: JSON.stringify(launchJob(root, rest[0], JSON.parse(rest[1]))), code: 0 };
  if (command === 'finish' && rest.length === 1) return { text: JSON.stringify(finishJob(root, rest[0])), code: 0 };
  throw Error('Usage: queue.mjs [--root DIR] add JSON | ready | suggest | status [--follow] | reserve ID JSON | launch ID JSON | finish ID');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { const result = await queueCLI(process.argv.slice(2)); if (result.text) console.log(result.text); process.exitCode = result.code; }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
