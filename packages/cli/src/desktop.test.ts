import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDesktopConfig, writeDesktopManifest } from "./desktop.js";

describe("desktop manifest generation", () => {
  it("uses onestack.config.ts and generates flattened permissions", () => {
    const root = mkdtempSync(join(tmpdir(), "onestack-desktop-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "sample", version: "1.2.3" }));
    writeFileSync(join(root, "onestack.config.ts"), `import { defineConfig } from "@onestack/config"; export default defineConfig({ app: { name: "Desktop Sample", identifier: "dev.onestack.sample" }, desktop: { width: 900, permissions: { filesystem: { read: ["$documents"] }, clipboard: true } } });`);
    writeDesktopManifest(root, { devUrl: "http://127.0.0.1:5173" });
    const manifest = JSON.parse(readFileSync(join(root, ".onestack/desktop.json"), "utf8"));
    expect(manifest.app.name).toBe("Desktop Sample");
    expect(manifest.window.width).toBe(900);
    expect(manifest.permissions).toContain("filesystem.read");
    expect(manifest.permissions).toContain("clipboard.read");
    expect(manifest.filesystem.read).toEqual(["$documents"]);
    expect(manifest.url).toBe("http://127.0.0.1:5173");
  });

  it("keeps legacy onestack.desktop.json support", () => {
    const root = mkdtempSync(join(tmpdir(), "onestack-desktop-legacy-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "legacy", version: "0.1.0" }));
    writeFileSync(join(root, "onestack.desktop.json"), JSON.stringify({ app: { name: "Legacy App" }, window: { width: 700 } }));
    expect(readDesktopConfig(root)).toMatchObject({ app: { name: "Legacy App" }, window: { width: 700 } });
  });
});

// Scoped package names must never become nested executable paths.
it("normalizes scoped package names for desktop artifacts", async () => {
  const { desktopArtifactName } = await import("./desktop.js");
  expect(desktopArtifactName("@onestack/example-counter")).toBe("onestack-example-counter");
  expect(desktopArtifactName("../../Example App")).toBe("example-app");
});
