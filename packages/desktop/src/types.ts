export type DesktopOS = "windows" | "macos" | "linux" | "unknown";
export type DesktopArch = "x64" | "arm64" | "x86" | "other";

export type DesktopNamespace =
  | "filesystem"
  | "window"
  | "clipboard"
  | "notifications"
  | "dialog"
  | "tray"
  | "shell"
  | "system"
  | "updater";

export interface DesktopRequest<T = unknown> {
  protocol: "onestack.desktop.v1";
  id: string;
  namespace: DesktopNamespace;
  command: string;
  payload: T;
}

export interface DesktopBridgeError {
  code: string;
  message: string;
  details?: unknown;
}

export interface DesktopResponse<T = unknown> {
  protocol: "onestack.desktop.v1";
  id: string;
  ok: boolean;
  value?: T;
  error?: DesktopBridgeError;
}

export interface DesktopEvent<T = unknown> {
  protocol: "onestack.desktop.v1";
  scope: "desktop" | "window" | "tray" | "notification" | "updater";
  name: string;
  target?: string;
  payload?: T;
}

export interface PlatformInfo {
  os: DesktopOS;
  arch: DesktopArch;
  version?: string;
  appVersion?: string;
}

export interface WindowOptions {
  title?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
  fullscreen?: boolean;
  alwaysOnTop?: boolean;
  transparent?: boolean;
  frameless?: boolean;
  decorations?: boolean;
  route?: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileOptions {
  multiple?: boolean;
  directory?: string;
  filters?: FileFilter[];
}

export interface SaveFileOptions {
  defaultName?: string;
  directory?: string;
  filters?: FileFilter[];
}

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  sound?: boolean;
  timeoutMs?: number;
}

export type TrayMenuEntry =
  | { type: "separator" }
  | { label: string; action: string; enabled?: boolean };

export interface TrayOptions {
  icon?: string;
  tooltip?: string;
  title?: string;
  menu?: TrayMenuEntry[];
}

export interface UpdateManifest {
  version: string;
  url: string;
  sha256?: string;
  notes?: string;
  signature?: string;
}

export interface UpdateCheckResult {
  available: boolean;
  currentVersion?: string;
  update?: UpdateManifest;
}
