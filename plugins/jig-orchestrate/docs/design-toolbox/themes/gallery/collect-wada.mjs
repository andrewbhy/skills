import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Optional network refresh of the pinned, MIT-licensed numeric dataset only.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
const root = dirname(fileURLToPath(import.meta.url));
const repo = 'mattdesl/dictionary-of-colour-combinations';
const revision = 'c142bd0bc8049ea48db4da5eb397981f047e8ef4';
const raw = `https://raw.githubusercontent.com/${repo}/${revision}/`;
async function get(path) {
  const response = await fetch(raw + path);
  if (!response.ok) throw Error(`${response.status}: ${path}`);
  return response.text();
}
const [data, licence] = await Promise.all([get('colors.json'), get('LICENSE.md')]);
if (!licence.includes('The MIT License (MIT)') || !licence.includes('Copyright (c) 2020 Matt DesLauriers') || !licence.includes('Permission is hereby granted')) throw Error('Review Wada dataset licence');
// Keep numerical facts only: no colour names, book text or imagery.
const colors = JSON.parse(data).map(({hex, combinations}) => ({hex, combinations}));
if (colors.length !== 159) throw Error('Unexpected Wada colour count');
const source = { id:'wada', repo, revision, attribution:'Sanzo Wada; digitisation by Dain M. Blodorn Kim; corrected sRGB conversion by Matt DesLauriers',
  licence:'MIT', sourceUrl:`https://github.com/${repo}/blob/${revision}/colors.json`,
  licenceUrl:`https://github.com/${repo}/blob/${revision}/LICENSE.md`, licenceLocal:'licences/wada.txt',
  dataLocal:'wada-data.json', upstreamSHA256:createHash('sha256').update(data).digest('hex'),
  dataSHA256:createHash('sha256').update(JSON.stringify(colors,null,2)+'\n').digest('hex'),
};
const sources = JSON.parse(await readFile(join(root,'sources.json'),'utf8')).filter(s=>s.id!=='wada');
await writeFile(join(root,'wada-data.json'), JSON.stringify(colors,null,2)+'\n');
await writeFile(join(root,'licences/wada.txt'), licence.replace(/\r\n/g,'\n'));
await writeFile(join(root,'sources.json'), JSON.stringify([...sources,source],null,2)+'\n');
console.log('Recorded pinned Wada numerical data and MIT notice.');
