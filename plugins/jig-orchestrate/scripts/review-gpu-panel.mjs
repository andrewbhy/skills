if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-gpu-panel.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { towerTokenCss } from './tower-theme.mjs';

// New home only: GPU chip and read-only panel. Colours come from tower tokens; busy and amber keep a glyph and words.
export const gpuCss = `
${towerTokenCss.replace('.needs-panel{', '#gpupanel,.gpuchip{')}
.gpuchip[hidden]{display:none}.gpuchip{margin-left:auto;font:inherit;font-size:.85em;font-weight:600;border-radius:99px;padding:2px 12px;min-height:26px;cursor:pointer;border:1px solid currentColor;background:transparent;color:inherit;display:inline-flex;gap:6px;align-items:center}
.gpuchip:hover,.gpuchip[aria-expanded=true]{background:transparent;text-decoration:underline;text-underline-offset:3px}
.gpuchip[aria-expanded=true]{box-shadow:inset 0 0 0 2px currentColor}
.gpuchip.busy,.gpuchip.busy:hover,.gpuchip.busy[aria-expanded=true]{background:var(--gpu-busy-bg);color:var(--gpu-busy-fg);border-color:var(--gpu-busy-bg)}
.gpuchip.amber,.gpuchip.amber:hover,.gpuchip.amber[aria-expanded=true]{background:var(--gpu-amber-bg);color:var(--gpu-amber-fg);border-color:var(--gpu-amber-bg)}
.gpuchip.unknown{opacity:1;border-style:dashed}
.gpuchip:focus-visible{outline:2px solid currentColor;outline-offset:2px}
#gpupanel[hidden]{display:none}#gpupanel{background:var(--gpu-panel-bg);color:var(--gpu-panel-fg);border-bottom:1px solid var(--gpu-panel-border);padding:12px 24px 16px;animation:gpu-in .15s ease-out}
#gpupanel:focus{outline:none}#gpupanel:focus-visible{outline:3px solid var(--gpu-focus-ring);outline-offset:-3px}
#gpupanel .gpu-head{display:flex;align-items:center;gap:16px}
#gpupanel .gpu-head h3{margin:0 auto 0 0;color:var(--gpu-panel-fg);font-size:1.05em}
#gpupanel h3{margin:12px 0 4px;color:var(--gpu-panel-muted)}
#gpupanel .why{color:var(--gpu-panel-muted);margin:4px 0}
#gpupanel .gpu-na{font-weight:700;margin:8px 0 2px;color:var(--gpu-panel-fg)}
.gr{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:12px;padding:3px 0;border-top:1px solid var(--gpu-panel-border)}.gv{overflow-wrap:anywhere}#gpupanel .gk{color:var(--gpu-panel-muted)}
#gpupanel .gpu-close{min-height:34px;padding:4px 12px;font:inherit;font-size:13px;color:var(--gpu-panel-fg);background:transparent;border:1px solid var(--gpu-panel-muted);border-radius:6px;cursor:pointer}
#gpupanel .gpu-close:hover{text-decoration:underline}
#gpupanel .gpu-close:focus-visible{outline:3px solid var(--gpu-focus-ring);outline-offset:2px}
@keyframes gpu-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){#gpupanel{animation:none}.gpuchip{transition:none}}
`;

// Shared by the GPU and Settings panels (stringified into the page): Escape closes and returns focus to the trigger; Tab stays inside.
export function trapKeys(document, { panel, trigger, isOpen, close }) {
  document.addEventListener('keydown', e => {
    if (!isOpen() || e.isComposing) return;
    const inside = panel.contains(document.activeElement);
    if (e.key === 'Escape' && (inside || document.activeElement === trigger)) { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (e.key !== 'Tab' || !inside) return;
    const items = [...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(n => !n.hidden);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    else if (at === panel) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  }, true);
}

// Browser side. The chip stays visible while the setting is on; without a reading the panel says so and why.
export function createGpuPanel(document, window, { el, when, dur, getState }) {
  const chip = document.getElementById('gpu'), panel = document.getElementById('gpupanel');
  const glyph = { idle: '○', busy: '●', amber: '▲', unknown: '?' };
  let body = null, closeBtn = null;
  const open = () => !panel.hidden;
  const unavailable = g => !g || (!g.gpu && !(g.comfy && g.comfy.up));
  const reasonOf = g => !g ? 'No reading yet. The tower reads nvidia-smi and ComfyUI every few seconds; if this stays, neither is reachable.' : 'nvidia-smi is not available and ComfyUI is not answering.';
  function build() {
    panel.textContent = '';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'GPU and ComfyUI'); panel.tabIndex = -1;
    const head = el('div', 'gpu-head'); head.append(el('h3', null, 'GPU and ComfyUI'));
    closeBtn = el('button', 'gpu-close', 'Close'); closeBtn.type = 'button'; closeBtn.addEventListener('click', () => close(true));
    head.append(closeBtn);
    body = el('div', 'gpu-body'); panel.append(head, body);
  }
  function fill() {
    const g = getState().gpu; body.textContent = '';
    if (unavailable(g)) body.append(el('p', 'gpu-na', 'GPU data unavailable'), el('p', 'why', reasonOf(g)));
    if (!g) return;
    const row = (k, v) => { const r = el('div', 'gr'); r.append(el('span', 'gk', k), el('span', 'gv', v)); body.append(r); };
    const c = g.comfy, now = Date.now(), run = c.running[0];
    row('Now', !c.up ? 'ComfyUI is not answering' : run ? (run.model || 'running') + (run.prefix ? ' / ' + run.prefix : '') + (run.startedAt ? ', since ' + when(run.startedAt) : '') : 'nothing running');
    row('Owner', g.owner ? g.owner.who + ' (' + (g.owner.source === 'lease' ? 'lease' : 'guessed from ' + g.owner.source) + ')' : 'nobody');
    row('Lease', g.lease ? g.lease.who + ': ' + g.lease.task + ', ' + dur(now - Date.parse(g.lease.since)) + ' of about ' + g.lease.expectMinutes + ' min' + (g.lease.stale ? ' (stale, no longer blocks)' : g.lease.overdue ? ' (overdue)' : '') : 'none');
    row('Queue', c.up ? c.pending + ' waiting, ' + c.running.length + ' running' : 'unknown');
    row('VRAM', g.gpu ? (g.gpu.usedMB / 1024).toFixed(1) + ' of ' + (g.gpu.totalMB / 1024).toFixed(0) + ' GB, util ' + (g.gpu.util ?? '?') + '%, ' + (g.gpu.temp ?? '?') + ' °C' : 'nvidia-smi not available');
    body.append(el('h3', null, 'Last finished'));
    if (!c.lastDone.length) body.append(el('p', 'why', 'None yet.'));
    for (const d of c.lastDone) {
      const r = el('div', 'gr');
      r.append(el('span', 'gk', d.seconds == null ? '?' : 'took ' + (d.seconds >= 60 ? Math.floor(d.seconds / 60) + 'm ' + (d.seconds % 60) + 's' : d.seconds + 's')),
        el('span', 'gv', (d.client || d.prefix || d.promptId.slice(0, 8)) + (d.model ? ' / ' + d.model : '') + (d.status && d.status !== 'success' ? ' [' + d.status + ']' : '') + (d.endedAt ? ', ' + when(d.endedAt) : '')));
      body.append(r);
    }
  }
  function close(restore) {
    panel.hidden = true; chip.setAttribute('aria-expanded', 'false');
    if (restore) chip.focus();
  }
  function paint() {
    const s = getState(), g = s.gpu, on = !!(g || s.gpuOn);
    chip.hidden = !on;
    if (!on) { if (open()) close(false); return; }
    const level = unavailable(g) ? 'unknown' : g.chip.level;
    chip.className = 'gpuchip ' + level;
    chip.textContent = '';
    const full = unavailable(g) ? 'GPU: unavailable' : g.chip.text, gt = el('span', 'gt', full);
    gt.setAttribute('data-short', full.replace(/^GPU: /, '').replace(/\s*[(].*$/, ''));
    chip.append(el('span', 'gg', glyph[level] || '?'), gt);
    chip.title = full + '. Open details.';
    if (open()) fill();
  }
  function openPanel() {
    if (!body) build();
    panel.hidden = false; chip.setAttribute('aria-expanded', 'true');
    fill(); panel.focus();
  }
  chip.setAttribute('aria-haspopup', 'dialog');
  chip.addEventListener('click', () => { if (open()) close(true); else openPanel(); });
  trapKeys(document, { panel, trigger: chip, isOpen: open, close });
  return paint;
}
