if (process.argv[2] === '--help') { console.log('Usage: node scripts/review-lightbox.mjs <arguments>; see the owning skill for commands.'); process.exit(0); }
// Click-to-enlarge for every image on a tower page: a full-window viewer at native resolution.
// Keys: + / - or the wheel zoom, 0 fits the window, 1 shows 100 percent, arrows go to the next or previous image,
// drag pans, Esc or a click on the dark backdrop closes. The toolbar sits at the bottom centre, away from page actions. "Open original" opens the file itself in a new tab. Inlined into markdown and image pages.
import { safeHref } from './review-safe-href.mjs';
export const lightboxCss = `main img.wide{width:100%;height:auto}main img{cursor:zoom-in}
#lb{position:fixed;inset:0;z-index:2000;background:#000d;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;cursor:grab}
#lb[hidden]{display:none}#lb.drag{cursor:grabbing}#lb img{position:absolute;left:0;top:0;max-width:none;transform-origin:0 0;user-select:none;-webkit-user-drag:none;cursor:inherit}
#lbbar{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 16px);flex-wrap:wrap;justify-content:center;z-index:2001;display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:10px;background:#000c;color:#fff;font:14px system-ui,sans-serif}
#lbbar[hidden]{display:none}#lbbar button,#lbbar a{font:inherit;color:#fff;background:#fff2;border:1px solid #fff5;border-radius:6px;padding:3px 12px;min-height:28px;cursor:pointer;text-decoration:none}
#lbbar #lbinfo{min-width:7em;text-align:center}`;
export const lightboxHtml = `<div id="lb" hidden role="dialog" aria-label="Image viewer"><img alt=""></div><div id="lbbar" hidden><button type="button" id="lbfit" title="Fit to window (0)">Fit</button><button type="button" id="lb100" title="Native size (1)">100%</button><button type="button" id="lbm" title="Zoom out (-)">-</button><button type="button" id="lbp" title="Zoom in (+)">+</button><button type="button" id="lbprev" title="Previous image (Left arrow)">Prev</button><button type="button" id="lbnext" title="Next image (Right arrow)">Next</button><span id="lbinfo"></span><a id="lborig" target="_blank" rel="noopener noreferrer">Open original</a><button type="button" id="lbx" title="Close (Esc)">Close</button></div>`;
export const lightboxScriptFor = (sel) => lightboxScript.split("'main img'").join(JSON.stringify(sel).replace(/"/g,"'"));
export const lightboxScript = `(function(){
var safeHref=${safeHref.toString()};
var lb=document.getElementById('lb'),bar=document.getElementById('lbbar'),big=lb.querySelector('img');
var list=[],at=0,scale=1,fit=1,tx=0,ty=0,drag=null,moved=false,closedAt=0;
function imgs(i){var group=i&&i.closest('.m,.qm');return Array.prototype.filter.call((group||document).querySelectorAll('main img'),function(i){return !i.complete||i.naturalWidth>0})}
for(const i of document.querySelectorAll('main img')){var mark=function(e){var t=e.target||e;if(t.naturalWidth>=160)t.classList.add('wide')};if(i.complete)mark(i);else i.addEventListener('load',mark)}
function apply(){big.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';document.getElementById('lbinfo').textContent=(at+1)+' of '+list.length+' - '+Math.round(scale*100)+'%'}
function center(){var w=big.naturalWidth,h=big.naturalHeight;tx=(window.innerWidth-w*scale)/2;ty=(window.innerHeight-h*scale)/2}
function show(n){at=(n+list.length)%list.length;var src=list[at].currentSrc||list[at].src;big.src=src;document.getElementById('lborig').href=safeHref(src);
 var go=function(){fit=Math.min(window.innerWidth/big.naturalWidth,window.innerHeight/big.naturalHeight,1);scale=fit;center();apply()};
 if(big.complete&&big.naturalWidth)go();else big.onload=go}
function zoomAt(f,cx,cy){var s=Math.min(16,Math.max(0.05,scale*f));tx=cx-(cx-tx)*(s/scale);ty=cy-(cy-ty)*(s/scale);scale=s;apply()}
function open(i){list=imgs(i);var k=list.indexOf(i);if(k<0)return;lb.hidden=false;bar.hidden=false;show(k)}
function close(byPointer){lb.hidden=true;bar.hidden=true;big.removeAttribute('src');closedAt=byPointer===true?Date.now():0}
// A double-click on Close or the backdrop must not carry its second click through to the page underneath.
document.addEventListener('click',function(e){if(closedAt&&Date.now()-closedAt<400){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('click',function(e){var t=e.target;if(t&&t.tagName==='A')t=t.querySelector('img');if(t&&t.tagName==='IMG'&&t.matches('main img')&&lb.hidden){e.preventDefault();open(t)}});
document.getElementById('lbx').addEventListener('click',function(){close(true)});
document.getElementById('lbfit').addEventListener('click',function(){scale=fit;center();apply()});
document.getElementById('lb100').addEventListener('click',function(){zoomAt(1/scale,window.innerWidth/2,window.innerHeight/2)});
document.getElementById('lbm').addEventListener('click',function(){zoomAt(0.8,window.innerWidth/2,window.innerHeight/2)});
document.getElementById('lbp').addEventListener('click',function(){zoomAt(1.25,window.innerWidth/2,window.innerHeight/2)});
document.getElementById('lbprev').addEventListener('click',function(){show(at-1)});
document.getElementById('lbnext').addEventListener('click',function(){show(at+1)});
lb.addEventListener('wheel',function(e){e.preventDefault();zoomAt(e.deltaY<0?1.15:1/1.15,e.clientX,e.clientY)},{passive:false});
lb.addEventListener('pointerdown',function(e){moved=false;drag={x:e.clientX-tx,y:e.clientY-ty};lb.classList.add('drag');lb.setPointerCapture(e.pointerId)});
lb.addEventListener('pointermove',function(e){if(drag){moved=true;tx=e.clientX-drag.x;ty=e.clientY-drag.y;apply()}});
lb.addEventListener('pointerup',function(e){var click=drag&&!moved&&e.target===lb;drag=null;lb.classList.remove('drag');if(click)close(true)});
lb.addEventListener('dblclick',function(e){if(Math.abs(scale-1)<0.01){scale=fit;center();apply()}else zoomAt(1/scale,e.clientX,e.clientY)});
document.addEventListener('keydown',function(e){if(lb.hidden||e.ctrlKey||e.metaKey||e.altKey)return;var k=e.key,c=[window.innerWidth/2,window.innerHeight/2];
 if(k==='Escape')close(false);else if(k==='+'||k==='=')zoomAt(1.25,c[0],c[1]);else if(k==='-')zoomAt(0.8,c[0],c[1]);else if(k==='0'){scale=fit;center();apply()}else if(k==='1')zoomAt(1/scale,c[0],c[1]);
 else if(k==='ArrowRight')show(at+1);else if(k==='ArrowLeft')show(at-1);else return;e.preventDefault();e.stopPropagation()},true);
window.addEventListener('resize',function(){if(!lb.hidden){fit=Math.min(window.innerWidth/big.naturalWidth,window.innerHeight/big.naturalHeight,1)}});
})();`;
