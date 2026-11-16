if (process.argv[2] === '--help') { console.log('Usage: node scripts/review.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Register review material for the local review server.
// Usage: node scripts/review.mjs add <path> --title "..." [--note "..."] [--supersedes <id>] [--depends-on <id|queue-id|qN>]
//   | list [--all] | done <id> | close <id> --reason "<text>" | supersede <old> <new> | progress <queue-id> "<short text>"
//   | reply <id> "<text>" [--to <at>] | thread <id> | watch | threads
//   | decide "<text>" --quote "<exact words>" --source <thread|playtest|qN> --affects <ref>:<kind> [...] [--project <name>] [--answers qN]
//   | decision-void <project>#<id> --reason "<text>"   (append-only: the decision stays listed, struck through, with no impacts)
//   | oq-reset <qN|qN.M>   (an open question answered, replied or deferred on the dashboard becomes open again)
//   | decisions [--project <name>] | import-decisions <seed.json> | park <queue-id> --reason "<text>" | unpark <queue-id>
//   | (queue-set --thread item-<n> links a work item to a review item: one shared thread; --thread "" removes the link)
//   | queue-set <id> --state <new|running|waiting-person|waiting-other|parked|done|superseded> [--item "<text>"] [--waits "<text>"] [--reason "<text>"] [--revisit "<date|trigger>"]
//   | undo   (takes back the last close/done/park/unpark/queue-set within 10 minutes, if the item has not changed since)
//   | queue-add <id> "<text>" [--thread item-<n>] [--state new|running|waiting-person] [--kind spike|build|review|merge] [--provider claude|codex] [--browser] [--gpu] [--waits "<text>"]
//   | queue-item <id> "<text>" | queue-backfill-times [--dry-run] | doctor
// queue-backfill-times: sets updatedAt (marked timeSource "backfill:<decision|thread|progress|snapshot>") on items that have neither addedAt nor updatedAt, from the
//   newest evidence; --dry-run prints the table and writes nothing. Every other command that changes an item stamps updatedAt itself.
// queue-set metadata: --action answer|try|approve|read on waiting-person; on running,
//   --assignee claude|codex[:model] [--job <id>] [--timebox <minutes>]. Session comes from the thread owner.
// queue-set: the only way to change a queue item's state; the move is checked against the state machine (review-states.mjs) and
//   logged in the item's thread. doctor: lists impossible or stale combinations (done with waitsFor, running with old progress, unknown states).
// queue-set naming the state the item is already in is a same-state edit: --waits ("" clears a stale wait), --item, --revisit change that field only, are checked
//   not to change the state, and are logged in the thread.
// park: a parked queue item leaves For you / Your move and shows in the collapsed Parked group with its reason (a waitsFor starting with "parked" counts too).
// decide: record a decision in the personal store (~/.jig/<project>/decisions.jsonl, or JIG_HOME). Kinds: outdates, informs, reopens,
//   confirms, blocks, unblocks. Refs are project-qualified: item-31, app:docs/design/FLOWS.md, jig:queue/<id>, lab:<id>.
//   --affects takes one or more <ref>:<kind> values (repeat the flag or list them). A source or --answers of qN answers open question N.
// add: a path that an open item already points to closes that item as "superseded by #N"; --supersedes names more (comma list).
//   --depends-on (comma list or repeated): the item shows as blocked until each dependency closes. A dependency is a review item id,
//   a queue id, or qN for open question N.
// close / supersede / done: record who closed (coordinator) and why, and write a system line into the item's thread.
// reply: append a coordinator message; --to quotes a person message's timestamp in that thread.
// thread: print a thread's messages, including quoted excerpts.
// watch: prints `<id> | [re: "<excerpt>" | ]<text> [image: <absolute path>]...` per new person message.
//   --once [--thread <id> ...] [--since <cursor>] waits without a deadline for a batch.
//   Owner watches also use --item <id> --owner <session> --generation <n>.
// threads: list threads whose last message is from the person and still has no reply.
// capability-renew: the live holder of JIG_CAPABILITY_FILE extends its credential to 24 h from now (also after expiry); refused for a dead holder, wrong secret or non-holder.
// progress: agents call it at milestones; the review page shows it on the running work row.
import { existsSync, readFileSync } from 'node:fs';
import { identity, openMergeRequests, recordMergeRequest, renewCapability } from './review-capabilities.mjs';
import { branchTip, runMerge } from './review-merge.mjs';
import { claimThread, readOwnership, returnThread } from './review-ownership.mjs';
import { replyReference } from './review-message.mjs';
import { armSessionWatch, beatSession, claimStartedSession, doctorSessions, endReturnedSession, endSession, handoffBlock, modelAction, probeSession, releaseStartedSession, startSession } from './review-sessions.mjs';
import { resolve, join } from 'node:path';
import { projectName, stateDir, waitingRecords } from './jig-store.mjs';
import { layers, towerOff } from './layers.mjs';
import { undoLast, withUndo } from './review-undo.mjs';
import { readDecisions, voidDecision } from './review-decisions.mjs';
import { markQuestionAnswered, questionId, reopenQuestion } from './review-questions.mjs';
import { boardStates } from './review-states.mjs';
import { addWork, doctor, moveWork, reportProgress, setItemText, setParked } from './review-work.mjs';
import { pathToFileURL } from 'node:url';
import { backfillTimes } from './review-backfill.mjs';
import { duplicateGroups, similarOpen } from './review-similar.mjs';
import { projectRoot, messageLine, addItem, appendThread, readThread, recordDecision, closeItem, defaultPort, knownThreadIds, listItems, loadConfig, markDone, supersedeItem, reviewDir, unreadThreads, watchThreads, writeProgress } from './review-core.mjs';

function parse(argv) {
  const flags = {}; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (['all', 'sessions', 'as-person', 'print-monitor-command', 'take-over-stale', 'once', 'no-similar', 'dry-run'].includes(key)) flags[key] = true;
      else if (key === 'browser' || key === 'gpu') flags[key] = true;
      else if (key === 'thread' && argv[0] === 'watch') {
        if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--thread needs a value.');
        (flags.thread ??= []).push(argv[++i]);
      }
      else if (key === 'affects') {
        flags.affects ??= [];
        while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags.affects.push(argv[++i]);
        if (!flags.affects.length) throw new Error('--affects needs <ref>:<kind>.');
      }
      else if (key === 'depends-on' && flags[key] !== undefined && argv[i + 1] !== undefined) flags[key] += ',' + argv[++i];
      else { if (argv[i + 1] === undefined) throw new Error(`--${key} needs a value.`); flags[key] = argv[++i]; }
    } else rest.push(argv[i]);
  }
  return { flags, rest };
}

export function run(argv, { out = console.log } = {}) {
  const { flags, rest } = parse(argv);
  const [command, arg] = rest;
  const tower = layers(projectRoot()).tower;
  if (!tower && !['queue-add', 'queue-set', 'progress', 'doctor'].includes(command)) throw new Error(towerOff);
  if (tower && command !== 'watch' && !(command === 'session' && arg === 'beat')) modelAction();
  if (command === 'session') {
    if (arg === 'start' && waitingRecords(projectRoot())) out(waitingRecords(projectRoot()));
    if (arg === 'probe') return probeSession({ out });
    if (arg === 'start') return startSession(flags, { out });
    const id = flags.session ?? identity().id;
    if (arg === 'beat') { const row = beatSession(id); out(`Heartbeat saved for ${id}.`); return row; }
    if (arg === 'end') { const row = endSession(id); out(`Ended ${id}; Return ownership explicitly with all four handback fields.`); return row; }
    throw new Error('Usage: session start --item <id> --label "..." [--provider claude] | session beat|end [--session <uuid>]');
  }
  if (command === 'capability-renew') {
    const result = renewCapability();
    out(`Capability ${result.id} renewed until ${new Date(result.expiresAt).toISOString()}.`);
    return result;
  }
  if (command === 'merge') return runMerge(arg, flags, { out });
  const config = tower ? loadConfig() : { queue: join(stateDir(projectRoot()), 'queue.json'), roots: [] };
  const port = Number(flags.port ?? process.env.JIG_REVIEW_PORT ?? config.port ?? defaultPort);
  const origin = `http://127.0.0.1:${port}`;
  const project = flags.project ?? projectName(projectRoot());
  const dashProject = flags['dash-project'] ?? projectName(projectRoot()); // the project whose dashboard state (oq-answers.json) is changed
  const undoable = (kind, id, verb, fn) => tower ? withUndo({ kind, id, label: `${verb} ${id}`, queue: config.queue, dir: reviewDir(), project }, fn) : fn();
  if (['claim', 'delegate', 'return', 'release', 'handoff'].includes(command)) {
    if (!knownThreadIds(config.queue).has(arg)) throw new Error('Ownership command needs a known canonical thread.');
    const linked = config.queue && existsSync(config.queue) ? JSON.parse(readFileSync(config.queue, 'utf8')).items?.find(x => x.id === arg)?.thread : null;
    if (linked) throw new Error(`Use canonical thread ${linked}.`);
    if (command === 'claim') return claimStartedSession(arg, flags, { out });
    if (command === 'handoff') { const block = handoffBlock(arg, flags.note); out(block); return block; }
    if (command === 'release') { const row = releaseStartedSession(arg, flags); out(JSON.stringify(row)); return row; }
    const expectedGeneration = flags.generation === undefined ? undefined : Number(flags.generation);
    const previousOwner = command === 'return' ? readOwnership(arg).owner : null;
    const row = command === 'return'
      ? returnThread(arg, { expectedGeneration, done: flags.done, open: flags.open, decisions: flags.decisions, branches: flags.branches, note: flags.note, asPerson: Boolean(flags['as-person']) })
      : claimThread(arg, { expectedGeneration, sessionId: flags.session ?? identity().id, label: flags.label, provider: flags.provider ?? 'claude' });
    if (command === 'return') endReturnedSession(previousOwner?.sessionId);
    out(JSON.stringify(row));
    return row;
  }
  if (command === 'request') {
    if (!knownThreadIds(config.queue).has(flags.item)) throw new Error('Merge request needs a known item.');
    if (flags.needs === 'merge') branchTip(flags.branch);
    const request = recordMergeRequest({ needs: flags.needs, item: flags.item, branch: flags.branch, text: flags.text, generation: readOwnership(flags.item).ownershipGeneration });
    out(`${request.needs} request ${request.id}: ${request.item} ${request.branch ?? request.text}`);
    return request;
  }
  if (command === 'add') {
    if (!arg) throw new Error('Usage: review.mjs add <path> --title "..." [--note "..."] [--supersedes <id>] [--depends-on <ref>]');
    const { item, superseded } = addItem(config.roots, { path: resolve(arg), title: flags.title, note: flags.note, supersedes: flags.supersedes ?? [], dependsOn: flags['depends-on'] ?? [] }, undefined, undefined, { queue: config.queue, openQuestions: config.openQuestions });
    for (const n of superseded) out(`Closed #${n} as superseded by #${item.id}.`);
    const path = listItems(config.roots, undefined, { all: true }).find((x) => x.id === item.id).url;
    out(origin + path);
    return item;
  }
  if (command === 'list') {
    for (const x of listItems(config.roots, undefined, { all: Boolean(flags.all) })) out(`${x.id}\t${x.done ? 'done' : x.kind}\t${x.title}\t${x.url ? origin + x.url : '(unavailable)'}`);
    return;
  }
  if (command === 'close') {
    if (!arg || !flags.reason) throw new Error('Usage: review.mjs close <id> --reason "<text>"');
    undoable('item', arg, 'Closed item', () => closeItem(arg, { by: 'coordinator', reason: flags.reason }));
    out(`Closed ${arg}.`);
    return;
  }
  if (command === 'supersede') {
    if (!arg || !rest[2]) throw new Error('Usage: review.mjs supersede <old-id> <new-id>');
    supersedeItem(arg, rest[2]);
    out(`Closed ${arg} as superseded by #${rest[2]}.`);
    return;
  }
  if (command === 'done') {
    if (!arg) throw new Error('Usage: review.mjs done <id>');
    undoable('item', arg, 'Marked done', () => markDone(arg));
    out(`Marked ${arg} done.`);
    return;
  }
  if (command === 'progress') {
    if (!arg || !rest[2]) throw new Error('Usage: review.mjs progress <queue-id> "<short text>"');
    const expected = flags.generation ?? process.env.JIG_OWNERSHIP_GENERATION;
    const options = { tower, ...(expected === undefined ? {} : { generation: Number(expected) }) };
    const rec = !tower || config.queue && existsSync(config.queue) ? reportProgress(config.queue, arg, rest.slice(2).join(' '), options) : writeProgress(arg, rest.slice(2).join(' '), undefined, undefined, options);
    out(`Progress saved for ${arg}.`);
    return rec;
  }
  if (command === 'reply') {
    if (!arg || !rest[2]) throw new Error('Usage: review.mjs reply <id> "<text>" [--to <at>]');
    if (!knownThreadIds(config.queue).has(arg)) throw new Error(`No review item, queue item or thread named ${arg}.`);
    let replyTo;
    if (flags.to !== undefined) {
      const target = readThread(arg).find(m => m.at === flags.to && m.from === 'person');
      if (!target) throw new Error('No person message with that timestamp in this thread.');
      replyTo = replyReference(target);
    }
    const ownership = readOwnership(arg);
    if (ownership.handback) out(`Return context: ${JSON.stringify(ownership.handback)}`);
    const expected = flags.generation ?? process.env.JIG_OWNERSHIP_GENERATION;
    const rec = appendThread(arg, 'agent', rest.slice(2).join(' '), undefined, undefined, [], replyTo, { reply: true, ...(expected === undefined ? {} : { generation: Number(expected) }) });
    out(`Replied on ${arg}.`);
    return rec;
  }
  if (command === 'queue-set') {
    if (!arg || !flags.state) throw new Error(`Usage: review.mjs queue-set <id> --state <${boardStates.filter((s) => s !== 'blocked').join('|')}> [--item "<text>"] [--waits "<text>"] [--reason "<text>"] [--revisit "<date|trigger>"] [--thread item-<n>]`);
    const to = flags.state === 'pending' ? 'new' : flags.state;
    if (flags.session !== undefined) throw new Error('--session is not accepted by queue-set; the assignee session comes from the thread owner.');
    const x = undoable('work', arg, `Moved to ${to}:`, () => moveWork(config.queue, arg, to, { tower, by: 'coordinator', reason: flags.reason ?? '', waits: flags.waits, item: flags.item, revisit: flags.revisit, thread: flags.thread, action: flags.action, assignee: flags.assignee, job: flags.job, timebox: flags.timebox }));
    out(`Queue item ${arg} is now ${to}${x.waitsFor ? ` (waits: ${x.waitsFor})` : ''}.`);
    return x;
  }
  if (command === 'queue-add') {
    if (!arg || !rest[2]) throw new Error('Usage: review.mjs queue-add <id> "<text>" [--thread item-<n>] [--state new|running|waiting-person] [--kind spike|build|review|merge] [--provider claude|codex] [--browser] [--gpu] [--waits "<text>"]');
    const text = rest.slice(2).join(' ');
    const near = !tower || flags['no-similar'] ? [] : similarOpen(text, config.queue, reviewDir(), arg);
    const x = addWork(config.queue, arg, text, { tower, state: flags.state === 'pending' ? 'new' : flags.state ?? 'new', kind: flags.kind, provider: flags.provider, browser: flags.browser, gpu: flags.gpu, thread: flags.thread || undefined, waits: flags.waits ?? '' });
    out('Added ' + arg + ' (' + (x.kind ?? 'work') + ', ' + (x.state === 'running' ? 'running' : x.waitsFor ? 'waiting-person' : 'new') + (x.thread ? ', linked to ' + x.thread : '') + ').');
    for (const n of near.slice(0, 3)) out(`Similar open topic: ${n.id} "${n.title.length > 70 ? n.title.slice(0, 67) + '...' : n.title}" - post there instead? (added anyway; --no-similar hides this)`);
    return x;
  }
  if (command === 'queue-item') {
    if (!arg || !rest[2]) throw new Error('Usage: review.mjs queue-item <id> "<text>"');
    setItemText(config.queue, arg, rest.slice(2).join(' '));
    out(`Updated the text of ${arg}.`);
    return;
  }
  if (command === 'queue-backfill-times') {
    if (!config.queue || !existsSync(config.queue)) throw new Error('No queue file to backfill.');
    const rows = backfillTimes(config.queue, { dryRun: Boolean(flags['dry-run']) });
    out(['id', 'time', 'source'].join('	'));
    for (const r of rows) out([r.id, r.at, r.source].join('	'));
    out(`${rows.length} item(s) ${flags['dry-run'] ? 'would be backfilled (dry run, nothing written)' : 'backfilled'}.`);
    return rows;
  }
  if (command === 'doctor') {
    if (tower && waitingRecords(projectRoot())) out(waitingRecords(projectRoot()));
    const options = flags['stale-minutes'] ? { staleMinutes: Number(flags['stale-minutes']) } : {};
    const found = flags.sessions && tower ? doctorSessions(options) : doctor(config.queue, { ...options, tower });
    if (!tower && ['threads', 'review-roots.json', 'review-items.json', 'tower.json', 'seen.json', 'sessions', 'ownership', 'coordination.json', 'owner-watch'].some(name => existsSync(join(stateDir(projectRoot()), name)))) out('this store has tower data but layers.tower is off');
    for (const f of found) out(`${f.id}\t${f.problem}`);
    out(found.length ? `${found.length} board issue(s).` : 'Board is consistent.');
    if (found.length) process.exitCode = 1;
    // Hints only: never counted as issues and never change the exit status.
    if (tower && !flags.sessions) for (const g of duplicateGroups(config.queue, reviewDir())) out(`hint: possible duplicate topics: ${g.map((t) => `${t.id} "${t.title.length > 60 ? t.title.slice(0, 57) + '...' : t.title}"`).join(' | ')}`);
    return found;
  }
  if (command === 'park') {
    if (!arg || !flags.reason) throw new Error('Usage: review.mjs park <queue-id> --reason "<text>"');
    undoable('work', arg, 'Parked', () => setParked(config.queue, arg, flags.reason, { revisit: flags.revisit }));
    out(`Parked ${arg}.`);
    return;
  }
  if (command === 'unpark') {
    if (!arg) throw new Error('Usage: review.mjs unpark <queue-id>');
    undoable('work', arg, 'Unparked', () => setParked(config.queue, arg, null));
    out(`Unparked ${arg}.`);
    return;
  }
  if (command === 'undo') {
    const r = undoLast({ queue: config.queue, dir: reviewDir(), project });
    out(`Undone: ${r.label}`);
    return r;
  }
  if (command === 'decide') {
    if (!arg || !flags.quote || !flags.source) throw new Error('Usage: review.mjs decide "<text>" --quote "<exact words>" --source <thread|playtest|qN> --affects <ref>:<kind> ... [--project <name>] [--answers qN]');
    const project = flags.project ?? projectName(process.cwd());
    const { decision, reopened } = recordDecision({ decision: arg, quote: flags.quote, source: flags.source, project, impacts: flags.affects ?? [], answers: flags.answers, at: flags.date });
    out(`Decision #${decision.id} (${project}) recorded.`);
    // A decision that answers a question (--answers q20.1 or q20) marks it answered on the dashboard.
    if (flags.answers && questionId.test(flags.answers)) { markQuestionAnswered(flags.answers, { project: dashProject, text: flags.quote, decision: `${project}#${decision.id}` }); out(`Question ${flags.answers.slice(1)} marked answered.`); }
    for (const n of reopened) out(`Reopened item ${n}.`);
    return decision;
  }
  if (command === 'decision-void') {
    const m = String(arg ?? '').match(/^(.+)#(\d+)$/);
    if (!m || !flags.reason) throw new Error('Usage: review.mjs decision-void <project>#<id> --reason "<text>"');
    const rec = voidDecision(m[1], Number(m[2]), flags.reason);
    out(`Decision ${m[1]}#${m[2]} voided: ${rec.voided.reason}`);
    return rec;
  }
  if (command === 'oq-reset') {
    if (!arg || !questionId.test(arg)) throw new Error('Usage: review.mjs oq-reset <qN or qN.M>  (puts a question answered, replied or deferred on the dashboard back to open)');
    reopenQuestion(arg, { project: dashProject });
    out(`Question ${arg.slice(1)} is open again.`);
    return;
  }
  if (command === 'import-decisions') {
    if (!arg) throw new Error('Usage: review.mjs import-decisions <file.json>  (a seed file: {decisions:[{project, decision, quote, source, at, impacts}]})');
    const list = JSON.parse(readFileSync(resolve(arg), 'utf8').replace(/^\uFEFF/, '')).decisions ?? [];
    for (const d of list) { const { decision } = recordDecision({ ...d, impacts: d.impacts ?? [] }, { now: new Date(d.at) }); out(`Decision ${decision.project}#${decision.id}: ${decision.decision.slice(0, 70)}`); }
    return;
  }
  if (command === 'decisions') {
    for (const d of readDecisions({ project: flags.project })) out(`${d.project}#${d.id}	${d.at.slice(0, 10)}	${d.decision}	${d.impacts.map((i) => `${i.ref}:${i.kind}`).join(' ')}`);
    return;
  }
  if (command === 'threads') {
    for (const t of unreadThreads()) out(`${t.id}\t${t.at}\t${t.text.replace(/\s+/g, ' ')}`);
    return;
  }
  if (command === 'thread') {
    if (!arg || !knownThreadIds(config.queue).has(arg)) throw new Error('Usage: review.mjs thread <known-id>');
    for (const m of readThread(arg)) out(`${m.at} | ${m.from} | ${messageLine(m)}`);
    return;
  }
  if (command === 'watch') {
    if (flags.timeout !== undefined) throw new Error('Watch has no timeout; stop the tracked job to cancel it.');
    if (!flags.once && (flags.since !== undefined || flags.thread)) throw new Error('--since and --thread require --once.');
    if (flags.owner && (!flags.item || flags.generation === undefined || !Number.isSafeInteger(Number(flags.generation)))) throw new Error('Owner watch needs --item and --generation.');
    if (flags.owner) {
      const row = readOwnership(flags.item);
      if (Number(flags.generation) !== row.ownershipGeneration || row.owner?.sessionId !== flags.owner) throw new Error('Owner watch generation conflict; refresh before retrying.');
      return armSessionWatch(flags.owner, { once: Boolean(flags.once), since: flags.since, threads: flags.thread, out });
    }
    const pollRequests = () => identity().kind !== 'coordinator' ? [] : openMergeRequests()
      .filter(request => (!flags.item || flags.item === request.item) && (!flags.thread || flags.thread.includes(request.item)))
      .map(request => ({ id: request.id, item: request.item, text: `${request.needs ?? 'merge'} request ${request.id} | ${request.branch ?? request.text}` }));
    if (flags.once) {
      const stop = watchThreads(reviewDir(), (id, m) => out(`${id} | ${messageLine(m)}`), {
        once: true, threads: flags.thread, item: flags.item, since: flags.since, onWarning: console.error, pollRequests
      });
      process.send?.('armed');
      return stop.finished.then(cursor => { if (cursor) out(`cursor ${cursor}`); });
    }
    const stop = watchThreads(reviewDir(), (id, m) => out(`${id} | ${messageLine(m)}`), { item: flags.item, owner: flags.owner, generation: flags.generation === undefined ? undefined : Number(flags.generation) });
    const seen = new Set();
    const poll = () => {
      for (const request of pollRequests()) if (!seen.has(request.id)) {
        seen.add(request.id);
        out(`${request.item} | ${request.text}`);
      }
    };
    poll();
    const timer = setInterval(poll, 700);
    return () => { clearInterval(timer); stop(); };
  }
  throw new Error('Usage: review.mjs add <path> --title "..." [--note "..."] | list [--all] | done <id> | close <id> --reason "<text>" | supersede <old> <new> | progress <queue-id> "<text>" | reply <id> "<text>" [--to <at>] | thread <id> | watch | threads | decide "<text>" --quote "<words>" --source <src> --affects <ref>:<kind> | decisions [--project <name>]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await run(process.argv.slice(2), { out: (l) => process.stdout.write(l + '\n') }); } catch (e) { console.error(String(e.message).replace(/\s+/g, ' ')); process.exit(e.exitCode ?? (process.argv[2] === 'watch' && process.argv.includes('--once') ? 2 : 1)); }
}
