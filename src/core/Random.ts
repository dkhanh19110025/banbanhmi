export type Range = readonly [number, number];

export function randomIn(range: Range): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
