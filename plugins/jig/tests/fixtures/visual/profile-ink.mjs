// Offline CPU profile, never launches a browser. This isolates ink analysis;
// it cannot establish the runner's end-to-end 84-state target.
import assert from 'node:assert/strict';
import { measureInk } from '../../../scripts/visual-visibility.mjs';

// The pre-calibration implementation, retained only as a measurement reference.
function reference(ink, ground, threshold = 4.5) {
  const luminance = rgb => rgb.slice(0, 3).reduce((sum, byte, i) => {
    const c = byte / 255;
    return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126,.7152,.0722][i];
  },0);
  const ratios = [];
  for(let i=0;i<ink.pixels.length;i+=4) {
    if(Math.max(...[0,1,2].map(c=>Math.abs(ink.pixels[i+c]-ground.pixels[i+c])))<=1) continue;
    const a=luminance([...ink.pixels.subarray(i,i+3)]),b=luminance([...ground.pixels.subarray(i,i+3)]);
    ratios.push((Math.max(a,b)+.05)/(Math.min(a,b)+.05));
  }
  ratios.sort((a,b)=>a-b);
  const contrastRatio=ratios.length?ratios[Math.floor((ratios.length-1)*.9)]:1;
  return {contrastRatio,threshold,inkPixels:ratios.length,kind:!ratios.length?'empty-content':contrastRatio<threshold?'near-invisible':null};
}

const frames = 84, width = 640, height = 80;
const ground = { width,height,pixels:Buffer.alloc(width*height*4,255) };
const ink = { ...ground,pixels:Buffer.from(ground.pixels) };
// Repeated neutral and chromatic antialias colours, plus unchanged surface.
for(let i=0;i<ink.pixels.length;i+=4) if(i%28<20) {
  const value=(i/4)%192;
  ink.pixels[i]=value;ink.pixels[i+1]=(value*3)%256;ink.pixels[i+2]=(value*7)%256;
}
assert.deepEqual(measureInk(ink,ground),reference(ink,ground));
const time = fn => { const start=performance.now();for(let i=0;i<frames;i++)fn(ink,ground);return performance.now()-start; };
time(measureInk); // Warm the optimized loop before measuring both versions.
const beforeMs=time(reference),afterMs=time(measureInk);
console.log(JSON.stringify({kind:'offline ink CPU profile',node:process.version,platform:process.platform,frames,width,height,beforeMs,afterMs,speedup:beforeMs/afterMs,endToEndMeasured:false},null,2));
