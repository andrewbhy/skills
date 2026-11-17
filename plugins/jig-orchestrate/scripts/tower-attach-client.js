// Browser side of message images, shared by the thread page and the dashboard question cards. Inlined; plain script, no imports.
// attachKit: paste (Ctrl+V), drop and an attach button put images into the message being written; thumbnails with a remove button
// show above the box. attNodes: the images of a sent message, inline; a click opens the image viewer (the lightbox, on '.att img').
var ATT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
var ATT_MAX = 6;
var ATT_BYTES = 10 * 1024 * 1024;
function attKit(opts) {
  // opts: host (element that accepts drops), pasteOn (element or document that hears paste), list (array kept by the caller),
  // onNote(text) shows a short problem, onChange() runs after any change.
  var list = opts.list;
  var strip = document.createElement('div'); strip.className = 'thumbs'; strip.hidden = !list.length;
  var input = document.createElement('input'); input.type = 'file'; input.accept = ATT_TYPES.join(','); input.multiple = true; input.hidden = true;
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'attbtn'; btn.textContent = 'Attach';
  btn.title = 'Add an image (or paste with Ctrl+V, or drop one here)'; btn.setAttribute('aria-label', 'Attach image');
  function draw() {
    strip.textContent = ''; strip.hidden = !list.length;
    list.forEach(function (im, i) {
      var t = document.createElement('div'); t.className = 'thumb';
      var img = document.createElement('img'); img.src = 'data:' + im.type + ';base64,' + im.data; img.alt = 'Image ' + (i + 1) + ' to send';
      var x = document.createElement('button'); x.type = 'button'; x.className = 'thumbx'; x.textContent = '×'; x.title = 'Remove this image'; x.setAttribute('aria-label', 'Remove image ' + (i + 1));
      x.addEventListener('click', function () { list.splice(i, 1); draw(); if (opts.onChange) opts.onChange(); });
      t.append(img, x); strip.append(t);
    });
  }
  function read(file) {
    return new Promise(function (ok) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); var at = s.indexOf(','); ok(at < 0 ? null : s.slice(at + 1)); };
      r.onerror = function () { ok(null); }; r.readAsDataURL(file);
    });
  }
  async function add(files) {
    for (var f of files) {
      if (ATT_TYPES.indexOf(f.type) < 0) { opts.onNote('Only PNG, JPEG or WebP images can be attached.'); continue; }
      if (list.length >= ATT_MAX) { opts.onNote('At most ' + ATT_MAX + ' images per message.'); break; }
      if (f.size > ATT_BYTES) { opts.onNote('That image is larger than 10 MB.'); continue; }
      var data = await read(f);
      if (!data) { opts.onNote('Could not read that image.'); continue; }
      list.push({ type: f.type, data: data });
    }
    draw(); if (opts.onChange) opts.onChange();
  }
  function imageFiles(dt) {
    var out = [];
    if (dt && dt.items && dt.items.length) { for (var it of dt.items) { if (it.kind === 'file' && /^image\//.test(it.type)) { var f = it.getAsFile(); if (f) out.push(f); } } }
    else if (dt && dt.files) { for (var g of dt.files) if (/^image\//.test(g.type)) out.push(g); }
    return out;
  }
  (opts.pasteOn || opts.host).addEventListener('paste', function (e) {
    var files = imageFiles(e.clipboardData);
    if (!files.length) return; // plain text paste goes on as usual
    e.preventDefault(); add(files);
  });
  var depth = 0;
  var hasFiles = function (e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; };
  opts.host.addEventListener('dragenter', function (e) { if (hasFiles(e)) { depth++; opts.host.classList.add('dropping'); } });
  opts.host.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
  opts.host.addEventListener('dragleave', function (e) { if (hasFiles(e) && --depth <= 0) { depth = 0; opts.host.classList.remove('dropping'); } });
  opts.host.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; opts.host.classList.remove('dropping');
    var files = Array.prototype.slice.call(e.dataTransfer.files || []);
    if (files.length) add(files);
  });
  btn.addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () { var fs = Array.prototype.slice.call(input.files || []); input.value = ''; if (fs.length) add(fs); });
  draw();
  return {
    strip: strip, button: btn, input: input, redraw: draw,
    payload: function () { return list.map(function (im) { return { type: im.type, data: im.data }; }); },
    clear: function () { list.length = 0; draw(); if (opts.onChange) opts.onChange(); }
  };
}
// The /att/<thread>/<file> address of a stored attachment path, or null.
function attUrl(path) {
  var m = String(path || '').match(/attachments[\\/]([^\\/]+)[\\/](\d{10,}-\d{1,3}\.(?:png|jpg|webp))$/);
  return m ? '/att/' + encodeURIComponent(m[1]) + '/' + m[2] : null;
}
function attNodes(atts) {
  var box = document.createElement('div'); box.className = 'att';
  (atts || []).forEach(function (a) {
    var u = attUrl(a.path); if (!u) return;
    var img = document.createElement('img'); img.src = u; img.alt = 'Attached image'; img.loading = 'lazy';
    if (a.w > 0 && a.h > 0) { img.width = a.w; img.height = a.h; }
    box.append(img);
  });
  return box.childNodes.length ? box : null;
}
