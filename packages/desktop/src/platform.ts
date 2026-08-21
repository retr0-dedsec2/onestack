import { invokeDesktop, isDesktopHost } from "./ipc.js";
import type { DesktopArch, DesktopOS, PlatformInfo } from "./types.js";

function detectOS(): DesktopOS {
  const value = typeof navigator === "undefined" ? "" : `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (value.includes("win")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("linux") || value.includes("x11")) return "linux";
  return "unknown";
}

function detectArch(): DesktopArch {
  const value = typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase();
  if (value.includes("arm64") || value.includes("aarch64")) return "arm64";
  if (value.includes("x86_64") || value.includes("x64") || value.includes("win64")) return "x64";
  if (value.includes("x86") || value.includes("i686")) return "x86";
  return "other";
}

let cached: PlatformInfo = { os: detectOS(), arch: detectArch() };

export const platform = {
  get os() { return cached.os; },
  get arch() { return cached.arch; },
  get appVersion() { return cached.appVersion; },
  async info() {
    if (!isDesktopHost()) return cached;
    cached = await invokeDesktop<PlatformInfo>("system", "info", {});
    return cached;
  },
};
