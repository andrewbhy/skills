if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-panel-chat.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Serialized into the new home only. Dependencies are the direct thread page's shared code.
export function createPanelChat({ document, window, topic, host, tools, owner, fetch, attKit, fillMessage, attNodes, replyReference, renderThreadMessages, postThreadMessage, bindThreadOwnership, clock, onArtifacts, onTitle }) {
  const nodes = {};
  const el = (tag, id, parent, text) => {
    const n = document.createElement(tag); n.className = 'chat-' + id; nodes[id] = n;
    if (text != null) n.textContent = text;
    if (parent) parent.append(n);
    return n;
  };
  const $ = id => nodes[id];
  const root = el('section', 'root', host); root.setAttribute('aria-label', 'Session chat');
  const toolbar = el('div', 'tools', tools);
  for (const [id, label] of [['give', 'Hand to a session…'], ['return', 'Take back…'], ['owner-detail', 'Owner details'], ['owner-retry', 'Retry reading']]) {
    const b = el('button', id, toolbar, label); b.type = 'button'; b.disabled = id === 'give' || id === 'return';
  }
  nodes['owner-cue'] = owner;
  el('p', 'feedback', root).setAttribute('role', 'status');
  const scroll = el('div', 'scroll', root); el('div', 'msgs', scroll);
  el('p', 'state', root).setAttribute('role', 'status');
  const form = el('form', 'f', root);
  const recipient = el('label', 'recipient', form, 'To: reading ownership…');
  const box = el('textarea', 'box', form); box.id = 'session-input-' + topic; box.rows = 3; box.maxLength = 4000; box.value = '';
  recipient.setAttribute('for', box.id);
  const reply = el('div', 'replychip', form); reply.hidden = true;
  el('span', 'replylabel', reply);
  const cancel = el('button', 'cancelreply', reply, 'Cancel reply'); cancel.type = 'button';
  const thumbs = el('div', 'thumbhost', form), actions = el('div', 'actions', form);
  const sendButton = el('button', 'send', actions, 'Send'); sendButton.type = 'submit';
  el('p', 'hint', form, 'Enter sends · Shift+Enter adds a line. Paste or drop an image to attach it.');
  const dialog = el('dialog', 'panel', root); dialog.setAttribute('aria-label', 'Thread ownership');
  el('h2', 'panel-title', dialog);
  const give = el('div', 'give-content', dialog); give.hidden = true;
  el('p', 'give-help', give, 'Open Claude or Codex yourself, then paste the first prompt below. Ownership changes when that session claims the thread.');
  const command = el('textarea', 'command', give); command.readOnly = true; command.setAttribute('aria-label', 'Session start instructions');
  el('button', 'copy', give, 'Copy start instructions').type = 'button';
  el('div', 'owner-details', dialog).hidden = true;
  const returnForm = el('form', 'return-form', dialog); returnForm.hidden = true;
  el('p', 'return-help', returnForm, 'Take this thread back and return it to the coordinator? Add a note if you want.');
  const generation = el('p', 'return-generation-line', returnForm);
  generation.append('Generation ', el('span', 'return-generation'), '.');
  const fields = el('div', 'return-fields', returnForm);
  const returnLabel = el('label', 'return-label', fields, 'Note (optional)');
  const returnNote = el('textarea', 'return-note', fields); returnNote.id = 'session-return-note-' + topic; returnNote.value = '';
  returnLabel.setAttribute('for', returnNote.id);
  el('p', 'return-error', returnForm).setAttribute('role', 'alert');
  el('button', 'confirm-return', returnForm, 'Take back to coordinator').type = 'submit';
  el('button', 'dismiss', dialog, 'Cancel').type = 'button';
  let replyTo = null, busy = false, active = false, timer = null, last = '', loading = false;
  const pics = [], key = 'jig-panel-draft:' + topic;
  const snapshot = () => JSON.stringify({ text: box.value, replyTo, images: pics });
  const save = () => { try { window.sessionStorage.setItem(key, snapshot()); } catch { $('state').textContent = 'Draft could not be saved for reload. Keep this panel open.'; } };
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(key) || 'null');
    if (draft) { box.value = typeof draft.text === 'string' ? draft.text : ''; replyTo = draft.replyTo || null; if (Array.isArray(draft.images)) pics.push(...draft.images); }
  } catch { /* An unavailable store must not prevent writing. */ }
  const showReply = () => { reply.hidden = !replyTo; $('replylabel').textContent = replyTo ? replyTo.from + ' · ' + replyTo.excerpt : ''; };
  const setReply = message => { if (busy) return; replyTo = message ? replyReference(message) : null; showReply(); save(); box.focus(); };
  cancel.addEventListener('click', () => setReply(null)); showReply();
  const kit = attKit({ host: form, pasteOn: box, list: pics, onNote: text => { $('state').textContent = 'Not attached: ' + text; }, onChange: save });
  thumbs.append(kit.strip); actions.append(kit.button, kit.input);
  const ownerDocument = { getElementById: $, get activeElement() { return document.activeElement; } };
  const ownership = bindThreadOwnership({ document: ownerDocument, fetch, navigator: window.navigator, performance: window.performance, id: topic, reload: () => load(true), preparedNote: true, labels: { give: 'Hand to a session…', return: 'Take back…' } });
  async function load(force = false) {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch('/api/threads/' + encodeURIComponent(topic), { cache: 'no-store' });
      if (!response.ok) throw new Error('Thread unavailable');
      const text = await response.text(), d = JSON.parse(text);
      if (!active) return;
      onTitle?.(d.title);
      onArtifacts?.(d.artifacts);
      ownership.render(d.ownership);
      if (text !== last || force) {
        renderThreadMessages({ document, $, d, clock, setReply, fillMessage, attNodes }); last = text;
      }
    } catch { if (active) { ownership.error(); $('state').textContent = 'Could not read this thread. Retry reading; your draft is retained.'; } }
    finally { loading = false; }
  }
  async function send() {
    const text = box.value.trim(); if (busy || (!text && !pics.length)) return;
    busy = true; sendButton.disabled = true; $('state').textContent = ''; save();
    const sent = snapshot();
    try {
      const response = await postThreadMessage(fetch, topic, { text, images: kit.payload(), replyTo });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || String(response.status));
      if (snapshot() === sent) { box.value = ''; replyTo = null; showReply(); kit.clear(); save(); }
      await load(true); scroll.scrollTop = scroll.scrollHeight;
    } catch (e) { $('state').textContent = 'Not sent: ' + e.message + '. Draft retained.'; }
    finally { busy = false; sendButton.disabled = false; if (active) box.focus(); }
  }
  box.addEventListener('input', save);
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  form.addEventListener('submit', e => { e.preventDefault(); send(); });
  function pause() { active = false; save(); if (timer != null) window.clearInterval(timer); timer = null; root.hidden = toolbar.hidden = true; }
  function resume() { active = true; root.hidden = toolbar.hidden = false; load(true); timer = window.setInterval(() => load(), 3000); }
  return { pause, resume, save, root, toolbar, nodes, send, load, modalOpen: ownership.modalOpen, closedRecently: ownership.closedRecently };
}
