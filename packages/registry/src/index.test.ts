import { describe, expect, it } from "vitest";
import { analyzeComponentCompatibility } from "./index.js";

describe("OneStack registry compatibility", () => {
  it("marks plain components universal", () => {
    expect(analyzeComponentCompatibility(`export const Card = () => <section>Hi</section>`).portability).toBe("universal");
  });

  it("detects browser-only APIs", () => {
    expect(analyzeComponentCompatibility(`export const width = window.innerWidth`).portability).toBe("web-compatible");
  });
});
