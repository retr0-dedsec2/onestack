import { onDesktopEvent, type DesktopEventListener } from "./events.js";
import { invokeDesktop } from "./ipc.js";
import type { UpdateCheckResult, UpdateManifest } from "./types.js";

let endpoint: string | undefined;
let pendingUpdate: UpdateManifest | undefined;

export const updater = {
  configure(options: { endpoint: string }) { endpoint = options.endpoint; },
  async check(options: { endpoint?: string } = {}) {
    const result = await invokeDesktop<UpdateCheckResult>("updater", "check", { endpoint: options.endpoint ?? endpoint });
    pendingUpdate = result.update;
    return result;
  },
  async download(update: UpdateManifest | undefined = pendingUpdate) {
    if (!update) throw new Error("OneStack updater: call check() or provide an update manifest first.");
    return invokeDesktop<{ path: string }>("updater", "download", { update }, 120_000);
  },
  async install(path?: string) {
    return invokeDesktop<void>("updater", "install", { path }, 120_000);
  },
  onProgress(listener: DesktopEventListener<{ received: number; total?: number }>) {
    return onDesktopEvent("updater", "progress", listener);
  },
};
