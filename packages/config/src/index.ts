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

export interface OneStackMobilePermissions {
  filesystem?: boolean;
  camera?: boolean;
  photos?: boolean;
  microphone?: boolean;
  clipboard?: boolean;
  notifications?: boolean;
  location?: boolean;
  haptics?: boolean;
  share?: boolean;
  system?: boolean;
  externalUrls?: boolean;
}

export interface OneStackMobileConfig {
  orientation?: "portrait" | "landscape" | "any";
  permissions?: OneStackMobilePermissions;
  deepLinks?: string[];
  icon?: string;
  splash?: string;
  allowWebViewFallback?: boolean;
  android?: { packageName?: string; minSdk?: number; targetSdk?: number };
  ios?: { bundleIdentifier?: string; deploymentTarget?: string };
}

export interface OneStackAdapterConfig { provider: string; [key: string]: unknown; }
export interface OneStackDeployConfig { provider?: "vercel" | "netlify" | "cloudflare" | "node" | "docker" | "static"; }

export interface OneStackConfig {
  /** Public API origin, never provider credentials. Empty means same-origin web requests. */
  api?: { origin?: string };
  app?: OneStackAppConfig;
  desktop?: OneStackDesktopConfig;
  mobile?: OneStackMobileConfig;
  data?: OneStackAdapterConfig;
  auth?: OneStackAdapterConfig;
  storage?: OneStackAdapterConfig;
  payments?: OneStackAdapterConfig;
  deploy?: OneStackDeployConfig;
}

export function defineConfig<T extends OneStackConfig>(config: T): T {
  return config;
}
