import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const impeccablePin = JSON.parse(readFileSync(new URL('./impeccable-pin.json', import.meta.url), 'utf8'));
export const IMPECCABLE_BUDGET_MS = 5000;

// Copy only local HTML/CSS into an isolated detector input. Remote references
// are never fetched; scripts, fonts and images are never executed or downloaded.
export function detectorInput(url, destination) {
  if (new URL(url).protocol !== 'file:') throw new Error('Impeccable requires a local file URL for static detection');
  const source=fileURLToPath(url),root=dirname(source),seen=new Set(),gaps=[];
  const copy=file=>{
    if(seen.has(file))return;seen.add(file);
    const name=relative(root,file);
    if(name.startsWith('..')||isAbsolute(name))throw new Error('Detector stylesheet escapes the page directory');
    const text=readFileSync(file,'utf8'),target=join(destination,'input',name);
    mkdirSync(dirname(target),{recursive:true});writeFileSync(target,text);
    const refs=file===source
      ? [...text.matchAll(/<link\b[^>]*>/gi)].filter(m=>/\brel\s*=\s*["']stylesheet["']/i.test(m[0])).map(m=>m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]).filter(Boolean)
      : [...text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gi)].map(m=>m[1]);
    for(const ref of refs){const next=new URL(ref,pathToFileURL(file));if(next.protocol!=='file:'){gaps.push('Remote stylesheet skipped by static detector');continue;}copy(fileURLToPath(next));}
    return target;
  };
  return {file:copy(source),gaps};
}

export function executeDetector(binary,args,options) {
  return new Promise((resolveRun,reject)=>{
    const child=spawn(binary,args,{...options,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',overflow=false,failure;
    child.stdout.on('data',b=>{if(stdout.length+b.length>4*1024*1024){overflow=true;child.kill();}else stdout+=b;});
    child.stderr.on('data',b=>{stderr=(stderr+b).slice(-8192);});
    child.on('error',error=>{failure=error;});
    child.on('close',(code,signal)=>failure?reject(failure):overflow?reject(new Error('Detector output exceeds 4 MB')):resolveRun({code,signal,stdout,stderr}));
  });
}

export function selectDetectorFindings(raw,pin=impeccablePin) {
  if(!Array.isArray(raw)||raw.some(f=>!f||typeof f.antipattern!=='string'||typeof f.file!=='string'||typeof f.snippet!=='string'))throw new Error('Invalid Impeccable JSON findings');
  if(!Array.isArray(pin.waivers)||pin.waivers.some(w=>!pin.allowlist.includes(w.ruleId)||typeof w.target!=='string'||!w.target||w.target==='*'||!w.reason?.trim()||!w.evidence?.trim()))throw new Error('Invalid Impeccable waiver');
  const findings=[],waived=[];
  for(const f of raw.filter(f=>pin.allowlist.includes(f.antipattern))){
    const item={...f,ruleId:f.antipattern,target:`${f.file}:${f.line ?? 0}:${f.snippet}`,severity:'warn'};
    const exception=pin.waivers.find(w=>w.ruleId===item.ruleId&&w.target===item.target);
    if(exception)waived.push({...item,exception});else findings.push(item);
  }
  return {findings,waived,ignored:raw.length-findings.length-waived.length};
}

export async function inspectImpeccable(options,{binary=process.env.IMPECCABLE_BIN,pin=impeccablePin,execute=executeDetector}={}) {
  const start=performance.now(),report={version:pin.version,executed:false,findings:[],waived:[],gaps:[],budgetMs:IMPECCABLE_BUDGET_MS};
  let directory;
  try {
    const target=`${process.platform==='win32'?'windows':process.platform}-${process.arch}`;
    if(!pin.checksums[target])throw new Error(`Unsupported Impeccable platform: ${target}`);
    if(!binary)throw new Error('Set IMPECCABLE_BIN to the pinned detector executable');
    const digest=createHash('sha256').update(readFileSync(binary)).digest('hex');
    if(digest!==pin.checksums[target])throw new Error('Impeccable checksum mismatch');
    report.checksum=digest;
    directory=mkdtempSync(join(tmpdir(),'jig-impeccable-'));
    const input=detectorInput(options.url,directory);report.coverageGaps=input.gaps;
    const remaining=IMPECCABLE_BUDGET_MS-(performance.now()-start);
    if(remaining<=0)throw new Error('Impeccable budget exceeded before detection');
    const result=await execute(resolve(binary),['detect','--no-config','--json',input.file],{
      cwd:directory,timeout:Math.max(1,Math.floor(remaining)),env:{...process.env,DO_NOT_TRACK:'1',IMPECCABLE_NO_TELEMETRY:'1',
        HOME:directory,USERPROFILE:directory,XDG_CONFIG_HOME:directory,XDG_CACHE_HOME:directory,TMP:directory,TEMP:directory,TMPDIR:directory},
    });
    // Engine 0.1.19: 2 means findings, 1 means an incomplete/failed scan.
    if(result.signal||![0,2].includes(result.code))throw new Error(`Impeccable failed (${result.signal || result.code}): ${result.stderr}`);
    const raw=JSON.parse(result.stdout);
    // Stable targets refer to source-relative paths, never ephemeral temp paths.
    for(const f of Array.isArray(raw)?raw:[])if(typeof f.file==='string')f.file=relative(join(directory,'input'),f.file).replaceAll('\\','/');
    Object.assign(report,selectDetectorFindings(raw,pin));report.executed=true;
  }catch(error){report.gaps.push(error.message);}
  finally{if(directory)try{rmSync(directory,{recursive:true,force:true});}catch(error){report.gaps.push(`Detector cleanup: ${error.message}`);}}
  report.elapsedMs=performance.now()-start;report.overBudget=report.elapsedMs>IMPECCABLE_BUDGET_MS;
  return report;
}
