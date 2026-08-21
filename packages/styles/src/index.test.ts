import { describe, expect, it } from "vitest";
import { compileUtilities, defineTheme, styleToCss } from "./index.js";

const theme = defineTheme({
  colors: { primary: "#111111", surface: "#ffffff" },
  spacing: { "4": 16 },
  radius: { lg: 16 },
});

describe("OneStack styles", () => {
  it("resolves tokens to CSS", () => {
    expect(styleToCss({ color: "$colors.primary", padding: 12 }, theme)).toBe("color:#111111;padding:12px");
  });

  it("compiles portable utility classes", () => {
    expect(compileUtilities("flex items-center gap-4 rounded-lg bg-surface", theme)).toEqual({
      display: "flex",
      alignItems: "center",
      gap: 16,
      borderRadius: 16,
      background: "#ffffff",
    });
  });
});
