import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import type { OneStackConfig } from "@onestack/config";

export function loadOneStackConfig(root: string): OneStackConfig | null {
  const tsPath = resolve(root, "onestack.config.ts");
  const jsPath = resolve(root, "onestack.config.js");
  const jsonPath = resolve(root, "onestack.config.json");
  if (existsSync(tsPath)) return evaluateConfig(readFileSync(tsPath, "utf8"), tsPath);
  if (existsSync(jsPath)) return evaluateConfig(readFileSync(jsPath, "utf8"), jsPath);
  if (existsSync(jsonPath)) return JSON.parse(readFileSync(jsonPath, "utf8")) as OneStackConfig;
  return null;
}

function evaluateConfig(source: string, fileName: string): OneStackConfig {
  const output = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  const blocking = output.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
  if (blocking.length) throw new Error(`OneStack config compile failed: ${blocking.map((item) => ts.flattenDiagnosticMessageText(item.messageText, " ")).join("; ")}`);
  const module = { exports: {} as any };
  const localRequire = (specifier: string) => {
    if (specifier === "@onestack/config") return { defineConfig: <T>(value: T) => value };
    throw new Error(`OneStack config may not import ${specifier}. Keep configuration deterministic and data-only.`);
  };
  const run = new Function("require", "module", "exports", output.outputText);
  run(localRequire, module, module.exports);
  return (module.exports.default ?? module.exports) as OneStackConfig;
}
