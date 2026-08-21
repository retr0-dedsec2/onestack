import { onDesktopEvent, type DesktopEventListener } from "./events.js";
import { invokeDesktop } from "./ipc.js";
import type { WindowOptions } from "./types.js";

function currentWindowId() {
  return (globalThis as unknown as { __ONESTACK_DESKTOP_WINDOW_ID__?: string }).__ONESTACK_DESKTOP_WINDOW_ID__ ?? "main";
}

export class DesktopWindow {
  constructor(readonly id: string) {}

  minimize() { return invokeDesktop<void>("window", "minimize", { id: this.id }); }
  maximize() { return invokeDesktop<void>("window", "maximize", { id: this.id }); }
  unmaximize() { return invokeDesktop<void>("window", "unmaximize", { id: this.id }); }
  center() { return invokeDesktop<void>("window", "center", { id: this.id }); }
  show() { return invokeDesktop<void>("window", "show", { id: this.id }); }
  hide() { return invokeDesktop<void>("window", "hide", { id: this.id }); }
  focus() { return invokeDesktop<void>("window", "focus", { id: this.id }); }
  close() { return invokeDesktop<void>("window", "close", { id: this.id }); }
  setTitle(title: string) { return invokeDesktop<void>("window", "setTitle", { id: this.id, title }); }
  setFullscreen(fullscreen: boolean) { return invokeDesktop<void>("window", "setFullscreen", { id: this.id, fullscreen }); }
  setAlwaysOnTop(alwaysOnTop: boolean) { return invokeDesktop<void>("window", "setAlwaysOnTop", { id: this.id, alwaysOnTop }); }
  setSize(width: number, height: number) { return invokeDesktop<void>("window", "setSize", { id: this.id, width, height }); }
  on<T = unknown>(name: string, listener: DesktopEventListener<T>) {
    return onDesktopEvent("window", name, listener, this.id);
  }
}

export const windowApi = {
  current() { return new DesktopWindow(currentWindowId()); },
  async create(options: WindowOptions = {}) {
    const result = await invokeDesktop<{ id: string }>("window", "create", options);
    return new DesktopWindow(result.id);
  },
  async getAll() {
    const ids = await invokeDesktop<string[]>("window", "list", {});
    return ids.map((id) => new DesktopWindow(id));
  },
  on<T = unknown>(name: string, listener: DesktopEventListener<T>) {
    return onDesktopEvent("window", name, listener);
  },
};

export { windowApi as window };
