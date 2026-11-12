import { readFileSync } from 'node:fs';

const version = '1.0.0';
const items = [
  { id: 1, title: 'Draft', done: false },
  { id: 2, title: 'Archive', done: true },
  { id: 3, title: 'Publish', done: false },
];
const mode = process.argv[2];
if (mode === '--version') console.log(version);
else if (mode === '--ui') console.log('Notebook 1.0.0\n[1] All items (ascending ID)\n[2] Open items (ascending ID)');
else if (mode === '--request') {
  try {
    const request = JSON.parse(readFileSync(0, 'utf8'));
    if (request.op !== 'list' || !['all', 'open'].includes(request.state)) throw new Error('Invalid request');
    const selected = items.filter(item => request.state === 'all' || !item.done);
    console.log(JSON.stringify({ version, items: selected }));
  } catch { console.error('Invalid request'); process.exitCode = 1; }
} else { console.error('Use --version, --ui or --request'); process.exitCode = 1; }
