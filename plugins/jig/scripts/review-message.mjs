// Splits message text into blocks (paragraphs, ordered and bullet lists) of text and link tokens. Pure data: the page builds
// DOM nodes from it with text nodes only, so message text is never parsed as HTML. Self-contained: the page embeds its source.
export function parseMessage(text, origin, resolveLocal = () => null) {
  const urlRe = /(https?:\/\/[^\s<>"'`]+|(?<=^|[\s(])(?:[a-z]:[\\/]|\/)[^\s<>"'`]+)/gi;
  const inline = (line) => {
    const out = []; let at = 0;
    for (const m of line.matchAll(urlRe)) {
      let u = m[0];
      u = u.replace(/[.,;:!?]+$/, '');
      while (/[)\]}]$/.test(u)) {
        const close = u.at(-1), open = { ')': '(', ']': '[', '}': '{' }[close];
        if (u.split(close).length <= u.split(open).length) break;
        u = u.slice(0, -1).replace(/[.,;:!?]+$/, '');
      }
      let decoded;
      try { decoded = decodeURIComponent(u); } catch { continue; }
      if (decoded.split(/[\\/]+/).some(s => s.toLowerCase() === 'private')) continue;
      if (/^[a-z]:[\\/]/i.test(u) || (u.startsWith('/') && !/^\/[ft]\//.test(u))) {
        const href = resolveLocal(u);
        if (!href) continue;
        if (m.index > at) out.push({ t: 'text', v: line.slice(at, m.index) });
        const path = href.split(/[?#]/)[0];
        out.push({ t: 'link', v: u, label: decoded.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop(), href, local: true, artifact: true, image: /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(path) });
        at = m.index + u.length;
        continue;
      }
      let url;
      try { url = new URL(u, origin); } catch { continue; }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      const local = url.origin === origin || (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === '7788');
      const artifact = local && url.pathname.startsWith('/f/');
      if (artifact && /(?:^|[\\/])\.{1,2}(?:[\\/]|$)/.test(decoded.replace(/^https?:\/\/[^/]+/, ''))) continue;
      if (m.index > at) out.push({ t: 'text', v: line.slice(at, m.index) });
      out.push({ t: 'link', v: u, label: artifact ? decodeURIComponent(url.pathname).replace(/\/$/, '').split('/').pop() : u, href: local ? url.pathname + url.search + url.hash : url.href, local, artifact, image: artifact && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(url.pathname) });
      at = m.index + u.length;
    }
    if (at < line.length) out.push({ t: 'text', v: line.slice(at) });
    return out;
  };
  const blocks = []; let cur = null;
  const push = (type, tokens, start) => {
    if (cur && cur.type === type && type !== 'p') cur.items.push(tokens);
    else if (cur && cur.type === 'p' && type === 'p') cur.items.push(tokens);
    else { cur = { type, items: [tokens] }; if (start != null) cur.start = start; blocks.push(cur); }
  };
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/); const ul = line.match(/^\s*[-*\u2022]\s+(.*)$/);
    if (!line.trim()) cur = null;
    else if (ol) push('ol', inline(ol[2]), Number(ol[1]));
    else if (ul) push('ul', inline(ul[1]));
    else push('p', inline(line));
  }
  return blocks;
}

// DOM-only message rendering shared by the thread and compact home previews.
export function messageArtifacts(blocks) {
  const seen = new Set(), out = [];
  for (const b of blocks) for (const line of b.items) for (const t of line) {
    const key = t.href?.split(/[?#]/)[0];
    if (t.artifact && !seen.has(key)) { seen.add(key); out.push(t); }
  }
  return out;
}

// A reference contains display data only: no markup or attachment paths.
export function replyReference(message) {
  const text = String(message.text ?? '').replace(/\s+/g, ' ').trim();
  return { at: message.at, from: message.from, excerpt: text.slice(0, 120) || (message.attachments?.length ? 'image' : '') };
}

export function fillReply(parent, replyTo, findTarget = null) {
  if (!replyTo) return;
  const target = findTarget?.(replyTo.at);
  const quote = document.createElement(target ? 'button' : 'div');
  quote.className = 'reply-quote';
  quote.textContent = target ? replyTo.from + ': ' + replyTo.excerpt : replyTo.excerpt;
  if (target) {
    quote.type = 'button';
    quote.title = 'Go to quoted message';
    quote.addEventListener('click', () => {
      const current = findTarget(replyTo.at);
      if (!current) return;
      current.scrollIntoView({ block: 'center', behavior: 'instant' });
      current.focus({ preventScroll: true });
      current.classList.add('reply-highlight');
      setTimeout(() => current.classList.remove('reply-highlight'), 1600);
    });
  }
  parent.append(quote);
}

export function fillMessage(parent, message, compact = false, openArtifact = null, findTarget = null) {
  if (message.replyTo) fillReply(parent, message.replyTo, findTarget);
  const blocks = message.blocks || parseMessage(message.text, location.origin);
  let remaining = compact ? 400 : Infinity;
  const add = (node, tokens) => {
    for (const t of tokens) {
      if (remaining <= 0) break;
      const label = t.label || t.v, display = label.slice(0, remaining);
      remaining -= display.length;
      if (t.t === 'text') { node.append(document.createTextNode(display)); continue; }
      const a = document.createElement('a'); a.textContent = display; a.href = t.href; a.title = t.v;
      if (!t.local) { a.target = '_blank'; a.rel='noopener noreferrer'; }
      if (t.artifact) {
        a.className = 'artifact-link';
        if (openArtifact) a.addEventListener('click', e => {
          if (e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault(); openArtifact(t.href);
        });
      }
      node.append(a);
    }
  };
  for (const b of blocks) {
    if (remaining <= 0) break;
    const node = document.createElement(b.type === 'p' ? 'div' : b.type); node.className = 'p';
    if (b.type === 'ol' && b.start > 1) node.start = b.start;
    b.items.forEach((line, i) => {
      if (b.type === 'p') { if (i) node.append(document.createElement('br')); add(node, line); }
      else { const li = document.createElement('li'); add(li, line); node.append(li); }
    });
    parent.append(node);
  }
  const artifacts = messageArtifacts(blocks);
  if (compact) {
    const count = artifacts.length + (message.attachments || []).length;
    if (count) { const badge = document.createElement('small'); badge.textContent = ' · '+count+' artifacts'; parent.append(badge); }
    return;
  }
  const box = document.createElement('div'); box.className = 'att';
  for (const t of artifacts.filter(t => t.image)) {
    const a = document.createElement('a'); a.href = t.href; a.title = t.v;
    const img = document.createElement('img');
    const raw = new URL(t.href, location.origin); raw.searchParams.set('raw', '1'); raw.hash = '';
    img.src = raw.pathname + raw.search; img.alt = t.label; img.loading = 'lazy';
    a.append(img); box.append(a);
  }
  if (box.childNodes.length) parent.append(box);
}

export const messageClient = [messageArtifacts, replyReference, fillReply, fillMessage].map(f => f.toString()).join('\n');
export const messageCss = `.artifact-link{display:inline-block;border:1px solid #8886;border-radius:5px;padding:0 5px;margin:1px 0;max-width:100%;overflow-wrap:anywhere}
.reply-quote{display:block;max-width:100%;box-sizing:border-box;border:0;border-left:3px solid currentColor;border-radius:3px;padding:4px 8px;margin:0 0 6px;background:#8882;color:inherit;font:inherit;font-size:.85em;text-align:left;overflow-wrap:anywhere;white-space:pre-wrap}
button.reply-quote{cursor:pointer}button.reply-quote:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.reply-highlight{box-shadow:0 0 0 3px #d97706}`;
