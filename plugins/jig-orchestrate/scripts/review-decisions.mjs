if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-decisions.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Decision log: what the person decided, in their words, and what each decision touches.
// Stored per project in the personal store (jig-store.mjs), one JSON record per line. Pure functions; no server code.
import { appendLine, decisionsPath, listProjects, readLines, repoOf } from './jig-store.mjs';

export const impactKinds = ['outdates', 'informs', 'reopens', 'confirms', 'blocks', 'unblocks'];
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const insensitive = process.platform !== 'linux';
const fold = (p) => { const s = String(p).replace(/\\/g, '/'); return insensitive ? s.toLowerCase() : s; };

// "app:docs/x.md:outdates" -> {ref: "app:docs/x.md", kind: "outdates"}. The kind is the last colon part.
export function parseImpact(text) {
  const s = String(text ?? '').trim();
  const i = s.lastIndexOf(':');
  const ref = i > 0 ? s.slice(0, i).trim() : '';
  const kind = i > 0 ? s.slice(i + 1).trim().toLowerCase() : '';
  if (!ref || !impactKinds.includes(kind)) throw new Error(`Invalid impact ${JSON.stringify(s)}: use <ref>:<kind> with kind one of ${impactKinds.join(', ')}.`);
  return { ref, kind };
}
export function validateImpact(impact) {
  if (!impact || typeof impact.ref !== 'string' || !impact.ref.trim() || /[\0\r\n]/.test(impact.ref) || !impactKinds.includes(impact.kind)) throw new Error('Invalid impact: need {ref, kind}.');
  return { ref: impact.ref.trim(), kind: impact.kind };
}

export const decisionKey = (d) => `${d.project}#${d.id}`;
export const decisionLabel = (d) => `#${d.id} (${d.project})`;

export function validateDecision(d) {
  if (!d || typeof d !== 'object') throw new Error('Invalid decision.');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(d.project ?? '')) throw new Error('A decision needs a home project name.');
  if (typeof d.decision !== 'string' || !d.decision.trim()) throw new Error('A decision needs text.');
  if (typeof d.quote !== 'string' || !d.quote.trim()) throw new Error("A decision needs the person's exact words (--quote).");
  if (typeof d.source !== 'string' || !d.source.trim()) throw new Error('A decision needs a source: a thread id, playtest or question number (--source).');
  if (!Number.isFinite(Date.parse(d.at))) throw new Error('A decision needs a date.');
  if (!Array.isArray(d.impacts)) throw new Error('Impacts must be a list.');
  return d;
}

export function readDecisions({ home, project } = {}) {
  const out = []; const voids = new Map();
  for (const p of project ? [project] : listProjects({ home })) {
    const file = decisionsPath(p, { home });
    if (!file) continue;
    for (const line of readLines(file)) {
      try {
        const d = JSON.parse(line);
        // An append-only void line ({void: <id>, reason, at}) keeps the decision in the log but takes away its effect.
        if (d && Number.isInteger(d.void) && typeof d.reason === 'string') { voids.set(`${p}#${d.void}`, { reason: d.reason, at: d.at }); continue; }
        if (d && Number.isInteger(d.id) && typeof d.decision === 'string' && Number.isFinite(Date.parse(d.at))) out.push({ ...d, project: p, impacts: (d.impacts ?? []).filter((x) => x && typeof x.ref === 'string' && impactKinds.includes(x.kind)) });
      } catch { /* skip a damaged line */ }
    }
  }
  for (const [i, d] of out.entries()) {
    const v = voids.get(`${d.project}#${d.id}`);
    if (v) out[i] = { ...d, voided: v, impacts: [] };
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.project.localeCompare(b.project) || a.id - b.id);
}

// Void a decision: append a record, never edit the log. The decision stays listed, struck through with the reason, and has no impacts.
export function voidDecision(project, id, reason, { home, now = new Date() } = {}) {
  const text = String(reason ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Voiding a decision needs a reason (--reason).');
  const d = readDecisions({ home, project }).find((x) => x.id === Number(id));
  if (!d) throw new Error(`No decision ${project}#${id}.`);
  if (d.voided) throw new Error(`Decision ${project}#${id} is already void.`);
  appendLine(decisionsPath(project, { home }), JSON.stringify({ void: d.id, reason: text, at: now.toISOString() }), { home });
  return { ...d, voided: { reason: text, at: now.toISOString() }, impacts: [] };
}

export function addDecision({ decision, quote, source, project, impacts = [], at, answers }, { home, now = new Date() } = {}) {
  if (!decisionsPath(project ?? 'x', { home })) throw new Error('No store root: set JIG_HOME.');
  const rec = {
    id: 1 + readDecisions({ home, project }).reduce((m, d) => Math.max(m, d.id), 0),
    project, decision: String(decision ?? '').trim(), quote: String(quote ?? '').trim(), source: String(source ?? '').trim(),
    at: at ?? now.toISOString(), impacts: impacts.map((i) => (typeof i === 'string' ? parseImpact(i) : validateImpact(i)))
  };
  if (answers) rec.answers = String(answers);
  validateDecision(rec);
  appendLine(decisionsPath(project, { home }), JSON.stringify(rec), { home });
  return rec;
}

// ---------- matching impact refs to dashboard things ----------
// A ref names an item (item-N, jig:item-N), a queue item (jig:queue/<id>), a file (app:docs/x.md) or a bare id (lab:schema-id).
export function describeRef(ref) {
  const m = String(ref).match(/^(?:([A-Za-z0-9][\w.-]*):)?(.+)$/);
  const project = m?.[1] ?? null; let rest = m?.[2] ?? ref;
  if (/^[a-z]$/i.test(project ?? '')) return { project: null, rest: String(ref), kind: 'file' }; // a drive letter, not a project
  let mm;
  if ((mm = rest.match(/^(?:item-|#)(\d+)$/i))) return { project, kind: 'item', id: Number(mm[1]) };
  if ((mm = rest.match(/^queue\/(.+)$/))) return { project, kind: 'queue', id: mm[1] };
  if (/[/\\]|\.[a-z0-9]{1,5}$/i.test(rest)) return { project, kind: 'file', path: rest.replace(/\\/g, '/').replace(/^\.?\//, '') };
  return { project, kind: 'id', id: rest };
}
// target: {type:'item', id, path, thread} or {type:'queue', id}
export function refMatches(ref, target, { home } = {}) {
  const d = describeRef(ref);
  if (d.kind === 'item') return target.type === 'item' && target.id === d.id;
  if (d.kind === 'queue') return target.type === 'queue' && target.id === d.id;
  if (d.kind === 'id') return (target.type === 'queue' && target.id === d.id) || (target.type === 'item' && target.thread === d.id);
  if (target.type !== 'item' || !target.path) return false;
  const path = fold(target.path); const rel = fold(d.path);
  if (d.project) {
    const repo = repoOf(d.project, { home });
    if (repo && path === fold(repo) + '/' + rel) return true;
  }
  return path === rel || path.endsWith('/' + rel);
}

// Every decision impact that hits a target, oldest first.
export function impactsFor(decisions, target, options) {
  const out = [];
  for (const d of decisions) for (const impact of d.impacts) if (refMatches(impact.ref, target, options)) out.push({ decision: d, kind: impact.kind, ref: impact.ref });
  return out;
}

export const noteText = {
  outdates: (d) => `outdated by decision ${decisionLabel(d)}`,
  informs: (d) => `new light from ${decisionLabel(d)}`,
  confirms: (d) => `confirmed by ${decisionLabel(d)}`,
  reopens: (d) => `reopened by decision ${decisionLabel(d)}`,
  blocks: (d) => `blocked by decision ${decisionLabel(d)}`,
  unblocks: (d) => `released by decision ${decisionLabel(d)}`
};

// Notes for one target. state: {open, added, mtime, reopenedBy}. Each note: {key, kind, text, active, state}.
// outdates: shown until the file changes after the decision, or the item closes. Items added after the decision are the updated version.
export function decisionNotes(decisions, target, state, options) {
  const notes = [];
  for (const { decision: d, kind } of impactsFor(decisions, target, options)) {
    const at = Date.parse(d.at);
    const newer = state.added !== undefined && Date.parse(state.added) >= at;
    const base = { key: decisionKey(d), id: d.id, project: d.project, kind, text: noteText[kind](d), decision: clip(d.decision, 160) };
    if (kind === 'outdates') {
      const updated = newer || (state.mtime !== undefined && state.mtime > at);
      notes.push({ ...base, active: Boolean(state.open) && !updated, state: !state.open ? 'closed' : updated ? 'updated' : 'outdated' });
    } else if (kind === 'informs' || kind === 'confirms') {
      notes.push({ ...base, active: Boolean(state.open) && !newer, state: !state.open ? 'closed' : newer ? 'later' : kind === 'informs' ? 'informed' : 'confirmed' });
    } else if (kind === 'reopens') {
      const did = (state.reopenedBy ?? []).includes(decisionKey(d));
      notes.push({ ...base, active: Boolean(state.open) && did, state: did ? (state.open ? 'reopened' : 'closed') : 'not applied' });
    }
    // blocks and unblocks are folded into blockers() below
  }
  return notes;
}

// Decisions that currently block a target: a later "unblocks" on it releases every earlier "blocks".
export function blockers(decisions, target, options) {
  let held = [];
  for (const { decision: d, kind } of impactsFor(decisions, target, options)) {
    if (kind === 'blocks') held.push(d);
    else if (kind === 'unblocks') held = [];
  }
  return held.map((d) => ({ ref: `decision:${decisionKey(d)}`, open: true, label: `decision ${decisionLabel(d)}: ${clip(d.decision, 60)}` }));
}

// Open-question numbers answered by a decision (source or answers like q12).
export function answeredQuestions(decisions) {
  const out = new Set();
  for (const d of decisions) for (const s of d.voided ? [] : [d.answers, d.source]) { const m = String(s ?? '').match(/^(?:q|question[-:# ]?)(\d+)$/i); if (m) out.add(Number(m[1])); }
  return out;
}
