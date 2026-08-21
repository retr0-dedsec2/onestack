import { onDesktopEvent, type DesktopEventListener } from "./events.js";
import { isDesktopHost } from "./ipc.js";

export const desktop = {
  get available() { return isDesktopHost(); },
  on<T = unknown>(name: string, listener: DesktopEventListener<T>) {
    return onDesktopEvent("desktop", name, listener);
  },
};
