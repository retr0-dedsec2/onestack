import { invokeDesktop } from "./ipc.js";
import type { OpenFileOptions, SaveFileOptions } from "./types.js";

export const dialog = {
  openFile(options: OpenFileOptions = {}) {
    return invokeDesktop<string[] | null>("dialog", "openFile", options);
  },
  openDirectory(directory?: string) {
    return invokeDesktop<string | null>("dialog", "openDirectory", { directory });
  },
  saveFile(options: SaveFileOptions = {}) {
    return invokeDesktop<string | null>("dialog", "saveFile", options);
  },
};
