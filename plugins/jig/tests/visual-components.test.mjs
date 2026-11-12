import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { componentArguments, runComponents } from '../scripts/visual-components.mjs';

test('[risk: a component build defaults to a matrix or unrequested images] default dimensions, selection and output budget', async t => {
  const out = mkdtempSync(join(tmpdir(), 'jig-components-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const setup = join(out, 'setup.mjs');
  writeFileSync(setup, 'export default async function(){}; export async function* states(){yield {name:"open",root:"#open"};yield {name:"closed",root:"#closed"};}');
  let captures = 0, contextsClosed = 0, browsersClosed = 0;
  const page = {
    setDefaultTimeout() {}, on() {}, goto: async () => {}, locator: () => ({ first: () => ({ waitFor: async () => {} }) }),
    waitForFunction: async () => {}, waitForTimeout: async () => {},
    evaluate: async fn => fn.name === 'inspectLayout' ? [{ box: { width: 10 } }] : { findings: [], gaps: [], elements: 1 },
    screenshot: async () => { captures++; }
  };
  const launch = async () => ({ version: () => 'boundary-fake', close: async () => { browsersClosed++; },
    newContext: async () => ({ newPage: async () => page, close: async () => { contextsClosed++; } }) });
  const {options,extra} = componentArguments(['--url','file:///fixture.html','--setup',setup,'--out',out,'--states','closed']);
  const report = await runComponents(options, extra, { launch });
  assert.equal(report.status, 'passed'); assert.equal(report.runs.length, 1);
  assert.equal(report.runs[0].states.length, 1); assert.equal(report.runs[0].states[0].name, 'closed');
  assert.equal(captures, 0); assert.equal(contextsClosed, 1); assert.equal(browsersClosed, 1);
  assert.deepEqual(readdirSync(out).sort(), ['components.json', 'setup.mjs']);
  await runComponents({...options,png:true}, extra, { launch });
  assert.equal(captures,0,'a clean state has no failure PNG');
  assert.equal(componentArguments(['--url','file:///fixture.html','--png','--sheet']).options.png,true);
  assert.throws(() => componentArguments(['--url','file:///fixture.html','--pixels','maybe']),/yes or no/);
  const unknown = await runComponents({...options,states:['absent']}, extra, { launch });
  assert.equal(unknown.status,'inconclusive'); assert.match(unknown.runs[0].gaps.join(), /Unknown states/);
});
