import { parseMessage, messageArtifacts } from './review-message.mjs';

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

// validateFile resolves against the same review roots as /f/. No filesystem
// names or unvalidated message labels are returned to the strip.
export function threadArtifacts(data, { origin, validateFile, attachmentUrl }) {
  const candidate = href => {
    const safe = artifactHref(href);
    if (!safe || (safe.startsWith('/f/') && !validateFile(safe))) return null;
    return { href: safe, label: decodeURIComponent(safe.split('/').pop()), image: /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(safe) };
  };
  const original = candidate(data.link);
  const recent = [];
  for (const message of data.messages || []) {
    const blocks = message.blocks || parseMessage(message.text, origin);
    for (const token of messageArtifacts(blocks)) {
      const item = candidate(token.href);
      if (item) recent.push(item);
    }
    for (const attachment of message.attachments || []) {
      const item = candidate(attachmentUrl(attachment));
      if (item) recent.push(item);
    }
  }
  recent.reverse();
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
