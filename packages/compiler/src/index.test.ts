import { describe, expect, it } from "vitest";
import { analyzeOneStackSource, compileOneStack } from "./index.js";

describe("OneStack compiler", () => {
  it("builds universal IR and marks dynamic expressions", () => {
    const analysis = analyzeOneStackSource(`function App(){ return <main><h1>Hello</h1><p>{name()}</p></main> }`);
    expect(analysis.ir).toHaveLength(1);
    expect(analysis.ir[0].kind).toBe("element");
    expect(analysis.ir[0].static).toBe(false);
  });

  it("emits the OneStack JSX runtime", () => {
    const result = compileOneStack(`export const App = () => <Button>Go</Button>`);
    expect(result.code).toContain("@onestack/core/jsx-runtime");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("discovers server boundaries", () => {
    const analysis = analyzeOneStackSource(`import { db } from './db.server'; const load = server(async () => db.all())`);
    expect(analysis.serverImports).toEqual(["./db.server"]);
    expect(analysis.serverFunctionCount).toBe(1);
  });
});
