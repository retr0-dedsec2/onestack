#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { generateRouteManifest, generateServerManifest, type SourceModule } from "@onestack/compiler";
import { convertComponentSource } from "@onestack/registry";
import { buildDesktop, previewDesktop, runDesktopDev, writeDesktopManifest } from "./desktop.js";
import { secureViteArgs } from "./vite.js";
import { runMobile } from "./mobile.js";
import { runServices } from "./services.js";
import { helpText, parseCli } from "./index.js";

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const output: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) output.push(...walk(path)); else output.push(path);
  }
  return output;
}

function writeManifests(root: string) {
  const files = walk(resolve(root, "src"));
  const sources: SourceModule[] = files.filter((file) => /\.(?:t|j)sx?$/.test(file)).map((file) => ({ path: file.slice(root.length + 1).replace(/\\/g, "/"), source: readFileSync(file, "utf8") }));
  const routeManifest = generateRouteManifest(sources.map((entry) => entry.path));
  const serverManifest = generateServerManifest(sources);
  const directory = resolve(root, ".onestack"); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "routes.json"), JSON.stringify(routeManifest, null, 2));
  writeFileSync(resolve(directory, "server.json"), JSON.stringify(serverManifest, null, 2));
  return { routes: routeManifest.length, serverModules: serverManifest.length };
}

function forwardedFlags(flags: Record<string, string | boolean>, ignored = new Set(["target"])) {
  return Object.entries(flags).filter(([key]) => !ignored.has(key)).flatMap(([key, value]) => value === true ? [`--${key}`] : [`--${key}`, String(value)]);
}

function runVite(command: "dev" | "build" | "preview", args: string[]) {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(executable, ["exec", "vite", command === "dev" ? undefined : command, ...args].filter((value): value is string => Boolean(value)), { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const parsed = parseCli(process.argv.slice(2));
const root = process.cwd();
if (parsed.command === "help") { console.log(helpText()); process.exit(0); }
if (!existsSync(resolve(root, "package.json"))) { console.error("OneStack: package.json not found in the current directory."); process.exit(1); }

if (["db", "auth", "deploy"].includes(parsed.command)) { await runServices(root, parsed); process.exit(0); }
const target = String(parsed.flags.target ?? "web");
if (!["web", "desktop", "android", "ios"].includes(target)) throw new Error(`Unknown target: ${target}`);
if (target === "android" || target === "ios") {
  if (!["build", "dev", "run", "release", "check"].includes(parsed.command)) throw new Error(`Unsupported mobile command: ${parsed.command}`);
  await runMobile(root, target, parsed.command, parsed.command === "check" ? { ...parsed.flags, "generate-only": true } : parsed.flags);
  process.exit(0);
}
if (parsed.command === "run") throw new Error("run requires --target android|ios");

if (parsed.command === "check") {
  const manifests = writeManifests(root); writeDesktopManifest(root);
  if (!existsSync(resolve(root, "src"))) { console.error("OneStack check failed: src/ directory is missing."); process.exit(1); }
  console.log(`OneStack check passed: ${manifests.routes} routes, ${manifests.serverModules} server modules, desktop manifest valid.`); process.exit(0);
}

if (parsed.command === "dev" || parsed.command === "build" || parsed.command === "preview" || parsed.command === "release") {
  const target = String(parsed.flags.target ?? "web");
  const args = secureViteArgs(root, forwardedFlags(parsed.flags));
  if (target === "desktop") {
    if (parsed.command !== "preview") writeManifests(root);
    if (parsed.command === "dev") runDesktopDev(root, args);
    else if (parsed.command === "preview") previewDesktop(root);
    else buildDesktop(root, args, parsed.command === "release");
  } else {
    if (parsed.command === "release") { console.error("OneStack release currently supports --target desktop."); process.exit(1); }
    if (parsed.command !== "preview") writeManifests(root);
    runVite(parsed.command, args);
  }
}

if (parsed.command === "import") {
  const input = parsed.args[0]; if (!input) { console.error("Usage: onestack import <file>"); process.exit(1); }
  const inputPath = resolve(root, input); if (!existsSync(inputPath)) { console.error(`OneStack import: ${input} not found.`); process.exit(1); }
  const converted = convertComponentSource(readFileSync(inputPath, "utf8"), basename(inputPath));
  const outDir = resolve(root, "src/components/imported"); mkdirSync(outDir, { recursive: true });
  const outputPath = resolve(outDir, `${basename(inputPath, extname(inputPath))}.tsx`); writeFileSync(outputPath, converted.source);
  console.log(`Imported ${input} -> ${outputPath.slice(root.length + 1)}`); console.log(`Portability: ${converted.report.portability}`);
  converted.warnings.forEach((warning) => console.warn(`Warning: ${warning}`)); process.exit(converted.report.portability === "unsupported" ? 2 : 0);
}

if (parsed.command === "add") {
  const name = parsed.args[0]; if (!name) { console.error("Usage: onestack add <component>"); process.exit(1); }
  const templates: Record<string, string> = {
    theme: `import { createDesignSystem } from "@onestack/ui";\n\nexport const { Screen, Stack, Row, Card, Title, Text, Caption, Button, Input, tokens } = createDesignSystem({ colors: { primary: "#3157d5" }, radius: 12 });\n`,
    button: `import { Button as PrimitiveButton } from "@onestack/ui";\n\nexport function Button(props: Record<string, unknown>) {\n  return <PrimitiveButton {...props} />;\n}\n`,
    card: `import { Card as PrimitiveCard } from "@onestack/ui";\n\nexport function Card(props: Record<string, unknown>) {\n  return <PrimitiveCard {...props} />;\n}\n`,
  };
  const template = templates[name.toLowerCase()]; if (!template) { console.error(`Unknown built-in component: ${name}. Available: ${Object.keys(templates).join(", ")}`); process.exit(1); }
  const outDir = resolve(root, "src/components/ui"); mkdirSync(outDir, { recursive: true });
  const outputPath = resolve(outDir, `${name.toLowerCase()}.tsx`); writeFileSync(outputPath, template); console.log(`Added ${name} -> ${outputPath.slice(root.length + 1)}`); process.exit(0);
}
