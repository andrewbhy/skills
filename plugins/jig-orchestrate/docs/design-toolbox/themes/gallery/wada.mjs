import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import colors from './wada-data.json' with { type: 'json' };

// Curated for interface studies, not a reconstruction of the printed layouts.
// Number, mood, appearance. Twelve triples and twelve quadruples.
export const wadaSelection = [
  [135,'calm','light'], [139,'calm','dark'], [167,'calm','dark'], [178,'calm','light'],
  [202,'calm','dark'], [281,'calm','light'], [321,'calm','light'], [330,'calm','light'],
  [126,'warm','light'], [166,'warm','dark'], [184,'warm','light'], [190,'warm','dark'],
  [243,'warm','dark'], [263,'warm','light'], [296,'warm','light'], [342,'warm','dark'],
  [134,'vivid','dark'], [141,'vivid','dark'], [154,'vivid','light'], [247,'vivid','dark'],
  [265,'vivid','dark'], [276,'vivid','light'], [295,'vivid','dark'], [320,'vivid','light'],
];
export const neutralScale = ['#000000','#171717','#262626','#404040','#525252','#737373',
  '#a3a3a3','#bdbdbd','#d4d4d4','#e5e5e5','#f5f5f5','#fafafa','#ffffff'];
function luminance(hex) {
  return hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
function contrast(a,b) {
  const x=luminance(a), y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function mix(a,b,t) {
  const channels = hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
  const x=channels(a), y=channels(b);
  return '#'+x.map((v,i)=>Math.round(v*(1-t)+y[i]*t).toString(16).padStart(2,'0')).join('');
}
export const wadaPalettes = wadaSelection.map(([combination,mood,mode])=>{
  const original = colors.filter(c=>c.combinations.includes(combination)).map(c=>c.hex);
  const dark = mode==='dark', endpoint = dark?'#000000':'#ffffff';
  const sorted = [...original].sort((a,b)=>luminance(a)-luminance(b));
  const canvas = dark?sorted[0]:sorted.at(-1);
  const remaining = original.filter(c=>c!==canvas);
  // Triples reuse their first non-background colour as the question highlight.
  // Quadruples use all three remaining colours; the first repeats for decision.
  const [header,accent,highlight=header] = remaining;
  const accents = [header,accent,header,highlight];
  // Subtle layers move toward the same neutral endpoint, preserving text headroom.
  const bg = [canvas,mix(canvas,endpoint,.06),mix(canvas,endpoint,.12)];
  const states = dark?['#a3a3a3','#d4d4d4','#fafafa','#bdbdbd']:['#525252','#404040','#171717','#737373'];
  const surfaces = [...bg,...accents.slice(0,3).map(c=>mix(bg[2],c,.18)),
    mix(bg[1],accents[3],.13),mix(bg[2],states[0],.18)];
  const candidates = dark?[...neutralScale].reverse():neutralScale;
  const text = candidates.find(c=>surfaces.every(bg=>contrast(c,bg)>=4.5));
  const muted = [...candidates].reverse().find(c=>bg.every(bg=>contrast(c,bg)>=4.5));
  if (!text || !muted) throw Error(`Wada ${combination}: no readable neutral text`);
  return { id:`wada-${combination}`, name:`Wada ${combination} · ${mood}`, scheme:'wada', schemeName:'Wada',
    source:'wada', mode, combination, mood, original, bg, text, muted, accents, states,
    roles:{background:canvas,header,accent,highlight},
    adaptation:'Source canvas preserved; derived background layers, header tints, neutral text and state colours for readability.',
  };
});
