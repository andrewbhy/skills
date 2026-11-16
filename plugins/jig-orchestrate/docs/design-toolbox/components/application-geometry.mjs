if (process.argv[2] === '--help') { console.log('Usage: node docs/design-toolbox/components/application-geometry.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Project facts for the round-2 desktop reference, evaluated in Chrome.
export function inspectGeometry(selector) {
 const root=document.querySelector(selector),findings=[],gaps=[];let icons=0,centres=0,borders=0;
 if(!root)throw new Error('Geometry root missing');
 const visible=el=>el.checkVisibility({visibilityProperty:true,opacityProperty:true})&&el.getBoundingClientRect().width>0;
 const name=el=>el.id?'#'+el.id:el.dataset.component||el.className?.baseVal||el.className||el.localName;
 for(const svg of [root,...root.querySelectorAll('svg')].filter(el=>el.matches('.gc-icon,.app-choice-tick')&&visible(el))) {
  icons++;const box=svg.getBoundingClientRect();
  if(Math.abs(box.width-16)>.05||Math.abs(box.height-16)>.05)findings.push({kind:'icon-size',element:name(svg),width:box.width,height:box.height,expected:16});
  const control=svg.closest('.gc-button,.gc-menu-item,.gc-tab');
  if(control&&getComputedStyle(control).flexWrap!=='wrap') {
   centres++;const b=control.getBoundingClientRect(),delta=box.top+box.height/2-b.top-b.height/2;
   if(Math.abs(delta)>.55)findings.push({kind:'icon-centre',element:name(control),delta});
  }
  // The icon set's path centre may differ slightly from its geometric centre.
  // One CSS pixel is the explicit optical tolerance, not an unmeasured claim.
  try {const ink=svg.getBBox(),v=svg.viewBox.baseVal;if(ink.width&&ink.height&&v.width&&v.height){const dx=((ink.x+ink.width/2)-(v.x+v.width/2))*box.width/v.width,dy=((ink.y+ink.height/2)-(v.y+v.height/2))*box.height/v.height;if(Math.abs(dx)>1||Math.abs(dy)>1)findings.push({kind:'icon-ink-centre',element:name(svg),delta:[dx,dy]});}}catch(error){gaps.push(name(svg)+': '+error.message);}
 }
 for(const el of [root,...root.querySelectorAll('*')].filter(el=>!el.closest('svg')&&visible(el))) {
  const s=getComputedStyle(el);
  if(el.matches('.gc-button')){const token=el.classList.contains('gc-button--coarse')?'--target-coarse':el.classList.contains('gc-button--compact')?'--target-compact':'--target-control',expected=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token)),box=el.getBoundingClientRect();if(Math.abs(box.height-expected)>.05)findings.push({kind:'control-size',element:name(el),height:box.height,expected});if(el.classList.contains('gc-button--icon')&&Math.abs(box.width-expected)>.05)findings.push({kind:'control-size',element:name(el),width:box.width,expected});}
  for(const side of ['Top','Right','Bottom','Left']){const n=parseFloat(s['border'+side+'Width']);if(n){borders++;if(n!==1)findings.push({kind:'border-size',element:name(el),side,width:n,expected:1});}}
 }
 return {findings,gaps,icons,centres,borders};
}
