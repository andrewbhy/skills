// Project only explicitly allowed JSON fields. Unknown values are scanned past,
// never decoded into message, prompt, code or tool-content objects/strings.
export function selectFields(text, fields) {
  let at = 0;
  const whitespace = () => { while (/\s/.test(text[at] ?? '') && at < text.length) at++; };
  const stringEnd = () => {
    if (text[at++] !== '"') throw new Error('Invalid JSON');
    while (at < text.length) {
      const char = text[at++];
      if (char === '\\') {
        const escape = text[at++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(at, at + 4))) throw new Error('Invalid JSON');
          at += 4;
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) throw new Error('Invalid JSON');
      }
      else if (char === '"') return;
      else if (char.charCodeAt(0) < 32) throw new Error('Invalid JSON');
    }
    throw new Error('Invalid JSON');
  };
  const value = (schema) => {
    whitespace();
    const start = at;
    if (text[at] === '{' || text[at] === '[') {
      const object = text[at++] === '{';
      const close = object ? '}' : ']';
      const result = schema && object ? Object.create(null) : undefined;
      whitespace();
      if (text[at] !== close) {
        while (true) {
          whitespace();
          let key;
          if (object) {
            const keyStart = at;
            stringEnd();
            // Decode keys only when selecting from this object.
            if (schema) key = JSON.parse(text.slice(keyStart, at));
            whitespace();
            if (text[at++] !== ':') throw new Error('Invalid JSON');
          }
          const child = schema && object && Object.hasOwn(schema, key) ? schema[key] : undefined;
          const selected = value(child);
          if (child) result[key] = selected;
          whitespace();
          if (text[at] !== ',') break;
          at++;
        }
      }
      if (text[at++] !== close) throw new Error('Invalid JSON');
      return result;
    }
    if (text[at] === '"') stringEnd();
    else {
      const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
      if (!token) throw new Error('Invalid JSON');
      at += token[0].length;
    }
    return schema === true ? JSON.parse(text.slice(start, at)) : undefined;
  };
  const result = value(fields);
  whitespace();
  if (at !== text.length) throw new Error('Invalid JSON');
  return result;
}
