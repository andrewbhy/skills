// Coordinator-only recipe; never supply seed instructions or scoring to the session.
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function prepare(name, destination, seed = false) {
  if (!['budget', 'ui', 'outside'].includes(name)) throw new Error('Unknown fixture');
  const sources = fileURLToPath(new URL('./', import.meta.url)), target = resolve(destination);
  const rel = relative(sources, target);
  if (!rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\')) throw new Error('Destination must be outside fixture sources');
  await mkdir(target); // Exclusive; never overwrite an existing run.
  for (const entry of await readdir(join(sources, name))) {
    await cp(join(sources, name, entry), join(target, entry), { recursive: true, force: false, errorOnExist: true });
  }
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${join(target, '.git/hooks')}`, ...args], {
    cwd: target, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'core.autocrlf', 'false');
  const commit = message => { git('add', '--all'); git('commit', '--allow-empty', '-qm', message); return git('rev-parse', 'HEAD'); };
  const base = commit('baseline');
  if (name === 'budget') {
    await writeFile(join(target, 'test/repeated.test.mjs'), `import test from 'node:test';\nimport { setTimeout } from 'node:timers/promises';\n\ntest('${seed ? '' : '[risk: unstable formatting] '}repeated formatting', async () => {\n  await setTimeout(${seed ? 3500 : 0});\n});\n`);
  } else if (name === 'ui') {
    const path = join(target, 'index.html');
    const html = await readFile(path, 'utf8');
    await writeFile(path, html.replace('translateX(0)', seed ? 'translateX(150vw)' : 'translateX(2px)'));
  } else if (seed) {
    const path = join(target, 'vendor/notebook.mjs');
    await writeFile(path, (await readFile(path, 'utf8')).replace('items: selected', 'items: selected.reverse()'));
  }
  const revision = commit('candidate');
  return { base, revision };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [name, destination, flag, ...extra] = process.argv.slice(2);
    if (!destination || flag && flag !== '--seed' || extra.length) throw new Error('Usage: node prepare.mjs <budget|ui|outside> <new-directory> [--seed]');
    console.log(JSON.stringify(await prepare(name, destination, flag === '--seed')));
  } catch (error) {
    console.error(error.code ? 'Cannot prepare fixture; use a new directory outside fixture sources' : error.message);
    process.exitCode = 1;
  }
}
