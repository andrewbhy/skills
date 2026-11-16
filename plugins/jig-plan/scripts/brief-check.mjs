if (process.argv[2] === '--help') { console.log('Usage: node scripts/brief-check.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, normalize, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recordToolSignal } from './signals.mjs';
import { statePath } from './jig-store.mjs';
import { layers } from './layers.mjs';
import { confirmedLink, loadGlossaries } from './goal-translate.mjs';

const localSchema = new URL('./plan-sections.json', import.meta.url);
export const schema = JSON.parse(readFileSync(existsSync(localSchema) ? localSchema : new URL('../docs/plan-sections.json', import.meta.url), 'utf8'));

// Only top-level plan sections count; headings in examples/fences cannot satisfy them.
export function sections(text) {
  const clean = text.replace(/<!--[\s\S]*?-->/g, '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  const found = new Map();
  const matches = [...clean.matchAll(/^## ([^\n]+)\n/gm)];
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim().toLowerCase();
    if (found.has(name)) throw Error(`Duplicate section: ${name}`);
    found.set(name, clean.slice(matches[i].index + matches[i][0].length, matches[i + 1]?.index).trim());
  }
  return found;
}

// Kept separate from refusal reasons so old callers retain the array contract.
export function inspectPlan(text, config = {}, { glossary = new Map() } = {}) {
  const reasons = [];
  let parts;
  try { parts = sections(text.replaceAll('\r\n', '\n')); } catch (error) { return { reasons: [error.message], warnings: [], ambiguity: null }; }
  reasons.push(...mockupGridReasons(text));
  for (const name of schema.sections) if (!parts.get(name.toLowerCase())) reasons.push(`Missing or empty section: ${name}`);
  const requirements = parts.get('requirements') ?? '';
  if (/^Kind:\s*(?:ui|product)\s*$/im.test(parts.get('intent') ?? '')) {
    if (!/^Top task:[ \t]*\S[^\n]*$/m.test(parts.get('intent') ?? '')) reasons.push("Missing Top task: line in Intent (the person's words)");
    const first = (parts.get('intent') ?? '').match(/^First walk:[ \t]*(?:slice[ \t]+)?(\d+)\b[^\n]*$/im);
    if (!first || !new RegExp(`^\\s*${first[1]}[.)]\\s`, 'm').test(parts.get('slices') ?? '')) reasons.push('Missing First walk: line referencing a numbered slice');
  }
  if (!/\bWHEN\b[\s\S]+\bTHEN\b/.test(requirements)) reasons.push('Requirements need WHEN/THEN scenarios');
  const slices = parts.get('slices') ?? '';
  if (!/\b\d+\s*(?:min(?:utes)?|m)\b/i.test(slices)) reasons.push('Slices need timeboxes in minutes');
  const rows = (parts.get('verification plan') ?? '').split('\n').filter(line => /^\s*\|/.test(line))
    .map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
  const header = rows[0] ?? [];
  for (const column of schema.verificationColumns) if (!header.includes(column)) reasons.push(`Verification plan missing column: ${column}`);
  const data = rows.slice(2);
  if (!data.length || data.some(row => row.length !== header.length || row.some(cell => !cell))) reasons.push('Verification plan needs complete risk/check/layer/time/acceptor rows');
  const outcome = parts.get('plan-check outcome') ?? '';
  // A BLOCK line that says seats, recheck or person input are pending is a valid draft, not a malformed outcome.
  const blocks = outcome.split('\n').filter(line => /^(?:BLOCK|PENDING):/.test(line));
  const draft = blocks.length && blocks.every(line => /\b(?:pending|recheck|awaiting|person input)\b/i.test(line)) ? blocks.join(' ') : null;
  if (!draft && (!/^OK:\s*\S.+/m.test(outcome) || blocks.length)) reasons.push('Plan-check outcome must have an OK: line and no unresolved BLOCK:/PENDING: line');
  const measures = inspectMeasures(parts, config, glossary);
  return { reasons: [...reasons, ...measures.reasons], warnings: measures.warnings, ambiguity: measures.ambiguity, ...(draft && { draft }) };
}

const DRAFT_REASON = 'Plan-check outcome is a draft: seats or person input pending';
// A draft is not launchable, so library callers still get a refusal reason for it.
export function checkPlan(text, config = {}, options) {
  const { reasons, draft } = inspectPlan(text, config, options);
  return draft ? [...reasons, DRAFT_REASON] : reasons;
}

// Each round brief must name its inputs and executable checks itself. A link
// to a complete plan cannot silently supply a missing round contract.
export function mockupGridReasons(text) {
  const clean = text.replaceAll('\r\n', '\n').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  const identity = (clean.match(/^# (.*)$/m)?.[1] ?? '') + '\n' + (sections(clean).get('intent') ?? '');
  if (!/\b(?:mockups?|jig-mockup)\b/i.test(identity)) return [];
  const reasons = [];
  for (const [pattern, label] of [
    [/\bgrid[\\/]tokens\.css\b/, 'grid/tokens.css'],
    [/\bgrid[\\/]primitives\.css\b/, 'grid/primitives.css'],
    [/\bui-tokens-check\.mjs\b/, 'ui-tokens-check.mjs'],
    [/\bstyle-lint\.mjs\b/, 'style-lint.mjs'],
    [/\bvisual-check\.mjs\b/, 'visual-check.mjs (rendered alignment, clip and reflow; pending when browsers are forbidden)'],
  ]) if (!pattern.test(clean)) reasons.push(`Mockup brief must name ${label}`);
  return reasons;
}

function inspectMeasures(parts, config, glossary) {
  const result = { reasons: [], warnings: [], ambiguity: null };
  const kindLine = (parts.get('intent') ?? '').split('\n')[0];
  if (!/^Kind:/i.test(kindLine)) return result; // No Kind is the legacy contract.
  const gate = config?.plan?.ambiguityGate ?? 'warn';
  const threshold = config?.plan?.ambiguityThreshold ?? 0.5;
  if (!['warn', 'block'].includes(gate) || typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    result.reasons.push('Invalid plan config: ambiguityGate must be warn or block; ambiguityThreshold must be a number from 0 to 1');
    return result;
  }
  const findings = gate === 'block' ? result.reasons : result.warnings;
  const contract = schema.conditionalSections['Success measures'];
  const kind = kindLine.slice(kindLine.indexOf(':') + 1).trim().toLowerCase();
  if (![...contract.kinds, 'mechanical'].includes(kind)) findings.push(`Unknown plan Kind: ${kind}`);
  const times = [...(parts.get('slices') ?? '').matchAll(/\b(\d+(?:\.\d+)?)\s*(?:min(?:utes)?|m)\b/gi)];
  const small = times.length > 0 && times.reduce((sum, match) => sum + Number(match[1]), 0) < 30;
  const table = parts.get('success measures');
  if (!table) {
    if (kind !== 'mechanical' && !small) findings.push('Success measures: missing table');
    return result;
  }
  const lines = table.split('\n').filter(line => line.trim());
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  const rows = lines.map(cells), header = rows[0] ?? [], data = rows.slice(2);
  const problems = [];
  if (header.length !== contract.columns.length || header.some((cell, i) => cell !== contract.columns[i])) problems.push(`columns must be ${contract.columns.join(', ')}`);
  if (rows[1]?.length !== contract.columns.length || rows[1].some(cell => !/^:?-{3,}:?$/.test(cell))) problems.push('needs a Markdown separator row');
  if (!data.length || data.length > contract.maxRows) problems.push(`needs 1 to ${contract.maxRows} rows`);
  if (lines.some(line => !/^\s*\|.*\|\s*$/.test(line)) || data.some(row => row.length !== contract.columns.length || row.some(cell => !cell))) problems.push('each complete row must occupy one line with eight nonempty cells');
  if (data.some(row => !/^G[1-9]\d*$/.test(row[0]) || !/^[123]$/.test(row[3]))) problems.push('rows need Goal IDs such as G1 and numeric Tier 1, 2 or 3');
  if (problems.length) {
    findings.push(...problems.map(problem => `Success measures: ${problem}`));
    return result; // Malformed rows cannot establish a trustworthy score.
  }
  const goals = new Map();
  for (const row of data) {
    if (row[3] !== '3' && !confirmedLink(row, data, glossary)) {
      findings.push(`Success measures: ${row[0]} has an unconfirmed or invalid glossary link; it does not count as measured`);
      continue;
    }
    const tiers = goals.get(row[0]) ?? new Set();
    tiers.add(Number(row[3]));
    goals.set(row[0], tiers);
  }
  const unmeasured = [...goals.values()].filter(tiers => tiers.has(3) && !tiers.has(1) && !tiers.has(2)).length;
  if (!goals.size) return result;
  result.ambiguity = { unmeasured, total: goals.size, share: unmeasured / goals.size };
  if (result.ambiguity.share >= threshold) findings.push(`Ambiguity share ${result.ambiguity.share} is at or above threshold ${threshold}`);
  return result;
}

export function inspectFile(path, read = p => readFileSync(p, 'utf8'), { workspace, config = {}, glossaryPaths = [] } = {}) {
  const glossary = loadGlossaries(glossaryPaths, read);
  const text = read(path), parts = sections(text.replaceAll('\r\n', '\n'));
  if (!parts.has('plan')) return inspectPlan(text, config, { glossary });
  const reasons = [...mockupGridReasons(text), ...briefReasons(text, { root: workspace ?? process.cwd() }), ...schema.briefSections.filter(name => !parts.get(name.toLowerCase())).map(name => `Missing or empty brief section: ${name}`)];
  const link = parts.get('plan')?.match(/^\[Plan\]\((.+)\)$/m)?.[1];
  if (!link || (/^[a-z][a-z\d+.-]*:/i.test(link) && !win32.isAbsolute(link))) return { reasons: [...reasons, 'Plan needs a local [Plan](path) link'], warnings: [], ambiguity: null };
  if (link.split(/[\\/]/).includes('..')) return { reasons: [...reasons, 'Plan link must not contain .. segments'], warnings: [], ambiguity: null };
  const target = isAbsolute(link) ? normalize(link) : win32.isAbsolute(link) ? win32.normalize(link) : resolve(workspace ?? dirname(path), link);
  const linked = inspectPlan(read(target), config, { glossary });
  return { ...linked, reasons: [...reasons, ...linked.reasons.map(reason => `Linked plan: ${reason}`)] };
}

export function briefReasons(text, { root = process.cwd(), home } = {}) {
  const clean = text.replaceAll('\r\n', '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  const reasons = [];
  if (layers(root, { home }).orchestration && !/^jig-reservation:[ \t]*[a-zA-Z0-9][a-zA-Z0-9_-]*[ \t]*$/m.test(clean)) reasons.push('Missing or invalid jig-reservation: line');
  for (const label of ['Workspace', 'Data', 'Report']) {
    const value = clean.match(new RegExp(`^${label} path:[ \\t]*(.+)$`, 'mi'))?.[1]?.trim();
    const normalized = value && (win32.isAbsolute(value) ? win32.normalize(value) : normalize(value));
    if (!normalized || !(isAbsolute(normalized) || win32.isAbsolute(normalized))) reasons.push(`Missing absolute ${label.toLowerCase()} path:`);
    if (value?.split(/[\\/]/).includes('..')) reasons.push(`${label} path must not contain .. segments`);
  }
  for (const label of ['Write locations', 'Server ownership']) if (!new RegExp(`^${label}:[ \\t]*\\S[^\\n]*$`, 'mi').test(clean)) reasons.push(`Missing ${label}: declaration`);
  const body = sections(clean).get('requirement-to-check') ?? '';
  const rows = body.split('\n').filter(line => /^\s*\|/.test(line)).map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
  if (rows[0]?.join('|') !== 'Requirement|Check' || !rows[1]?.every(cell => /^:?-{3,}:?$/.test(cell)) || rows.length < 3 || rows.slice(2).some(row => row.length !== 2 || row.some(cell => !cell || /^(?:none|tbd|pending|-)$/i.test(cell)))) reasons.push('Requirement-to-check table needs Requirement | Check and a named check in every row');
  return reasons;
}

export function checkFile(path, read, options) {
  const { reasons, draft } = inspectFile(path, read, options);
  return draft ? [...reasons, DRAFT_REASON] : reasons;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), paths = [];
    let workspace, glossaryPath, projectGlossaryPath;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--workspace') {
        if (workspace || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('--workspace needs one folder');
        workspace = resolve(args[++i]);
      } else if (['--glossary', '--project-glossary'].includes(args[i])) {
        const project = args[i] === '--project-glossary';
        if ((project ? projectGlossaryPath : glossaryPath) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`${args[i]} needs one file`);
        const path = resolve(args[++i]);
        if (project) projectGlossaryPath = path; else glossaryPath = path;
      } else if (args[i].startsWith('--')) throw Error(`Unknown option: ${args[i]}`);
      else paths.push(args[i]);
    }
    if (!paths.length) throw Error('Usage: node scripts/brief-check.mjs [--workspace <folder>] [--glossary <file>] [--project-glossary <file>] <brief-or-plan.md> [...]');
    const configPath = statePath(resolve(workspace ?? process.cwd()), 'config.json');
    const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
    let failed = false, drafted = false;
    for (const path of paths) {
      try {
        const { reasons, warnings, ambiguity, draft } = inspectFile(resolve(path), undefined, { workspace, config, glossaryPaths: [glossaryPath, projectGlossaryPath] });
        if (ambiguity) console.log(`${path}: ambiguity: ${ambiguity.unmeasured} of ${ambiguity.total} goals unmeasured`);
        for (const warning of warnings) console.error(`${path}: warning: ${warning}`);
        if (reasons.length) { failed = true; console.error(`${path}:\n${reasons.join('\n')}`); recordToolSignal('broken-brief', path, { area: 'brief-check', root: workspace, what: reasons.join('\n') }); }
        else if (draft) { drafted = true; console.log(`${path}: draft: pending (structure OK, not launchable: ${draft})`); }
        else console.log(`${path}: OK (structure only; no acceptance authority)`);
      } catch (error) { failed = true; console.error(`${path}: ${error.message}`); recordToolSignal('broken-brief', path, { area: 'brief-check', root: workspace, what: error.message }); }
    }
    process.exitCode = failed ? 1 : drafted ? 2 : 0; // 2 = structurally valid draft with pending seats; no signal
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
