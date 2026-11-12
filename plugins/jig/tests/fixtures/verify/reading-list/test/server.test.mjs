import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer } from '../server.mjs';

test('[risk: screen unavailable] serves the list screen and its modules; unrelated paths are unavailable', async (t) => {
  const server = createServer();
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, type] of [['/list', 'text/html'], ['/app.mjs', 'text/javascript'], ['/items.mjs', 'text/javascript']]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.ok((await response.text()).length > 0);
  }
  assert.equal((await fetch(base + '/package.json')).status, 404);
});
