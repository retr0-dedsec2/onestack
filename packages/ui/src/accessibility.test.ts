import { describe, expect, it } from "vitest";
import { assertAccessibleProps } from "./index.js";

describe("universal UI accessibility", () => {
  it("requires alternative text for images", () => {
    expect(assertAccessibleProps("Image", {})).toContain('Image requires an alt prop (use alt="" for decorative images).');
    expect(assertAccessibleProps("Image", { alt: "Profile" })).toEqual([]);
  });
  it("requires a dialog name", () => {
    expect(assertAccessibleProps("Dialog", {})).toHaveLength(1);
    expect(assertAccessibleProps("Dialog", { label: "Settings" })).toEqual([]);
  });
});
