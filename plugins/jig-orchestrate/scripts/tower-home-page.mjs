import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { messageClient, messageCss } from './tower-message.mjs';
import { parseMessage } from './tower-message.mjs';
// The dashboard home page (/): markup and styles here, behaviour in tower-home-client.js (a plain script, inlined).
// Single column below 1600 px (Running comes before the questions), two columns above.
import { readFileSync } from 'node:fs';
import { formatTowerTime, pageCss } from './tower-core.mjs';
import { brandCss, brandHtml, faviconLink } from './tower-brand.mjs';
import { attachClient, attachCss } from './tower-attach.mjs';
import { lightboxCss, lightboxHtml, lightboxScriptFor } from './tower-lightbox.mjs';
import { createNeedsYou, needsCss, needsMarkup } from './tower-needs-you-page.mjs';
import { createRunningRail, orderRunningRail, runningCss, runningMarkup } from './tower-running-page.mjs';
import { createSessionPanel, panelCss } from './tower-session-panel.mjs';
import { createThreadLinks } from './tower-thread-links.mjs';
import { createPanelChat } from './tower-panel-chat.mjs';
import { createPanelArtifacts, artifactCss } from './tower-panel-artifacts.mjs';
import { messageAuthor, bindThreadOwnership, renderThreadMessages, postThreadMessage } from './tower-thread-chat.mjs';
import { createGpuPanel, gpuCss, trapKeys } from './tower-gpu-panel.mjs';
import { createSettingsPanel, settingsCss } from './tower-settings-panel.mjs';
import { createQuiet, quietCss, quietMarkup, quietTopics } from './tower-quiet-page.mjs';
import { defaultThemePack, themeSwitchLinks, themeSwitchScript, themeSwitchMarkup, themeLiveMarkup, themeSwitchCss } from './tower-theme.mjs';

import { css, headerCss, settingsIcon, renderOwnershipMap } from './tower-home-markup.mjs';

export function homePage(initial = null, { themePack = defaultThemePack, quietHours = 72 } = {}) {
  // Only a finite number reaches the inline script; anything else falls back to the default.
  const quietHoursValue = Number.isFinite(Number(quietHours)) ? Number(quietHours) : 72;
  const init = initial === null ? '' : `<script id="init" type="application/json">${initial.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}</script>`;
  const client = `${messageAuthor.toString()}
${bindThreadOwnership.toString()}
${renderThreadMessages.toString()}
${postThreadMessage.toString()}
${createPanelChat.toString()}
${createPanelArtifacts.toString()}
(${orderRunningRail.toString()})(document, window);
const sessionPanel = (${createSessionPanel.toString()})(document, window, options => createPanelChat({ document, window, ...options, fetch, attKit, fillMessage, attNodes, replyReference, renderThreadMessages, postThreadMessage, bindThreadOwnership, clock: formatTowerTime }), options => createPanelArtifacts({ document, window, ...options }));
const boardTitle = (topic, fallback) => { const s = state || {}, w = s.work || {}; const d = (s.discussions || []).find(x => x.id === topic) || (s.items || []).find(x => x.thread === topic); const r = d ? null : ['running', 'next', 'waiting', 'needsYou', 'parked', 'done'].flatMap(k => w[k] || []).find(x => String(x.thread ?? x.id) === topic); return (d && d.title) || (r && r.item) || fallback; };
const openTopic = info => sessionPanel.open({ ...info, title: boardTitle(info.topic, info.title) });
const threadLinks = (${createThreadLinks.toString()})(document, window, { open: openTopic, owner: topic => { const o = (state.ownershipMap?.rows || []).find(r => r.id === topic)?.owner; return o ? (o.label || o.sessionId) : 'coordinator'; } });
const renderNeedsYou = (${createNeedsYou.toString()})(document, window, { open: openTopic });
const renderRunningRail = (${createRunningRail.toString()})(document, window, { post: async (path, body) => { const j = await post(path, body); return { ok: !!j, body: j || {} }; }, refresh: () => poll(true), open: openTopic });
` + readFileSync(new URL('./tower-home-client.js', import.meta.url), 'utf8').split('/* HOME_FACTORIES */\n').join(`${trapKeys.toString()}
const renderGpu = (${createGpuPanel.toString()})(document, window, { el, when, dur, getState: () => state });
const settingsPanel = (${createSettingsPanel.toString()})(document, window, { el, trapKeys });
${quietTopics.toString()}
const quiet = (${createQuiet.toString()})(document, window, { el, getState: () => state, quietHours: ${quietHoursValue}, find: quietTopics, ago });
`);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>tower</title>${faviconLink}
${themeSwitchLinks(themePack)}${themeSwitchScript()}<style>${pageCss}${brandCss}${lightboxCss}${attachCss}${messageCss}${css}
.owner-row,#agents li{overflow-wrap:anywhere}.owner-row{grid-column:2/-1;display:block;font-size:.85em;margin-top:4px}#agents li{margin:8px 0}#agents a:focus-visible,#agents summary:focus-visible{outline:3px solid #2563eb;outline-offset:3px}#agents summary{min-height:44px;cursor:pointer}.tabs{flex-wrap:wrap}.bar.tower-hdr{flex-wrap:wrap;padding-block:8px}
${needsCss}${runningCss}${quietCss}${panelCss}${artifactCss}${themeSwitchCss}${gpuCss}${headerCss}${settingsCss}
body{background:var(--surface-canvas);color:var(--text-primary)}
</style>
<div class="bar tower-hdr" id="tower-hdr">${brandHtml()}<nav class="tabs"><button type="button" data-tab="board" class="on">Dashboard</button><button type="button" data-tab="disc">Discussions<span class="cnt" id="disccnt"></span></button><button type="button" data-tab="dec">Decisions<span class="cnt" id="deccnt"></span></button><button type="button" data-tab="pk">Parked<span class="cnt" id="pkcnt"></span></button><button type="button" data-tab="agents">Agents</button></nav><button type="button" id="gpu" hidden class="gpuchip unknown" aria-expanded="false" aria-controls="gpupanel">GPU: unknown</button><button type="button" id="issues" class="issues" hidden aria-expanded="false" aria-controls="issuepanel"></button>${themeSwitchMarkup}<button type="button" id="settings" class="settings-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="settingspanel">${settingsIcon}<span class="stx">Settings</span></button></div>${themeLiveMarkup}<div id="issuepanel" hidden></div><div id="gpupanel" class="hpanel" hidden></div><div id="settingspanel" class="hpanel" hidden></div><main data-page="home" id="home-main">
<div id="board"><div class="dashboard-layout">${runningMarkup}${needsMarkup}</div>
<details id="digest" data-key="digest" hidden><summary><span class="sum" id="digestsum"></span><button type="button" class="sbtn" id="digestx" title="Hide this until something else changes">Dismiss</button></summary><ul id="digestlist"></ul></details>
<div class="work-below">

<section id="work">
<h2 class="o3">Work</h2><div id="workbody" class="o3"></div>
<div id="nextbox" class="o5"></div>
${quietMarkup(quietHoursValue)}<details id="done" data-key="done" class="o6"><summary>Done recently<span class="cnt" id="donecnt"></span></summary><div id="donebody"></div></details>
</section></div></div>
<div id="disc" hidden><h2>Discussions <span class="cnt" id="discsub"></span></h2><div class="chips" id="chips"></div><div id="dlist"></div><details id="dclosed"><summary>Closed<span class="cnt" id="dclosedcnt"></span></summary><div id="dclosedbody"></div></details></div>
<div id="dec" hidden><h2>Decisions <span class="cnt" id="decsub"></span></h2><div class="chips" id="dchips"></div><div id="declist"></div></div>
<div id="pk" hidden><h2>Parked <span class="cnt" id="pksub"></span></h2><p class="meta">Set aside on purpose. Nothing comes back by itself: a revisit date or trigger is only a reminder.</p><div id="pklist"></div></div>
<section id="agents" hidden><h2>Agents</h2><details id="map" open><summary>Map · Relationships</summary><p id="map-status" role="status" aria-live="polite"></p><ul id="relationships"></ul></details></section></main>
<div id="toast" role="status" aria-live="polite" hidden></div>
${init}
${lightboxHtml}<script>
${formatTowerTime.toString()}
${lightboxScriptFor('.att img')}
${attachClient}
${parseMessage.toString()}
${messageClient}
${renderOwnershipMap.toString()}
${client}
</script>`;
}
