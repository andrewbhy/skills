export function parseItems(text) {
  let records;
  try {
    records = JSON.parse(text);
  } catch {
    return { items: null, error: 'Invalid JSON.' };
  }
  if (!Array.isArray(records)) {
    return { items: null, error: 'Expected an array of records.' };
  }
  const items = [];
  for (const [index, record] of records.entries()) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)
        || typeof record.title !== 'string' || record.title.trim().length === 0) {
      return { items: null, error: `Item ${index + 1} must have a nonempty string title.` };
    }
    items.push({ title: record.title.trim() });
  }
  return { items, error: null };
}
