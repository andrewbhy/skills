import { messageClient, messageCss } from './review-message.mjs';
import { parseMessage } from './review-message.mjs';
// The dashboard home page (/): markup and styles here, behaviour in review-home-client.js (a plain script, inlined).
// Single column below 1600 px (Running comes before the questions), two columns above.
import { readFileSync } from 'node:fs';
import { pageCss } from './review-core.mjs';
import { brandCss, brandHtml, faviconLink } from './review-brand.mjs';
import { attachClient, attachCss } from './review-attach.mjs';
import { lightboxCss, lightboxHtml, lightboxScriptFor } from './review-lightbox.mjs';

const client = readFileSync(new URL('./review-home-client.js', import.meta.url), 'utf8');

const css = `
main[data-page=home]{max-width:84rem;padding:16px 24px 64px}
.cols{display:grid;grid-template-columns:1fr;gap:0 48px;align-items:start}
@media (max-width:1599px){.cols{display:flex;flex-direction:column}#need,#work{display:contents}.o1{order:1}.o2{order:2}.o3{order:3}.o4{order:4}.o5{order:5}.o6{order:6}}
@media (min-width:1600px){body{font-size:18px}main[data-page=home]{max-width:none;padding:20px 48px 80px}.cols{grid-template-columns:minmax(0,5fr) minmax(0,6fr)}}
@media (min-width:2400px){body{font-size:21px}main[data-page=home]{padding:28px 72px 96px}.cols{gap:0 80px}}
h2{margin:24px 0 6px;font-size:1.25em;display:flex;align-items:baseline;gap:10px}h2:first-child{margin-top:4px}
h3{margin:16px 0 2px;font-size:.85em;text-transform:uppercase;letter-spacing:.05em;color:#767676;font-weight:600;display:flex;align-items:center;gap:10px}
.cnt{font-weight:400;color:#767676;font-size:.8em}
.item{display:grid;grid-template-columns:14px minmax(0,1fr);gap:4px 10px;padding:8px 0;border-bottom:1px solid #8884}
.meta{font-size:.82em;color:#767676}.kind{border:1px solid #8886;border-radius:4px;padding:0 5px;font-size:.75em;margin-right:6px}
button{font:inherit;font-size:.8em;cursor:pointer;min-height:28px}
button:disabled{cursor:default;opacity:.55}
details{margin:10px 0}summary{cursor:pointer;font-weight:600}
details>summary .cnt{margin-left:6px}
.udot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#2563eb;vertical-align:.05em;flex:none}.udot.off{background:transparent}
.item .udot{margin-top:.55em}
.t.has{font-weight:700}
.rw{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:2px 8px;align-items:start;padding:6px 6px 6px 8px;border-bottom:1px solid #8883;border-left:3px solid transparent}
.rw .rt{font-weight:500}.rw .udot{margin-top:.5em}
.tag{display:inline-block;font-size:.72em;padding:0 6px;margin-right:6px;border-radius:9px;background:#8882;color:#5f5f5f;vertical-align:.1em;white-space:nowrap}
.rw .w{font-size:.82em;color:#767676}.rw .w b{color:#c2410c;font-weight:600}
.rw.run{border-left-color:#3b82f6}.rw.fresh{background:#3b82f620}
.sel{outline:2px solid #2563eb;outline-offset:-2px;border-radius:4px}
.prog{font-size:.85em;color:#767676;margin-top:2px}.prog .el{font-weight:600;color:inherit;margin-right:8px}
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
.hint{font-size:.78em;margin-left:8px;color:#a16207}.hint .sbtn{margin-left:6px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}
.chips button{border:1px solid #8886;background:none;color:inherit;border-radius:99px;padding:3px 12px}.chips button.on{background:#2563eb;border-color:#2563eb;color:#fff}
.drow{display:grid;grid-template-columns:13rem minmax(0,1fr) 6rem;gap:4px 14px;align-items:baseline;padding:8px 6px;border-bottom:1px solid #8883;color:inherit}
.drow:hover,.drow:focus-visible{background:#8881;text-decoration:none}
.drow .pill{margin-left:0;justify-self:start}.drow .ttl{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drow .pv{color:#767676;font-size:.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.drow .age{color:#767676;font-size:.82em;text-align:right}
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
.qproj{font-weight:600;font-size:.9em;margin:12px 0 2px}
.qcard{border:1px solid #8885;border-radius:8px;padding:8px 12px;margin:6px 0 10px}
.qcard .qt{font-weight:600}.qcard .qn{color:#767676;font-weight:400;margin-right:6px}.qcard .qwhy{font-size:.88em;color:#5f5f5f;margin:2px 0}.qcard .qrec{font-size:.86em;margin:2px 0}.qcard .qrec b{font-weight:600}
.qcard .qsrc{font-size:.8em;margin-left:8px}
.qacts{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;margin:4px 0}
.qsub{display:grid;grid-template-columns:3.2rem minmax(0,1fr);gap:2px 8px;padding:6px 0;border-top:1px solid #8883}
.qsub .qsn{color:#767676;font-size:.85em;padding-top:.15em}.qsub.done{color:#767676;font-size:.88em}
.qform{grid-column:2/3;display:flex;gap:6px;align-items:flex-end;margin-top:4px}.qform textarea{font:inherit;flex:1;min-height:3.2em;padding:5px 8px;border:1px solid #8888;border-radius:6px;background:transparent;color:inherit;resize:vertical}
.gpuchip[hidden]{display:none}.gpuchip{margin-left:auto;font:inherit;font-size:.85em;font-weight:600;border-radius:99px;padding:2px 12px;min-height:26px;cursor:pointer;border:1px solid #fff8;background:transparent;color:#fff;display:inline-flex;gap:6px;align-items:center}.gpuchip:hover,.gpuchip[aria-expanded=true]{background:#fff2}.gpuchip.busy{background:#2563eb;border-color:#2563eb}.gpuchip.amber{color:#1d1d1f;background:#fbbf24;border-color:#fbbf24}.gpuchip.amber:hover,.gpuchip.amber[aria-expanded=true]{background:#fcd34d}.gpuchip.unknown{opacity:.7}
#gpupanel{background:#26262b;color:#f4f4f5;border-bottom:2px solid #8886;padding:8px 24px 12px}#gpupanel[hidden]{display:none}#gpupanel h3{margin:8px 0 4px;color:#bbb}#gpupanel .why{color:#ccc;margin:2px 0}.gr{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:12px;padding:3px 0;border-top:1px solid #fff2}.gk{color:#bbb}.gv{overflow-wrap:anywhere}
.issues{margin-left:0;font:inherit;font-size:.85em;font-weight:600;color:#1d1d1f;background:#fbbf24;border:0;border-radius:99px;padding:2px 12px;min-height:26px;cursor:pointer}.issues:hover,.issues[aria-expanded=true]{background:#fcd34d}
#issuepanel{background:#fffbeb;color:#1d1d1f;border-bottom:2px solid #fbbf24;padding:8px 24px 12px}#issuepanel[hidden]{display:none}#issuepanel h3{margin:4px 0}#issuepanel .iss{padding:6px 0;border-top:1px solid #0002}#issuepanel .why{font-size:.88em;color:#555}#issuepanel code{font-size:.85em}
.qthread{margin:6px 0 4px;border-left:3px solid #8885;padding-left:10px}.qm{font-size:.9em;margin:3px 0}.qm .by{display:block;font-size:.78em;color:#767676}.qm.person{color:#1d4ed8}.qm span:not(.by){white-space:pre-wrap;overflow-wrap:anywhere}.qchat .attbtn{min-height:2.6em}.qthread.dropping{outline:2px dashed #2563eb}.qthread .thumbs{margin:6px 0 0}
.qchat{display:flex;gap:6px;align-items:flex-end;margin:6px 0}.qchat textarea{font:inherit;flex:1;min-height:2.6em;padding:5px 8px;border:1px solid #8888;border-radius:6px;background:transparent;color:inherit;resize:vertical}.qsrc2{font-size:.8em}
#toast{position:fixed;left:16px;bottom:16px;z-index:5;background:#1d1d1f;color:#fff;padding:8px 14px;border-radius:8px;display:flex;gap:12px;align-items:center;box-shadow:0 2px 12px #0006;max-width:calc(100vw - 32px)}
#toast[hidden]{display:none}#toast button{background:#fff;color:#1d1d1f;border:0;border-radius:6px;padding:2px 12px}
@media (max-width:700px){.rw{grid-template-columns:12px minmax(0,1fr)}.racts{grid-column:2/3;justify-content:flex-start}.drow{grid-template-columns:minmax(0,1fr)}}
@media (prefers-color-scheme:dark){#issuepanel{background:#3b2f0b;color:#f4f4f5}#issuepanel .why{color:#ccc}.qm.person{color:#93c5fd}.dn-outdates{color:#fca5a5}.dn-informs,.st-informed{color:#93c5fd}.dn-confirms,.st-confirmed{color:#86efac}.dn-reopens,.dn-blocks,.dn-unblocks,.st-blocking,.st-reopened{color:#c4b5fd}.st-outdated{color:#fca5a5}.rw .w b{color:#fb923c}.tag{color:#bbb}.pill.waiting-coordinator{color:#fb923c}.hint{color:#facc15}.qcard .qwhy{color:#bbb}h3,.cnt,.meta,.rw .w,.off{color:#a0a0a8}#toast{background:#e8e8ea;color:#17171a}#toast button{background:#17171a;color:#e8e8ea}}`;

// `initial` is the board state as JSON text: it is rendered before first paint, so nothing pops in afterwards.
export function homePage(initial = null) {
  const init = initial === null ? '' : `<script id="init" type="application/json">${initial.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}</script>`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>tower</title>${faviconLink}
<style>${pageCss}${brandCss}${lightboxCss}${attachCss}${messageCss}${css}</style>
<div class="bar tower-hdr">${brandHtml()}<nav class="tabs"><button type="button" data-tab="board" class="on">Dashboard</button><button type="button" data-tab="disc">Discussions<span class="cnt" id="disccnt"></span></button><button type="button" data-tab="dec">Decisions<span class="cnt" id="deccnt"></span></button><button type="button" data-tab="pk">Parked<span class="cnt" id="pkcnt"></span></button></nav><button type="button" id="gpu" hidden class="gpuchip unknown" aria-expanded="false" aria-controls="gpupanel">GPU: unknown</button><button type="button" id="issues" class="issues" hidden aria-expanded="false" aria-controls="issuepanel"></button></div><div id="issuepanel" hidden></div><div id="gpupanel" class="hpanel" hidden></div><main data-page="home">
<div id="board">
<details id="digest" data-key="digest" hidden><summary><span class="sum" id="digestsum"></span><button type="button" class="sbtn" id="digestx" title="Hide this until something else changes">Dismiss</button></summary><ul id="digestlist"></ul></details>
<div class="cols">
<section id="need">
<h2 class="o1">For you <span class="cnt" id="needcnt"></span></h2>
<h3 class="o1">Read and review <button id="seen" class="sbtn" title="Mark everything as looked at">Mark all seen</button></h3><div id="list" class="o1"></div><p class="meta o1" id="empty" hidden>Nothing to review.</p>
<details id="blk" data-key="blk" class="o1"><summary>Blocked<span class="cnt" id="blkcnt"></span></summary><div id="blkbody"></div></details>
<h3 id="qh" class="o2">Your move</h3><div id="qbody" class="o2"></div>
<section id="oq" class="o4" hidden><h3 id="oqh">Open questions</h3><div id="oqbody"></div><details id="oqans" data-key="oqans" hidden><summary>Answered<span class="cnt" id="oqanscnt"></span></summary><div id="oqansbody"></div></details></section>
</section>
<section id="work">
<h2 class="o3">Work</h2><div id="workbody" class="o3"></div><div id="runbody" class="o3"></div>
<div id="nextbox" class="o5"></div>
<details id="wait" data-key="wait" class="o6"><summary>In progress elsewhere<span class="cnt" id="waitcnt"></span></summary><div id="waitbody"></div></details>
<details id="done" data-key="done" class="o6"><summary>Done recently<span class="cnt" id="donecnt"></span></summary><div id="donebody"></div></details>
</section></div></div>
<div id="disc" hidden><h2>Discussions <span class="cnt" id="discsub"></span></h2><div class="chips" id="chips"></div><div id="dlist"></div><details id="dclosed"><summary>Closed<span class="cnt" id="dclosedcnt"></span></summary><div id="dclosedbody"></div></details></div>
<div id="dec" hidden><h2>Decisions <span class="cnt" id="decsub"></span></h2><div class="chips" id="dchips"></div><div id="declist"></div></div>
<div id="pk" hidden><h2>Parked <span class="cnt" id="pksub"></span></h2><p class="meta">Set aside on purpose. Nothing comes back by itself: a revisit date or trigger is only a reminder.</p><div id="pklist"></div></div>
</main>
<div id="toast" role="status" aria-live="polite" hidden></div>
${init}
${lightboxHtml}<script>
${lightboxScriptFor('.att img')}
${attachClient}
${parseMessage.toString()}
${messageClient}
${client}
</script>`;
}
