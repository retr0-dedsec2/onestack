export interface DesktopPermissions {
  filesystem?: {
    read?: string[] | boolean;
    write?: string[] | boolean;
  };
  clipboard?: boolean | { read?: boolean; write?: boolean };
  notifications?: boolean | { show?: boolean };
  window?: boolean | { create?: boolean; control?: boolean };
  shell?: boolean | { externalUrls?: boolean; revealFile?: boolean };
  tray?: boolean | { create?: boolean };
  system?: boolean | { info?: boolean };
  updater?: boolean | { check?: boolean; download?: boolean; install?: boolean };
}

export function flattenPermissions(permissions: DesktopPermissions = {}): string[] {
  const output = new Set<string>();
  const addBoolean = (value: unknown, prefix: string, names: string[]) => {
    if (value === true) names.forEach((name) => output.add(`${prefix}.${name}`));
    else if (value && typeof value === "object") {
      for (const name of names) if ((value as Record<string, unknown>)[name] === true) output.add(`${prefix}.${name}`);
    }
  };
  const filesystem = permissions.filesystem;
  if (filesystem?.read === true || Array.isArray(filesystem?.read)) output.add("filesystem.read");
  if (filesystem?.write === true || Array.isArray(filesystem?.write)) output.add("filesystem.write");
  addBoolean(permissions.clipboard, "clipboard", ["read", "write"]);
  addBoolean(permissions.notifications, "notifications", ["show"]);
  addBoolean(permissions.window, "window", ["create", "control"]);
  if (permissions.shell === true) {
    output.add("shell.external");
    output.add("shell.revealFile");
  } else if (permissions.shell && typeof permissions.shell === "object") {
    if (permissions.shell.externalUrls) output.add("shell.external");
    if (permissions.shell.revealFile) output.add("shell.revealFile");
  }
  addBoolean(permissions.tray, "tray", ["create"]);
  addBoolean(permissions.system, "system", ["info"]);
  addBoolean(permissions.updater, "updater", ["check", "download", "install"]);
  return [...output].sort();
}
