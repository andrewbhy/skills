import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const assets = new Map([
  ['/list', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/items.mjs', ['items.mjs', 'text/javascript; charset=utf-8']],
]);

export function createServer() {
  return createHttpServer(async (request, response) => {
    const asset = assets.get(new URL(request.url, 'http://localhost').pathname);
    if (!asset) {
      response.writeHead(404).end('Not found');
      return;
    }
    try {
      const body = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, { 'content-type': asset[1], 'cache-control': 'no-store' }).end(body);
    } catch {
      response.writeHead(500).end('Unable to load asset');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () => {
    console.log(`Ready: http://127.0.0.1:${server.address().port}/list`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close());
  }
}
