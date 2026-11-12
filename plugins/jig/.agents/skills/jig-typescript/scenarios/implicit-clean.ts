function renderTitle(value: string): string {
  return value.toUpperCase();
}

export function ingestTitle(external: unknown): string {
  if (
    typeof external !== "object" ||
    external === null ||
    Array.isArray(external) ||
    !("title" in external) ||
    typeof external.title !== "string" ||
    external.title.trim().length === 0
  ) {
    throw new Error("Expected a record with a nonempty title");
  }
  return renderTitle(external.title);
}
