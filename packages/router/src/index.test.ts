import { describe, expect, it } from "vitest";
import { createRouter, matchRoute, routePathFromFile } from "./index.js";

describe("OneStack router", () => {
  it("turns route files into URLs", () => {
    expect(routePathFromFile("src/routes/index.tsx")).toBe("/");
    expect(routePathFromFile("src/routes/users/[id].tsx")).toBe("/users/:id");
    expect(routePathFromFile("src/routes/docs/[...slug].tsx")).toBe("/docs/*slug");
  });

  it("matches dynamic params", () => {
    expect(matchRoute("/users/:id", "/users/42")).toEqual({ id: "42" });
  });

  it("resolves routes without a browser", () => {
    const router = createRouter([{ path: "/projects/:id", value: "project" }], "/projects/abc");
    expect(router.current()?.params).toEqual({ id: "abc" });
    router.dispose();
  });
});
