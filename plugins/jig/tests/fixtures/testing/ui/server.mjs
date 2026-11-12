import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/dom-check.mjs', ['dom-check.mjs', 'text/javascript; charset=utf-8']],
]);
const server = createServer(async (request, response) => {
  const file = files.get(request.url);
  if (!file) { response.writeHead(404).end(); return; }
  try {
    response.writeHead(200, { 'Content-Type': file[1] });
    response.end(await readFile(new URL(file[0], import.meta.url)));
  } catch { response.writeHead(500).end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}`));
