import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Exercise the coordinator's sandbox patch until it is applied. After applying,
// exercise the canonical source directly. No installed skill is overwritten.
export function skillCandidate(file) {
  const patchFile = '.jig/skill-patch.diff';
  const current = existsSync(file) ? readFileSync(file, 'utf8').replaceAll('\r\n', '\n') : '';
  if (!existsSync(patchFile)) return current;
  const section = readFileSync(patchFile, 'utf8').split(`diff --git a/${file} b/${file}\n`)[1]?.split('\ndiff --git ')[0];
  if (!section) return current;
  let base = '';
  try { base = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replaceAll('\r\n', '\n'); } catch { /* new file */ }
  const lines = base.split('\n'), result = [];
  let cursor = 0;
  for (const hunk of section.split(/^@@ /m).slice(1)) {
    const [header, ...body] = hunk.split('\n');
    const start = Number(header.match(/^-(\d+)/)[1]);
    const index = Math.max(0, start - 1);
    result.push(...lines.slice(cursor, index)); cursor = index;
    for (const line of body) {
      if (line.startsWith(' ') || line.startsWith('-')) {
        if (lines[cursor] !== line.slice(1)) throw new Error(`Patch context mismatch: ${file}`);
        cursor++;
      }
      if (line.startsWith(' ') || line.startsWith('+')) result.push(line.slice(1));
    }
  }
  result.push(...lines.slice(cursor));
  const candidate = result.join('\n');
  if (current !== base && current !== candidate) throw new Error(`Skill patch is stale against working source: ${file}`);
  return current === candidate ? current : candidate;
}
