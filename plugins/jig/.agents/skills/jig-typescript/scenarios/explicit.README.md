# Title rendering

Preserve the public `renderTitle(value: unknown): string` function. It trims and
uppercases valid titles, and throws `Expected a nonempty title` for missing,
null, numeric, empty or whitespace-only values. Keep the behavioural tests passing
while repairing the TypeScript hazards. Run `npm test` and the tool-check scripts.

The tests use Node's built-in TypeScript stripping (Node 22.6 or newer).
