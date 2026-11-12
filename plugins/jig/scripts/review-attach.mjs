// Images attached to thread messages: validation of the JSON payload (type, magic bytes, size, count) and storage in the personal store.
// Wire format: images:[{type:'png'|'jpeg'|'webp' (or image/<same>), data:<base64, no data: prefix>}].
import { attachmentPath, writeAttachment } from './jig-store.mjs';

export const maxImageBytes = 10 * 1024 * 1024;
export const maxImages = 6;
const b64Max = Math.ceil(maxImageBytes / 3) * 4;
// Largest request body a message with images may have (base64 is 4/3 of the bytes).
export const maxAttachBody = maxImages * (b64Max + 256) + 64 * 1024;
const kinds = { png: { ext: 'png', mime: 'image/png' }, jpeg: { ext: 'jpg', mime: 'image/jpeg' }, webp: { ext: 'webp', mime: 'image/webp' } };
export const attachmentMime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

const fail = (status, error) => Object.assign(new Error(error), { status });

// The kind and pixel size read from the file's own header, or null when it is not a PNG, JPEG or WebP.
export function sniffImage(b) {
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.toString('latin1', 12, 16) === 'IHDR') {
    return { kind: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { kind: 'jpeg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { kind: 'jpeg', w: 0, h: 0 };
  }
  if (b.length >= 16 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const f = b.toString('latin1', 12, 16);
    if (f === 'VP8X' && b.length >= 30) return { kind: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (f === 'VP8L' && b.length >= 25) { const v = b.readUInt32LE(21); return { kind: 'webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (f === 'VP8 ' && b.length >= 30) return { kind: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    return { kind: 'webp', w: 0, h: 0 };
  }
  return null;
}

// Decodes and checks the images of one message; throws an error with .status (400 bad, 413 too big, 415 wrong type) and a plain message.
export function decodeImages(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw fail(400, 'images must be a list');
  if (list.length > maxImages) throw fail(413, `at most ${maxImages} images per message`);
  return list.map((x, n) => {
    const label = `image ${n + 1}`;
    if (!x || typeof x !== 'object' || typeof x.type !== 'string' || typeof x.data !== 'string') throw fail(400, `${label}: needs type and base64 data`);
    const kind = x.type.toLowerCase().replace(/^image\//, '');
    if (!Object.hasOwn(kinds, kind)) throw fail(415, `${label}: only png, jpeg and webp are accepted`);
    if (x.data.length > b64Max + 4) throw fail(413, `${label}: larger than 10 MB`);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(x.data) || x.data.length % 4 !== 0) throw fail(400, `${label}: data is not base64`);
    const bytes = Buffer.from(x.data, 'base64');
    if (bytes.length > maxImageBytes) throw fail(413, `${label}: larger than 10 MB`);
    const seen = sniffImage(bytes);
    if (!seen || seen.kind !== kind) throw fail(415, `${label}: the file is not a real ${kind} image`);
    return { bytes, ext: kinds[kind].ext, type: kinds[kind].mime, w: seen.w, h: seen.h };
  });
}

// Stores decoded images under attachments/<thread>/<timestamp>-<n>.<ext>; returns [{path, w, h, type}] with absolute paths.
export function storeImages(project, thread, images, { home, now = Date.now() } = {}) {
  const out = [];
  let ts = now;
  for (const [n, im] of images.entries()) {
    for (;;) {
      const name = `${ts}-${n + 1}.${im.ext}`;
      try {
        const path = writeAttachment(project, thread, name, im.bytes, { home });
        out.push({ path: path.replace(/\\/g, '/'), w: im.w, h: im.h, type: im.type });
        break;
      } catch (e) { if (e.code !== 'EEXIST') throw e; ts++; }
    }
  }
  return out;
}

// Path of a stored file for the /att/<thread>/<file> route, or null.
export const servedAttachment = attachmentPath;

// Shared page pieces: styles and the browser script (kit for the message box, inline images of sent messages).
import { readFileSync } from 'node:fs';
export const attachClient = readFileSync(new URL('./review-attach-client.js', import.meta.url), 'utf8');
export const attachCss = `.thumbs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}.thumbs[hidden]{display:none}
.thumb{position:relative;width:72px;height:72px;border:1px solid #8886;border-radius:8px;overflow:hidden;background:#8881}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumbx{position:absolute;top:3px;right:3px;width:26px;height:26px;min-height:0;padding:0;border:0;border-radius:99px;background:#000c;color:#fff;font:inherit;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer}
.thumbx:hover,.thumbx:focus-visible{background:#b91c1c}
.attbtn{font:inherit;min-height:2.6em;padding:6px 12px;border:1px solid #8888;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
.attbtn:hover{background:#8882}
.dropping{outline:2px dashed #2563eb;outline-offset:-2px}
.att{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.att img,main .att img.wide{max-width:min(100%,360px);max-height:240px;width:auto;height:auto;border-radius:6px;border:1px solid #8886;cursor:zoom-in;display:block;background:#fff}`;
