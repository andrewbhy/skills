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
//   | queue-item <id> "<text>" | doctor
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
// threads: list threads whose last message is from the person and still has no reply.
// progress: agents call it at milestones; the review page shows it on the running work row.
import { readFileSync } from 'node:fs';
import { replyReference } from './review-message.mjs';
import { resolve } from 'node:path';
import { projectName } from './jig-store.mjs';
import { undoLast, withUndo } from './review-undo.mjs';
import { readDecisions, voidDecision } from './review-decisions.mjs';
import { markQuestionAnswered, questionId, reopenQuestion } from './review-questions.mjs';
import { boardStates } from './review-states.mjs';
import { doctor, moveWork, setItemText, setParked } from './review-work.mjs';
import { pathToFileURL } from 'node:url';
import { projectRoot, messageLine, addItem, appendThread, readThread, recordDecision, closeItem, defaultPort, knownThreadIds, listItems, loadConfig, markDone, supersedeItem, reviewDir, unreadThreads, watchThreads, writeProgress } from './review-core.mjs';

function parse(argv) {
  const flags = {}; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (key === 'all') flags.all = true;
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
  const config = loadConfig();
  const port = Number(flags.port ?? process.env.JIG_REVIEW_PORT ?? config.port ?? defaultPort);
  const origin = `http://127.0.0.1:${port}`;
  const project = flags.project ?? projectName(projectRoot());
  const dashProject = flags['dash-project'] ?? projectName(projectRoot()); // the project whose dashboard state (oq-answers.json) is changed
  const undoable = (kind, id, verb, fn) => withUndo({ kind, id, label: `${verb} ${id}`, queue: config.queue, dir: reviewDir(), project }, fn);
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
    const rec = writeProgress(arg, rest.slice(2).join(' '));
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
    const rec = appendThread(arg, 'coordinator', rest.slice(2).join(' '), undefined, undefined, [], replyTo);
    out(`Replied on ${arg}.`);
    return rec;
  }
  if (command === 'queue-set') {
    if (!arg || !flags.state) throw new Error(`Usage: review.mjs queue-set <id> --state <${boardStates.filter((s) => s !== 'blocked').join('|')}> [--item "<text>"] [--waits "<text>"] [--reason "<text>"] [--revisit "<date|trigger>"] [--thread item-<n>]`);
    const to = flags.state === 'pending' ? 'new' : flags.state;
    const x = undoable('work', arg, `Moved to ${to}:`, () => moveWork(config.queue, arg, to, { by: 'coordinator', reason: flags.reason ?? '', waits: flags.waits, item: flags.item, revisit: flags.revisit, thread: flags.thread }));
    out(`Queue item ${arg} is now ${to}${x.waitsFor ? ` (waits: ${x.waitsFor})` : ''}.`);
    return x;
  }
  if (command === 'queue-item') {
    if (!arg || !rest[2]) throw new Error('Usage: review.mjs queue-item <id> "<text>"');
    setItemText(config.queue, arg, rest.slice(2).join(' '));
    out(`Updated the text of ${arg}.`);
    return;
  }
  if (command === 'doctor') {
    const found = doctor(config.queue, flags['stale-minutes'] ? { staleMinutes: Number(flags['stale-minutes']) } : {});
    for (const f of found) out(`${f.id}\t${f.problem}`);
    out(found.length ? `${found.length} board issue(s).` : 'Board is consistent.');
    if (found.length) process.exitCode = 1;
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
    const list = JSON.parse(readFileSync(resolve(arg), 'utf8')).decisions ?? [];
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
  if (command === 'watch') return watchThreads(reviewDir(), (id, m) => out(`${id} | ${messageLine(m)}`)); // returns the stop function
  throw new Error('Usage: review.mjs add <path> --title "..." [--note "..."] | list [--all] | done <id> | close <id> --reason "<text>" | supersede <old> <new> | progress <queue-id> "<text>" | reply <id> "<text>" [--to <at>] | thread <id> | watch | threads | decide "<text>" --quote "<words>" --source <src> --affects <ref>:<kind> | decisions [--project <name>]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { run(process.argv.slice(2), { out: (l) => process.stdout.write(l + '\n') }); } catch (e) { console.error(e.message); process.exit(1); }
}
