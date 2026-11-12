export function renderTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Expected a nonempty title");
  }
  return value.trim().toUpperCase();
}

async function saveTitle(title: string): Promise<string> {
  return title;
}

const title = renderTitle("jig");
await saveTitle(title);
