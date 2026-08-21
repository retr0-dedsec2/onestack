import { describe, expect, it } from "vitest";
import { createServerRegistry, server } from "@onestack/server";
import { createRpcHandler, createRpcStub, deserializeRpc, serializeRpc } from "./index.js";

describe("OneStack RPC", () => {
  it("invokes server functions through a transport", async () => {
    const greet = server((name: string) => `Hello ${name}`, { id: "greet" });
    const handler = createRpcHandler(createServerRegistry([greet]));
    const client = createRpcStub(greet, handler);
    await expect(client("Ada")).resolves.toBe("Hello Ada");
  });

  it("round-trips dates", () => {
    const value = deserializeRpc(serializeRpc({ at: new Date("2026-01-01T00:00:00.000Z") })) as { at: Date };
    expect(value.at).toBeInstanceOf(Date);
  });
});
