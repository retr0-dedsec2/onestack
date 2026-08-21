import { describe, expect, it } from "vitest";
import { createVNode } from "@onestack/core";
import { renderToString } from "./index.js";

describe("OneStack SSR", () => {
  it("renders deterministic hydration markers", () => {
    const tree = createVNode("main", null, createVNode("h1", null, "Hello"));
    const result = renderToString(tree);
    expect(result.html).toBe('<main data-os-h="0"><h1 data-os-h="1">Hello</h1></main>');
    expect(result.hydrationNodes).toBe(2);
  });

  it("escapes user text", () => {
    expect(renderToString(createVNode("p", null, '<script>')).html).toContain("&lt;script&gt;");
  });
});
