import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { flattenPermissions, type DesktopPermissions } from "@onestack/desktop";

interface DesktopProjectConfig {
  app?: { name?: string; version?: string; identifier?: string };
  window?: Record<string, unknown>;
  permissions?: DesktopPermissions;
  updater?: { endpoint?: string };
}

type DesktopManifest = ReturnType<typeof writeDesktopManifest>;

function readJson(path: string) { return JSON.parse(readFileSync(path, "utf8")) as Record<string, any>; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "onestack-app"; }
function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function nativeArch() { return process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "i386" : "amd64"; }

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
  const directory = resolve(root, ".onestack"); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "desktop.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(directory, "permissions.json"), JSON.stringify({ permissions: manifest.permissions, filesystem: manifest.filesystem }, null, 2));
  return manifest;
}

function nativeCargoManifest(root: string) {
  const candidates = [resolve(root, "packages/desktop/native/Cargo.toml"), resolve(root, "node_modules/@onestack/desktop/native/Cargo.toml"), resolve(dirname(fileURLToPath(import.meta.url)), "../../desktop/native/Cargo.toml")];
  const found = candidates.find(existsSync);
  if (!found) throw new Error("OneStack desktop host Cargo.toml could not be located. Install @onestack/desktop.");
  return found;
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; quiet?: boolean } = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: options.quiet ? "pipe" : "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  return result;
}

function platformDir() { return process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux"; }
function binaryName() { return process.platform === "win32" ? "onestack-desktop-host.exe" : "onestack-desktop-host"; }
function packagedBinaryName(manifest: DesktopManifest) { return process.platform === "win32" ? `${manifest.app.name}.exe` : manifest.app.name.replace(/\s+/g, "-"); }

export function runDesktopDev(root: string, viteArgs: string[]) {
  const manifestPath = resolve(root, ".onestack/desktop.json");
  const devUrl = "http://127.0.0.1:5173";
  writeDesktopManifest(root, { devUrl });
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const vite = spawn(pnpm, ["exec", "vite", "--host", "127.0.0.1", "--port", "5173", ...viteArgs], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
  const host = spawn(cargo, ["run", "--manifest-path", nativeCargoManifest(root)], { cwd: root, stdio: "inherit", env: { ...process.env, ONESTACK_DESKTOP_MANIFEST: manifestPath }, shell: process.platform === "win32" });
  const stop = (code = 0) => { if (!vite.killed) vite.kill(); if (!host.killed) host.kill(); process.exit(code); };
  host.on("exit", (code) => stop(code ?? 0)); vite.on("exit", (code) => { if (code && code !== 0) stop(code); });
  process.on("SIGINT", () => stop(130)); process.on("SIGTERM", () => stop(143));
}

export function buildDesktop(root: string, viteArgs: string[], strictPackaging = false) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  run(pnpm, ["exec", "vite", "build", ...viteArgs], { cwd: root });
  const cargoManifest = nativeCargoManifest(root);
  run(process.platform === "win32" ? "cargo.exe" : "cargo", ["build", "--release", "--manifest-path", cargoManifest], { cwd: root });
  const nativeTarget = resolve(dirname(cargoManifest), "target/release", binaryName());
  const manifest = writeDesktopManifest(root, { assets: "assets" });
  const outputRoot = resolve(root, "dist/desktop", platformDir());
  rmSync(outputRoot, { recursive: true, force: true }); mkdirSync(outputRoot, { recursive: true });

  if (process.platform === "darwin") stageMac(root, outputRoot, nativeTarget, manifest);
  else stagePortable(root, outputRoot, nativeTarget, manifest);

  const artifacts = packageDesktop(outputRoot, manifest, strictPackaging);
  signDesktop(outputRoot, manifest, artifacts, strictPackaging);
  console.log(`OneStack desktop build: ${outputRoot}`);
}

function copyWebDist(root: string, destination: string) {
  const webDist = resolve(root, "dist"); mkdirSync(destination, { recursive: true });
  for (const entry of ["index.html", "assets"]) { const source = resolve(webDist, entry); if (existsSync(source)) cpSync(source, resolve(destination, entry), { recursive: true }); }
}

function stagePortable(root: string, outputRoot: string, nativeTarget: string, manifest: DesktopManifest) {
  copyFileSync(nativeTarget, resolve(outputRoot, packagedBinaryName(manifest)));
  if (process.platform !== "win32") chmodSync(resolve(outputRoot, packagedBinaryName(manifest)), 0o755);
  copyWebDist(root, resolve(outputRoot, "assets"));
  mkdirSync(resolve(outputRoot, ".onestack"), { recursive: true });
  copyFileSync(resolve(root, ".onestack/desktop.json"), resolve(outputRoot, ".onestack/desktop.json"));
}

function stageMac(root: string, outputRoot: string, nativeTarget: string, manifest: DesktopManifest) {
  const app = resolve(outputRoot, `${manifest.app.name}.app`);
  const contents = resolve(app, "Contents"); const macos = resolve(contents, "MacOS"); const resources = resolve(contents, "Resources");
  mkdirSync(macos, { recursive: true }); mkdirSync(resolve(resources, ".onestack"), { recursive: true });
  const binary = resolve(macos, packagedBinaryName(manifest)); copyFileSync(nativeTarget, binary); chmodSync(binary, 0o755);
  copyWebDist(root, resolve(resources, "assets"));
  copyFileSync(resolve(root, ".onestack/desktop.json"), resolve(resources, ".onestack/desktop.json"));
  writeFileSync(resolve(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleDisplayName</key><string>${xml(manifest.app.name)}</string><key>CFBundleExecutable</key><string>${xml(packagedBinaryName(manifest))}</string><key>CFBundleIdentifier</key><string>${xml(manifest.app.identifier)}</string><key>CFBundleName</key><string>${xml(manifest.app.name)}</string><key>CFBundleShortVersionString</key><string>${xml(manifest.app.version)}</string><key>CFBundleVersion</key><string>${xml(manifest.app.version)}</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
}

function toolExists(command: string, args = ["--version"]) { try { return spawnSync(command, args, { stdio: "ignore", shell: process.platform === "win32" }).status === 0; } catch { return false; } }

function packageDesktop(outputRoot: string, manifest: DesktopManifest, strict: boolean) {
  const artifacts: string[] = [];
  const warnOrThrow = (message: string) => { if (strict) throw new Error(message); console.warn(`OneStack packaging: ${message}`); };
  if (process.platform === "darwin") {
    const app = resolve(outputRoot, `${manifest.app.name}.app`); artifacts.push(app);
    if (!toolExists("hdiutil", ["help"])) { warnOrThrow("hdiutil is unavailable; .app was built but .dmg was skipped."); return artifacts; }
    const dmg = resolve(dirname(outputRoot), `${manifest.app.name}-${manifest.app.version}.dmg`);
    run("hdiutil", ["create", "-volname", manifest.app.name, "-srcfolder", app, "-ov", "-format", "UDZO", dmg]); artifacts.push(dmg); return artifacts;
  }
  if (process.platform === "linux") {
    const appSlug = slug(manifest.app.name); const version = manifest.app.version; const arch = nativeArch();
    const debRoot = mkdtempSync(join(tmpdir(), "onestack-deb-"));
    mkdirSync(resolve(debRoot, "DEBIAN"), { recursive: true }); mkdirSync(resolve(debRoot, "usr/lib", appSlug), { recursive: true }); mkdirSync(resolve(debRoot, "usr/bin"), { recursive: true });
    cpSync(outputRoot, resolve(debRoot, "usr/lib", appSlug), { recursive: true });
    const launcher = resolve(debRoot, "usr/bin", appSlug); writeFileSync(launcher, `#!/bin/sh\nexec /usr/lib/${appSlug}/${packagedBinaryName(manifest)} "$@"\n`); chmodSync(launcher, 0o755);
    writeFileSync(resolve(debRoot, "DEBIAN/control"), `Package: ${appSlug}\nVersion: ${version}\nArchitecture: ${arch}\nMaintainer: OneStack\nDescription: ${manifest.app.name} built with OneStack\n`);
    const deb = resolve(dirname(outputRoot), `${appSlug}_${version}_${arch}.deb`);
    if (toolExists("dpkg-deb")) { run("dpkg-deb", ["--build", debRoot, deb]); artifacts.push(deb); } else warnOrThrow("dpkg-deb is unavailable; .deb packaging was skipped.");
    rmSync(debRoot, { recursive: true, force: true });

    if (toolExists("appimagetool")) {
      const appDir = mkdtempSync(join(tmpdir(), "onestack-appdir-")); const libDir = resolve(appDir, "usr/lib", appSlug); mkdirSync(libDir, { recursive: true }); cpSync(outputRoot, libDir, { recursive: true });
      const appRun = resolve(appDir, "AppRun"); writeFileSync(appRun, `#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/usr/lib/${appSlug}/${packagedBinaryName(manifest)}" "$@"\n`); chmodSync(appRun, 0o755);
      writeFileSync(resolve(appDir, `${appSlug}.desktop`), `[Desktop Entry]\nType=Application\nName=${manifest.app.name}\nExec=${appSlug}\nIcon=${appSlug}\nCategories=Utility;\n`);
      writeFileSync(resolve(appDir, `${appSlug}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="28" fill="#111114"/><path d="M32 38h64v14H48v12h40v14H48v12h48v14H32z" fill="white"/></svg>`);
      const appImage = resolve(dirname(outputRoot), `${manifest.app.name}-${version}-${process.arch}.AppImage`); run("appimagetool", [appDir, appImage]); artifacts.push(appImage); rmSync(appDir, { recursive: true, force: true });
    } else warnOrThrow("appimagetool is unavailable; AppImage packaging was skipped.");
    artifacts.push(resolve(outputRoot, packagedBinaryName(manifest))); return artifacts;
  }
  if (process.platform === "win32") {
    const exe = resolve(outputRoot, packagedBinaryName(manifest)); artifacts.push(exe);
    if (!toolExists("wix", ["--version"])) { warnOrThrow("WiX CLI is unavailable; executable was built but .msi packaging was skipped."); return artifacts; }
    const wxs = resolve(outputRoot, "onestack.wxs");
    writeFileSync(wxs, `<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"><Package Name="${xml(manifest.app.name)}" Manufacturer="OneStack" Version="${xml(manifest.app.version)}" UpgradeCode="00000000-0000-0000-0000-000000000001"><MajorUpgrade DowngradeErrorMessage="A newer version is already installed."/><MediaTemplate EmbedCab="yes"/><StandardDirectory Id="ProgramFilesFolder"><Directory Id="INSTALLFOLDER" Name="${xml(manifest.app.name)}"><Files Include="**"><Exclude Files="**\\*.wxs"/><Exclude Files="**\\*.msi"/></Files></Directory></StandardDirectory></Package></Wix>`);
    const msi = resolve(dirname(outputRoot), `${manifest.app.name}-${manifest.app.version}.msi`);
    try { run("wix", ["build", basename(wxs), "-o", msi], { cwd: outputRoot }); artifacts.push(msi); } catch (error) { warnOrThrow(`WiX packaging failed: ${error instanceof Error ? error.message : error}`); }
    return artifacts;
  }
  return artifacts;
}

function signDesktop(outputRoot: string, manifest: DesktopManifest, artifacts: string[], strict: boolean) {
  const warnOrThrow = (message: string) => { if (strict) throw new Error(message); console.warn(`OneStack signing: ${message}`); };
  if (process.platform === "darwin") {
    const identity = process.env.ONESTACK_MACOS_SIGN_IDENTITY;
    const app = resolve(outputRoot, `${manifest.app.name}.app`);
    if (identity) run("codesign", ["--deep", "--force", "--options", "runtime", "--sign", identity, app]);
    else if (strict) warnOrThrow("ONESTACK_MACOS_SIGN_IDENTITY is required for a signed release.");
    const profile = process.env.ONESTACK_MACOS_NOTARY_PROFILE; const dmg = artifacts.find((item) => item.endsWith(".dmg"));
    if (profile && dmg) run("xcrun", ["notarytool", "submit", dmg, "--keychain-profile", profile, "--wait"]);
    return;
  }
  if (process.platform === "win32") {
    const thumbprint = process.env.ONESTACK_WINDOWS_CERTIFICATE_SHA1;
    if (!thumbprint) { if (strict) warnOrThrow("ONESTACK_WINDOWS_CERTIFICATE_SHA1 is required for a signed release."); return; }
    for (const artifact of artifacts.filter((item) => /\.(?:exe|msi)$/i.test(item))) run("signtool", ["sign", "/sha1", thumbprint, "/fd", "SHA256", "/tr", "http://timestamp.digicert.com", "/td", "SHA256", artifact]);
  }
}

export function previewDesktop(root: string) {
  const config = readDesktopConfig(root); const pkg = readJson(resolve(root, "package.json")); const name = config.app?.name ?? pkg.productName ?? pkg.name ?? "OneStack App";
  const manifest = { app: { name } } as DesktopManifest; const platform = platformDir(); const dir = resolve(root, "dist/desktop", platform);
  if (!existsSync(dir)) throw new Error("No desktop build found. Run onestack build --target desktop first.");
  const executable = process.platform === "darwin" ? resolve(dir, `${name}.app/Contents/MacOS`, packagedBinaryName(manifest)) : resolve(dir, packagedBinaryName(manifest));
  const child: ChildProcess = spawn(executable, [], { cwd: dirname(executable), stdio: "inherit" }); child.on("exit", (code) => process.exit(code ?? 0));
}
