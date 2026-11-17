import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { commandFor } from './command-line.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const columns = ['Word', 'Meaning', 'Measures', 'Status', 'Confirmed on', 'Last verdict', 'Evidence'];
const cells = line => line.trim().slice(1, -1).split('|').map(cell => cell.trim());
const clean = value => typeof value === 'string' && value.trim() && !/[|\r\n]/.test(value);
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fileLink = value => /^\[[^\]\r\n]+\]\(([^)\r\n]+)\)$/.test(value) && !/\]\([a-z][a-z\d+.-]*:/i.test(value);

export function parseGlossary(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const start = lines.findIndex(line => line.trim().startsWith('|'));
  if (start < 0 || JSON.stringify(cells(lines[start])) !== JSON.stringify(columns)) throw Error('Glossary needs the seven documented columns');
  if (!/^\s*\|(?:\s*:?-{3,}:?\s*\|){7}\s*$/.test(lines[start + 1] ?? '')) throw Error('Glossary needs a separator row');
  const entries = new Map();
  for (const line of lines.slice(start + 2)) {
    if (!line.trim()) continue;
    if (!/^\s*\|.*\|\s*$/.test(line)) throw Error('Glossary entries must occupy one physical line');
    const row = cells(line);
    if (row.length !== 7 || row.some(cell => !clean(cell))) throw Error('Glossary needs seven nonempty cells per row');
    const [rawWord, meaning, encoded, status, confirmedOn, lastVerdict, evidence] = row;
    const word = rawWord.toLowerCase();
    if (entries.has(word)) throw Error(`Duplicate glossary word: ${word}`);
    const measures = JSON.parse(encoded);
    if (!Array.isArray(measures) || measures.length < 1 || measures.length > 3 || measures.some(m => !m || ![1, 2].includes(m.tier) || !clean(m.metric) || !clean(m.source))) throw Error(`${word}: needs one to three measures with tier 1/2 and source`);
    if (!['draft', 'confirmed'].includes(status) || (status === 'confirmed' ? !date(confirmedOn) : confirmedOn !== '-')) throw Error(`${word}: invalid status or confirmation date`);
    const verdict = lastVerdict.match(/^(met|not met) on (\d{4}-\d{2}-\d{2}); measures (met|not met)$/);
    if (lastVerdict !== '-' && (!verdict || !date(verdict[2]) || !fileLink(evidence))) throw Error(`${word}: verdict needs a date, both results and a file evidence link`);
    if (evidence !== '-' && !fileLink(evidence)) throw Error(`${word}: evidence must link to a file`);
    entries.set(word, { word, meaning, measures, status, confirmedOn, lastVerdict, evidence });
  }
  return entries;
}

export function loadGlossaries(paths = [], read = path => readFileSync(path, 'utf8')) {
  const result = new Map();
  for (const path of paths.filter(Boolean)) {
    for (const [word, entry] of parseGlossary(read(path))) result.set(word, { ...entry, glossary: path });
  }
  return result;
}

export function measureRows(text) {
  const unfenced = text.replaceAll('\r\n', '\n').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  const body = unfenced.match(/^## Success measures\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
  if (!body) return [];
  const rows = body.split('\n').filter(line => line.trim());
  if (cells(rows[0]).join(',') !== 'Goal,Outcome,Metric,Tier,Baseline,Target,When,Source' || !/^\s*\|(?:\s*:?-{3,}:?\s*\|){8}\s*$/.test(rows[1] ?? '')) throw Error('Success measures needs the documented eight-column table');
  return rows.slice(2).map(line => {
    const row = cells(line);
    if (!/^\s*\|.*\|\s*$/.test(line) || row.length !== 8 || row.some(c => !clean(c)) || !/^G[1-9]\d*$/.test(row[0]) || !/^[123]$/.test(row[3])) throw Error('Invalid Success measures row');
    return row;
  });
}

function contains(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
}

export function confirmedLink(row, allRows, glossary) {
  if (!/^(?:glossary|draft):/i.test(row[7])) return true; // Ordinary direct measures retain their contract.
  const marker = row[7].match(/^glossary:([^;]+);/);
  if (!marker) return false;
  const entry = glossary.get(marker[1].trim().toLowerCase());
  return entry?.status === 'confirmed'
    && entry.measures.some(m => m.metric === row[2] && String(m.tier) === row[3] && row[7] === `glossary:${entry.word}; ${m.source}`)
    && allRows.some(goal => goal[0] === row[0] && goal[3] === '3' && contains(`${goal[1]} ${goal[2]}`, entry.word));
}

// Catalogue rows are templates, never confirmations of personal meaning.
export function catalogueTemplates(text) {
  return text.replaceAll('\r\n', '\n').split('\n').filter(line => /^\|/.test(line)).flatMap(line => {
    const row = cells(line), match = row[1]?.match(/^T([12]) (.+)$/);
    return match && row.length === 5 && ['proposed', 'validated'].includes(row[3])
      ? [{ word: row[0].toLowerCase(), meaning: row[0], measures: [{ metric: match[2], tier: Number(match[1]), source: row[2] }], status: 'draft', confirmedOn: '-' }] : [];
  });
}

export function translateGoals(text, glossary = new Map(), catalogue = '') {
  const existing = measureRows(text);
  if (!existing.length) throw Error('Plan needs Success measures with tier 3 goals');
  const goals = new Map(existing.filter(row => row[3] === '3').map(row => [row[0], row]));
  const rows = [], confirmations = [], drafts = [];
  for (const [id, goal] of goals) {
    const description = `${goal[1]} ${goal[2]}`;
    let matches = [...glossary.values()].filter(entry => contains(description, entry.word));
    if (!matches.length) matches = catalogueTemplates(catalogue).filter(entry => contains(description, entry.word));
    if (!matches.length) {
      const word = goal[1].match(/["'“‘]([^"'”’]+)["'”’]/)?.[1] ?? goal[1];
      drafts.push({ word, status: 'draft', measures: [] });
      confirmations.push(`By '${word}' I have no fitting catalogue measure yet (draft). Your verdict stays final.`);
      continue;
    }
    const proposed = matches.flatMap(entry => entry.measures);
    if (proposed.length > 3) throw Error(`${id}: translation exceeds three measures; merge goals or narrow the meaning`);
    for (const entry of matches) {
      if (entry.status === 'draft') drafts.push(entry);
      for (const measure of entry.measures) {
        const marker = `${entry.status === 'confirmed' ? 'glossary' : 'draft'}:${entry.word}`;
        const row = [id, goal[1], measure.metric, String(measure.tier), 'unknown', 'choose before launch', goal[6], `${marker}; ${measure.source}`];
        if (!existing.some(old => old[0] === id && old[2] === row[2] && old[3] === row[3] && old[7] === row[7])) rows.push(row);
      }
    }
    const citations = matches.map(entry => entry.status === 'confirmed' ? `glossary '${entry.word}', ${entry.confirmedOn}` : `'${entry.word}' draft`).join('; ');
    confirmations.push(`By '${matches.map(entry => entry.word).join(', ')}' I will measure: ${proposed.map(m => m.metric).join('; ')} (${citations}). Your verdict stays final.`);
  }
  if (existing.length + rows.length > 4) throw Error('Success measures would exceed four rows; merge goals before translating');
  return { rows: rows.map(row => `| ${row.join(' | ')} |`), confirmations, drafts };
}

export function recordVerdict(text, { word, measures, verdict, on, evidence }) {
  const entries = parseGlossary(text), key = word?.toLowerCase();
  if (!entries.has(key)) throw Error(`Unknown glossary word: ${word}`);
  if (!['met', 'not met'].includes(measures) || !['met', 'not met'].includes(verdict) || !date(on) || !clean(evidence) || /[\[\]()]/.test(evidence) || /^[a-z][a-z\d+.-]*:/i.test(evidence)) throw Error('Verdict needs both results, an ISO date and a relative file evidence path');
  const updated = text.replaceAll('\r\n', '\n').split('\n').map(line => {
    if (!line.trim().startsWith('|') || cells(line)[0]?.toLowerCase() !== key) return line;
    const row = cells(line);
    row[5] = `${verdict} on ${on}; measures ${measures}`;
    row[6] = `[evidence](${evidence})`;
    return `| ${row.join(' | ')} |`;
  }).join('\n');
  parseGlossary(updated);
  return updated;
}

export function failedTranslations(glossary) {
  return [...glossary.values()].filter(entry => entry.lastVerdict?.startsWith('not met on '));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), command = args[0]?.startsWith('--') ? 'translate' : args.shift(), options = {};
    const allowed = command === 'verdict' ? ['glossary', 'word', 'measures', 'verdict', 'date', 'evidence'] : command === 'retro' ? ['glossary', 'project-glossary'] : ['plan', 'glossary', 'project-glossary', 'catalogue'];
    if (!['translate', 'retro', 'verdict'].includes(command)) throw Error(`Usage: ${commandFor(import.meta.url)} [verdict|retro] --glossary <file> [options]`);
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2);
      if (!args[i].startsWith('--') || !allowed.includes(key) || options[key] || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Invalid option: ${args[i]}`);
      options[key] = args[i + 1];
    }
    if (!options.glossary) throw Error('--glossary is required (use an empty glossary for new vocabulary)');
    if (command === 'verdict') {
      const path = options.glossary;
      writeFileSync(path, recordVerdict(readFileSync(path, 'utf8'), { ...options, on: options.date, measures: options.measures?.replace('-', ' '), verdict: options.verdict?.replace('-', ' ') }));
      console.log('Verdict recorded; the person stays final.');
    } else {
      const glossary = loadGlossaries([options.glossary, options['project-glossary']]);
      if (command === 'retro') console.log(failedTranslations(glossary).map(e => `${e.word}: ${e.lastVerdict}; ${e.evidence}; revise and reconfirm translation`).join('\n') || 'No recorded failed translations; missing verdicts remain unknown.');
      else {
        if (!options.plan) throw Error('--plan is required');
        const localCatalogue = new URL('./measures.md', import.meta.url);
        const output = translateGoals(readFileSync(options.plan, 'utf8'), glossary, readFileSync(options.catalogue ?? (existsSync(localCatalogue) ? localCatalogue : new URL('../docs/measures.md', import.meta.url)), 'utf8'));
        console.log([...output.rows, ...output.confirmations].join('\n'));
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
