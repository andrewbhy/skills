import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// Dependency-free PNG comparison for Chrome's 8-bit RGB/RGBA screenshots.
// Same-scale repeat is exact. Cross-scale comparison reports raster differences;
// text antialiasing is evidence to inspect, never silently called a clean diff.
import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export function decodePNG(bytes) {
 const signature=Buffer.from([137,80,78,71,13,10,26,10]);
 if(!bytes.subarray(0,8).equals(signature))throw new Error('Not a PNG');
 let width,height,channels;const chunks=[];
 for(let offset=8;offset<bytes.length;) {
  const length=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);offset+=length+12;
  if(kind==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);if(data[8]!==8||![2,6].includes(data[9])||data[12]!==0)throw new Error('Only noninterlaced 8-bit RGB/RGBA PNG is supported');channels=data[9]===6?4:3;}
  if(kind==='IDAT')chunks.push(data);
 }
 if(!width||!height||width*height>100000000)throw new Error('Invalid or excessive PNG dimensions');
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(width*height*4),row=Buffer.alloc(stride),previous=Buffer.alloc(stride);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++) {
  const filter=raw[y*(stride+1)];if(filter>4)throw new Error('Unknown PNG filter');
  for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0;row[x]=(raw[y*(stride+1)+x+1]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}
  for(let x=0;x<width;x++){const dest=(y*width+x)*4,src=x*channels;pixels[dest]=row[src];pixels[dest+1]=row[src+1];pixels[dest+2]=row[src+2];pixels[dest+3]=channels===4?row[src+3]:255;}
  row.copy(previous);
 }
 return {width,height,pixels};
}

function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function encodePNG({width,height,pixels}) {
 const chunk=(kind,data)=>{const name=Buffer.from(kind),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}

export function diffPixels(a,b,{scale=1,tolerance=0}={}) {
 if(!Number.isInteger(scale)||scale<1||b.width!==a.width*scale||b.height!==a.height*scale)throw new Error('Images must have identical CSS dimensions and an integer scale ratio');
 let changed=0,totalDelta=0,maxDelta=0;const heat=Buffer.alloc(a.width*a.height*4);
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++) {
  const i=(y*a.width+x)*4;let delta=0;
  for(let c=0;c<4;c++){let value=0;for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)value+=b.pixels[((y*scale+sy)*b.width+x*scale+sx)*4+c];delta=Math.max(delta,Math.abs(a.pixels[i+c]-Math.round(value/(scale*scale))));}
  totalDelta+=delta;maxDelta=Math.max(maxDelta,delta);if(delta>tolerance)changed++;
  heat[i]=delta>tolerance?255:Math.round(a.pixels[i]*.3);heat[i+1]=delta>tolerance?48:Math.round(a.pixels[i+1]*.3);heat[i+2]=delta>tolerance?96:Math.round(a.pixels[i+2]*.3);heat[i+3]=255;
 }
 return {width:a.width,height:a.height,pixels:heat,changedPixels:changed,totalPixels:a.width*a.height,changedFraction:changed/(a.width*a.height),meanDelta:totalDelta/(a.width*a.height),maxDelta,scale,tolerance};
}

export function baselinePath(directory, file) {
 if(typeof file!=='string'||!file||isAbsolute(file))throw new Error('Baseline image path must be relative');
 const path=resolve(directory,file),rel=relative(resolve(directory),path);
 if(rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel))throw new Error('Baseline image escapes store');
 return path;
}

export function readBaseline(directory, filename='manifest.json') {
 const manifest=JSON.parse(readFileSync(resolve(directory,filename),'utf8'));
 if(manifest.version!==1||typeof manifest.approvedBy!=='string'||!manifest.approvedBy.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(manifest.approvedAt)||!manifest.browser||!manifest.platform||!Array.isArray(manifest.entries)||!manifest.entries.length)throw new Error('Baseline requires version 1, approval, browser, platform and entries');
 if(!Number.isFinite(Date.parse(manifest.approvedAt))||new Date(manifest.approvedAt).toISOString().slice(0,10)!==manifest.approvedAt)throw new Error('Baseline approval date is invalid');
 const keys=new Set();
 for(const e of manifest.entries) {
  if(typeof e.state!=='string'||!e.state||typeof e.component!=='string'||!e.component||typeof e.selector!=='string'||!e.selector||![1,2].includes(e.scale)||!Number.isInteger(e.viewport?.width)||!Number.isInteger(e.viewport?.height)||e.viewport.width<1||e.viewport.height<1)throw new Error('Invalid baseline entry');
  const key=JSON.stringify([e.viewport.width,e.viewport.height,e.scale,e.state,e.component,e.dataMode]);
  if(keys.has(key))throw new Error('Duplicate baseline entry');keys.add(key);baselinePath(directory,e.file);
 }
 return manifest;
}

// Explicit approval metadata is input, not approval granted by this command.
// Prepare and validate everything first; refuse to replace any existing store.
export function freezeBaseline(filename,destination) {
 if(existsSync(destination))throw new Error('Baseline store already exists; choose a new approved version');
 const directory=dirname(resolve(filename)),manifest=readBaseline(directory,resolve(filename));
 const images=manifest.entries.map((e,i)=>{
  const bytes=readFileSync(baselinePath(directory,e.file));decodePNG(bytes);
  return {bytes,file:`component-${i+1}.png`};
 });
 mkdirSync(destination,{recursive:true});
 images.forEach(image=>writeFileSync(join(destination,image.file),image.bytes));
 const frozen={...manifest,entries:manifest.entries.map((e,i)=>({...e,file:images[i].file}))};
 writeFileSync(join(destination,'manifest.json'),JSON.stringify(frozen,null,2)+'\n');return frozen;
}

// A manifest is [{name, first, second, scale?}]; paths resolve beside it.
// Pair mode remains available: first.png second.png [--scale 2]. No image is
// persisted unless --png is explicit; inputs may be temporary in-memory probes.
export function runPixelFiles(argv) {
 const options={out:join(tmpdir(),'jig-scratch',`pixels-${process.pid}-${Date.now()}`),png:false},positional=[];
 for(let i=0;i<argv.length;i++) {
  if(argv[i]==='--png'){options.png=true;continue;}
  if(argv[i].startsWith('--')) {
   const key=argv[i].slice(2);
   if(!['out','manifest','states','scale','freeze'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Usage: first.png second.png [--out DIR] [--png] [--scale N], or --manifest FILE [--states NAME,...], or --freeze APPROVED_MANIFEST --out NEW_STORE');
   options[key]=argv[++i];
  }else positional.push(argv[i]);
 }
 if(options.freeze){if(positional.length||options.manifest||options.states||options.scale||options.png)throw new Error('--freeze accepts only --out');const manifest=freezeBaseline(options.freeze,options.out);return {tool:'visual-pixels',status:'passed',operation:'freeze',components:manifest.entries.length,store:options.out};}
 if(options.states&&!options.manifest)throw new Error('--states requires --manifest');
 let pairs,base=process.cwd();
 if(options.manifest){if(positional.length)throw new Error('Use a manifest or an image pair');base=dirname(resolve(options.manifest));pairs=JSON.parse(readFileSync(options.manifest,'utf8'));}
 else {if(positional.length!==2)throw new Error('Two PNG inputs are required');pairs=[{name:'default',first:positional[0],second:positional[1],scale:options.scale||1}];}
 if(!Array.isArray(pairs)||!pairs.length||pairs.some(p=>!p||typeof p.name!=='string'||!p.name||typeof p.first!=='string'||typeof p.second!=='string')||new Set(pairs.map(p=>p.name)).size!==pairs.length)throw new Error('Invalid pixel manifest');
 const selected=options.states?.split(',').map(s=>s.trim());
 if(selected?.some(s=>!pairs.some(p=>p.name===s)))throw new Error('Unknown pixel state');
 const runs=[];mkdirSync(options.out,{recursive:true});
 for(const pair of pairs.filter(p=>!selected||selected.includes(p.name))) {
  const result=diffPixels(decodePNG(readFileSync(resolve(base,pair.first))),decodePNG(readFileSync(resolve(base,pair.second))),{scale:Number(pair.scale??1)});
  const {pixels,...summary}=result;const run={state:pair.name,...summary};runs.push(run);
  if(options.png&&result.changedPixels){run.screenshot=join(options.out,`pixels-${runs.length}.png`);writeFileSync(run.screenshot,encodePNG(result));}
 }
 const report={tool:'visual-pixels',status:runs.some(r=>r.scale===1&&r.changedPixels)?'findings':'passed',runs};
 writeFileSync(join(options.out,'pixels.json'),JSON.stringify(report,null,2)+'\n');return report;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
 try{const report=runPixelFiles(process.argv.slice(2));console.log(JSON.stringify(report));process.exitCode=report.status==='findings'?1:0;}catch(error){console.log(JSON.stringify({status:'inconclusive',gaps:[error.message]}));process.exitCode=2;}
}
