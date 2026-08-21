export { desktop } from "./desktop.js";
export { filesystem } from "./filesystem.js";
export { window, DesktopWindow } from "./window.js";
export { clipboard } from "./clipboard.js";
export { notifications } from "./notifications.js";
export { dialog } from "./dialog.js";
export { tray, DesktopTray } from "./tray.js";
export { shell } from "./shell.js";
export { platform } from "./platform.js";
export { updater } from "./updater.js";
export { DesktopError } from "./errors.js";
export { flattenPermissions, type DesktopPermissions } from "./permissions.js";
export type {
  DesktopArch,
  DesktopBridgeError,
  DesktopEvent,
  DesktopOS,
  FileFilter,
  NotificationOptions,
  OpenFileOptions,
  PlatformInfo,
  SaveFileOptions,
  TrayMenuEntry,
  TrayOptions,
  UpdateCheckResult,
  UpdateManifest,
  WindowOptions,
} from "./types.js";
