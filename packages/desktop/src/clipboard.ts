import { invokeDesktop } from "./ipc.js";

export const clipboard = {
  readText() { return invokeDesktop<string>("clipboard", "readText", {}); },
  writeText(text: string) { return invokeDesktop<void>("clipboard", "writeText", { text }); },
  clear() { return invokeDesktop<void>("clipboard", "clear", {}); },
};
