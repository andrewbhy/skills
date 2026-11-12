// Coordinator helper; do not supply this file or scoring notes to the reviewer.
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function prepare(name, destination, seed = false) {
  if (!['mechanical', 'business', 'dependency'].includes(name)) throw new Error('Unknown fixture');
  const fixtures = fileURLToPath(new URL('./', import.meta.url));
  const target = resolve(destination);
  const rel = relative(fixtures, target);
  if (!rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\')) throw new Error('Destination must be outside fixture sources');
  await mkdir(target); // Exclusive; never overwrite a previous run.
  for (const entry of await readdir(join(fixtures, name))) {
    await cp(join(fixtures, name, entry), join(target, entry), { recursive: true, force: false, errorOnExist: true });
  }
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${join(target, '.git/hooks')}`, ...args], { cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'core.autocrlf', 'false');
  const commit = message => { git('add', '--all'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  // The old acceptance test passes on the base; candidate updates it with the task.
  const base = commit('baseline');
  if (name === 'mechanical') {
    for (const file of seed ? ['catalog.mjs'] : ['catalog.mjs', 'cli.mjs']) {
      const path = join(target, file);
      await writeFile(path, (await readFile(path, 'utf8')).replaceAll('addItem', 'appendItem'));
    }
  } else if (name === 'business') {
    await writeFile(join(target, 'pricing.mjs'), `export function discount(subtotal) {\n  return subtotal ${seed ? '>' : '>='} 100 ? subtotal * 0.1 : 0;\n}\n`);
    const path = join(target, 'test/pricing.test.mjs');
    await writeFile(path, (await readFile(path, 'utf8')).replace('discount(200), 20', 'discount(100), 10'));
  } else {
    const path = join(target, 'package.json');
    const pkg = JSON.parse(await readFile(path, 'utf8'));
    pkg.dependencies = { 'tiny-invariant': (seed ? '^' : '') + '1.3.3' };
    await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
  }
  const revision = commit('candidate');
  return { base, revision };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [name, destination, flag, ...extra] = process.argv.slice(2);
    if (!destination || flag && flag !== '--seed' || extra.length) throw new Error('Usage: node prepare.mjs <mechanical|business|dependency> <new-directory> [--seed]');
    console.log(JSON.stringify(await prepare(name, destination, flag === '--seed')));
  } catch (error) {
    console.error(error.code ? 'Cannot prepare fixture; use a new directory outside the fixture sources' : error.message);
    process.exitCode = 1;
  }
}
