if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-settings-panel.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
import { towerTokenCss } from './tower-theme.mjs';

// New home only: the Settings panel. Colours come from tower tokens; errors carry words and a mark, never colour alone.
export const settingsCss = `
${towerTokenCss.replace('.needs-panel{', '#settingspanel,.settings-btn{')}
.settings-btn{font:inherit;font-size:14px;min-height:32px;padding:2px 14px;border:1px solid currentColor;border-radius:99px;background:transparent;color:inherit;cursor:pointer}
.settings-btn:hover,.settings-btn[aria-expanded=true]{text-decoration:underline;text-underline-offset:3px}
.settings-btn[aria-expanded=true]{box-shadow:inset 0 0 0 2px currentColor}
.settings-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
#settingspanel[hidden]{display:none}#settingspanel{background:var(--set-panel-bg);color:var(--set-panel-fg);border-bottom:1px solid var(--set-panel-border);padding:12px 24px 16px;animation:set-in .15s ease-out}
#settingspanel:focus{outline:none}#settingspanel:focus-visible{outline:3px solid var(--set-focus-ring);outline-offset:-3px}
#settingspanel .set-head{display:flex;align-items:center;gap:16px}
#settingspanel .set-head h3{margin:0 auto 0 0;color:var(--set-panel-fg);font-size:1.05em;text-transform:none;letter-spacing:0}
#settingspanel .set-rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:4px 32px;margin:8px 0}
#settingspanel .set-row{display:flex;flex-direction:column;gap:3px;padding:8px 0;border-top:1px solid var(--set-panel-border)}
#settingspanel .set-label{font-weight:700}
#settingspanel .set-hint{margin:0;color:var(--set-panel-muted);font-size:.88em}
#settingspanel .set-err{margin:0;color:var(--set-error-fg);font-weight:600;font-size:.92em}
#settingspanel .set-err[hidden]{display:none}
#settingspanel input[type=number],#settingspanel select{font:inherit;font-size:1em;min-height:36px;padding:3px 8px;max-width:20rem;color:var(--set-panel-fg);background:var(--set-field-bg);border:1px solid var(--set-field-border);border-radius:6px}
#settingspanel input[aria-invalid=true],#settingspanel select[aria-invalid=true]{border-width:2px;border-style:dashed}
#settingspanel input[type=checkbox]{width:20px;height:20px;margin:0 8px 0 0;accent-color:currentColor}
#settingspanel .set-check{display:flex;align-items:center;min-height:36px}
#settingspanel input:focus-visible,#settingspanel select:focus-visible{outline:3px solid var(--set-focus-ring);outline-offset:2px}
#settingspanel .set-foot{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
#settingspanel .set-status{margin:0;color:var(--set-panel-fg);min-height:1.4em;flex:1 1 16rem}
#settingspanel .set-btn{min-height:34px;padding:4px 14px;font:inherit;font-size:13px;color:var(--set-panel-fg);background:transparent;border:1px solid var(--set-panel-muted);border-radius:6px;cursor:pointer}
#settingspanel .set-btn:hover{text-decoration:underline}
#settingspanel .set-btn:disabled{cursor:default;text-decoration:none}
#settingspanel .set-btn:focus-visible{outline:3px solid var(--set-focus-ring);outline-offset:2px}
@keyframes set-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){#settingspanel{animation:none}}
`;

// Browser side (stringified into the page). Values load from GET /api/settings; Save posts to the same path, where tower-config validates.
export function createSettingsPanel(document, window, { el, trapKeys }) {
  const btn = document.getElementById('settings'), panel = document.getElementById('settingspanel');
  const idOf = key => 'set-' + key.replace('.', '-');
  const inputs = {}, errs = {};
  let built = false, packSelect, statusEl, saveBtn, closeBtn, loaded = null, busy = false;
  const open = () => !panel.hidden;
  function row(key, label, control, hint, checkbox) {
    const r = el('div', 'set-row'), id = idOf(key);
    control.id = id; inputs[key] = control;
    const lab = el('label', 'set-label', label); lab.htmlFor = id;
    const h = el('p', 'set-hint', hint); h.id = id + '-hint';
    const err = el('p', 'set-err'); err.id = id + '-err'; err.hidden = true; errs[key] = err;
    control.setAttribute('aria-describedby', h.id + ' ' + err.id);
    if (checkbox) { const line = el('div', 'set-check'); line.append(control, lab); r.append(line); } else r.append(lab, control);
    r.append(h, err);
    return r;
  }
  function number(min, max) { const i = el('input'); i.type = 'number'; i.min = min; i.max = max; i.step = 1; i.inputMode = 'numeric'; return i; }
  function toggle() { const i = el('input'); i.type = 'checkbox'; return i; }
  function build() {
    built = true;
    panel.textContent = '';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Settings'); panel.tabIndex = -1;
    const head = el('div', 'set-head'); head.append(el('h3', null, 'Settings'));
    closeBtn = el('button', 'set-btn', 'Close'); closeBtn.type = 'button'; closeBtn.addEventListener('click', () => close(true));
    head.append(closeBtn);
    packSelect = el('select');
    const rows = el('div', 'set-rows');
    rows.append(
      row('quietHours', 'Quiet after (hours)', number(1, 720), 'A topic with no news for this long counts as quiet. 1 to 720.'),
      row('stalledHours', 'Stalled after (hours)', number(1, 168), 'Running work with no sign of life for this long is marked stalled. 1 to 168.'),
      row('themePack', 'Theme pack', packSelect, 'Each pack names its dark pairing. A change applies when you reload this page.'),
      row('gpu.enabled', 'GPU monitoring', toggle(), 'On shows the GPU chip and reads nvidia-smi and ComfyUI.', true),
      row('newHome', 'New home', toggle(), 'Turning this off returns to the old page when you reload. To return, run: node scripts/tower.mjs config set newHome true', true));
    const foot = el('div', 'set-foot');
    saveBtn = el('button', 'set-btn', 'Save'); saveBtn.type = 'button'; saveBtn.addEventListener('click', save);
    statusEl = el('p', 'set-status'); statusEl.setAttribute('role', 'status'); statusEl.setAttribute('aria-live', 'polite');
    foot.append(saveBtn, statusEl);
    panel.append(head, rows, foot);
  }
  function clearErrors() {
    for (const key of Object.keys(errs)) { errs[key].hidden = true; errs[key].textContent = ''; inputs[key].removeAttribute('aria-invalid'); }
  }
  function showError(key, reason) {
    const err = errs[key]; if (!err) return false;
    err.hidden = false; err.textContent = 'Not saved: ' + reason;
    inputs[key].setAttribute('aria-invalid', 'true');
    return true;
  }
  function fill(data) {
    loaded = data;
    const v = data.values;
    inputs.quietHours.value = v.quietHours; inputs.stalledHours.value = v.stalledHours;
    inputs['gpu.enabled'].checked = !!v['gpu.enabled']; inputs.newHome.checked = !!v.newHome;
    packSelect.textContent = '';
    for (const p of data.packs) {
      const o = el('option', null, p.id + (p.dark === p.id ? ' (also used in dark)' : ' (dark pairing: ' + p.dark + ')')); o.value = p.id; packSelect.append(o);
    }
    packSelect.value = v.themePack;
  }
  async function load() {
    statusEl.textContent = 'Loading the current settings.';
    try {
      const res = await fetch('/api/settings', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      fill(await res.json()); statusEl.textContent = '';
    } catch (e) { statusEl.textContent = 'Could not load the settings (' + e.message + '). Close this panel and try again.'; }
  }
  function collect() {
    const num = i => { const t = String(i.value).trim(), n = Number(t); return t !== '' && Number.isFinite(n) ? n : t; };
    return { quietHours: num(inputs.quietHours), stalledHours: num(inputs.stalledHours), themePack: packSelect.value, 'gpu.enabled': inputs['gpu.enabled'].checked, newHome: inputs.newHome.checked };
  }
  async function save() {
    if (busy || !loaded) return;
    busy = true; saveBtn.disabled = true; clearErrors(); statusEl.textContent = 'Saving.';
    try {
      const body = collect();
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const before = loaded.values;
        fill(j);
        const notes = [];
        if (j.values.themePack !== before.themePack) notes.push('Reload this page to see the new theme pack.');
        if (j.values['gpu.enabled'] !== before['gpu.enabled']) notes.push('The GPU chip follows on the next refresh or reload.');
        if (!j.values.newHome) notes.push('New home is off: the old page returns when you reload. To return, run: node scripts/tower.mjs config set newHome true');
        statusEl.textContent = 'Saved. ' + notes.join(' ');
      } else {
        const fields = j.fields || {}; let first = null;
        for (const [key, reason] of Object.entries(fields)) if (showError(key, reason) && !first) first = key;
        const stray = Object.entries(fields).filter(([key]) => !errs[key]).map(([key, reason]) => (key ? key + ': ' : '') + reason);
        statusEl.textContent = 'Nothing was saved. ' + (first ? 'Please check the marked field' + (Object.keys(fields).length > 1 ? 's' : '') + '.' : stray.join(' ') || j.error || 'The tower refused the change (' + res.status + ').');
        if (first) inputs[first].focus();
      }
    } catch (e) { statusEl.textContent = 'Nothing was saved. The tower could not be reached (' + e.message + ').'; }
    busy = false; saveBtn.disabled = false;
  }
  function close(restore) {
    panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
    if (restore) btn.focus();
  }
  function openPanel() {
    if (!built) build();
    clearErrors();
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    panel.focus(); load();
  }
  btn.addEventListener('click', () => { if (open()) close(true); else openPanel(); });
  trapKeys(document, { panel, trigger: btn, isOpen: open, close });
  return { open: openPanel, close };
}
