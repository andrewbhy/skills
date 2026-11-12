// Small DOM replay boundary. Browser fixtures separately check real CSS layout
// and selector behaviour; this supplies recorded styles/boxes without Chrome.
export function visualDOM(t) {
  const prior = Object.fromEntries(['document','window','CSS','Node','getComputedStyle','CSSStyleSheet'].map(k => [k, globalThis[k]]));
  t.after(() => { for (const [k,v] of Object.entries(prior)) v === undefined ? delete globalThis[k] : globalThis[k] = v; });
  const defaults = { display:'block', visibility:'visible', position:'static', overflowX:'visible', overflowY:'visible',
    opacity:'1', color:'rgb(0, 0, 0)', backgroundColor:'rgba(0, 0, 0, 0)', backgroundImage:'none', filter:'none', mixBlendMode:'normal',
    font:'14px sans-serif', fontSize:'14px', fontWeight:'400', letterSpacing:'normal', textTransform:'none',
    paddingLeft:'0px', paddingRight:'0px', paddingTop:'0px', paddingBottom:'0px', alignItems:'normal', justifyContent:'normal', textAlign:'left' };
  for (const side of ['Top','Right','Bottom','Left']) Object.assign(defaults, { [`border${side}Width`]:'0px', [`border${side}Style`]:'none', [`border${side}Color`]:'rgba(0, 0, 0, 0)' });
  for (const corner of ['TopLeft','TopRight','BottomRight','BottomLeft']) defaults[`border${corner}Radius`] = '0px';
  const node = (tag, attrs = {}, css = {}, text = '', children = [], rect = {}) => {
    const box = { x:0,y:0,width:100,height:24,...rect };
    Object.assign(box, { left:box.x, top:box.y, right:box.x+box.width, bottom:box.y+box.height });
    const e = { localName:tag, id:attrs.id || '', classList:(attrs.class || '').split(' ').filter(Boolean), children, parentElement:null,
      childNodes:text ? [{ nodeType:3, textContent:text }] : [], css:{ ...defaults,...css },
      clientWidth:box.width, clientHeight:box.height, clientLeft:0, clientTop:0,
      getBoundingClientRect:() => box,
      hasAttribute:k => k in attrs, getAttribute:k => attrs[k] ?? null,
      matches:selectors => selectors.split(',').some(part => {
        let s = part.trim();
        const negatives = [...s.matchAll(/:not\(([^)]+)\)/g)].map(m => m[1]);
        if (negatives.some(n => e.matches(n))) return false;
        s = s.replace(/:not\([^)]+\)/g,'');
        if (s.includes(':disabled')) { if (!('disabled' in attrs)) return false; s=s.replace(':disabled',''); }
        const attributes = [...s.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
        if (attributes.some(([,k,v]) => !(k in attrs) || v !== undefined && attrs[k] !== v)) return false;
        s=s.replace(/\[[^\]]+\]/g,'');
        const id=s.match(/#([\w-]+)/)?.[1]; if(id && e.id!==id) return false;
        const classes=[...s.matchAll(/\.([\w-]+)/g)].map(m=>m[1]); if(classes.some(c=>!e.classList.includes(c))) return false;
        const name=s.match(/^[\w-]+/)?.[0]; return !name || name===tag;
      }),
      closest:s => { for(let p=e;p;p=p.parentElement) if(p.matches(s)) return p; return null; },
      contains:n => { for(let p=n;p;p=p.parentElement) if(p===e) return true; return false; },
      querySelectorAll:s => children.flatMap(c=>[c,...c.querySelectorAll('*')]).filter(c=>s==='*'||c.matches(s)),
      querySelector:s => e.querySelectorAll(s)[0] || null,
      scrollIntoView(){},
    };
    children.forEach(c=>{c.parentElement=e;}); return e;
  };
  let color = [0,0,0,255];
  const ctx = { clearRect(){}, fillRect(){}, measureText:s=>({width:s.length*7}),
    set fillStyle(value) { const parts=(value.match(/[\d.]+/g)||['0','0','0']).map(Number); const rgb=parts.slice(0,3).map(n=>value.startsWith('color(srgb ')?Math.round(n*255):n); color=[...rgb,Math.round((parts[3]??1)*255)]; },
    getImageData:()=>({data:color}),
  };
  let root;
  globalThis.CSS={escape:s=>s}; globalThis.Node={TEXT_NODE:3}; globalThis.window={};
  globalThis.getComputedStyle=e=>({ ...e.css, getPropertyValue:k=>e.css[k] || '' });
  globalThis.document={
    querySelector:s=>root?.matches(s) ? root : root?.querySelector(s), querySelectorAll:s=>[...(root?.matches(s)?[root]:[]),...(root?.querySelectorAll(s)||[])],
    createElement:tag=>{ if(tag!=='canvas') throw new Error(`Unsupported replay node: ${tag}`); return {getContext:()=>ctx}; },
    createRange:()=>({selectNodeContents(){},getClientRects:()=>[]}),
  };
  return { node, mount:e=>{root=e; document.body=e; document.documentElement=e; return e;} };
}
