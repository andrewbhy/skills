import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Shell command formatting shared by installed helpers; no project state.
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

export function commandQuote(value, platform = process.platform) {
  return platform === 'win32'
    ? `'${String(value).replace(/['\u2018-\u201b]/g, char => char + char)}'`
    : `'${String(value).replaceAll("'", "'\\''")}'`;
}
export function commandFor(script, args = [], { env = {}, platform = process.platform } = {}) {
  const path = script instanceof URL || String(script).startsWith('file:') ? fileURLToPath(script) : script;
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Command module must be absolute');
  const quote = value => commandQuote(value, platform);
  const command = [process.execPath, path, ...args].map(quote).join(' ');
  const settings = Object.entries(env).map(([key, value]) => platform === 'win32' ? `$env:${key}=${quote(value)}; ` : `${key}=${quote(value)}`).join(platform === 'win32' ? '' : ' ');
  return platform === 'win32' ? settings + '& ' + command : (settings ? 'env ' + settings + ' ' : '') + command;
}
export function isEntry(script) { return Boolean(process.argv[1]) && process.argv[1] === fileURLToPath(script); }
