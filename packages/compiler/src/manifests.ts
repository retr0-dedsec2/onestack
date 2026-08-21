import { analyzeOneStackSource } from "./index.js";

export interface SourceModule {
  path: string;
  source: string;
}

export interface RouteManifestEntry {
  file: string;
  path: string;
  layout: boolean;
}

export interface ServerManifestEntry {
  file: string;
  functionCount: number;
  serverImports: string[];
}

function normalizeRoute(file: string, routesDir = "src/routes") {
  let relative = file.replace(/\\/g, "/");
  const marker = `${routesDir.replace(/\\/g, "/").replace(/\/$/, "")}/`;
  const markerIndex = relative.indexOf(marker);
  if (markerIndex >= 0) relative = relative.slice(markerIndex + marker.length);
  relative = relative.replace(/\.(?:t|j)sx?$/, "");
  const segments = relative.split("/").filter(Boolean);
  const layout = segments.at(-1) === "layout";
  if (segments.at(-1) === "index" || layout) segments.pop();
  const mapped = segments.map((segment) => {
    const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
    if (optionalCatchAll) return `*${optionalCatchAll[1]}?`;
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
    if (catchAll) return `*${catchAll[1]}`;
    const dynamic = segment.match(/^\[(.+)\]$/);
    if (dynamic) return `:${dynamic[1]}`;
    return segment;
  });
  return { path: `/${mapped.join("/")}`.replace(/\/$/, "") || "/", layout };
}

export function generateRouteManifest(files: string[], routesDir = "src/routes"): RouteManifestEntry[] {
  return files
    .filter((file) => /\.(?:t|j)sx?$/.test(file) && file.replace(/\\/g, "/").includes(`${routesDir.replace(/\\/g, "/")}/`))
    .map((file) => ({ file, ...normalizeRoute(file, routesDir) }))
    .sort((a, b) => a.path.localeCompare(b.path) || Number(b.layout) - Number(a.layout));
}

export function generateServerManifest(modules: SourceModule[]): ServerManifestEntry[] {
  return modules
    .map(({ path, source }) => {
      const analysis = analyzeOneStackSource(source, path);
      return { file: path, functionCount: analysis.serverFunctionCount, serverImports: analysis.serverImports };
    })
    .filter((entry) => entry.functionCount > 0 || entry.serverImports.length > 0);
}
