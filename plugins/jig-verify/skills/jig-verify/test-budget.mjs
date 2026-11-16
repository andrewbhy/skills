if (process.argv[2] === '--help') { console.log('Usage: node skills/jig-verify/test-budget.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Canonical source; sync-skills.mjs ships this dependency-free helper with its callers.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { missedProblems, problemLayers } from './missed-problems.mjs';
export { parseMissedProblems } from './missed-problems.mjs';

const defaults = {
  timeBudgetMs: 10000,
  tokenBudgetMs: 2000,
  gateBudgetMs: 20000,
  fontPassBudgetMs: 20000,
  allFontsBudgetMs: 40000,
  riskTagPattern: '\\[risk:\\s*[^\\]\\s][^\\]]*\\]',
  liveTagPattern: '\\[live:([^@\\]\\s]+)@([^\\]\\s]+)\\]',
  testGlobs: ['**/*.test.js', '**/*.test.mjs', '**/*.test.cjs', '**/*.test.ts', '**/*.test.tsx', '**/*.spec.js', '**/*.spec.ts', '**/*.spec.tsx'],
  excludeGlobs: ['**/node_modules/**', '**/fixtures/**', '**/dist/**', '**/coverage/**'],
  // The default captures the whole quoted literal; project patterns capture just the title.
  testPattern: '\\b(?:test|it)(?:\\.(?:only|skip|todo|concurrent|serial))*\\s*\\(\\s*((?:\'(?:\\\\.|[^\'\\\\\\r\\n])*\'|"(?:\\\\.|[^"\\\\\\r\\n])*"|`(?:\\\\.|[^`\\\\\\r\\n])*`))',
};

// Portable glob subset, shared in meaning with diff-signals: *, ** and ?; forward slashes.
function glob(pattern) {
  let source = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { source += '(?:.*/)?'; i++; }
      else source += '.*';
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(source + '$');
}

export function configuration(cwd, configPath) {
  const path = resolve(cwd, configPath ?? '.jig/testing.json');
  if (configPath && !existsSync(path)) throw new Error('Testing configuration does not exist');
  const input = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Testing configuration must be an object');
  for (const key of Object.keys(input)) if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown testing field: ${key}`);
  const config = { ...defaults, ...input };
  for (const key of ['timeBudgetMs', 'tokenBudgetMs', 'gateBudgetMs', 'fontPassBudgetMs', 'allFontsBudgetMs']) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  for (const key of ['testGlobs', 'excludeGlobs']) {
    if (!Array.isArray(config[key]) || config[key].some(p => typeof p !== 'string' || !p || /^(?:\/|[a-z]:)|\\|\0/i.test(p) || p.split('/').includes('..'))) {
      throw new Error(`${key} must be project-relative globs with forward slashes`);
    }
  }
  if (!config.testGlobs.length) throw new Error('testGlobs must not be empty');
  for (const key of ['riskTagPattern', 'liveTagPattern', 'testPattern']) {
    if (typeof config[key] !== 'string' || !config[key]) throw new Error(`${key} must be a non-empty regex source`);
    const regex = new RegExp(config[key], key === 'testPattern' ? 'gm' : '');
    if (regex.test('')) throw new Error(`${key} must not match an empty string`);
  }
  return config;
}

export function inventory(cwd, configPath) {
  const config = configuration(cwd, configPath);
  const include = config.testGlobs.map(glob), exclude = config.excludeGlobs.map(glob);
  const tests = [], files = [], unrecognizedFiles = [], unsupportedDeclarations = [];
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name;
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      if (exclude.some(re => re.test(path) || entry.isDirectory() && re.test(path + '/'))) continue;
      if (entry.isDirectory()) { walk(join(directory, entry.name), path + '/'); continue; }
      if (!entry.isFile() || !include.some(re => re.test(path))) continue;
      files.push(path);
      const text = readFileSync(join(directory, entry.name), 'utf8');
      const pattern = new RegExp(config.testPattern + (config.testPattern === defaults.testPattern ? '(?=\\s*[,\\)])' : ''), 'gm');
      const risk = new RegExp(config.riskTagPattern), live = new RegExp(config.liveTagPattern);
      let count = 0;
      const recognized = new Set();
      for (const match of text.matchAll(pattern)) {
        if (!match[1]) throw new Error('testPattern must capture a non-empty title in group 1');
        count++;
        recognized.add(match.index);
        const title = config.testPattern === defaults.testPattern ? match[1].slice(1, -1) : match[1];
        if (config.testPattern === defaults.testPattern && match[1].startsWith('`') && title.includes('${')) {
          unsupportedDeclarations.push({ file: path, line: text.slice(0, match.index).split('\n').length });
        }
        const tag = live.exec(title);
        if (tag && (!tag[1] || !tag[2])) throw new Error('liveTagPattern must capture system and version in groups 1 and 2');
        tests.push({ file: path, line: text.slice(0, match.index).split('\n').length, title,
          risk: risk.exec(title)?.[0] ?? null,
          live: tag ? { system: tag[1], version: tag[2] } : null,
          invalidLiveTag: /\[live[:\]]/.test(title) && !tag });
      }
      if (config.testPattern === defaults.testPattern) {
        for (const match of text.matchAll(/\b(?:test|it)(?:\.(?:only|skip|todo|concurrent|serial))*\s*\(/g)) {
          if (!recognized.has(match.index)) unsupportedDeclarations.push({ file: path, line: text.slice(0, match.index).split('\n').length });
        }
      }
      if (!count) unrecognizedFiles.push(path);
    }
  };
  walk(cwd);
  return { config, files, tests, unrecognizedFiles, unsupportedDeclarations };
}

export async function testBudget(cwd, command, configPath) {
  if (!Array.isArray(command) || !command.length || !command[0] || command.some(s => typeof s !== 'string')) throw new Error('Supply a test executable and arguments after --');
  const scanned = inventory(cwd, configPath);
  const start = performance.now();
  // No shell: arguments (including globs and spaces) reach the test runner unchanged.
  const execution = await new Promise(resolveRun => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // A nested runner is an independent run, not a node:test worker.
    const child = spawn(command[0] === 'node' ? process.execPath : command[0], command.slice(1), {
      cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Bound captured output; child streams continue draining after the cap.
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(0, 65536); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(0, 65536); });
    child.on('error', error => resolveRun({ exitCode: null, signal: null, error: error.code, stdout, stderr }));
    child.on('close', (exitCode, signal) => resolveRun({ exitCode, signal, stdout, stderr }));
  });
  const elapsedMs = performance.now() - start;
  const missingRiskTags = scanned.tests.filter(t => !t.risk);
  const invalidLiveTags = scanned.tests.filter(t => t.invalidLiveTag);
  const overBudget = elapsedMs > scanned.config.timeBudgetMs;
  const passed = execution.exitCode === 0 && !execution.error && !overBudget && !missingRiskTags.length
    && !invalidLiveTags.length && !scanned.unrecognizedFiles.length && !scanned.unsupportedDeclarations.length && scanned.tests.length > 0;
  return { passed, command, elapsedMs, timeBudgetMs: scanned.config.timeBudgetMs, overBudget,
    files: scanned.files, testCount: scanned.tests.length, missingRiskTags, invalidLiveTags,
    liveTests: scanned.tests.filter(t => t.live), unrecognizedFiles: scanned.unrecognizedFiles,
    unsupportedDeclarations: scanned.unsupportedDeclarations, execution };
}

export async function testingSummary(cwd, command, configPath) {
  const intake = missedProblems(cwd);
  const { entries, path, present, warnings, openRepeats } = intake;
  const byLayer = Object.fromEntries(problemLayers.map(layer => [layer, 0]));
  const bySource = { script: 0, model: 0, person: 0, unknown: 0 };
  for (const entry of entries) byLayer[entry.layer]++;
  for (const entry of entries) bySource[entry.source || 'unknown']++;
  const result = await testBudget(cwd, command, configPath);
  const systems = new Map();
  for (const { live } of result.liveTests) {
    const key = JSON.stringify([live.system, live.version]);
    if (!systems.has(key)) systems.set(key, { ...live, count: 0 });
    systems.get(key).count++;
  }
  return { ...result, summary: {
    suite: { count: result.testCount, elapsedMs: result.elapsedMs, timeBudgetMs: result.timeBudgetMs },
    live: { count: result.liveTests.length, versions: [...systems.values()] },
    missedProblems: { path, present, count: entries.length, byLayer, bySource, warnings, openRepeats },
  } };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let json = false;
  try {
    const args = process.argv.slice(2), split = args.indexOf('--');
    if (split < 0) throw new Error('Usage: node test-budget.mjs [--summary] [--json] [--config path] -- <executable> [args...]');
    const options = args.slice(0, split);
    let configPath, summary = false;
    for (let i = 0; i < options.length; i++) {
      if (options[i] === '--json' && !json) json = true;
      else if (options[i] === '--summary' && !summary) summary = true;
      else if (options[i] === '--config' && !configPath && options[i + 1]) configPath = options[++i];
      else throw new Error('Unknown or incomplete test-budget option');
    }
    const result = await (summary ? testingSummary : testBudget)(process.cwd(), args.slice(split + 1), configPath);
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.passed ? 'Passed' : 'Failed'}: ${result.testCount} tests; ${result.elapsedMs.toFixed(1)}ms / ${result.timeBudgetMs}ms${result.overBudget ? ' OVER BUDGET: delete or merge tests' : ''}`);
      if (result.summary) {
        console.log(`Live test count: ${result.summary.live.count}`);
        for (const version of result.summary.live.versions) console.log(`Live version: ${version.system}@${version.version}: ${version.count}`);
        const problems = result.summary.missedProblems;
        console.log(`Missed problems: ${problems.count}; ${problems.path}${problems.present ? '' : ' (missing; no history recorded)'}`);
        for (const warning of problems.warnings) console.log(warning);
        for (const repeat of problems.openRepeats) console.log(`Open repeat: ${repeat.id}: ${repeat.reason}`);
        for (const [layer, count] of Object.entries(problems.byLayer)) console.log(`Missed problem layer: ${layer}: ${count}`);
      }
      for (const test of result.missingRiskTags) console.log(`Missing risk: ${test.file}:${test.line} ${test.title}`);
      for (const test of result.liveTests) console.log(`Live: ${test.file}:${test.line} ${test.live.system}@${test.live.version} ${test.title}`);
      for (const test of result.invalidLiveTags) console.log(`Missing live system/version: ${test.file}:${test.line} ${test.title}`);
      for (const file of result.unrecognizedFiles) console.log(`No recognized test declarations: ${file}`);
      for (const test of result.unsupportedDeclarations) console.log(`Unsupported test title: ${test.file}:${test.line}`);
      if (!result.testCount) console.log('No tests discovered; check testGlobs and testPattern');
      if (result.execution.error || result.execution.exitCode !== 0) console.log(`Command failed: ${result.execution.error ?? result.execution.signal ?? result.execution.exitCode}`);
      process.stdout.write(result.execution.stdout);
      process.stderr.write(result.execution.stderr);
    }
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) {
    if (json || process.argv.includes('--json')) console.log(JSON.stringify({ passed: false, error: error.message }));
    else console.error(error.message);
    process.exitCode = 1;
  }
}
