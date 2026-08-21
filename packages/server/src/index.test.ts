import { describe, expect, it } from "vitest";
import { createServerRegistry, server } from "./index.js";

describe("OneStack server functions", () => {
  it("registers and invokes typed functions", async () => {
    const add = server((a: number, b: number) => a + b, { id: "math.add" });
    const registry = createServerRegistry([add]);
    await expect(registry.invoke("math.add", [2, 3])).resolves.toBe(5);
  });
});
