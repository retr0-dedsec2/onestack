export type PermissionToggle<T extends string> = boolean | Partial<Record<T, boolean>>;

export interface OneStackFilesystemPermissions {
  read?: boolean | string[];
  write?: boolean | string[];
}

export interface OneStackDesktopPermissions {
  filesystem?: OneStackFilesystemPermissions;
  clipboard?: PermissionToggle<"read" | "write">;
  notifications?: PermissionToggle<"show">;
  window?: PermissionToggle<"create" | "control">;
  shell?: boolean | { externalUrls?: boolean; revealFile?: boolean };
  tray?: PermissionToggle<"create">;
  system?: PermissionToggle<"info">;
  updater?: PermissionToggle<"check" | "download" | "install">;
}

export interface OneStackAppConfig {
  name?: string;
  version?: string;
  identifier?: string;
}

export interface OneStackDesktopConfig {
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
  permissions?: OneStackDesktopPermissions;
  updater?: { endpoint?: string };
}

export interface OneStackConfig {
  app?: OneStackAppConfig;
  desktop?: OneStackDesktopConfig;
}

export function defineConfig<T extends OneStackConfig>(config: T): T {
  return config;
}
