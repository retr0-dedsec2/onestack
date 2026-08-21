import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { flattenPermissions, type DesktopPermissions } from "@onestack/desktop";

interface DesktopProjectConfig {
  app?: { name?: string; version?: string; identifier?: string };
  window?: Record<string, unknown>;
  permissions?: DesktopPermissions;
  updater?: { endpoint?: string };
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
}

export function readDesktopConfig(root: string): DesktopProjectConfig {
  const path = resolve(root, "onestack.desktop.json");
  return existsSync(path) ? readJson(path) as DesktopProjectConfig : {};
}

export function writeDesktopManifest(root: string, options: { devUrl?: string; assets?: string } = {}) {
  const config = readDesktopConfig(root);
  const pkg = readJson(resolve(root, "package.json"));
  const permissions = config.permissions ?? {};
  const readScopes = Array.isArray(permissions.filesystem?.read) ? permissions.filesystem.read : permissions.filesystem?.read === true ? ["*"] : [];
  const writeScopes = Array.isArray(permissions.filesystem?.write) ? permissions.filesystem.write : permissions.filesystem?.write === true ? ["*"] : [];
  const appName = config.app?.name ?? pkg.productName ?? pkg.name ?? "OneStack App";
  const version = config.app?.version ?? pkg.version ?? "0.0.0";
  const identifier = config.app?.identifier ?? `dev.onestack.${String(pkg.name ?? "app").replace(/[^a-zA-Z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}`;
  const manifest = {
    app: { name: appName, version, identifier },
    window: { title: appName, width: 1200, height: 800, resizable: true, decorations: true, ...(config.window ?? {}) },
    permissions: flattenPermissions(permissions),
    filesystem: { read: readScopes, write: writeScopes },
    updater: config.updater ?? {},
    ...(options.devUrl ? { url: options.devUrl } : {}),
    ...(options.assets ? { assets: options.assets } : {}),
  };
  const directory = resolve(root, ".onestack");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "desktop.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(directory, "permissions.json"), JSON.stringify({ permissions: manifest.permissions, filesystem: manifest.filesystem }, null, 2));
  return manifest;
}

function nativeCargoManifest(root: string) {
  const candidates = [
    resolve(root, "packages/desktop/native/Cargo.toml"),
    resolve(root, "node_modules/@onestack/desktop/native/Cargo.toml"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../../desktop/native/Cargo.toml"),
  ];
  const found = candidates.find(existsSync);
  if (!found) throw new Error("OneStack desktop host Cargo.toml could not be located. Install @onestack/desktop.");
  return found;
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; quiet?: boolean } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.quiet ? "pipe" : "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  return result;
}

function platformDir() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "linux";
}

function binaryName() { return process.platform === "win32" ? "onestack-desktop-host.exe" : "onestack-desktop-host"; }

export function runDesktopDev(root: string, viteArgs: string[]) {
  const manifestPath = resolve(root, ".onestack/desktop.json");
  const devUrl = "http://127.0.0.1:5173";
  writeDesktopManifest(root, { devUrl });
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const vite = spawn(pnpm, ["exec", "vite", "--host", "127.0.0.1", "--port", "5173", ...viteArgs], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
  const host = spawn(cargo, ["run", "--manifest-path", nativeCargoManifest(root)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ONESTACK_DESKTOP_MANIFEST: manifestPath },
    shell: process.platform === "win32",
  });
  const stop = (code = 0) => { if (!vite.killed) vite.kill(); if (!host.killed) host.kill(); process.exit(code); };
  host.on("exit", (code) => stop(code ?? 0));
  vite.on("exit", (code) => { if (code && code !== 0) stop(code); });
  process.on("SIGINT", () => stop(130));
  process.on("SIGTERM", () => stop(143));
}

export function buildDesktop(root: string, viteArgs: string[], strictPackaging = false) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(pnpm, ["exec", "vite", "build", ...viteArgs], { cwd: root });
  const outputRoot = resolve(root, "dist/desktop", platformDir());
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(resolve(outputRoot, "assets"), { recursive: true });
  const webDist = resolve(root, "dist");
  for (const entry of ["index.html", "assets"]) {
    const source = resolve(webDist, entry);
    if (existsSync(source)) cpSync(source, resolve(outputRoot, "assets", entry), { recursive: true });
  }
  const manifest = writeDesktopManifest(root, { assets: "assets" });
  const cargoManifest = nativeCargoManifest(root);
  run(process.platform === "win32" ? "cargo.exe" : "cargo", ["build", "--release", "--manifest-path", cargoManifest], { cwd: root });
  const nativeTarget = resolve(dirname(cargoManifest), "target/release", binaryName());
  const executable = resolve(outputRoot, process.platform === "win32" ? `${manifest.app.name}.exe` : manifest.app.name.replace(/\s+/g, "-"));
  copyFileSync(nativeTarget, executable);
  mkdirSync(resolve(outputRoot, ".onestack"), { recursive: true });
  copyFileSync(resolve(root, ".onestack/desktop.json"), resolve(outputRoot, ".onestack/desktop.json"));
  packageDesktop(outputRoot, manifest, strictPackaging);
  console.log(`OneStack desktop build: ${outputRoot}`);
}

function toolExists(command: string, args = ["--version"]) {
  try { return spawnSync(command, args, { stdio: "ignore", shell: process.platform === "win32" }).status === 0; } catch { return false; }
}

function packageDesktop(outputRoot: string, manifest: any, strict: boolean) {
  const warnOrThrow = (message: string) => { if (strict) throw new Error(message); console.warn(`OneStack packaging: ${message}`); };
  if (process.platform === "darwin") {
    if (!toolExists("hdiutil", ["help"])) return warnOrThrow("hdiutil is unavailable; .app host is built but .dmg was skipped.");
    const dmg = join(dirname(outputRoot), `${manifest.app.name}.dmg`);
    run("hdiutil", ["create", "-volname", manifest.app.name, "-srcfolder", outputRoot, "-ov", "-format", "UDZO", dmg]);
    return;
  }
  if (process.platform === "linux") {
    const debRoot = join(outputRoot, ".deb-root");
    const appName = String(manifest.app.name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    mkdirSync(join(debRoot, "DEBIAN"), { recursive: true });
    mkdirSync(join(debRoot, "usr/lib", appName), { recursive: true });
    cpSync(outputRoot, join(debRoot, "usr/lib", appName), { recursive: true, filter: (src) => !src.includes(".deb-root") });
    writeFileSync(join(debRoot, "DEBIAN/control"), `Package: ${appName}\nVersion: ${manifest.app.version}\nArchitecture: amd64\nMaintainer: OneStack\nDescription: ${manifest.app.name} built with OneStack\n`);
    if (toolExists("dpkg-deb")) run("dpkg-deb", ["--build", debRoot, join(dirname(outputRoot), `${appName}_${manifest.app.version}_amd64.deb`)]);
    else warnOrThrow("dpkg-deb is unavailable; .deb packaging was skipped.");
    rmSync(debRoot, { recursive: true, force: true });
    if (!toolExists("appimagetool")) warnOrThrow("appimagetool is unavailable; AppImage packaging was skipped.");
    return;
  }
  if (process.platform === "win32") {
    if (!toolExists("wix", ["--version"])) return warnOrThrow("WiX CLI is unavailable; executable is built but .msi packaging was skipped.");
    const wxs = join(outputRoot, "onestack.wxs");
    const exe = `${manifest.app.name}.exe`;
    writeFileSync(wxs, `<Wix xmlns=\"http://wixtoolset.org/schemas/v4/wxs\"><Package Name=\"${manifest.app.name}\" Manufacturer=\"OneStack\" Version=\"${manifest.app.version}\" UpgradeCode=\"00000000-0000-0000-0000-000000000001\"><StandardDirectory Id=\"ProgramFilesFolder\"><Directory Id=\"INSTALLFOLDER\" Name=\"${manifest.app.name}\"><Component><File Source=\"${exe}\" /></Component></Directory></StandardDirectory><Feature Id=\"Main\"><ComponentGroupRef Id=\"ProductComponents\" /></Feature></Package></Wix>`);
    try { run("wix", ["build", wxs, "-o", join(dirname(outputRoot), `${manifest.app.name}.msi`)], { cwd: outputRoot }); }
    catch (error) { warnOrThrow(`WiX packaging failed: ${error instanceof Error ? error.message : error}`); }
  }
}

export function previewDesktop(root: string) {
  const platform = platformDir();
  const dir = resolve(root, "dist/desktop", platform);
  if (!existsSync(dir)) throw new Error("No desktop build found. Run onestack build --target desktop first.");
  const config = readDesktopConfig(root);
  const pkg = readJson(resolve(root, "package.json"));
  const name = config.app?.name ?? pkg.productName ?? pkg.name ?? "OneStack App";
  const executable = resolve(dir, process.platform === "win32" ? `${name}.exe` : String(name).replace(/\s+/g, "-"));
  const child: ChildProcess = spawn(executable, [], { cwd: dir, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}
