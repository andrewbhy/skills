if (process.argv[2] === '--help') { console.log('Usage: node scripts/statusline-usage.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Optional status-line capture: JSON on stdin; only allowance fields are stored.
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultStatusFile, normalizeLimits } from './usage.mjs';

try {
  const { values } = parseArgs({ options: { 'status-file': { type: 'string' }, now: { type: 'string' } } });
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const limits = normalizeLimits(payload?.rate_limits);
  if (Object.keys(limits).length) {
    const now = values.now ? new Date(values.now) : new Date();
    if (!Number.isFinite(+now)) throw new Error('--now must be a date');
    const file = values['status-file'] ?? defaultStatusFile();
    mkdirSync(dirname(file), { recursive: true });
    const record = JSON.stringify({ saved_at: now.toISOString(), rate_limits: limits }) + '\n';
    writeFileSync(file, record);
    appendFileSync(join(dirname(file), 'usage-history.jsonl'), record);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
