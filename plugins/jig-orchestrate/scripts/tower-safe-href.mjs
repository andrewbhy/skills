import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// URL gate for every href the tower assigns from data (queue entries, thread text, digest events).
// Allows same-origin absolute paths (/t/..., /f/..., /item/..., /#frag) and http(s) URLs; anything else,
// including javascript:, data:, vbscript:, mixed-case or whitespace-prefixed schemes, protocol-relative
// and backslash forms, becomes '#'. Self-contained: it is inlined into the browser pages with toString().
export function safeHref(value) {
  if (typeof value !== 'string' || value === '') return '#';
  if (/[\u0000- \u007f-\u009f\\]/.test(value)) return '#';
  if (/^\/(?![\/\\])/.test(value)) return value;
  if (/^https?:\/\/[^\/?#]/i.test(value)) return value;
  return '#';
}
