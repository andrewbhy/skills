import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, runVisual } from './visual-clip.mjs';

// CSS proxies for crispness. Pixel visibility remains an independent inspector.
export const CRISP_THRESHOLDS = Object.freeze({ primary: 12, secondary: 5.5, coloured: 4.5, body: 13, border: 1.5, fill: 1.15 });

export function contrast(a, b) {
  const luminance = rgb => rgb.slice(0, 3).reduce((sum, byte, i) => {
    const c = byte / 255;
    return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

export function analyseCrisp(measurements, { scale = 1, thresholds = {} } = {}) {
  const limits = { ...CRISP_THRESHOLDS, ...thresholds }, findings = [], checkedFocus = new Set();
  for (const m of measurements) {
    const role = m.role || 'body';
    const add = (kind, measured, expected, extra = {}) => findings.push({ kind, element: m.element, rect: m.rect, measured, expected, role, ...extra });
    if (m.disabled) m.contrastStatus = 'disabled, exempt';
    if (m.text && !m.disabled) {
      if (m.foreground && m.background) {
        const ratio = contrast(m.foreground, m.background);
        const threshold = limits[m.filledControl || m.tone === 'coloured' ? 'coloured' : m.tone === 'secondary' ? 'secondary' : 'primary'];
        m.contrastRatio = ratio; m.contrastThreshold = threshold;
        if (ratio < threshold) add('text-contrast', ratio, `contrast >= ${threshold}`, { tone: m.tone, threshold });
      }
      if (scale === 1 && role === 'body' && m.fontSize < limits.body) add('small-body-text', m.fontSize, `font-size >= ${limits.body}px`);
      if (m.opacity < 1) add('text-opacity', m.opacity, 1);
    }
    for (const border of m.borders || []) {
      if (m.filledControl || m.background && border.color.slice(0,3).every((v,i)=>Math.abs(v-m.background[i])<.5)) continue;
      const ratio = contrast(border.color, m.background);
      if (ratio < limits.border) add('faint-border', ratio, `contrast >= ${limits.border}`, { edge: border.edge });
    }
    if(m.quiet && m.state==='default' && !m.disabled){
      const ground=m.controlSurface || m.surface || m.background;
      const fillVisible=m.fill&&ground&&contrast(m.fill,ground)>=limits.fill;
      const borderVisible=(m.borders || []).some(b=>ground&&contrast(b.color,ground)>=limits.border);
      if(!fillVisible&&!borderVisible)add('faint-border','no visible quiet-control fill or boundary','visible default control affordance');
    }
    const focus=m.focusTarget || m, ground=focus.controlSurface || m.background;
    const ring=focus.outline&&focus.outline.width>0&&!['none','hidden'].includes(focus.outline.style)&&focus.outline.color[3]>0&&ground&&
      contrast(focus.outline.color,ground)>=limits.border;
    const shadowRing=focus.focusShadow?.width>0&&focus.focusShadow.color[3]>0&&ground&&contrast(focus.focusShadow.color,ground)>=limits.border;
    if(m.control && m.filledControl && m.focusVisible && !m.disabled && !checkedFocus.has(focus.element)) {
      checkedFocus.add(focus.element);
      if(!ring && !shadowRing)add('faint-border','no visible focus ring','visible focus ring on filled control',{edge:'focus',element:focus.element,rect:focus.rect});
    }
    if (m.fill && m.surface) {
      const ratio = contrast(m.fill, m.surface), threshold = m.separator ? limits.border : limits.fill;
      // An identical nested fill is the same surface. Keep separators and
      // distinct, nearly identical visible fills subject to their thresholds.
      const distinct=m.fill.slice(0,3).some((v,i)=>Math.abs(v-m.surface[i])>=.5);
      if ((m.separator || distinct) && m.fill[3]!==0 && m.surface[3]!==0 && ratio < threshold) add(m.separator ? 'faint-separator' : 'grey-on-grey', ratio, `contrast >= ${threshold}`);
    }
    if (m.hiddenWidth > 1 && (m.canGrow || m.singleRow)) add('unintended-truncation', m.hiddenWidth,
      'show full text when the container can grow or only one row is shown', { hiddenWidth: m.hiddenWidth, canGrow: m.canGrow, singleRow: m.singleRow });
  }
  return { findings, gaps: [], measurements };
}

// Compare both side-by-side specimens and successive snapshots of live controls.
// Callers isolate history by viewport, scale and data mode.
export function analyseConsistency(measurements, history = [], exceptions = []) {
  const findings = [], waived = [];
  const all = [...history, ...measurements];
  const components = Map.groupBy(all, m => m.component);
  const selections = all.filter(m => m.selected && m.componentRoot);
  const emit = (m, other, kind, property, measured, expected) => {
    const f = { kind, element: m.element, other: other.element, rect: m.rect, property, measured, expected,
      state: m.state, referenceState: other.state };
    const exception = exceptions.find(e => e.element === m.element && e.property === property && typeof e.reason === 'string' && e.reason.trim());
    if (exception && kind === 'selection-style') waived.push({ ...f, reason: exception.reason });
    else findings.push(f);
  };
  for (const m of measurements) {
    const peers = (components.get(m.component) || []).filter(p => p !== m);
    const textPeers = peers.filter(p => p.text && m.text && p.slot === m.slot && p.state !== m.state);
    for (const property of ['fontWeight', 'fontSize', 'letterSpacing', 'textWidth']) {
      const other = textPeers.find(p => (property !== 'textWidth' || p.text === m.text) && p[property] !== m[property]);
      if (other) emit(m, other, 'state-typography', property, m[property], other[property]);
    }
    if (m.componentRoot && m.background) {
      // State paint includes ink and boundary as well as fill. A disabled
      // control must differ from its enabled default and hover specimens.
      for(const other of peers.filter(p=>p.componentRoot&&p.background&&
        ((m.disabled&&['default','hover'].includes(p.state)&&!p.disabled)||
         (p.disabled&&['default','hover'].includes(m.state)&&!m.disabled)))){
        const ink=m.color&&other.color?contrast(m.color,other.color):1;
        const borderColors=x=>(x.borders || []).map(b=>b.color);
        const a=borderColors(m),b=borderColors(other);
        const boundary=a.length===b.length&&a.every((c,i)=>contrast(c,b[i])<CRISP_THRESHOLDS.border);
        const ratio=contrast(m.background,other.background);
        if(ratio<CRISP_THRESHOLDS.fill&&ink<CRISP_THRESHOLDS.border&&boundary)
          emit(m,other,'state-fill','background',{fill:ratio,ink},'enabled and disabled paint must be distinguishable');
      }
      if (m.state === 'hover' || m.state === 'default') {
        const otherState = m.state === 'hover' ? 'default' : 'hover';
        const other = peers.find(p => p.componentRoot && p.state === otherState && p.background);
        if (other && contrast(m.background, other.background) < CRISP_THRESHOLDS.fill) emit(m, other, 'state-fill', 'background', contrast(m.background, other.background), `contrast >= ${CRISP_THRESHOLDS.fill}`);
      }
      const selected = peers.find(p => p.componentRoot && p.selected && p.background);
      const threshold = m.state === 'hover' ? 1.3 : m.state === 'default' ? 1.5 : null;
      if (selected && threshold) {
        const ratio = contrast(m.background, selected.background);
        if (ratio < threshold) emit(m, selected, 'state-fill', 'background', ratio, `contrast >= ${threshold}`);
      }
      // Also detect the pair when selected arrives after default/hover.
      if (m.selected) for (const state of ['default', 'hover']) {
        const other = peers.find(p => p.componentRoot && p.state === state && p.background);
        const limit = state === 'hover' ? 1.3 : 1.5;
        if (other && contrast(m.background, other.background) < limit) emit(m, other, 'state-fill', 'background', contrast(m.background, other.background), `contrast >= ${limit}`);
      }
    }
    if (m.selected && m.componentRoot) {
      if (m.squareTable && m.radius.some(value => parseFloat(value) > 0)) emit(m, { element: m.table }, 'selection-style', 'radius', m.radius, Array(4).fill('0px'));
      for (const property of ['background', 'radius', 'color']) {
        const other = selections.find(p => !exceptions.some(e => e.element === p.element && e.property === property));
        if (other && other.element !== m.element && JSON.stringify(m[property]) !== JSON.stringify(other[property])) emit(m, other, 'selection-style', property, m[property], other[property]);
      }
    }
  }
  // Keep one snapshot per identity/state/text. Avoid quadratic growth over a run.
  const retained = new Map(all.map(m => [JSON.stringify([m.element, m.component, m.slot, m.state, m.text]), m]));
  return { findings, gaps: [], exceptions: waived, history: [...retained.values()] };
}

// Serializable browser capture. It performs no DOM writes and reuses styles,
// colour conversion, paths and font metrics within the snapshot.
export function crispTargets({ selector = 'body', state = 'default', fontChecksOnly = false } = {}) {
  const root = document.querySelector(selector);
  if (!root) throw new Error('Root missing');
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 20000) throw new Error('Root exceeds 20000 elements; narrow selector');
  const styles = new Map(), paths = new Map(), colors = new Map(), gaps = new Set();
  const style = e => { if (!styles.has(e)) styles.set(e, getComputedStyle(e)); return styles.get(e); };
  const path = e => {
    if (!e) return '';
    if (!paths.has(e)) paths.set(e, e.id ? `#${CSS.escape(e.id)}` : e.parentElement ? `${path(e.parentElement)} > ${e.localName}:nth-child(${[...e.parentElement.children].indexOf(e) + 1})` : e.localName);
    return paths.get(e);
  };
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = css => {
    if (!colors.has(css)) { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const c = [...ctx.getImageData(0, 0, 1, 1).data]; c[3] /= 255; colors.set(css, c); }
    return colors.get(css);
  };
  const over = (a, b) => {
    const alpha = a[3] + b[3] * (1 - a[3]);
    return alpha ? [...a.slice(0, 3).map((v, i) => (v * a[3] + b[i] * b[3] * (1 - a[3])) / alpha), alpha] : [0, 0, 0, 0];
  };
  const paint = (e, ink = [0, 0, 0, 0]) => {
    for (let a = e; a; a = a.parentElement) {
      const s = style(a);
      if (s.backgroundImage !== 'none' || s.filter !== 'none' || s.mixBlendMode !== 'normal') {
        if (!fontChecksOnly) gaps.add(`${path(a)}: image/gradient/filter/blend background requires pixel review`); return null;
      }
      ink = over(ink, rgba(s.backgroundColor)); ink[3] *= Number(s.opacity);
    }
    return over(ink, [255, 255, 255, 1]);
  };
  const measurements = [];
  const stateSuffix = /-(selected\+focused|focus-visible|selected|default|hover|active|focused|focus|disabled|loading|filled|error)$/;
  for (const e of elements) {
    const s = style(e), r = e.getBoundingClientRect();
    if (!r.width || !r.height || s.visibility !== 'visible' || s.display === 'none' || e.closest('[hidden],svg') || e.matches('script,style,option,optgroup,noscript')) continue;
    const direct = [...e.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    const text = direct.map(n => n.textContent.trim()).join(' ') || (e.localName === 'select' ? e.selectedOptions[0]?.textContent || '' : e.matches('input,textarea') ? e.value || e.placeholder || '' : '');
    const placeholder = e.matches('input,textarea') && !e.value && Boolean(e.placeholder);
    const inkStyle = placeholder ? getComputedStyle(e, '::placeholder') : s;
    const owner = e.closest('[data-state],[data-component],[aria-selected],[aria-current],[data-selected],.is-selected') || e;
    const ownerState = owner.getAttribute('data-state');
    const selected = owner.matches('[aria-selected=true],[aria-current]:not([aria-current=false]),[data-selected]:not([data-selected=false]),.is-selected');
    const component = owner.getAttribute('data-component') || owner.id?.replace(stateSuffix, '') || path(owner);
    const variant = owner.getAttribute('data-variant') || '';
    const componentRoot = owner === e;
    let slot = '', node = e;
    while (node !== owner && node.parentElement) { slot = `/${node.localName}:${[...node.parentElement.children].indexOf(node)}` + slot; node = node.parentElement; }
    let opacity = rgba(inkStyle.color)[3] * (placeholder ? Number(inkStyle.opacity) : 1);
    for (let a = e; a; a = a.parentElement) opacity *= Number(style(a).opacity);
    ctx.font = inkStyle.font; ctx.letterSpacing = inkStyle.letterSpacing === 'normal' ? '0px' : inkStyle.letterSpacing;
    const textWidth = text ? ctx.measureText(inkStyle.textTransform === 'uppercase' ? text.toUpperCase() : inkStyle.textTransform === 'lowercase' ? text.toLowerCase() : text).width : 0;
    const inkColor = [...rgba(inkStyle.webkitTextFillColor || inkStyle.color)];
    if (placeholder) inkColor[3] *= Number(inkStyle.opacity);
    const background = paint(e), foreground = text ? paint(e, inkColor) : null;
    const roleOwner = e.closest('[data-role]');
    const explicitRole = roleOwner?.getAttribute('data-role');
    const role = ['body','metadata','label','caption','chip','kbd','status-bar'].includes(explicitRole) ? explicitRole : (e.closest('th,[role=columnheader],[role=rowheader]') ? 'table-header' :
      e.closest('kbd,.kbd,.kbd-hint,[data-component=kbd]') ? 'kbd' : e.closest('.chip,.status-chip,[data-component=chip]') ? 'chip' :
      e.closest('[role=status],.status-bar,.statusbar,[data-component=status-bar]') ? 'status-bar' : 'body');
    const unavailable = e.closest(':disabled,[aria-disabled=true],[data-state=disabled]');
    const loading = Boolean(e.closest('[aria-busy=true],[data-state=loading]'));
    const disabled = Boolean(unavailable) && !loading;
    const explicitTone = e.closest('[data-text-role]')?.getAttribute('data-text-role') || explicitRole;
    const secondaryToken = s.getPropertyValue('--text-secondary').trim();
    const secondary = secondaryToken && JSON.stringify(rgba(secondaryToken)) === JSON.stringify(rgba(inkStyle.color));
    const ink = rgba(inkStyle.color);
    const coloured = Math.max(...ink.slice(0, 3)) - Math.min(...ink.slice(0, 3)) > 12 ||
      e.closest('a[href],[data-role=status],[data-role=destructive],[data-role=accent],[data-text-role=coloured]');
    const control = e.closest('button,[role=button],input,select,textarea');
    let filledControl = false;
    for (let a = e; control && a; a = a.parentElement) {
      const bg = rgba(style(a).backgroundColor);
      if (bg[3] > 0) filledControl = true;
      if (a === control) break;
    }
    const tone = coloured || ['status','destructive','link','accent','coloured'].includes(explicitTone) ? 'coloured' : explicitTone === 'primary' || explicitTone === 'secondary' ? explicitTone :
      secondary || e.matches('small,.meta,.text-secondary,.text-muted') || [...e.classList].some(c => /(?:^|[-_])(?:muted|detail|help)(?:$|[-_])/.test(c)) ? 'secondary' : 'primary';
    const fill = rgba(s.backgroundColor)[3] > 0 && e.parentElement && !e.matches('html,body') ? background : null;
    const controlSurface=control?.parentElement?paint(control.parentElement):null;
    const focusVisible=/focus|focused/.test(ownerState || state) || document.activeElement===e&&e.matches(':focus-visible');
    const outlineColor=rgba(s.outlineColor || 'rgba(0, 0, 0, 0)');
    // Only a zero-blur spread counts as a ring; ordinary elevation cannot
    // rescue a missing focus indicator on a filled control.
    const shadow=s.boxShadow?.match(/(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+([\d.]+)px/);
    const group=control?.closest('[data-component=split-button],[data-split-button],.spec-split,.split');
    let focusTarget;
    if(group && group!==control) {
      const gs=style(group),gr=group.getBoundingClientRect();
      const shadow=gs.boxShadow?.match(/(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+([\d.]+)px/);
      focusTarget={element:path(group),rect:{x:gr.x,y:gr.y,width:gr.width,height:gr.height},controlSurface:paint(group.parentElement),
        outline:{width:parseFloat(gs.outlineWidth)||0,style:gs.outlineStyle,color:rgba(gs.outlineColor || 'rgba(0, 0, 0, 0)')},
        focusShadow:shadow?{width:Number(shadow[2]),color:rgba(shadow[1])}:null};
    }
    const borders = background ? ['Top', 'Right', 'Bottom', 'Left'].flatMap(side => parseFloat(s[`border${side}Width`]) > 0 && rgba(s[`border${side}Color`])[3] > 0 && !['none', 'hidden'].includes(s[`border${side}Style`]) ? [{ edge: side.toLowerCase(), color: paint(e, rgba(s[`border${side}Color`])) }].filter(b => b.color) : []) : [];
    // Selection paint sometimes lives on a label inside a square row. Retain
    // that surface too, so a pill cannot hide behind its unpainted row shell.
    const selectionPaint = selected && !componentRoot && fill && [s.borderTopLeftRadius, s.borderTopRightRadius].some(v => parseFloat(v) > 0);
    const table = selected && e.closest('table,[role=table],[role=grid]');
    const tableStyle = table && style(table);
    const squareTable = Boolean(tableStyle && [tableStyle.borderTopLeftRadius, tableStyle.borderTopRightRadius, tableStyle.borderBottomRightRadius, tableStyle.borderBottomLeftRadius].every(v => parseFloat(v) === 0));
    let hiddenWidth = 0, canGrow = false, singleRow = false;
    if (text) {
      const fragments = direct.flatMap(n => { const range = document.createRange(); range.selectNodeContents(n); return [...range.getClientRects()]; });
      const textLeft = fragments.length ? Math.min(...fragments.map(b => b.left)) : r.left + parseFloat(s.paddingLeft);
      const textRight = fragments.length ? Math.max(...fragments.map(b => b.right)) : textLeft + textWidth;
      // Include clipping ancestors: the actual ellipsis may sit on a wrapper.
      for (let a = e; a && root.contains(a); a = a.parentElement) {
        const as = style(a);
        if (/hidden|clip/.test(as.overflowX)) {
          const box = a.getBoundingClientRect(), left = box.left + a.clientLeft + parseFloat(as.paddingLeft);
          const right = box.left + a.clientLeft + a.clientWidth - parseFloat(as.paddingRight);
          const cut = Math.max(0, textRight - right, left - textLeft);
          if (cut <= 1) continue; // A different child's overflow is not this text's truncation.
          hiddenWidth = Math.max(hiddenWidth, cut);
          const p = a.parentElement;
          if (p) {
            const ps = style(p), number = value => parseFloat(value) || 0;
            const siblings = [...p.children].filter(n => n !== a && style(n).display !== 'none' && !['absolute','fixed'].includes(style(n).position));
            let available = p.clientWidth - number(ps.paddingLeft) - number(ps.paddingRight);
            if (/flex/.test(ps.display) && !ps.flexDirection.startsWith('column')) {
              available -= siblings.reduce((sum, n) => sum + n.getBoundingClientRect().width + number(style(n).marginLeft) + number(style(n).marginRight), 0);
              available -= number(ps.columnGap) * siblings.length;
            } else if (/grid/.test(ps.display) && siblings.length) available = 0; // Cannot infer another grid track's free space.
            canGrow ||= available - number(as.marginLeft) - number(as.marginRight) > box.width + 1;
          }
        }
      }
      const row = e.closest('tr,[role=row],[role=option],[role=treeitem]');
      if (row?.parentElement) singleRow = [...row.parentElement.children].filter(n => n.matches('tr,[role=row],[role=option],[role=treeitem]') && !n.querySelector('th,[role=columnheader]') && style(n).visibility === 'visible' && n.getBoundingClientRect().height > 0).length === 1;
    }
    measurements.push({ element: path(e), component: `${component}:${variant}${selectionPaint ? ':selection-paint' : ''}`, componentRoot: componentRoot || Boolean(selectionPaint), slot,
      state: selected ? (ownerState?.includes('selected') ? ownerState : 'selected') : ownerState || e.id?.match(stateSuffix)?.[1] || state.match(stateSuffix)?.[1] || state, selected,
      text, tone, role, disabled, loading, filledControl, control:control===e,quiet:control===e&&e.matches('.quiet,[data-variant=quiet]'),controlSurface,focusTarget,
      focusVisible,outline:{width:parseFloat(s.outlineWidth)||0,style:s.outlineStyle,color:outlineColor},
      focusShadow:shadow?{width:Number(shadow[2]),color:rgba(shadow[1])}:null,
      fontWeight: inkStyle.fontWeight, fontSize: parseFloat(inkStyle.fontSize), letterSpacing: inkStyle.letterSpacing, textWidth,
      opacity, foreground, background, color: rgba(inkStyle.color), radius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius],
      fill, surface: fill ? paint(e.parentElement) : null, borders, separator: e.matches('hr,[role=separator]'),
      table: table ? path(table) : null, squareTable,
      hiddenWidth: Math.max(0, hiddenWidth), canGrow, singleRow, rect: { x: r.x, y: r.y, width: r.width, height: r.height } });
  }
  return { measurements, gaps: [...gaps], exceptions: window.jigConsistency === undefined ? [] : window.jigConsistency };
}

export async function inspectCrisp(page, selector = 'body', options = {}) {
  const snapshot = await page.evaluate(crispTargets, { selector, state: options.state, fontChecksOnly: options.fontChecksOnly });
  if (!Array.isArray(snapshot.exceptions) || snapshot.exceptions.some(e => !e || typeof e.element !== 'string' || !['background', 'radius', 'color'].includes(e.property) || typeof e.reason !== 'string' || !e.reason.trim())) throw new Error('Invalid window.jigConsistency: require {element, property, reason} exceptions');
  return { ...analyseCrisp(snapshot.measurements, options), gaps: snapshot.gaps, exceptions: snapshot.exceptions };
}

export async function runCrisp(options) {
  return runVisual(options, 'crisp', (page, scoped, run) => inspectCrisp(page, scoped.root, { state: run.state }));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await cli(runCrisp);
