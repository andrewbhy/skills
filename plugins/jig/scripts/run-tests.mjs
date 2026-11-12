import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Automatic writers exercised by the suite can never use a person's logs.
const root = mkdtempSync(join(tmpdir(), 'jig-test-signals-'));
try {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=./scripts/slow-tests-reporter.mjs', '--test-reporter-destination=stdout', ...(process.argv.length > 2 ? process.argv.slice(2) : ['tests/*.test.mjs'])], {
    stdio: 'inherit', env: { ...process.env, JIG_SIGNALS_PROJECT: root, JIG_SIGNALS_HOME: join(root, 'home') }
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { rmSync(root, { recursive: true, force: true }); }
