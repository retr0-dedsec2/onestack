import { analyzeOneStackSource } from "@onestack/compiler";

export type Portability = "universal" | "web-compatible" | "needs-adaptation" | "unsupported";

export interface ComponentRegistryEntry {
  name: string;
  files: Record<string, string>;
  dependencies?: string[];
  description?: string;
}

export interface CompatibilityIssue {
  code: string;
  message: string;
  portability: Portability;
}

export interface CompatibilityReport {
  portability: Portability;
  issues: CompatibilityIssue[];
  serverFunctionCount: number;
}

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
  const portability = issues.reduce<Portability>((current, issue) =>
    order.indexOf(issue.portability) > order.indexOf(current) ? issue.portability : current,
  "universal");

  return { portability, issues, serverFunctionCount: analysis.serverFunctionCount };
}

export function createRegistry(entries: ComponentRegistryEntry[] = []) {
  const registry = new Map(entries.map((entry) => [entry.name, entry]));
  return {
    add(entry: ComponentRegistryEntry) {
      if (registry.has(entry.name)) throw new Error(`OneStack registry: ${entry.name} already exists.`);
      registry.set(entry.name, entry);
    },
    get(name: string) {
      return registry.get(name);
    },
    list() {
      return [...registry.values()];
    },
  };
}
