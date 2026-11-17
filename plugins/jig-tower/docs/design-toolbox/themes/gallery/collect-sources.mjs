import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Maintainer tool: refresh pinned provenance and licence copies, never used by the page.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const projects = [
  ['nord','nordtheme/nord','develop','src/nord.scss','license','Sven Greb (Nord)'],
  ['solarized','altercation/solarized','master','README.md','LICENSE','Ethan Schoonover'],
  ['catppuccin','catppuccin/catppuccin','main','README.md','LICENSE','Catppuccin contributors'],
  ['dracula','dracula/dracula-theme','main','README.md','LICENSE','Dracula Theme; created by Zeno Rocha'],
  ['tokyo-night','enkia/tokyo-night-vscode-theme','master','themes/tokyo-night-color-theme.json','LICENSE.txt','Enkia'],
  ['gruvbox','morhetz/gruvbox','master','colors/gruvbox.vim','README.md','Pavel Pertsev (morhetz)'],
];
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.text();
}
await mkdir(join(root, 'licences'), { recursive: true });
// Wada has a separate pinned collector; preserve that source when refreshing editors.
const existing = JSON.parse(await readFile(join(root,'sources.json'),'utf8'));
const sources = [];
for (const [id,repo,branch,path,licencePath,attribution] of projects) {
  const commit = JSON.parse(await get(`https://api.github.com/repos/${repo}/commits/${branch}`)).sha;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid revision');
  const raw = `https://raw.githubusercontent.com/${repo}/${commit}/`;
  const sourceText = await get(raw + path);
  const licenceText = await get(raw + licencePath);
  let notice = licenceText;
  let licence = 'MIT';
  if (id === 'gruvbox') {
    const pkg = await get(raw + 'package.json');
    if (JSON.parse(pkg).license !== 'MIT' || !licenceText.includes('[MIT/X11]')) throw Error('Gruvbox licence changed');
    // Upstream has no standalone LICENSE. Preserve its exact licence declaration
    // and package metadata, and include the MIT permission text for redistribution.
    const mit = await get(`https://raw.githubusercontent.com/altercation/solarized/${sources.find(s => s.id === 'solarized').revision}/LICENSE`);
    notice = `Gruvbox attribution: ${attribution}\nSource: https://github.com/${repo}/tree/${commit}\n\nUpstream package.json:\n${pkg}\n\nUpstream README licence declaration:\n${licenceText.slice(licenceText.indexOf('License\n-------'))}\n\nMIT permission terms (upstream declares MIT/X11 above):\n${mit.slice(mit.indexOf('Permission is hereby granted'))}`;
    licence = 'MIT/X11';
  } else if (!licenceText.includes('Permission is hereby granted')) throw Error(`Review licence: ${id}`);
  const licenceLocal = `licences/${id}.txt`;
  await writeFile(join(root, licenceLocal), notice.replace(/\r\n/g,'\n'));
  sources.push({ id, repo, revision: commit, attribution, licence,
    sourceUrl: `https://github.com/${repo}/blob/${commit}/${path}`,
    licenceUrl: `https://github.com/${repo}/blob/${commit}/${licencePath}`,
    licenceLocal, availableHex: [...new Set((sourceText.match(/#[\da-f]{6}\b/gi) ?? []).map(v => v.toLowerCase()))].sort() });
}
await writeFile(join(root,'sources.json'), JSON.stringify([...sources,...existing.filter(s=>!projects.some(([id])=>id===s.id))],null,2)+'\n');
console.log(`Recorded ${sources.length} pinned sources and reusable licences.`);
