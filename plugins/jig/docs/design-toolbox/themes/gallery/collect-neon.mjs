// Maintainer command: pinned colour data and licence notices, never editor code.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const projects = [
  ['synthwave-84', 'robb0wen/synthwave-vscode', 'ecfa2fe1279f7233663fa3f98a96e6756000567b', 'themes/synthwave-color-theme.json', 'LICENSE', 'Robb Owen'],
  ['shades-of-purple', 'ahmadawais/shades-of-purple-vscode', 'e8eb49f33e5db05ceba6677367b33ddb27ad821c', 'themes/shades-of-purple-color-theme.json', 'LICENSE.md', 'Ahmad Awais'],
];
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.text();
}
const sources = JSON.parse(await readFile(join(root, 'sources.json'), 'utf8'));
for (const [id, repo, revision, path, licencePath, attribution] of projects) {
  const raw = `https://raw.githubusercontent.com/${repo}/${revision}/`;
  const [colours, notice] = await Promise.all([get(raw + path), get(raw + licencePath)]);
  if (!notice.includes('MIT License') || !notice.includes('Permission is hereby granted')) throw Error(`Review licence: ${id}`);
  const licenceLocal = `licences/${id}.txt`;
  await writeFile(join(root, licenceLocal), notice.replace(/\r\n/g, '\n'));
  const reuseNotes = id === 'shades-of-purple'
    ? 'The upstream notice additionally says anything built with it should also be MIT licensed. The gallery implementation and its original/adapted palette mappings are distributed under MIT; retain the complete upstream notice.'
    : 'Retain the upstream copyright and MIT permission notice.';
  if (id === 'shades-of-purple' && !notice.includes('Any thing you build with this should also be MIT licensed.')) throw Error('Review changed Shades of Purple condition');
  const record = { id, repo, revision, attribution, licence: 'MIT', reuseNotes,
    sourceUrl: `https://github.com/${repo}/blob/${revision}/${path}`,
    licenceUrl: `https://github.com/${repo}/blob/${revision}/${licencePath}`,
    licenceLocal, availableHex: [...new Set((colours.match(/#[\da-f]{6}\b/gi) ?? []).map(v => v.toLowerCase()))].sort() };
  const index = sources.findIndex(s => s.id === id);
  if (index === -1) sources.push(record); else sources[index] = record;
}
await writeFile(join(root, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
console.log('Recorded two pinned MIT neon sources and notices. Panda excluded: no clear licence at checked revision.');
