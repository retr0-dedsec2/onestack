import ts from "typescript";
import { analyzeOneStackSource } from "@onestack/compiler";

export type Portability = "universal" | "web-compatible" | "needs-adaptation" | "unsupported";
export interface ComponentRegistryEntry { name: string; files: Record<string, string>; dependencies?: string[]; description?: string; }
export interface CompatibilityIssue { code: string; message: string; portability: Portability; }
export interface CompatibilityReport { portability: Portability; issues: CompatibilityIssue[]; serverFunctionCount: number; }
export interface ImportResult { source: string; report: CompatibilityReport; convertedImports: string[]; warnings: string[]; }

const SHADCN_COMPONENTS = new Set(["Button","Card","Badge","Input","Textarea","Label","Separator"]);

export function analyzeComponentCompatibility(source: string): CompatibilityReport {
  const issues: CompatibilityIssue[] = [];
  const analysis = analyzeOneStackSource(source);
  const checks: Array<[RegExp, CompatibilityIssue]> = [
    [/\bdocument\b|\bwindow\b/, { code: "OSR100", message: "Browser DOM API detected.", portability: "web-compatible" }],
    [/\bcanvas\b|WebGL|three(?:\.js)?/i, { code: "OSR200", message: "Canvas/WebGL code needs a platform adapter.", portability: "needs-adaptation" }],
    [/dangerouslySetInnerHTML/, { code: "OSR300", message: "Raw HTML is not portable to native renderers.", portability: "needs-adaptation" }],
    [/\beval\s*\(|new Function\s*\(/, { code: "OSR900", message: "Dynamic code execution is unsupported by the registry importer.", portability: "unsupported" }],
  ];
  for (const [pattern, issue] of checks) if (pattern.test(source)) issues.push(issue);
  const order: Portability[] = ["universal", "web-compatible", "needs-adaptation", "unsupported"];
  const portability = issues.reduce<Portability>((current, issue) => order.indexOf(issue.portability) > order.indexOf(current) ? issue.portability : current, "universal");
  return { portability, issues, serverFunctionCount: analysis.serverFunctionCount };
}

export function convertComponentSource(source: string, fileName = "component.tsx"): ImportResult {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const convertedImports: string[] = [];
  const warnings: string[] = [];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  const uiNames = new Set<string>();

  sourceFile.statements.forEach((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return;
    const specifier = statement.moduleSpecifier.text;
    if (specifier === "react" || specifier.startsWith("react/")) {
      replacements.push({ start: statement.getFullStart(), end: statement.getEnd(), value: "" });
      convertedImports.push(specifier);
      return;
    }
    if (/components\/ui\//.test(specifier) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const element of statement.importClause.namedBindings.elements) {
        const name = element.name.text;
        if (SHADCN_COMPONENTS.has(name)) uiNames.add(name);
        else warnings.push(`Unmapped shadcn primitive: ${name}`);
      }
      replacements.push({ start: statement.getFullStart(), end: statement.getEnd(), value: "" });
      convertedImports.push(specifier);
    }
  });

  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "className") {
      replacements.push({ start: node.name.getStart(sourceFile), end: node.name.getEnd(), value: "class" });
    }
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(sourceFile) === "React" && ["Fragment"].includes(node.name.text)) {
      replacements.push({ start: node.getStart(sourceFile), end: node.getEnd(), value: node.name.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let output = source;
  replacements.sort((a, b) => b.start - a.start).forEach((replacement) => {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  });

  const imports: string[] = [];
  if (output.includes("Fragment") && !/from ["']@onestack\/core["']/.test(output)) imports.push(`import { Fragment } from "@onestack/core";`);
  if (uiNames.size) imports.push(`import { ${[...uiNames].sort().join(", ")} } from "@onestack/ui";`);
  if (imports.length) output = `${imports.join("\n")}\n${output.trimStart()}`;

  return { source: output, report: analyzeComponentCompatibility(output), convertedImports, warnings };
}

export function createRegistry(entries: ComponentRegistryEntry[] = []) {
  const registry = new Map(entries.map((entry) => [entry.name, entry]));
  return {
    add(entry: ComponentRegistryEntry) { if (registry.has(entry.name)) throw new Error(`OneStack registry: ${entry.name} already exists.`); registry.set(entry.name, entry); },
    get(name: string) { return registry.get(name); },
    list() { return [...registry.values()]; },
  };
}
