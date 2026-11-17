import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';

export function changedFiles(options, directory) {
  if (options.changed) return options.changed.split(',').map(f=>resolve(directory,f));
  if (!options.since) return null;
  // No shell. NUL boundaries retain spaces, tabs and non-ASCII file names.
  const root=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:directory,encoding:'utf8'}).trim();
  const changed=execFileSync('git',['diff','--name-only','-z',options.since,'--'],{cwd:directory,encoding:'utf8'});
  const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'});
  return [...new Set((changed+untracked).split('\0').filter(Boolean))].map(f=>resolve(root,f));
}
export function selectChanged(states,files,directory,sharedFiles=[]) {
  if(files===null)return {states,gaps:[]};
  const normalize=f=>relative(directory,resolve(directory,f)).replaceAll('\\','/');
  const changed=new Set(files.map(normalize));
  if(sharedFiles.some(f=>changed.has(normalize(f))))return {states,gaps:[]};
  const mapped=new Set(states.flatMap(s=>s.files || []).map(normalize));
  const unknown=[...changed].filter(f=>!mapped.has(f));
  if(unknown.length)return {states,gaps:[`Unmapped changed files; full measurement retained: ${unknown.join(', ')}`]};
  // Missing component mappings are never silently treated as unaffected.
  return {states:states.filter(s=>!s.files?.length || s.files.some(f=>changed.has(normalize(f)))),gaps:[]};
}
