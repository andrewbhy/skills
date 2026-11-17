import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Dependency-free documentation views. Markdown remains the source of rules.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { pageShell } from './page-shell.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const craft = 'Craft basics the reviewer checks before the person sees anything (person, 7 Nov 2026)';
export const guides = [
  { id:'theme-builder', title:'Theme builder', benefit:'Turn a colour direction into a complete set of interface colours.',
    when:'When preparing a theme for a build, mockup or golden reference.', skills:'jig-build, jig-mockup',
    example:{ title:'Eight types, only four hues', before:'The coordinator found eight interface types sharing four header hues in the theme preview.', after:'The generator now gives all eight types distinct angles and dedicated header, edge and text roles.', why:'A complete pack needs distinguishable roles, not just a handful of attractive swatches.', source:'themes/README.md', heading:'Pass 7 coordinator findings', evidence:'Eight types shared four hues' },
    sections:[['themes/README.md','Scale and role contract'],['themes/README.md','Shared typography dependency']],
    commands:['node docs/design-toolbox/themes/build-palettes.mjs','node docs/design-toolbox/themes/check-themes.mjs'],
    limit:'Generation supplies candidate tokens. The checker measures them; you still judge the result in Themes and board.' },
  { id:'theme-checker', title:'Theme checker', benefit:'Catch unreadable text and layers that disappear into each other.',
    when:'After a theme edit, before sharing an interface and during review or CI.', skills:'jig-verify, jig-review',
    example:{ title:'Panel and chrome blended together', before:'The coordinator found zero surface steps and reversed light neutrals in the preview.', after:'Adjacent layers now require a measured separation; tests deliberately collapse a layer and require rejection.', why:'Passing a text contrast check alone does not make the interface hierarchy visible.', source:'themes/README.md', heading:'Pass 7 coordinator findings', evidence:'Zero surface steps and reversed light neutrals' },
    sections:[['themes/README.md','Pass 7 coordinator findings'],['themes/README.md','Contrast and measured results']],
    commands:['node docs/design-toolbox/themes/check-themes.mjs','node --test docs/design-toolbox/themes/theme-pass7.test.mjs'],
    limit:'These are arithmetic checks on declared pairs. They do not prove rendered coverage, colour recognition or visual comfort.' },
  { id:'spacing-craft', title:'Spacing and craft checks', benefit:'Catch margin errors and unfinished controls before you see a mockup.',
    when:'Before mockup feedback and whenever interface changes are verified or reviewed.', skills:'jig-mockup, jig-verify, jig-review',
    example:{ title:'A chip nearly touched the card edge', before:'The person found a motion-lab artifact chip about 8 px from the left edge and almost touching the bottom, while the text used about 24 px.', after:'The recorded fix calls for one inset on all sides, a chip that hugs its word, and the icon on the title row.', why:'Compare measured insets and inspect the actual image. A source-only token check cannot see unequal rendered margins.', source:'round-5 fix list, person, 8 Nov 2026', evidence:'Lab artifact node margins' },
    sections:[['README.md',craft]],
    commands:['node scripts/mockup-check.mjs docs/design-toolbox/components/index.html --ledger docs/design-toolbox/components/README.md --tokens docs/design-toolbox/jig-pages.css --tokens docs/design-toolbox/typography/type.css --tokens docs/design-toolbox/themes/white-board/theme.css --tokens docs/design-toolbox/motion-lab/tokens.css'],
    limit:'The static command checks ledger coverage, tokens, icon substitutes and declared interaction states. Rendered spacing needs measurements and screenshot review; this guide does not claim the historical margin defect was caught automatically.' },
  { id:'craft-basics', title:'Craft basics', benefit:'Keep grouping, controls and labels consistent enough to scan without hunting.',
    when:'While building and during screenshot review, before a mockup reaches you.', skills:'jig-mockup, jig-verify, jig-review',
    example:{ title:'Controls looked pasted onto their card', before:'The person found a separate white control box and a letter used as a chevron on a node.', after:'The rule requires quiet controls in the host header and real SVG icons from one set.', why:'An attached control should share its host’s surface and rhythm and remain recognisable across fonts.', source:'README.md', heading:'Components and their quality bar', evidence:'pasted-on white box' },
    sections:[['README.md',craft]], commands:[],
    limit:'This is a review checklist. Agents must inspect screenshots and try controls; reading the source does not establish craft quality.' },
  { id:'motion-vocabulary', title:'Motion vocabulary', benefit:'Put an exact name to the effect you have in mind.',
    when:'When describing an effect, before a brief or motion ledger is built.', skills:'jig-mockup',
    example:{ kind:'Example', title:'Circles around the edge', before:'A loose description could mean an event or selection.', after:'Perimeter draw marks an event; halo marks selection.', why:'Naming the effect and linking its stage removes a guess before building.', source:'motion-vocabulary.md', heading:null, evidence:'Perimeter draw' },
    sections:[['motion-vocabulary.md',null]], commands:[],
    limit:'Names do not approve motion. The frequency gate and project decisions still apply.' },
  { id:'motion-recipes', title:'Motion recipes', benefit:'Give ordinary controls a consistent response.',
    when:'When building menu, popover, tooltip, dialog, toast, disclosure, tab or press feedback.', skills:'jig-mockup',
    example:{ kind:'Example', title:'A toast closes while it is opening', before:'Restarted keyframes jump back to the first frame.', after:'Retarget a transition from the current value and ignore stale close completions.', why:'Rapid input must remain responsive.', source:'motion-recipes.md', heading:null, evidence:'Retarget' },
    sections:[['motion-recipes.md',null]], commands:['node --test tests/motion-recipes.test.mjs'],
    limit:'Browser-free tests cover lifecycle and token contracts. Rendered interpolation, focus and feel remain pending.' },
  { id:'motion-basics', title:'Motion basics', benefit:'Make changes understandable while keeping frequent actions fast.',
    when:'Before choosing motion, then during slow playback, replay and interruption review.', skills:'jig-mockup, jig-verify, jig-review',
    example:{ title:'The receipt appeared before arrival', before:'The coordinator’s motion-lab review found a transfer receipt appearing at 150 ms, before the arriving item had landed; its source was barely visible.', after:'The recorded fix calls for showing the source first, using a visible path, and displaying the receipt after landing.', why:'Cause must precede effect. Slow playback and frame review catch this ordering error; passing final-state replay alone cannot.', source:'round-5 fix list, coordinator browser check, 7 Nov 2026', evidence:'receipt shows at 150 ms' },
    sections:[['README.md','Motion basics'],['motion-lab/README.md',null],['README.md','Borrowed practices and attribution']],
    commands:['node docs/design-toolbox/motion-lab/check.cjs'],
    limit:'General UI stays under 300 ms; explanatory sequences have their own budget. The lab lets you experiment. Passing virtual time does not prove painted motion or comfort.' },
  { id:'component-checklist', title:'Component checklist', benefit:'Keep incomplete controls out of the reference that agents copy.',
    when:'Before a component becomes golden, and when copied controls change.', skills:'jig-mockup, jig-verify, jig-review',
    example:{ title:'A dialog stole focus on page load', before:'The coordinator found Golden components opening about 5,700 px down, at the dialog’s Close button.', after:'The reference has no autofocus attribute. Focus moves to Close only after the person opens the dialog, then returns to its trigger on dismissal.', why:'Focus must follow an action. The regression checks reject load-time focus and require focus after opening.', source:'README.md', heading:'Change notes: home and golden components, 8 November 2026', evidence:'5,700 px' },
    sections:[['README.md','Components and their quality bar'],['components/README.md','What to copy'],['components/README.md','Using the reference in a mockup']],
    commands:['node docs/design-toolbox/components/check-components.mjs'],
    limit:'Golden components is a reference prototype. Native focus containment, screen-reader behaviour and visual acceptance still need a browser and assistive technology.' },
];

export const escapeHTML = text => String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const slug = heading => heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,'').replace(/\s/g,'-');
export function section(markdown, heading) {
  if (!heading) return markdown;
  const lines = markdown.split('\n');
  const at = lines.indexOf('## '+heading);
  if (at < 0) throw new Error('Missing documentation section: '+heading);
  const end = lines.findIndex((line, i) => i > at && line.startsWith('## '));
  return lines.slice(at, end < 0 ? undefined : end).join('\n');
}

// Small, escaped renderer for our documentation subset; never executes raw HTML.
// Code spans are protected before links/emphasis so examples remain literal.
function inline(source, file) {
  const code=[];
  let text=source.replace(/`([^`]+)`/g,(_,body)=>`\u0000${code.push('<code>'+escapeHTML(body)+'</code>')-1}\u0000`);
  text=escapeHTML(text);
  text=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,href)=>{
    const [target,fragment]=href.split('#');
    if (/^https?:\/\//.test(href)) return `<a href="${href}">${label}</a>`;
    if (/^[a-z]+:|^\/|\\/.test(href)) return label;
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),target));
    // Link to the actual section in a rendered guide, never a vaguely related
    // page just because it was generated from the same Markdown file.
    if (fragment) {
      const guide=guides.find(g=>g.sections.some(([source,heading])=>source===resolved&&(heading?slug(heading)===fragment:heading===null)));
      if (guide) return `<a href="${guide.id}.html#${fragment}">${label}</a>`;
      if (resolved==='README.md'&&fragment==='toolbox-pages-and-typography-8-november-2026') return `<a href="../typography/">${label}</a>`;
    } else {
      const guide=guides.find(g=>g.sections.some(([source])=>source===resolved));
      if (guide) return `<a href="${guide.id}.html#documentation">${label}</a>`;
    }
    // Unrendered Markdown remains readable text; people never land on raw .md.
    if (/\.md$/i.test(target)) return label;
    if (!target || resolved.startsWith('../')) return label;
    return `<a href="../${resolved}${href.includes('#')?'#'+href.split('#')[1]:''}">${label}</a>`;
  });
  return text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\u0000(\d+)\u0000/g,(_,i)=>code[Number(i)]);
}

export function renderMarkdown(markdown, file) {
  let previous;
  do {
    previous=markdown;
    markdown=markdown.replace(/<!--[\s\S]*?-->/g,'');
  } while (markdown!==previous);
  const lines=markdown.trim().split('\n'), out=[];
  const fmt=text=>inline(text,file);
  let i=0;
  const boundary=line=>!line?.trim() || /^(?:#{1,6} |```|\||[-*] |\d+\. )/.test(line);
  while(i<lines.length) {
    const line=lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const code=[]; i++;
      while(i<lines.length&&!lines[i].startsWith('```')) code.push(lines[i++]);
      if (i===lines.length) throw new Error('Unclosed code fence in '+file);
      i++; out.push('<pre><code>'+escapeHTML(code.join('\n'))+'</code></pre>'); continue;
    }
    const heading=line.match(/^(#{1,6}) (.*)/);
    if (heading) { const level=Math.max(2,heading[1].length); out.push(`<h${level} id="${slug(heading[2])}">${fmt(heading[2])}</h${level}>`); i++; continue; }
    if (line.startsWith('|')) {
      const rows=[]; while(i<lines.length&&lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
      const row=(value,tag)=>'<tr>'+cells(value).map(c=>`<${tag}${tag==='th'?' scope="col"':''}>${fmt(c)}</${tag}>`).join('')+'</tr>';
      if (!rows[1]||!cells(rows[1]).every(c=>/^:?-+:?$/.test(c))) throw new Error('Malformed table in '+file);
      out.push('<div class="table-scroll" role="region" aria-label="Reference table" tabindex="0"><table><thead>'+row(rows[0],'th')+'</thead><tbody>'+rows.slice(2).map(r=>row(r,'td')).join('')+'</tbody></table></div>'); continue;
    }
    if (/^([-*] |\d+\. )/.test(line)) {
      const ordered=/^\d/.test(line), tag=ordered?'ol':'ul', items=[];
      const pattern=ordered?/^\d+\. /:/^[-*] /;
      while(i<lines.length&&pattern.test(lines[i])) {
        let item=lines[i++].replace(pattern,'');
        while(i<lines.length&&!boundary(lines[i])) item+=' '+lines[i++].trim();
        items.push('<li>'+fmt(item)+'</li>');
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    let paragraph=lines[i++];
    while(i<lines.length&&!boundary(lines[i])) paragraph+=' '+lines[i++].trim();
    out.push('<p>'+fmt(paragraph)+'</p>');
  }
  return out.join('\n');
}

export function generateGuides() {
  return new Map(guides.map(guide=>{
    const e=guide.example;
    if (e.heading!==undefined) {
      const evidence=section(read(e.source),e.heading);
      if (!evidence.includes(e.evidence)) throw new Error('Example lost its source: '+guide.id);
    }
    const docs=guide.sections.map(([file,heading])=>`<p class="eyebrow">From ${escapeHTML(file)}${heading?' · '+escapeHTML(heading):''}</p>\n${renderMarkdown(section(read(file),heading),file)}`).join('\n');
    const html=`<!doctype html>
<!-- Generated by build-guides.mjs; edit the source Markdown or guide metadata. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${guide.title} · jig</title><link rel="stylesheet" href="../jig-pages.css"></head><body>
<header class="page-header"><h1>${guide.title}<span class="title-dot">.</span></h1><p class="intro">${guide.benefit}</p><p class="header-meta">Agent tooling · ${guide.skills}</p></header>
<main class="toolbox-main guide-main"><nav class="guide-nav" aria-label="Agent guides">${guides.map(g=>`<a href="${g.id}.html"${g===guide?' aria-current="page"':''}>${g.title}</a>`).join('')}</nav>
<section aria-labelledby="when"><h2 id="when">When agents use this</h2><p>${guide.when}</p><p><strong>Skills:</strong> ${guide.skills}.</p><p>${guide.limit}</p></section>
<section class="finding" aria-labelledby="example"><h2 id="example">${e.kind??'A real finding'}: ${e.title}</h2><p><strong>Before:</strong> ${escapeHTML(e.before)}</p><p><strong>After / recorded fix:</strong> ${escapeHTML(e.after)}</p><p><strong>Why:</strong> ${escapeHTML(e.why)}</p><p class="eyebrow">Source: ${escapeHTML(e.source)}${e.heading?' · '+escapeHTML(e.heading):''}</p><a href="#documentation">Read the rules behind this example</a></section>
${guide.commands.length?`<section aria-labelledby="commands"><h2 id="commands">What the agent runs</h2><p>From the repository root:</p><pre><code>${guide.commands.map(escapeHTML).join('\n')}</code></pre></section>`:''}
<section id="documentation" aria-label="Tool documentation">${docs}</section>
<p><a href="../index.html">Back to Look and choose</a> · <a href="../components/">Try Golden components</a></p></main></body></html>\n`;
    const file = 'guides/'+guide.id+'.html';
    return [file,pageShell(html,file,guide.title)];
  }));
}

export function build(check=false) {
  const pages=generateGuides();
  if (!check) mkdirSync(path.join(root,'guides'),{recursive:true});
  for (const [file,html] of pages) {
    if (check) { if (readFileSync(path.join(root,file),'utf8')!==html) throw new Error(file+': documentation drift; run node docs/design-toolbox/build-guides.mjs'); }
    else writeFileSync(path.join(root,file),html);
  }
  return pages;
}
if (process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  if (process.argv.slice(2).some(arg=>arg!=='--check')) throw new Error(`Usage: ${__jigCommandFor(import.meta.url)} [--check]`);
  console.log(`${process.argv.includes('--check')?'Checked':'Built'} ${build(process.argv.includes('--check')).size} readable agent guides.`);
}
