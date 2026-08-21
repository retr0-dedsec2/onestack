import { invokeDesktop } from "./ipc.js";

export interface FileStat {
  path: string;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  modifiedMs?: number;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
}

const portablePath = (kind: string) => invokeDesktop<string>("filesystem", "path", { kind });

export const filesystem = {
  readText(path: string) {
    return invokeDesktop<string>("filesystem", "readText", { path });
  },
  writeText(path: string, content: string) {
    return invokeDesktop<void>("filesystem", "writeText", { path, content });
  },
  async readBinary(path: string) {
    const bytes = await invokeDesktop<number[]>("filesystem", "readBinary", { path });
    return Uint8Array.from(bytes);
  },
  writeBinary(path: string, content: Uint8Array | number[]) {
    return invokeDesktop<void>("filesystem", "writeBinary", { path, content: Array.from(content) });
  },
  exists(path: string) {
    return invokeDesktop<boolean>("filesystem", "exists", { path });
  },
  stat(path: string) {
    return invokeDesktop<FileStat>("filesystem", "stat", { path });
  },
  mkdir(path: string, recursive = true) {
    return invokeDesktop<void>("filesystem", "mkdir", { path, recursive });
  },
  remove(path: string, recursive = false) {
    return invokeDesktop<void>("filesystem", "remove", { path, recursive });
  },
  rename(from: string, to: string) {
    return invokeDesktop<void>("filesystem", "rename", { from, to });
  },
  copy(from: string, to: string) {
    return invokeDesktop<void>("filesystem", "copy", { from, to });
  },
  readDir(path: string) {
    return invokeDesktop<DirectoryEntry[]>("filesystem", "readDir", { path });
  },
  paths: {
    home: () => portablePath("home"),
    documents: () => portablePath("documents"),
    downloads: () => portablePath("downloads"),
    desktop: () => portablePath("desktop"),
    appData: () => portablePath("appData"),
    cache: () => portablePath("cache"),
    temp: () => portablePath("temp"),
  },
};
