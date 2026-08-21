import { describe, expect, it } from "vitest";
import { convertComponentSource } from "./index.js";

describe("component importer", () => {
  it("rewrites common React/shadcn source", () => {
    const result = convertComponentSource(`import React from "react";\nimport { Button } from "@/components/ui/button";\nexport function Hero(){ return <Button className="p-4">Go</Button> }`);
    expect(result.source).not.toContain('from "react"');
    expect(result.source).toContain('from "@onestack/ui"');
    expect(result.source).toContain('class="p-4"');
  });
});
