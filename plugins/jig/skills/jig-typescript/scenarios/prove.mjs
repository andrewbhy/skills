import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const [mode, folder, fixture = 'clean'] = process.argv.slice(2);
const pins = {
  typescript: '7.0.2',
  '@biomejs/biome': '2.6.6',
  oxlint: '1.92.0',
  'oxlint-tsgolint': '7.0.2006',
  knip: '6.44.2',
};

if (!['prepare', 'run'].includes(mode) || (mode === 'run' && !folder)
  || !['clean', 'explicit', 'implicit'].includes(fixture) || process.argv.length > 5) {
  throw new Error('Usage: node prove.mjs prepare [temporary-folder] [clean|explicit|implicit] | run <temporary-folder>');
}
const root = folder ? resolve(folder) : mkdtempSync(join(tmpdir(), 'jig-typescript-'));
if (mode === 'prepare') {
  mkdirSync(join(root, 'src'), { recursive: true });
  for (const file of ['tsconfig.json', 'biome.json']) { // starter copies are named *.starter.json so tools never load them from the skill folder
    copyFileSync(join(here, '../starter', file.replace('.json', '.starter.json')), join(root, file));
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'jig-typescript-proof', private: true, type: 'module', devDependencies: pins,
    scripts: {
      test: 'node --experimental-strip-types --test test/*.test.mjs',
      typecheck: 'node node_modules/typescript/bin/tsc --project tsconfig.json',
      lint: 'node node_modules/@biomejs/biome/bin/biome check src --error-on-warnings',
      'lint:types': 'node node_modules/oxlint/bin/oxlint --type-aware --deny typescript/no-floating-promises --deny typescript/no-unsafe-type-assertion src',
      knip: 'node node_modules/knip/bin/knip.js --include exports --include-entry-exports --no-progress --no-config-hints',
    },
  }, null, 2) + '\n');
  writeFileSync(join(root, 'knip.json'), JSON.stringify({
    entry: ['test/*.test.mjs'],
    project: ['src/**/*.ts', 'test/**/*.mjs'],
    ignoreDependencies: ['oxlint', 'oxlint-tsgolint'],
  }, null, 2) + '\n');
  copyFileSync(join(here, fixture === 'explicit' ? 'planted.ts' : `${fixture}.ts`), join(root, 'src/index.ts'));
  copyFileSync(join(here, `${fixture === 'implicit' ? 'implicit' : 'explicit'}.README.md`), join(root, 'README.md'));
  mkdirSync(join(root, 'test'), { recursive: true });
  copyFileSync(join(here, fixture === 'implicit' ? 'implicit-behaviour.mjs' : 'behaviour.mjs'), join(root, 'test/title.test.mjs'));
  console.log(root);
} else {
  for (const [name, version] of Object.entries(pins)) {
    const actual = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'))).version;
    if (actual !== version) throw new Error(`Expected ${name}@${version}, got ${actual}`);
  }
  const commands = {
    behaviour: ['--experimental-strip-types', '--test', 'test/*.test.mjs'],
    tsc: ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'],
    biome: ['node_modules/@biomejs/biome/bin/biome', 'check', 'src', '--error-on-warnings'],
    oxlint: ['node_modules/oxlint/bin/oxlint', '--type-aware', '--deny', 'typescript/no-floating-promises', '--deny', 'typescript/no-unsafe-type-assertion', 'src'],
    knip: ['node_modules/knip/bin/knip.js', '--include', 'exports', '--include-entry-exports', '--no-progress', '--no-config-hints'],
  };
  const cases = [
    { name: 'clean', file: 'clean.ts', expected: { behaviour: 0, tsc: 0, biome: 0, oxlint: 0, knip: 0 } },
    { name: 'planted', file: 'planted.ts', expected: { behaviour: 0, tsc: 1, biome: 1, oxlint: 1, knip: 1 },
      diagnostics: { tsc: ['TS2322'], biome: ['noExplicitAny', 'noUnsafeTypeAssertion', 'noFloatingPromises'],
        oxlint: ['no-floating-promises', 'no-unsafe-type-assertion'], knip: ['obsolete'] } },
    { name: 'explicit-any', code: 'export const value: any = 1;\n', expected: { tsc: 0, biome: 1 }, diagnostics: { biome: ['noExplicitAny'] } },
    { name: 'unchecked-cast', code: 'const value: unknown = 1;\nexport const asserted = value as string;\n', expected: { tsc: 0, biome: 1 }, diagnostics: { biome: ['noUnsafeTypeAssertion'] } },
    { name: 'floating-promise', code: 'Promise.resolve(1);\n', expected: { tsc: 0, biome: 1 }, diagnostics: { biome: ['noFloatingPromises'] } },
    { name: 'unused-export', code: 'export const obsolete = 1;\n', expected: { tsc: 0, biome: 0, knip: 1 }, diagnostics: { knip: ['Unused exports (1)', 'obsolete'] } },
    { name: 'formatting-only', code: 'export const value=1;\n', expected: { tsc: 0, biome: 1 }, diagnostics: { biome: ['format'] } },
    { name: 'deleted-module', code: '', expected: { behaviour: 1 }, diagnostics: { behaviour: ['renderTitle'] } },
    { name: 'implicit-planted', file: 'implicit.ts', tests: 'implicit-behaviour.mjs',
      expected: { behaviour: 1 }, diagnostics: { behaviour: ['ingress rejects empty titles', 'ingress rejects whitespace-only titles', 'Missing expected exception'] } },
    { name: 'implicit-clean', file: 'implicit-clean.ts', tests: 'implicit-behaviour.mjs',
      expected: { behaviour: 0, tsc: 0, biome: 0, oxlint: 0, knip: 0 } },
    { name: 'implicit-empty-accepted', code: readFileSync(join(here, 'implicit-clean.ts'), 'utf8')
      .replace('external.title.trim().length === 0', 'false'), tests: 'implicit-behaviour.mjs',
      expected: { behaviour: 1 }, diagnostics: { behaviour: ['ingress rejects empty titles', 'Missing expected exception'] } },
    { name: 'implicit-whitespace-accepted', code: readFileSync(join(here, 'implicit-clean.ts'), 'utf8')
      .replace('external.title.trim().length === 0', 'external.title.length === 0'), tests: 'implicit-behaviour.mjs',
      expected: { behaviour: 1 }, diagnostics: { behaviour: ['ingress rejects whitespace-only titles', 'Missing expected exception'] } },
    { name: 'restored-clean', file: 'clean.ts', expected: { behaviour: 0, tsc: 0, biome: 0, oxlint: 0, knip: 0 } },
  ];
  const results = [];
  try {
    for (const scenario of cases) {
      copyFileSync(join(here, scenario.tests ?? 'behaviour.mjs'), join(root, 'test/title.test.mjs'));
      writeFileSync(join(root, 'src/index.ts'), scenario.file
        ? readFileSync(join(here, scenario.file), 'utf8') : scenario.code);
      for (const [tool, expected] of Object.entries(scenario.expected)) {
        const args = commands[tool];
        const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 60_000 });
        const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
          .replaceAll(root, '<temp>').replaceAll(root.replaceAll('\\', '/'), '<temp>');
        const missingDiagnostics = (scenario.diagnostics?.[tool] ?? []).filter(text => !output.includes(text));
        results.push({ scenario: scenario.name, command: `node ${args.join(' ')}`,
          expected, exit: result.status, missingDiagnostics, output, error: result.error?.code ?? null });
      }
    }
  } finally {
    copyFileSync(join(here, 'clean.ts'), join(root, 'src/index.ts'));
    copyFileSync(join(here, 'behaviour.mjs'), join(root, 'test/title.test.mjs'));
  }
  const report = { node: process.version, platform: process.platform, pins, results };
  writeFileSync(join(root, 'proof.json'), JSON.stringify(report, null, 2) + '\n');
  for (const result of results) {
    console.log(`${result.scenario}: ${result.command} => ${result.exit} (expected ${result.expected})`);
    if (result.exit !== result.expected || result.error || result.missingDiagnostics.length) process.exitCode = 1;
  }
  console.log('Full diagnostics: proof.json in the temporary folder; clean fixture restored.');
}
