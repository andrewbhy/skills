import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';

// This checks the specified checkout, not another branch or a stale inventory.
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    repo: { type: 'string' }, loaded: { type: 'string' }, file: { type: 'string' },
  } });
  const sources = Number(values.loaded !== undefined) + Number(values.file !== undefined) + Number(positionals.length > 0);
  if (sources > 1) throw new Error('Supply loaded names by arguments, --loaded, --file or stdin, not several');
  const text = values.file !== undefined ? readFileSync(values.file, 'utf8') : values.loaded ?? (positionals.length ? positionals.join(' ') : readFileSync(0, 'utf8'));
  let names;
  if (text.trim().startsWith('[')) {
    names = JSON.parse(text);
    if (!Array.isArray(names) || !names.every(n => typeof n === 'string')) throw new Error('Loaded skills must be a JSON string array or whitespace/comma-separated names');
  } else names = text.split(/[\s,]+/).filter(Boolean);
  const loaded = new Set(names), root = resolve(values.repo ?? '.');
  const skills = readdirSync(join(root, '.agents', 'skills'), { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('jig-') && existsSync(join(root, '.agents', 'skills', e.name, 'SKILL.md')))
    .map(e => e.name).sort();
  console.log(`Jig skills in current checkout: ${skills.join(', ') || '(none)'}`);
  const missing = skills.filter(n => !loaded.has(n));
  if (missing.length) {
    console.log(`Missing skills: ${missing.join(', ')}`);
    console.log('Fix: install or update the jig plugin, then start a fresh session');
    process.exitCode = 1;
  } else console.log('No missing jig skills.');
} catch (error) { console.error(error.message); process.exitCode = 2; }
