import { describe, expect, it } from "vitest";
import { flattenPermissions } from "./permissions.js";

describe("desktop permissions", () => {
  it("flattens explicit capabilities", () => {
    expect(flattenPermissions({
      filesystem: { read: ["$documents"], write: false },
      clipboard: { read: true },
      window: true,
      shell: { externalUrls: true },
    })).toEqual([
      "clipboard.read",
      "filesystem.read",
      "shell.external",
      "window.control",
      "window.create",
    ]);
  });
});
