export function renderTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Expected a nonempty title");
  }
  return value.trim().toUpperCase();
}

export const untyped: any = "unchecked";
export const asserted = untyped as { title: string };
Promise.resolve("unowned");
export const obsolete = "unused export";
export const wrongType: string = 42;
