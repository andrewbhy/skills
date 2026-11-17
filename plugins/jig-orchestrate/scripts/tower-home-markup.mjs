import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// The top bar: the top bar stays one row. Narrower widths drop counts, shorten the GPU chip and show Settings as an icon.
export const settingsIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
export const headerCss = `
#tower-hdr{position:sticky;z-index:30;flex-wrap:nowrap;gap:12px;padding:0 20px;min-width:0}
#tower-hdr>*{flex-shrink:0}#tower-hdr .tabs{flex-shrink:1;min-width:0;flex-wrap:nowrap}
#tower-hdr .tabs button{white-space:nowrap;padding:2px 8px}
.settings-btn{display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
.gpuchip{max-width:30ch;flex-shrink:1!important;min-width:0}.gpuchip .gt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:1500px){#tower-hdr .tabs .cnt{display:none}}
@media(max-width:1250px){.gpuchip .gt{font-size:0}.gpuchip .gt::after{content:attr(data-short);font-size:.85rem}.settings-btn .stx{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.settings-btn{padding:2px 8px}}
@media(max-width:1050px){#theme-btn .tl{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}#theme-btn{padding:2px 8px}#tower-hdr{gap:8px;padding:0 12px}#tower-hdr .tabs button{padding:2px 6px}}
`;

export const css = `
main[data-page=home]{max-width:84rem;padding:16px 24px 64px}
@media (max-width:1599px){#work{display:contents}.o1{order:1}.o2{order:2}.o3{order:3}.o4{order:4}.o5{order:5}.o6{order:6}}
@media (min-width:1600px){body{font-size:18px}main[data-page=home]{max-width:none;padding:20px 48px 80px}}
@media (min-width:2400px){body{font-size:21px}main[data-page=home]{padding:28px 72px 96px}}
h2{margin:24px 0 6px;font-size:1.25em;display:flex;align-items:baseline;gap:10px}h2:first-child{margin-top:4px}
h3{margin:16px 0 2px;font-size:.85em;text-transform:uppercase;letter-spacing:.05em;color:#767676;font-weight:600;display:flex;align-items:center;gap:10px}
.cnt{font-weight:400;color:#767676;font-size:.8em}
.meta{font-size:.82em;color:#767676}
button{font:inherit;font-size:.8em;cursor:pointer;min-height:28px}
button:disabled{cursor:default;opacity:.55}
details{margin:10px 0}summary{cursor:pointer;font-weight:600}
details>summary .cnt{margin-left:6px}
.udot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#2563eb;vertical-align:.05em;flex:none}.udot.off{background:transparent}
.t.has{font-weight:700}
.rw{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:2px 8px;align-items:start;padding:6px 6px 6px 8px;border-bottom:1px solid #8883;border-left:3px solid transparent}
.rw .rt{font-weight:500}.rw .udot{margin-top:.5em}
.tag{display:inline-block;font-size:.72em;padding:0 6px;margin-right:6px;border-radius:9px;background:#8882;color:#5f5f5f;vertical-align:.1em;white-space:nowrap}
.rw .w{font-size:.82em;color:#767676}.rw .w b{color:#c2410c;font-weight:600}
.sel{outline:2px solid #2563eb;outline-offset:-2px;border-radius:4px}
.pg{font-weight:600;font-size:.9em;margin:12px 0 2px}
.racts{display:flex;gap:6px;align-items:flex-start;justify-content:flex-end;flex-wrap:wrap}
.act{display:flex;flex-direction:column;align-items:flex-end;gap:1px}.off{font-size:.7em;color:#767676;max-width:9rem;text-align:right;line-height:1.2}
.pform{grid-column:2/4;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px}.pform input{font:inherit;padding:3px 8px;border:1px solid #8888;border-radius:6px;background:transparent;color:inherit;min-width:12rem;flex:1}
.bar{display:flex;gap:20px;align-items:center}
.tabs{display:flex;gap:4px;flex-wrap:wrap}.tabs button{font:inherit;font-size:16px;color:#ccc;background:none;border:0;border-bottom:2px solid transparent;padding:2px 10px}
.tabs button.on{color:#fff;border-bottom-color:#9cf}.tabs button:hover{color:#fff}
.pill{display:inline-block;font-size:.72em;padding:0 8px;margin-left:8px;border-radius:9px;border:1px solid #8886;white-space:nowrap;vertical-align:.1em;font-weight:400}
.pill.waiting-you{background:#2563eb22;border-color:#2563eb88}
.pill.waiting-coordinator{background:#c2410c22;border-color:#c2410c88;color:#c2410c}
.pill.blocked{background:#7c3aed22;border-color:#7c3aed88}
.pill.closed{color:#767676}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}
.chips button{border:1px solid #8886;background:none;color:inherit;border-radius:99px;padding:3px 12px}.chips button.on{background:#2563eb;border-color:#2563eb;color:#fff}
.drow{display:grid;grid-template-columns:13rem minmax(0,1fr) 6rem;gap:4px 14px;align-items:baseline;padding:8px 6px;border-bottom:1px solid #8883;color:inherit}
.drow:hover,.drow:focus-visible{background:#8881;text-decoration:none}
.drow .pill{margin-left:0;justify-self:start}.drow .ttl{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drow .pv{color:#767676;font-size:.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.drow .age{color:#767676;font-size:.82em;text-align:right;overflow-wrap:anywhere}
.drow .why{grid-column:2/4;font-size:.82em;color:#767676}
#disc,#dec,#pk{max-width:84rem}
.dn{display:inline-block;font-size:.76em;padding:0 8px;margin:2px 8px 0 0;border-radius:9px;border:1px solid #8886;white-space:nowrap}
.dn-outdates{background:#dc262622;border-color:#dc2626aa;color:#b91c1c;font-weight:600}
.dn-informs{color:#1d4ed8;border-style:dashed;border-color:#1d4ed888}
.dn-confirms{color:#15803d;border-color:#15803d88}
.dn-reopens{background:#7c3aed22;border-color:#7c3aed88;color:#6d28d9}
.dn-blocks,.dn-unblocks{color:#6d28d9;border-color:#7c3aed88}
.drec{padding:12px 6px;border-bottom:1px solid #8883}
.drec h3{margin:0 0 4px;text-transform:none;letter-spacing:0;font-size:1em;color:inherit}
.drec .hd{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.drec .no{font-weight:700}
.drec blockquote{margin:6px 0;max-width:60rem}
.drec .src{font-size:.82em;color:#767676}.drec.void h3,.drec.void blockquote{text-decoration:line-through;color:#767676}.voidnote{font-size:.85em;color:#b91c1c;font-weight:600}
.aff{display:grid;grid-template-columns:7rem minmax(0,1fr) auto;gap:2px 12px;align-items:baseline;margin:4px 0 0;font-size:.9em;max-width:70rem}
.aff .ref{color:#767676;font-size:.85em}
.st-outdated{color:#b91c1c;font-weight:600}.st-blocking,.st-reopened{color:#6d28d9;font-weight:600}.st-closed,.st-updated,.st-released,.st-unlinked{color:#767676}.st-confirmed{color:#15803d}.st-informed{color:#1d4ed8}
#digest{border:1px solid #8886;border-left:4px solid #2563eb;border-radius:6px;padding:6px 12px;margin:0 0 12px;max-width:84rem}
#digest summary{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-weight:500}#digest summary .sum{flex:1;min-width:12rem}
#digest ul{margin:6px 0 2px;padding-left:1.2em}#digest li{margin:2px 0}#digest .k{font-size:.75em;color:#767676;margin-right:6px}
.issues{margin-left:0;font:inherit;font-size:.85em;font-weight:600;color:#1d1d1f;background:#fbbf24;border:0;border-radius:99px;padding:2px 12px;min-height:26px;cursor:pointer}.issues:hover,.issues[aria-expanded=true]{background:#fcd34d}
#issuepanel{background:#fffbeb;color:#1d1d1f;border-bottom:2px solid #fbbf24;padding:8px 24px 12px}#issuepanel[hidden]{display:none}#issuepanel h3{margin:4px 0}#issuepanel .iss{padding:6px 0;border-top:1px solid #0002}#issuepanel .why{font-size:.88em;color:#555}#issuepanel code{font-size:.85em}
#toast{position:fixed;left:16px;bottom:16px;z-index:5;background:#1d1d1f;color:#fff;padding:8px 14px;border-radius:8px;display:flex;gap:12px;align-items:center;box-shadow:0 2px 12px #0006;max-width:calc(100vw - 32px)}
#toast[hidden]{display:none}#toast button{background:#fff;color:#1d1d1f;border:0;border-radius:6px;padding:2px 12px}
@media (max-width:700px){.rw{grid-template-columns:12px minmax(0,1fr)}.racts{grid-column:2/3;justify-content:flex-start}.drow{grid-template-columns:minmax(0,1fr)}}
@media (prefers-color-scheme:dark){#issuepanel{background:#3b2f0b;color:#f4f4f5}#issuepanel .why{color:#ccc}.dn-outdates{color:#fca5a5}.dn-informs,.st-informed{color:#93c5fd}.dn-confirms,.st-confirmed{color:#86efac}.dn-reopens,.dn-blocks,.dn-unblocks,.st-blocking,.st-reopened{color:#c4b5fd}.st-outdated{color:#fca5a5}.rw .w b{color:#fb923c}.tag{color:#bbb}.pill.waiting-coordinator{color:#fb923c}h3,.cnt,.meta,.rw .w,.off{color:#a0a0a8}#toast{background:#e8e8ea;color:#17171a}#toast button{background:#17171a;color:#e8e8ea}}`;

// Render the v1 text list and board cues from the same sanitized server snapshot.
export function renderOwnershipMap(document, map) {
  const rows = map?.rows ?? [], error = map?.error ?? '';
  for (const node of document.querySelectorAll('[data-row]')) {
    let id; try { id = decodeURIComponent(node.dataset.href?.split('/t/')[1] ?? ''); } catch { continue; }
    if (!id) continue;
    const row = rows.find(row => row.id === id), cue = document.createElement('span');
    cue.className = 'owner-row'; cue.textContent = error || row?.cue || 'Owner: coordinator · unowned';
    node.append(cue);
  }
  const list = document.getElementById('relationships'), key = JSON.stringify(map ?? null);
  if (list.dataset.key === key) return;
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset.mapKey : null;
  list.dataset.key = key; list.textContent = '';
  document.getElementById('map-status').textContent = error || (rows.length ? 'Ownership and relationships from current records.' : 'Topics: none. Sessions: none. Children: none. Work / requests: none.');
  const add = (parent, text, href) => { const li = document.createElement('li'); if (href) { const a = document.createElement('a'); a.textContent = text; a.href = href; a.dataset.mapKey = href + ':' + text.split(' — ')[0]; li.append(a); } else li.textContent = text; parent.append(li); return li; };
  for (const row of rows) {
    const href = '/t/' + encodeURIComponent(row.id), topic = add(list, 'Topic: ' + row.id + ' — ' + (row.owner ? 'owned' : 'unowned'), href), children = document.createElement('ul'); topic.append(children);
    if (row.owner) {
      add(children, 'Session: ' + row.owner.sessionId + ' — ' + row.state + ' — owns ' + row.id + ' — ' + row.owner.label, href);
      add(children, row.cue);
      for (const child of row.children ?? []) add(children, 'Child: ' + child.id + ' — ' + child.state + ' — started by ' + row.owner.sessionId, href);
      if (!row.children?.length) add(children, 'Children: none');
    } else { add(children, 'Sessions: none'); add(children, 'Children: none'); }
    for (const work of row.work ?? []) add(children, 'Work: ' + work.id + ' — ' + work.state + ' — works on ' + row.id + (work.branch ? ' — branch ' + work.branch : ''), href);
    if (!row.work?.length) add(children, 'Work: none');
    add(children, 'Open requests: ' + (row.requests?.length ?? 0));
    for (const request of row.requests ?? []) add(children, 'Request: ' + request.needs + ' — open — waits on coordinator' + (request.branch ? ' — branch ' + request.branch : ''), href);
  }
  if (focused) for (const a of list.querySelectorAll('a')) if (a.dataset.mapKey === focused) { a.focus({ preventScroll: true }); break; }
}
