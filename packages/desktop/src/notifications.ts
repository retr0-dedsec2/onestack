import { onDesktopEvent, type DesktopEventListener } from "./events.js";
import { invokeDesktop } from "./ipc.js";
import type { NotificationOptions } from "./types.js";

export const notifications = {
  show(options: NotificationOptions) {
    return invokeDesktop<{ id: string }>("notifications", "show", options);
  },
  onClick(listener: DesktopEventListener<{ id?: string; action?: string }>) {
    return onDesktopEvent("notification", "click", listener);
  },
};
