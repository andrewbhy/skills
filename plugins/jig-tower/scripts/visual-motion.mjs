import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, runVisual, saveReport } from './visual-clip.mjs';
import { overlapTargets, analyseOverlap } from './visual-overlap.mjs';

// Original implementation; geometry candidates are not pixel/flicker verdicts.
export function analyseMotion(frames, { threshold = 2, duration = 2000, frameMs } = {}) {
  const gaps = [], findings = [];
  const intervals = frames.slice(1).map((f, i) => f.time - frames[i].time);
  const sorted = [...intervals].sort((a, b) => a - b);
  // Never infer a slower-than-60Hz cadence as evidence of complete coverage.
  const expected = frameMs ?? Math.min(1000 / 60, sorted[Math.floor(sorted.length * 0.2)] || 1000 / 60);
  const missed = intervals.flatMap((ms, i) => ms > expected * 1.8 ? [{ afterFrame: i, ms, estimatedMissed: Math.max(1, Math.round(ms / expected) - 1) }] : []);
  const elapsed = frames.length > 1 ? frames.at(-1).time - frames[0].time : 0;
  const estimatedMissed = missed.reduce((n, gap) => n + gap.estimatedMissed, 0);
  if (missed.length) gaps.push('Animation frames missed; snaps may have occurred inside gaps');
  if (frames.length < 3 || elapsed < duration - expected * 2) gaps.push('Recording shorter than requested or too few frames');
  const distance = (a, b) => Math.max(...a.rect.map((v, i) => Math.abs(v - b.rect[i])));
  const complete = i => i > 0 && intervals[i - 1] <= expected * 1.8;
  const overlaps=new Set();
  for(const [frame,f] of frames.entries())for(const finding of analyseOverlap(f.overlaps || []).findings){
    const key=JSON.stringify([finding.element,finding.other]);
    if(!overlaps.has(key)){overlaps.add(key);findings.push({...finding,frame,time:f.time});}
  }
  for (let i = 1; i < frames.length; i++) {
    const before = new Map(frames[i - 1].boxes.map(b => [b.id, b]));
    const after = new Map((frames[i + 1]?.boxes ?? []).map(b => [b.id, b]));
    for (const current of frames[i].boxes) {
      const previous = before.get(current.id), next = after.get(current.id);
      if (!previous || !complete(i)) continue;
      const jump = distance(previous, current);
      if (jump <= threshold) continue;
      const returned = next && complete(i + 1) && distance(current, next) > threshold && distance(previous, next) <= threshold;
      if (returned || current.marker) findings.push({ kind: returned ? 'one-frame-snap' : 'marker-hop',
        element: current.name, id: current.id, frame: i, time: frames[i].time, jump,
        before: previous.rect, at: current.rect, after: next?.rect });
    }
  }
  return { findings, gaps, coverage: { frames: frames.length, elapsedMs: elapsed, requestedMs: duration,
    expectedFrameMs: expected, missed, estimatedMissed,
    sampledFraction: frames.length ? frames.length / (frames.length + estimatedMissed) : 0 } };
}

export async function recordMotion(page, options) {
  return page.evaluate(new Function('input', `const overlapTargets=${overlapTargets};return (${motionFrames})(input);`),
    {selector:options.root,duration:options.duration,timeout:options['timeout-ms']});
}
export function motionFrames({ selector, duration, timeout }) {
  return new Promise((resolve, reject) => {
    const root = document.querySelector(selector);
    if (!root) { reject(new Error('Root missing')); return; }
    const frames = [], gaps = new Set(), ids = new WeakMap();
    let serial = 0, start, raf, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true; clearTimeout(timer); cancelAnimationFrame(raf);
      resolve({ frames, gaps: [...gaps] });
    };
    const timer = setTimeout(() => { gaps.add('rAF recording timed out'); finish(); }, duration + timeout);
    function sample(time) {
      start ??= time;
      if (!root.isConnected) { gaps.add('Root removed during recording'); finish(); return; }
      if (document.visibilityState !== 'visible') gaps.add('Page was not visible');
      const elements = [root, ...root.querySelectorAll('*')];
      if (elements.length > 5000) { gaps.add('Root exceeds 5000 elements; narrow selector'); finish(); return; }
      const boxes = [];
      for (const e of elements) {
        if (!ids.has(e)) ids.set(e, ++serial);
        if (e.shadowRoot || e.matches('canvas,iframe')) gaps.add('Shadow/frame/canvas contents require frame review');
        const b = e.getBoundingClientRect(), s = getComputedStyle(e);
        if (!b.width || !b.height || s.visibility !== 'visible' || s.display === 'none') continue;
        const marker = e.hasAttribute('data-visual-caret') ||
          (/caret|cursor/i.test(`${e.id} ${e.getAttribute('class')}`) && b.width <= 12 && b.height <= 40);
        boxes.push({ id: ids.get(e), name: e.id ? `#${e.id}` : e.localName,
          marker, rect: [b.x, b.y, b.width, b.height] });
      }
      frames.push({ time: time - start, boxes, overlaps:overlapTargets(selector) });
      if (time - start >= duration) finish();
      else raf = requestAnimationFrame(sample);
    }
    raf = requestAnimationFrame(sample);
  });
}

// Arm before triggering. Optional captures are returned in memory for the one
// checkpoint sheet, with actual elapsed times (not claims of exact frame timing).
export async function recordMotionStrip(page, options, trigger, { capture = false, captureFrame = () => page.screenshot({ caret: 'hide', animations: 'allow' }) } = {}) {
  const images = [];
  if (capture) images.push({ label: 'before trigger', bytes: await captureFrame() });
  const recording = recordMotion(page, options);
  const transition = (async () => {
    const start = Date.now();
    await trigger();
    if (capture) for (const fraction of [0, .25, .5, .75, 1]) {
      const remaining = start + options.duration * fraction - Date.now();
      if (remaining > 0) await page.waitForTimeout(remaining);
      images.push({ label: `after trigger +${Date.now() - start}ms`, bytes: await captureFrame() });
    }
  })();
  // Always join both promises, even when setup or capture fails.
  const [sampled, triggered] = await Promise.allSettled([recording, transition]);
  if (sampled.status === 'rejected') throw sampled.reason;
  if (triggered.status === 'rejected') throw triggered.reason;
  return { ...sampled.value, images };
}

export async function runMotion(options, dependencies) {
  return runVisual(options, 'motion', async (page, scoped, run) => {
    const recording = await recordMotion(page, scoped);
    const measured = analyseMotion(recording.frames, { threshold: scoped.threshold, duration: scoped.duration, frameMs: scoped['frame-ms'] });
    const filename = 'motion-' + run.viewport.width + 'x' + run.viewport.height + '-' + encodeURIComponent(run.state) + '.json';
    saveReport(scoped, recording, filename);
    return { ...measured, samples: join(scoped.out, filename), gaps: [...recording.gaps, ...measured.gaps] };
  }, dependencies);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await cli(runMotion, true);
