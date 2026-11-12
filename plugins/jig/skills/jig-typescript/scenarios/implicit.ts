function renderTitle(value: string): string {
  if (value == null) return "";
  return value.toUpperCase();
}
export function ingestTitle(external: unknown): string {
  const record = external as { title: string };
  return renderTitle(record.title);
}
