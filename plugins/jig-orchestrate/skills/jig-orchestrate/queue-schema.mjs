import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// The shared persisted queue contract. Keep readers and writers on these rules.
export const singleLine = value => typeof value === 'string' && value.trim().length > 0 && !/[\r\n\0]/.test(value);
export const queueStates = ['pending', 'starting', 'running', 'done', 'failed', 'stopped', 'review', 'parked'];
export const isJob = record => singleLine(record?.plan) && singleLine(record?.worktree);

export function waitList(value) {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return undefined;
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list) || list.some(v => typeof v !== 'string' || !v.trim().length || /\0/.test(v))) throw Error('Invalid waitsFor');
  return list;
}

function invalid(record, field, reason) {
  throw Error(`Invalid queue item: ${record?.id ?? '?'}: ${field} ${reason}`);
}
export function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) invalid(record, 'record', 'must be an object');
  if (!singleLine(record.id)) invalid(record, 'id', 'must be a non-empty single-line string without NUL');
  if (typeof record.item !== 'string' || !record.item.trim() || /\0/.test(record.item)) invalid(record, 'item', 'must be non-empty text without NUL');
  if (!queueStates.includes(record.state)) invalid(record, 'state', 'is unknown');
  // Check supplied fields before classification so a malformed job cannot
  // silently become a board item.
  for (const field of ['plan', 'worktree', 'provider', 'area', 'progressFile', 'reservationId', 'taskId']) {
    // An empty string means absent: older writers stored plan: '' on finished items.
    if (record[field] !== undefined && record[field] !== '' && !singleLine(record[field])) invalid(record, field, 'must be a non-empty single-line string without NUL');
  }
  const job = isJob(record);
  for (const field of ['provider', 'area']) if (job && record[field] === undefined) invalid(record, field, 'is required for a job');
  for (const field of ['dependsOn', 'touches']) {
    if ((job || record[field] !== undefined) && (!Array.isArray(record[field]) || record[field].some(v => !singleLine(v)))) invalid(record, field, 'must be an array of non-empty single-line strings without NUL');
  }
  try { waitList(record.waitsFor); } catch { invalid(record, 'waitsFor', 'Invalid waitsFor: require non-empty text or a list without NUL'); }
  for (const field of ['browser', 'nextDecision']) if (record[field] !== undefined && typeof record[field] !== 'boolean') invalid(record, field, 'must be boolean');
  if (job && ['starting', 'running'].includes(record.state)) {
    for (const field of [record.state === 'starting' ? 'reservationId' : 'taskId', 'progressFile']) if (!singleLine(record[field])) invalid(record, field, `is required for a ${record.state} job`);
  }
  return record;
}

export function validateQueue(queue) {
  if (!queue || queue.version !== 1 || !Array.isArray(queue.items)) throw Error('Invalid queue version or items');
  const records = new Map();
  for (const record of queue.items) {
    validateRecord(record);
    if (records.has(record.id)) invalid(record, 'id', 'is a duplicate id');
    records.set(record.id, record);
  }
  for (const record of queue.items.filter(isJob)) {
    if (record.dependsOn.some(id => !records.has(id) || id === record.id)) invalid(record, 'dependsOn', 'contains an unknown or self dependency');
  }
  const visited = new Set();
  const visit = (id, stack = new Set()) => {
    const record = records.get(id);
    if (stack.has(id)) invalid(record, 'dependsOn', 'contains a dependency cycle');
    if (visited.has(id)) return;
    if (isJob(record)) for (const dep of record.dependsOn) visit(dep, new Set([...stack, id]));
    visited.add(id);
  };
  for (const id of records.keys()) visit(id);
  return queue;
}
