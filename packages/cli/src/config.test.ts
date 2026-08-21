import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadOneStackConfig } from "./config.js";

describe("OneStack configuration", () => {
  it("loads typed onestack.config.ts files", () => {
    const root = mkdtempSync(join(tmpdir(), "onestack-config-"));
    writeFileSync(join(root, "onestack.config.ts"), `import { defineConfig } from "@onestack/config"; export default defineConfig({ app: { name: "Desk" }, desktop: { width: 900, permissions: { clipboard: true } } });`);
    expect(loadOneStackConfig(root)).toMatchObject({ app: { name: "Desk" }, desktop: { width: 900 } });
  });
});
