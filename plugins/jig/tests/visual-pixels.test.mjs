import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePNG, encodePNG, diffPixels, runPixelFiles, readBaseline, freezeBaseline } from '../scripts/visual-pixels.mjs';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('[risk: pixel comparator misses a one-pixel regression] PNG roundtrip and exact/cross-scale controls',()=>{
 const a={width:2,height:2,pixels:Buffer.from([20,30,40,255,50,60,70,255,80,90,100,255,110,120,130,255])};
 assert.deepEqual(decodePNG(encodePNG(a)),a);
 assert.equal(diffPixels(a,a).changedPixels,0);
 const broken={...a,pixels:Buffer.from(a.pixels)};broken.pixels[0]++;
 assert.equal(diffPixels(a,broken).changedPixels,1);
 const scaled={width:4,height:4,pixels:Buffer.alloc(64)};
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)a.pixels.copy(scaled.pixels,(y*4+x)*4,(Math.floor(y/2)*2+Math.floor(x/2))*4,(Math.floor(y/2)*2+Math.floor(x/2))*4+4);
 assert.equal(diffPixels(a,scaled,{scale:2}).changedPixels,0);
 assert.throws(()=>diffPixels(a,scaled),/identical CSS dimensions/);
});

test('[risk: pixel reruns write unnecessary PNGs or compare unaffected states] manifest selection and failure-only opt-in', t => {
 const out=mkdtempSync(join(tmpdir(),'jig-pixels-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
 const image={width:1,height:1,pixels:Buffer.from([20,30,40,255])};
 writeFileSync(join(out,'a.png'),encodePNG(image));
 writeFileSync(join(out,'b.png'),encodePNG({...image,pixels:Buffer.from([21,30,40,255])}));
 const manifest=join(out,'pairs.json');
 writeFileSync(manifest,JSON.stringify([{name:'changed',first:'a.png',second:'b.png'},{name:'clean',first:'a.png',second:'a.png'}]));
 const args=['--manifest',manifest,'--out',out];
 assert.equal(runPixelFiles([...args,'--states','clean']).status,'passed');
 const failed=runPixelFiles([...args,'--states','changed']);
 assert.equal(failed.status,'findings');assert.equal(failed.runs.length,1);
 assert.equal(failed.runs[0].screenshot,undefined);
 assert.equal(readdirSync(out).filter(f=>f.endsWith('.png')).length,2);
 assert(runPixelFiles([...args,'--states','changed','--png']).runs[0].screenshot);
 assert.equal(runPixelFiles([...args,'--states','clean','--png']).runs[0].screenshot,undefined);
 assert.throws(()=>runPixelFiles([...args,'--states','absent']),/Unknown/);
 assert.throws(()=>runPixelFiles(['--states','changed']),/requires/);
});

test('[risk: verification silently approves or overwrites a baseline] explicit freeze preserves approval and refuses replacement', t => {
 const out=mkdtempSync(join(tmpdir(),'jig-freeze-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
 const image=encodePNG({width:1,height:1,pixels:Buffer.from([20,30,40,255])});writeFileSync(join(out,'crop.png'),image);
 const manifest={version:1,approvedBy:'person',approvedAt:'2026-11-08',browser:'pinned',platform:'win32',entries:[{viewport:{width:800,height:600},scale:1,state:'open',component:'menu',selector:'#menu',file:'crop.png'}]};
 const source=join(out,'approved.json'),store=join(out,'store');writeFileSync(source,JSON.stringify(manifest));
 const frozen=freezeBaseline(source,store);
 assert.equal(readBaseline(store).approvedBy,'person');assert.equal(frozen.entries[0].file,'component-1.png');
 assert.deepEqual(readFileSync(join(store,'component-1.png')),image);
 assert.throws(()=>freezeBaseline(source,store),/already exists/);
 const report=runPixelFiles(['--freeze',source,'--out',join(out,'second')]);assert.equal(report.operation,'freeze');
 assert.throws(()=>runPixelFiles(['--freeze',source,'--states','open']),/only --out/);
 writeFileSync(source,JSON.stringify({...manifest,approvedAt:'2026-02-30'}));assert.throws(()=>freezeBaseline(source,join(out,'invalid')),/date/);
});
