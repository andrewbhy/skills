if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-thread-chat.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
export function messageAuthor(message, owner) {
  const who = message.identity;
  if (who) {
    const author = who.label ? who : owner?.sessionId === who.sessionId ? owner : null;
    if (author) return author.label + ' · ' + (author.provider === 'claude' ? 'Claude' : 'Codex');
    return who.kind;
  }
  return message.from === 'person' ? 'You' : message.from === 'coordinator' ? 'Coordinator' : message.from === 'system' ? 'System' : 'Progress';
}


// Same native dialog, input order and dismissal behavior as the accepted lo-fi.
export function bindThreadOwnership({ document, fetch, navigator, performance, id, reload, labels = {}, preparedNote = false }) {
  const $ = id => document.getElementById(id);
  let row = null, captured = null, trigger, closedAt = -Infinity, saving = false, panelVersion = 0;
  if (!preparedNote) $('return-fields').innerHTML = '<label for="return-note">Note (optional)</label><textarea id="return-note" name="note" rows="2" aria-describedby="return-error"></textarea>';
  const feedback = text => { $('feedback').textContent = text; };
  function render(value) {
    row = value;
    $('owner-cue').textContent = value.cue;
    $('give').disabled = !!value.owner || !/^item-\d+$/.test(id);
    $('return').disabled = !value.owner;
    $('give').title = value.owner ? 'This thread already has an owner. Take it back first.' : !/^item-\d+$/.test(id) ? 'Only review items can be handed to a session.' : '';
    $('return').title = value.owner ? '' : 'The coordinator already handles replies.';
    $('owner-retry').hidden = true;
    $('recipient').textContent = 'To: ' + (value.owner?.label ?? 'the coordinator');
  }
  function error() {
    row = null;
    $('owner-cue').textContent = 'Ownership unavailable. Retry reading; ownership is unchanged.';
    $('recipient').textContent = 'To: ownership unavailable; retry reading before sending.';
    $('give').disabled = $('return').disabled = true;
    $('give').title = $('return').title = 'Ownership unavailable. Retry reading first.';
    $('owner-retry').hidden = false;
  }
  function dismiss() {
    if (!$('panel').open || saving) return;
    $('panel').close(); panelVersion++; closedAt = performance.now(); trigger?.focus();
  }
  async function action(kind, body) {
    const response = await fetch('/api/threads/' + encodeURIComponent(id) + '/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Not saved; retry reading.');
    return result;
  }
  async function open(kind) {
    if (!row) return;
    const version = ++panelVersion;
    trigger = document.activeElement; captured = row.ownershipGeneration;
    $('panel-title').textContent = kind === 'give' ? (labels.give || 'Give to session') : (labels.return || 'Return to coordinator');
    $('give-content').hidden = kind !== 'give'; $('return-form').hidden = kind !== 'return';
    $('owner-details').hidden = true;
    $('return-generation').textContent = captured; $('return-error').textContent = '';
    $('dismiss').textContent = 'Cancel'; $('panel').showModal();
    if (kind === 'return') { $('return-note').focus(); return; }
    $('command').value = 'Preparing start instructions…'; $('copy').disabled = true; $('command').focus();
    feedback('Preparing start instructions…');
    try { const result = await action('give', { generation: captured }); if (!$('panel').open || version !== panelVersion) return; $('command').value = result.command; $('copy').disabled = false; feedback('Start instructions ready. Open your session and paste its first prompt.'); }
    catch (e) { if (!$('panel').open || version !== panelVersion) return; $('command').value = ''; feedback(e.message); $('dismiss').focus(); await reload(); }
  }
  $('give').onclick = () => open('give'); $('return').onclick = () => open('return'); $('dismiss').onclick = dismiss;
  $('panel').addEventListener('cancel', e => { e.preventDefault(); dismiss(); });
  $('panel').onclick = e => { const r = $('panel').getBoundingClientRect(); if (e.target === $('panel') && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dismiss(); };
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText($('command').value); feedback('Start instructions copied. Open your session and paste its first prompt.'); } catch { $('command').select(); feedback('Clipboard unavailable. Instructions selected; press Ctrl+C or Cmd+C.'); } };
  $('return-form').onsubmit = async e => {
    e.preventDefault(); if (saving) return;
    saving = true; $('confirm-return').disabled = $('dismiss').disabled = true; $('return-error').textContent = 'Returning thread…';
    try {
      await action('return', { generation: captured, note: $('return-note').value });
      saving = false; dismiss(); $('return-note').value = '';
      await reload(); $('box').focus(); feedback('Return recorded. Coordinator handles replies.');
    } catch (e) { $('return-error').textContent = e.message + ' Draft retained. Close and reopen Return after reading the current owner.'; $('return-error').tabIndex = -1; $('return-error').focus(); await reload(); }
    finally { saving = false; $('confirm-return').disabled = $('dismiss').disabled = false; }
  };
  $('owner-detail').onclick = () => {
    if (!row) return;
    trigger = document.activeElement; panelVersion++;
    $('panel-title').textContent = 'Owner details';
    $('give-content').hidden = $('return-form').hidden = true;
    $('owner-details').hidden = false; $('owner-details').textContent = row.details ?? row.cue;
    $('dismiss').textContent = 'Close'; $('panel').showModal(); $('dismiss').focus();
  };
  $('owner-retry').onclick = reload;
  return { render, error, modalOpen: () => $('panel').open, closedRecently: () => performance.now() - closedAt < 400 };
}


// The same conversation renderer runs on the direct page and in the session panel.
export function renderThreadMessages({document, $, d, prevSeen = null, clock, clip = clock, setReply, showInPane = null, fillMessage, attNodes}) {
  const addressee = d.addressee || 'the coordinator';
  const box=$('msgs'),sc=$('scroll');
  const near=sc.scrollHeight-sc.scrollTop-sc.clientHeight<80;
  const focused=document.activeElement;
  const focusedAt=focused.closest?.('.m')?.dataset.at;
  const focusedAction=focused.classList?.contains('reply-action');
  box.textContent='';
  const findTarget=at=>Array.from(box.children).find(node=>node.dataset.at===at);
  if(!d.messages.length){const e=document.createElement('div');e.className='empty';e.textContent='No messages yet. Write below; '+addressee+' sees it as it arrives.';box.append(e)}
  const firstNew=prevSeen?d.messages.findIndex(m=>m.from!=='person'&&Date.parse(m.at)>Date.parse(prevSeen)):-1;
  for(const n of d.earlierNotes||[]){
    const h=document.createElement('div');h.className='earlier';h.textContent='Earlier notes from work item "'+n.title+'" (read-only)';box.append(h);
    for(const m of n.messages){const e=document.createElement('div');e.className='m earliernote';const by=document.createElement('span');by.className='by';by.textContent=(m.from==='person'?'You':m.from==='coordinator'?'Coordinator':m.from==='system'?'System':'Progress')+' · '+clip(m.at);e.append(by);fillMessage(e,m,false,showInPane);const an=attNodes(m.attachments);if(an)e.append(an);box.append(e)}
    const hr=document.createElement('div');hr.className='newline';hr.textContent='\u2014\u2014 this item \u2014\u2014';box.append(hr);
  }
  for(const [mi,m] of d.messages.entries()){
    if(mi===firstNew&&mi>0){const hr=document.createElement('div');hr.className='newline';hr.setAttribute('role','separator');hr.textContent='—— new since you last looked ('+clock(prevSeen)+') ——';box.append(hr)}
    const e=document.createElement('div');e.className='m '+m.from;
    e.dataset.at=m.at;
    if(m.from==='person'||m.from==='coordinator'||m.reply){
      e.tabIndex=0;e.setAttribute('aria-keyshortcuts','R');
      const reply=document.createElement('button');reply.type='button';reply.className='reply-action';reply.textContent='Reply';reply.title='Reply to this message (R when focused)';
      reply.addEventListener('click',()=>setReply(m));e.append(reply);
      e.addEventListener('keydown',event=>{
        if(event.target===e&&event.key.toLowerCase()==='r'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing){event.preventDefault();setReply(m)}
      });
    }
    const by=document.createElement('span');by.className='by';
    by.textContent=messageAuthor(m,d.ownership?.owner)+' · '+clock(m.at);
    if(m.identity?.sessionId)by.title='Session '+m.identity.sessionId;
    e.append(by);fillMessage(e,m,false,showInPane,findTarget);const an=attNodes(m.attachments);if(an)e.append(an);box.append(e);
  }
  if(near)sc.scrollTop=sc.scrollHeight;
  if(focusedAt){const target=findTarget(focusedAt);(focusedAction?target?.querySelector('.reply-action'):target)?.focus({preventScroll:true})}
}

export async function postThreadMessage(fetch, id, {text, images, replyTo}) {
  return fetch('/api/threads/'+encodeURIComponent(id), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({from:'person', text, images, ...(replyTo?{replyTo}:{})})});
}
