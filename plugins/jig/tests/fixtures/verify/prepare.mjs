// Coordinator helper: never include this file in the project given to a session.
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const recipes = {
  'reading-list': ['items.mjs', 'title.trim().length === 0', 'title.length === 0'],
  'import-parser': ['parse-items.mjs', 'record.title.trim().length === 0', 'record.title.length === 0'],
};

const [name, destination, flag, ...extra] = process.argv.slice(2);
if (!Object.hasOwn(recipes, name) || !destination || (flag && flag !== '--seed') || extra.length) {
  console.error('Usage: node prepare.mjs <reading-list|import-parser> <new-directory> [--seed]');
  process.exitCode = 1;
} else {
  const source = fileURLToPath(new URL(`./${name}/`, import.meta.url));
  const target = resolve(destination);
  const withinSource = relative(source, target);
  if (!withinSource || (!isAbsolute(withinSource) && withinSource !== '..' && !withinSource.startsWith('..\\') && !withinSource.startsWith('../'))) {
    throw new Error('Destination must be outside the source fixture.');
  }
  // Exclusive creation refuses existing destinations, including the source.
  // The caller must create the parent directory first.
  await mkdir(target);
  for (const entry of await readdir(source)) {
    await cp(resolve(source, entry), resolve(target, entry), {
      recursive: true, force: false, errorOnExist: true,
    });
  }
  if (flag === '--seed') {
    const [file, before, after] = recipes[name];
    const path = resolve(target, file);
    const contents = await readFile(path, 'utf8');
    if (contents.split(before).length !== 2) {
      throw new Error(`Expected exactly one validator in ${file}; copy left unseeded.`);
    }
    await writeFile(path, contents.replace(before, after));
  }
  console.log(`Prepared ${name} at ${target} (${flag === '--seed' ? 'seeded' : 'clean'}).`);
}
