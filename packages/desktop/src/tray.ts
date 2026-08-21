import { onDesktopEvent, type DesktopEventListener } from "./events.js";
import { invokeDesktop } from "./ipc.js";
import type { TrayMenuEntry, TrayOptions } from "./types.js";

export class DesktopTray {
  constructor(readonly id: string) {}
  setMenu(menu: TrayMenuEntry[]) { return invokeDesktop<void>("tray", "setMenu", { id: this.id, menu }); }
  setTooltip(tooltip: string) { return invokeDesktop<void>("tray", "setTooltip", { id: this.id, tooltip }); }
  remove() { return invokeDesktop<void>("tray", "remove", { id: this.id }); }
  onAction(listener: DesktopEventListener<{ action: string }>) {
    return onDesktopEvent("tray", "action", listener, this.id);
  }
}

export const tray = {
  async create(options: TrayOptions = {}) {
    const result = await invokeDesktop<{ id: string }>("tray", "create", options);
    return new DesktopTray(result.id);
  },
};
