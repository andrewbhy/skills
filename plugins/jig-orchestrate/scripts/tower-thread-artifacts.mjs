import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { parseMessage, messageArtifacts } from './tower-message.mjs';

// Restrict panel navigation before URL normalization can hide traversal segments.
export function artifactHref(value) {
  if (typeof value !== 'string' || !/^\/(?:f|att)\//.test(value)) return null;
  const path = value.split(/[?#]/)[0];
  let parts;
  try { parts = path.split('/').slice(1).map(decodeURIComponent); } catch { return null; }
  if (parts.length < 3 || parts.some(p => !p || /[\\/:\0]/.test(p) || ['.', '..', 'private'].includes(p.toLowerCase()))) return null;
  if (parts[0] === 'att' && (parts.length !== 3 || !/^\d{10,}-\d{1,3}\.(png|jpg|webp)$/.test(parts[2]))) return null;
  return '/' + parts.map(encodeURIComponent).join('/');
}

// validateFile resolves against the same review roots as /f/. A validated real
// path is returned only for the local Copy file path control.
export function threadArtifacts(data, { origin, validateFile, attachmentUrl }) {
  const candidate = (href, at = null) => {
    const safe = artifactHref(href);
    if (!safe) return null;
    const file = safe.startsWith('/f/') ? validateFile(safe) : null;
    if (safe.startsWith('/f/') && !file) return null;
    return { href: safe, label: decodeURIComponent(safe.split('/').pop()), image: /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(safe), at,
      ...(file?.real ? { path: file.real } : {}) };
  };
  const original = candidate(data.link);
  const recent = [];
  for (const message of data.messages || []) {
    const blocks = message.blocks || parseMessage(message.text, origin);
    for (const token of messageArtifacts(blocks)) {
      const item = candidate(token.href, message.at || null);
      if (item) recent.push(item);
    }
    for (const attachment of message.attachments || []) {
      const item = candidate(attachmentUrl(attachment), message.at || null);
      if (item) recent.push({ ...item, ...(attachment.path ? { path: attachment.path } : {}) });
    }
  }
  recent.reverse();
  // Keep the original pinned for the direct page, but expose its newest mention
  // time so the panel can order the same catalog chronologically.
  if (original) original.at = recent.find(item => item.href === original.href)?.at || null;
  const latest = recent.find(item => item.image)?.href || original?.href || recent[0]?.href || null;
  const seen = new Set(original ? [original.href] : []);
  const items = original ? [{ ...original, original: true }] : [];
  for (const item of recent) if (!seen.has(item.href)) { seen.add(item.href); items.push(item); }
  return { items, latest };
}

// A deliberate pick remains stable even when newer messages arrive.
export function selectThreadArtifact(catalog, state = { follow: true, href: null }, action = {}) {
  if (action.type === 'pick' && catalog.items.some(item => item.href === action.href)) return { follow: false, href: action.href };
  const follow = action.type === 'follow' ? action.on : state.follow;
  const href = follow ? catalog.latest : state.href;
  return { follow, href: catalog.items.some(item => item.href === href) ? href : catalog.latest };
}
