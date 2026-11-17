import { commandFor as __jigCommandFor, isEntry as __jigIsEntry } from "../../../scripts/command-line.mjs";
if (process.argv[2] === '--help' && __jigIsEntry(import.meta.url)) { console.log('Usage: ' + __jigCommandFor(import.meta.url) + ' <arguments>; see the owning skill for commands.'); process.exit(0); }
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raster = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const within = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'));
};
const escapeRE = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Read-only record validation. It does not inspect pixels or grant acceptance.
export function checkImageRound(folder) {
  const findings = [];
  const add = (kind, path, message) => findings.push({ kind, path, message });
  const finish = images => ({ status: findings.length ? 'failed' : 'passed', images, findings });
  let root;
  try {
    root = realpathSync(resolve(folder));
    if (!statSync(root).isDirectory()) throw new Error('not a directory');
  } catch (error) {
    add('round', String(folder), error.message);
    return finish(0);
  }
  const local = (value, kind, directory = false) => {
    if (!text(value)) { add(kind, String(value), 'Expected a nonempty round-relative path'); return; }
    if (isAbsolute(value)) { add(kind, value, 'Round records must use relative paths'); return; }
    try {
      const path = realpathSync(resolve(root, value));
      if (!within(root, path)) throw new Error('Path escapes round folder');
      const stat = statSync(path);
      if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(directory ? 'Expected directory' : 'Expected file');
      return path;
    } catch (error) { add(kind, value, error.message); }
  };
  const readJSON = (path, kind) => {
    if (!path) return;
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'));
      if (!object(value)) throw new Error('Expected JSON object');
      return value;
    } catch (error) { add(kind, relative(root, path), error.message); }
  };
  // Without policy, still report inventory defects; inputs remain unapproved.
  const config = readJSON(local('image-round.json', 'config'), 'config') ?? {
    schemaVersion: 1, gallery: 'gallery-fragment.json', imageDirectory: 'images',
    allowedInputImages: [], bannedNames: [], processWords: []
  };
  if (config.schemaVersion !== 1) add('config', 'image-round.json', 'schemaVersion must be 1');
  const lists = {};
  for (const field of ['allowedInputImages', 'bannedNames', 'processWords']) {
    const value = config[field];
    if (!Array.isArray(value) || !value.every(text)) {
      add('config', 'image-round.json', `${field} must be an explicit array of nonempty strings`);
      lists[field] = [];
    } else lists[field] = value;
  }
  const allowed = new Set();
  for (const input of lists.allowedInputImages) {
    if (isAbsolute(input)) { add('allowed-input', input, 'Round records must use relative paths'); continue; }
    try {
      const path = realpathSync(resolve(root, input));
      if (!within(root, path)) throw new Error('Path escapes round folder');
      if (!statSync(path).isFile() || !raster.has(extname(path).toLowerCase())) throw new Error('Expected an existing input image');
      allowed.add(path);
    } catch (error) { add('allowed-input', input, error.message); }
  }
  const checkedPrompts = new Set();
  const checkPrompt = value => {
    const path = local(value, 'prompt');
    if (!path || checkedPrompts.has(path)) return;
    checkedPrompts.add(path);
    let content;
    try { content = readFileSync(path, 'utf8'); }
    catch (error) { add('prompt', value, error.message); return; }
    if (!content.trim()) add('prompt', value, 'Prompt is empty');
    for (const [field, kind] of [['bannedNames', 'banned-name'], ['processWords', 'process-word']]) {
      for (const term of lists[field]) {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRE(term)}(?![\\p{L}\\p{N}_])`, 'iu');
        if (pattern.test(content)) add(kind, value, `Prompt contains configured term: ${term}`);
      }
    }
  };
  const checkInputs = (inputs, label) => {
    if (!Array.isArray(inputs)) { add('provenance-inputs', label, 'input_images must be explicit, including [] for explore'); return; }
    for (const input of inputs) {
      const value = object(input) ? input.path : input;
      if (!text(value)) { add('provenance-inputs', label, 'Each input must be a path string or {path}'); continue; }
      try {
        const path = realpathSync(resolve(root, value));
        if (!allowed.has(path)) add('disallowed-input', label, `Input is not allowlisted: ${value}`);
      } catch (error) { add('provenance-inputs', label, `${value}: ${error.message}`); }
    }
  };
  const imageRoot = local(config.imageDirectory, 'image-directory', true);
  const images = new Set();
  const scan = directory => {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); }
    catch (error) { add('inventory', relative(root, directory), error.message); return; }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) { add('inventory', relative(root, path), 'Symlinks are not allowed in output inventory'); continue; }
      if (entry.isDirectory()) scan(path);
      else if (entry.isFile() && raster.has(extname(path).toLowerCase())) images.add(realpathSync(path));
    }
  };
  if (imageRoot) scan(imageRoot);
  if (!images.size) add('inventory', config.imageDirectory ?? '', 'No output images found');
  const gallery = readJSON(local(config.gallery, 'gallery'), 'gallery');
  const entries = gallery?.entries ?? gallery?.images;
  if (!Array.isArray(entries)) {
    add('gallery', config.gallery ?? '', 'Expected an entries array (legacy images accepted)');
    return finish(images.size);
  }
  const listed = new Set();
  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `gallery[${index}]`;
    if (!object(entry)) { add('gallery-entry', label, 'Expected object'); continue; }
    if (!text(entry.id) || ids.has(entry.id)) add('gallery-id', label, 'Expected unique nonempty id');
    ids.add(entry.id);
    const image = local(entry.image, 'image');
    if (image) {
      if (!images.has(image)) add('gallery-image', entry.image, 'Not an inventoried output image');
      if (listed.has(image)) add('gallery-duplicate', entry.image, 'Image listed more than once');
      listed.add(image);
    }
    const note = entry.note ?? entry.notes;
    if (!text(note) || /^[^\s]+\.(?:md|txt)$/i.test(note.trim())) add('note', label, 'Expected per-image note text, not just a notes filename');
    checkPrompt(entry.prompt);
    const provenance = readJSON(local(entry.provenance, 'provenance'), 'provenance');
    if (!provenance) continue;
    checkInputs(provenance.input_images, entry.provenance);
    if (provenance.attempts !== undefined) {
      if (!Array.isArray(provenance.attempts) || !provenance.attempts.length) add('provenance-attempts', entry.provenance, 'attempts must be a nonempty array when present');
      else for (const [n, attempt] of provenance.attempts.entries()) {
        const attemptLabel = `${entry.provenance} attempt ${n + 1}`;
        if (!object(attempt)) { add('provenance-attempts', attemptLabel, 'Expected object'); continue; }
        checkInputs(attempt.input_images, attemptLabel);
        checkPrompt(attempt.prompt);
      }
    }
  }
  for (const path of images) if (!listed.has(path)) add('gallery-missing', relative(root, path), 'Output image missing from gallery');
  return finish(images.size);
}

const isEntry = () => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
};
if (process.argv[1] && isEntry()) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('-')) {
    console.error(`Usage: ${__jigCommandFor(import.meta.url)} <round-folder>`);
    process.exitCode = 2;
  } else {
    const report = checkImageRound(args[0]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.status === 'passed' ? 0 : 1;
  }
}
