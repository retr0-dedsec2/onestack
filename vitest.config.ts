import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));
const source = (pkg: string, file = "index.ts") => resolve(root, `packages/${pkg}/src/${file}`);

export default defineConfig({
  resolve: {
    alias: [
      { find: "@onestack/core/jsx-dev-runtime", replacement: source("core", "jsx-dev-runtime.ts") },
      { find: "@onestack/core/jsx-runtime", replacement: source("core", "jsx-runtime.ts") },
      { find: "@onestack/core", replacement: source("core") },
      { find: "@onestack/reconciler", replacement: source("reconciler") },
      { find: "@onestack/compiler", replacement: source("compiler") },
      { find: "@onestack/styles", replacement: source("styles") },
      { find: "@onestack/router", replacement: source("router") },
      { find: "@onestack/ssr", replacement: source("ssr") },
      { find: "@onestack/server", replacement: source("server") },
      { find: "@onestack/rpc", replacement: source("rpc") },
      { find: "@onestack/ui", replacement: source("ui") },
      { find: "@onestack/registry", replacement: source("registry") },
      { find: "@onestack/cli", replacement: source("cli") }
    ]
  }
});
