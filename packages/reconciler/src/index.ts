export type Key = string | number;

export type ReconcileOperation<T> =
  | { type: "insert"; key: Key; to: number; item: T }
  | { type: "move"; key: Key; from: number; to: number; item: T }
  | { type: "retain"; key: Key; from: number; to: number; item: T }
  | { type: "remove"; key: Key; from: number; item: T };

export interface ReconcilePlan<T> {
  operations: ReconcileOperation<T>[];
  stableKeys: Set<Key>;
}

function assertUnique<T>(items: readonly T[], getKey: (item: T, index: number) => Key, label: string) {
  const keys = new Set<Key>();
  items.forEach((item, index) => {
    const key = getKey(item, index);
    if (keys.has(key)) throw new Error(`OneStack reconciler: duplicate key \"${String(key)}\" in ${label}.`);
    keys.add(key);
  });
}

function longestIncreasingSubsequence(values: number[]): Set<number> {
  if (values.length === 0) return new Set();
  const predecessors = new Array<number>(values.length).fill(-1);
  const tails: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]] < values[index]) low = middle + 1;
      else high = middle;
    }
    if (low > 0) predecessors[index] = tails[low - 1];
    tails[low] = index;
  }

  const result = new Set<number>();
  let cursor = tails[tails.length - 1];
  while (cursor >= 0) {
    result.add(cursor);
    cursor = predecessors[cursor];
  }
  return result;
}

export function reconcileKeyed<T>(
  previous: readonly T[],
  next: readonly T[],
  getKey: (item: T, index: number) => Key,
): ReconcilePlan<T> {
  assertUnique(previous, getKey, "previous children");
  assertUnique(next, getKey, "next children");

  const previousIndex = new Map<Key, number>();
  previous.forEach((item, index) => previousIndex.set(getKey(item, index), index));

  const nextKeys = new Set(next.map((item, index) => getKey(item, index)));
  const existing: Array<{ nextIndex: number; previousIndex: number; key: Key }> = [];
  next.forEach((item, nextIndex) => {
    const key = getKey(item, nextIndex);
    const oldIndex = previousIndex.get(key);
    if (oldIndex !== undefined) existing.push({ nextIndex, previousIndex: oldIndex, key });
  });

  const lisPositions = longestIncreasingSubsequence(existing.map((entry) => entry.previousIndex));
  const stableKeys = new Set<Key>();
  existing.forEach((entry, position) => {
    if (lisPositions.has(position)) stableKeys.add(entry.key);
  });

  const operations: ReconcileOperation<T>[] = [];
  previous.forEach((item, from) => {
    const key = getKey(item, from);
    if (!nextKeys.has(key)) operations.push({ type: "remove", key, from, item });
  });

  next.forEach((item, to) => {
    const key = getKey(item, to);
    const from = previousIndex.get(key);
    if (from === undefined) operations.push({ type: "insert", key, to, item });
    else if (stableKeys.has(key)) operations.push({ type: "retain", key, from, to, item });
    else operations.push({ type: "move", key, from, to, item });
  });

  return { operations, stableKeys };
}
