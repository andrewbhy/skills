export function improvementProposal(test) {
  const file=test.file || '';
  if(/worktree|diff-signals|branch/.test(file))return 'Reuse a prepared repository fixture; retain distinct dirty/unmerged refusal cases.';
  if(/scenario|cheap-verify/.test(file))return 'Batch seed/clean cases in one provider-free fixture process; retain each defect assertion.';
  if(/theme|token/.test(file))return 'Parse shared token inputs once per fixture; retain independent mutated-input checks.';
  return 'Profile child-process and fixture setup time; share setup or merge redundant cases while retaining failure/recovery assertions.';
}

// Use the runner's event durations, including failures but excluding skipped
// tests and suite aggregates. This does not change any budget or exit status.
export default async function* slowTestsReporter(events) {
  const tests=[];
  for await(const event of events){
    if(!['test:pass','test:fail'].includes(event.type))continue;
    const d=event.data;
    if(d.skip || d.details?.type==='suite' || !Number.isFinite(d.details?.duration_ms))continue;
    tests.push({name:d.name,file:d.file,elapsedMs:d.details.duration_ms});
  }
  yield '\nSlowest unit tests (proposal only; budgets unchanged):\n';
  for(const t of tests.sort((a,b)=>b.elapsedMs-a.elapsedMs).slice(0,5))yield `${t.elapsedMs.toFixed(1)} ms | ${t.name}\n  Proposal: ${improvementProposal(t)}\n`;
}
