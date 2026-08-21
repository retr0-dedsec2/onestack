import { invokeDesktop } from "./ipc.js";

export const shell = {
  openExternal(url: string) { return invokeDesktop<void>("shell", "openExternal", { url }); },
  revealFile(path: string) { return invokeDesktop<void>("shell", "revealFile", { path }); },
};
