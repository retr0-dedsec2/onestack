import { describe, expect, it } from "vitest";
import { reconcileKeyed } from "./index.js";

describe("reconcileKeyed", () => {
  it("plans inserts, removals and stable nodes", () => {
    const previous = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const next = [{ id: 2 }, { id: 3 }, { id: 4 }];
    const plan = reconcileKeyed(previous, next, (item) => item.id);

    expect(plan.operations.some((operation) => operation.type === "remove" && operation.key === 1)).toBe(true);
    expect(plan.operations.some((operation) => operation.type === "insert" && operation.key === 4)).toBe(true);
    expect(plan.stableKeys.has(2)).toBe(true);
    expect(plan.stableKeys.has(3)).toBe(true);
  });

  it("rejects duplicate keys", () => {
    expect(() => reconcileKeyed([{ id: 1 }], [{ id: 1 }, { id: 1 }], (item) => item.id)).toThrow(/duplicate key/i);
  });
});
