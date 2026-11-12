export function addItem(items, title) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { items, error: 'Enter a title.' };
  }
  return { items: [...items, { title: title.trim() }], error: null };
}
