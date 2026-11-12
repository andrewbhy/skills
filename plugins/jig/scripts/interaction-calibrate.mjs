#!/usr/bin/env node
// Re-run the jig-interaction calibration: does layer (a) still flag the recorded rejection reasons?
// Run after every checker or seat edit:  node scripts/interaction-calibrate.mjs
// Exit 0 when the score meets the pass mark and no reason that was caught before is lost; 1 otherwise.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check } from './interaction-check.mjs';

export function calibrate(dir) {
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const rows = [];
  const controls = [];
  for (const spec of manifest.specs) {
    const findings = check(JSON.parse(readFileSync(resolve(dir, spec.file), 'utf8'))).findings.filter((f) => f.severity === 'error');
    if (spec.control && !controls.some(c => c.file === spec.control)) {
      const errors = check(JSON.parse(readFileSync(resolve(dir, spec.control), 'utf8'))).findings.filter(f => f.severity === 'error');
      controls.push({ file: spec.control, clean: errors.length === 0, findings: errors });
    }
    for (const reason of spec.reasons) {
      const hit = reason.rule ? findings.find((f) => f.rule === reason.rule && new RegExp(reason.match).test(f.message)) : undefined;
      rows.push({ id: reason.id, label: reason.label, required: reason.required === true, flagged: Boolean(hit), evidence: hit ? `rule ${hit.rule}: ${hit.message}` : 'not flagged by the script (known gap)' });
    }
  }
  return { rows, controls, score: rows.filter((r) => r.flagged).length, total: rows.length, passMark: manifest.passMark };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const dir = process.argv[2] ?? new URL('../tests/fixtures/interaction/calibration/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const result = calibrate(dir);
  for (const row of result.rows) console.log(`${row.id} ${row.flagged ? 'flagged ' : 'MISSED  '} ${row.label}: ${row.evidence}`);
  for (const control of result.controls) console.log(`control ${control.file}: ${control.clean ? 'clean' : JSON.stringify(control.findings)}`);
  console.log(`layer (a): ${result.score} of ${result.total} (pass mark ${result.passMark})`);
  process.exitCode = result.score >= result.passMark && result.rows.every(r => !r.required || r.flagged) && result.controls.every(c => c.clean) ? 0 : 1;
}
