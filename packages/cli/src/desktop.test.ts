import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeDesktopManifest } from "./desktop.js";

describe("desktop manifest generation", () => {
  it("generates flattened permissions and filesystem scopes", () => {
    const root = mkdtempSync(join(tmpdir(), "onestack-desktop-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "sample", version: "1.2.3" }));
    writeFileSync(join(root, "onestack.desktop.json"), JSON.stringify({ permissions: { filesystem: { read: ["$documents"] }, clipboard: true } }));
    writeDesktopManifest(root, { devUrl: "http://127.0.0.1:5173" });
    const manifest = JSON.parse(readFileSync(join(root, ".onestack/desktop.json"), "utf8"));
    expect(manifest.permissions).toContain("filesystem.read");
    expect(manifest.permissions).toContain("clipboard.read");
    expect(manifest.filesystem.read).toEqual(["$documents"]);
    expect(manifest.url).toBe("http://127.0.0.1:5173");
  });
});
