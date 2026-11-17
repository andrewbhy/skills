import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "./command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
// WHATWG Fetch, Port blocking (checked 16 Nov 2026):
// https://fetch.spec.whatwg.org/#port-blocking
// One policy for runtime self-checks, browser fixtures and Node fetch fixtures.
export const badFetchPorts = Object.freeze([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53,
  69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117,
  119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514,
  515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989,
  990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080
]);
const blocked = new Set(badFetchPorts);

// portSource is the narrow deterministic seam for OS-assigned blocked ports.
export async function listenForFetch(server, host = '127.0.0.1', {
  maxAttempts = 16, portSource = () => server.address().port
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('Invalid listen attempt limit');
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve, reject) => {
      const failed = error => { server.removeListener('error', failed); reject(error); };
      server.once('error', failed);
      try { server.listen(0, host, () => { server.removeListener('error', failed); resolve(); }); }
      catch (error) { failed(error); }
    });
    let port;
    try {
      port = portSource(server);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid assigned port');
      if (!blocked.has(port)) return port;
    } catch (error) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      throw error;
    }
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  throw new Error(`No fetch-compatible port after ${maxAttempts} attempts`);
}
