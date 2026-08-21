import { describe, expect, it } from "vitest";
import { generateRouteManifest, generateServerManifest } from "./manifests.js";

describe("OneStack manifests", () => {
  it("generates route entries including layouts", () => {
    expect(generateRouteManifest(["src/routes/index.tsx", "src/routes/dashboard/layout.tsx", "src/routes/users/[id].tsx"])).toEqual([
      { file: "src/routes/index.tsx", path: "/", layout: false },
      { file: "src/routes/dashboard/layout.tsx", path: "/dashboard", layout: true },
      { file: "src/routes/users/[id].tsx", path: "/users/:id", layout: false },
    ]);
  });
  it("generates server entries from source", () => {
    const manifest = generateServerManifest([{ path: "src/actions.ts", source: `import db from './db.server'; export const load = server(async () => db.all())` }]);
    expect(manifest[0].functionCount).toBe(1);
    expect(manifest[0].serverImports).toEqual(["./db.server"]);
  });
});
