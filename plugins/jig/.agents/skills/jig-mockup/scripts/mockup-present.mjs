// Read-only pre-presentation gate. It validates evidence records, not visual taste.
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkPresentation(folder) {
  folder = resolve(folder);
  const reasons = [];
  const evidenceFiles = new Set();
  const refuse = message => reasons.push(message);
  const local = name => {
    if (typeof name !== 'string' || !name.trim() || isAbsolute(name)) throw Error('expected a round-relative file path');
    const path = resolve(folder, name), rel = relative(folder, path);
    if (rel.startsWith('..') || isAbsolute(rel)) throw Error('path leaves round folder');
    return path;
  };
  const json = name => {
    try {
      const value = JSON.parse(readFileSync(local(name), 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('expected object');
      return value;
    } catch (error) { refuse(`${name}: ${error.message}`); return {}; }
  };
  const evidence = (value, label) => {
    try {
      if (typeof value !== 'string' || !value.trim()) throw Error('evidence link missing');
      const file = isAbsolute(value) ? value : resolve(folder, value);
      const stat = statSync(file);
      if (!stat.isFile() || stat.size === 0) throw Error('evidence must be a nonempty file');
      evidenceFiles.add(file);
      return file;
    } catch (error) { refuse(`${label}: ${error.message}`); return undefined; }
  };
  const build = json('build.json');
  let lastBuild = 0;
  for (const name of ['build.json', build.artifact, ...(Array.isArray(build.inputs) ? build.inputs : [])]) {
    try {
      const stat = statSync(local(name));
      if (!stat.isFile()) throw Error('not a file');
      lastBuild = Math.max(lastBuild, stat.mtimeMs);
    } catch (error) { refuse(`Build input ${String(name)}: ${error.message}`); }
  }
  if (!Array.isArray(build.inputs) || build.inputs.some(name => typeof name !== 'string')) refuse('build.json: inputs must list every local build dependency (empty array allowed for self-contained HTML)');
  if (![build.builder, build.coordinator].every(value => typeof value === 'string' && value.trim())) refuse('build.json: builder and coordinator session IDs required');

  const gate = json('visual-check/report.json');
  const runs = Array.isArray(gate.runs) ? gate.runs : [];
  if (gate.options?.gate !== true) refuse('Visual report must come from visual-check --gate');
  if (gate.options?.url !== pathToFileURL(resolve(folder, typeof build.artifact === 'string' ? build.artifact : '')).href) refuse('Visual report targets a different artifact');
  const coverage = gate.coverage;
  if (!coverage || coverage.complete !== true || !Number.isInteger(coverage.expected) || coverage.expected <= 0
      || coverage.completed !== coverage.expected || coverage.attempted !== coverage.expected
      || !Array.isArray(gate.runs) || gate.runs.length !== coverage.expected || gate.runs.some(run => run?.completed !== true)
      || gate.budget?.stopped !== false || !Array.isArray(gate.gaps) || gate.gaps.length
      || runs.some(run => !run || !Array.isArray(run.gaps) || run.gaps.length)) refuse('Visual gate incomplete: all declared states must complete with no gaps or budget stop');
  if (!['passed', 'findings'].includes(gate.status) || !Array.isArray(gate.findings)) refuse('Visual gate report has invalid status or findings');
  try { if (statSync(local('visual-check/report.json')).mtimeMs <= lastBuild) refuse('Visual gate report is stale after the last build'); } catch { /* Missing report already diagnosed. */ }

  const review = json('fresh-seat-review.json');
  if (review.artifact !== build.artifact) refuse('Fresh-seat review targets a different artifact');
  if (review.fresh !== true || typeof review.reviewer !== 'string' || !review.reviewer.trim()
      || [build.builder, build.coordinator].includes(review.reviewer)) refuse('Acceptance requires a fresh seat distinct from builder and coordinator');
  if (review.decision !== 'accepted') refuse('Fresh-seat review has not accepted this artifact');
  evidence(review.renderedEvidence, 'Fresh-seat rendered evidence');
  evidence(review.reference, 'Fresh-seat reference');
  try {
    const reviewedAt = statSync(local('fresh-seat-review.json')).mtimeMs;
    if (reviewedAt <= lastBuild) refuse('Fresh-seat review is stale after the last build');
    for (const name of ['visual-check/report.json']) {
      if (typeof name === 'string' && statSync(resolve(folder, name)).mtimeMs > reviewedAt) refuse(`Fresh-seat review predates evidence: ${name}`);
    }
  } catch { /* Missing inputs already diagnosed. */ }

  const waivers = json('waivers.json');
  if (!Array.isArray(waivers.items)) refuse('Waiver list must contain an items array (empty allowed)');
  for (const finding of Array.isArray(gate.findings) ? gate.findings : []) {
    if (!finding || !Number.isInteger(finding.id)) { refuse('Visual report has an invalid finding ID'); continue; }
    const waiver = Array.isArray(waivers.items) ? waivers.items.find(item => item?.finding === finding.id) : undefined;
    if (!waiver) { refuse(`Open visual finding ${finding.id}: ${finding.kind ?? finding.rule ?? 'unnamed'}`); continue; }
    if (typeof waiver.reason !== 'string' || !waiver.reason.trim() || waiver.reviewer !== review.reviewer
        || !Array.isArray(review.waivers) || !review.waivers.includes(finding.id)) refuse(`Finding ${finding.id}: waiver needs reason and fresh-seat agreement`);
    evidence(waiver.evidence, `Finding ${finding.id} waiver evidence`);
    // Dismissing a detector finding needs a reusable checker calibration item.
    evidence(waiver.calibration, `Finding ${finding.id} checker calibration item`);
  }

  const ledger = json('feedback.json');
  if (!Array.isArray(ledger.items)) refuse('Feedback ledger must contain an items array (empty allowed)');
  const ids = new Set();
  for (const item of Array.isArray(ledger.items) ? ledger.items : []) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)
        || !['Keep', 'Fix', 'Strong objection'].includes(item.kind)
        || typeof item.item !== 'string' || !item.item.trim() || typeof item.artifact !== 'string' || !item.artifact.trim()
        || !['open', 'fixed', 'verified'].includes(item.status)) { refuse('Feedback ledger has an invalid or duplicate item'); continue; }
    ids.add(item.id);
    if (item.artifact !== build.artifact) continue;
    if (item.status !== 'verified') refuse(`Feedback ${item.id} on ${item.artifact} is ${item.status}; verification pending`);
    evidence(item.evidence, `Feedback ${item.id}`);
    if (!Array.isArray(review.closes) || !review.closes.includes(item.id)) refuse(`Fresh-seat review does not close feedback ${item.id} on ${item.artifact}`);
    if (typeof review.message !== 'string' || !review.message.includes(item.artifact) || !review.message.includes(item.id)) refuse(`Review message must name artifact ${item.artifact} and closed item ${item.id}`);
  }
  for (const name of ['feedback.json', 'waivers.json']) {
    try { if (statSync(local(name)).mtimeMs > statSync(local('fresh-seat-review.json')).mtimeMs) refuse(`Fresh-seat review predates evidence: ${name}`); }
    catch { /* Missing records already diagnosed. */ }
  }
  try {
    const reviewedAt = statSync(local('fresh-seat-review.json')).mtimeMs;
    for (const file of evidenceFiles) if (statSync(file).mtimeMs > reviewedAt) refuse(`Fresh-seat review predates evidence: ${relative(folder, file)}`);
  } catch { /* Missing review already diagnosed. */ }
  return { passed: reasons.length === 0, artifact: build.artifact, reasons };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) throw Error('Usage: node mockup-present.mjs <round folder>');
    const report = checkPresentation(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
