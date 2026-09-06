# OneStack

OneStack is an experimental universal full-stack TypeScript/JSX application framework.

> Write the product once. Choose where it runs.

## Current scope — v0.4

OneStack contains a web/full-stack core, hybrid desktop runtime, native Android/iOS hosts, SQL/auth/storage/payment adapters and deployment output generators, without React as the application runtime. See the [v0.4 guide](docs/v0.4/README.md) for supported capabilities and provider boundaries.

### Core framework

- custom JSX runtime and platform-agnostic VNodes
- fine-grained signals, computed values, effects, batching and untracked reads
- reactive DOM renderer
- keyed `<For>` lists that preserve mounted nodes/state
- deterministic SSR + client hydration
- renderer-neutral Universal IR analysis
- route and server manifest generation
- token-aware portable styles
- file routing and dynamic/catch-all matching
- server functions + transport-neutral typed RPC
- universal UI primitives with semantic/a11y foundations
- React/shadcn-style component source conversion

### Desktop v0.2

- `@onestack/desktop`
- Rust native host
- system WebViews through WRY/Tao
- Windows, macOS and Linux host targets
- typed `onestack.desktop.v1` IPC
- explicit native permissions
- filesystem + portable paths
- multiple windows
- native file dialogs
- clipboard
- notifications
- system tray
- safe shell helpers
- platform information
- update checking/download/install primitives
- Windows/macOS/Linux packaging flows
- signing/notarization hooks

The same OneStack components, signals, routes, styles and business logic are used by web and desktop applications.

## CLI

```bash
onestack check

onestack dev
onestack dev --target desktop

onestack build
onestack build --target desktop

onestack preview --target desktop
onestack release --target desktop

onestack add button
onestack import ./external/hero.tsx
```

`check`, `dev`, and `build` generate `.onestack/routes.json` and `.onestack/server.json`. Desktop commands additionally generate `.onestack/desktop.json` and `.onestack/permissions.json` for the native host.

## Configuration

```ts
import { defineConfig } from "@onestack/config";

export default defineConfig({
  app: {
    name: "My OneStack App",
    version: "1.0.0",
    identifier: "com.example.myapp",
  },

  desktop: {
    width: 1200,
    height: 800,
    resizable: true,

    permissions: {
      filesystem: {
        read: ["$documents", "$downloads"],
        write: ["$documents"],
      },
      clipboard: true,
      notifications: true,
      window: true,
      tray: true,
      system: true,
      shell: {
        externalUrls: true,
        revealFile: true,
      },
    },
  },
});
```

`onestack.desktop.json` remains supported for compatibility, but `onestack.config.ts` is the primary configuration format.

## Desktop APIs

```ts
import {
  filesystem,
  window,
  clipboard,
  notifications,
  dialog,
  tray,
  shell,
  platform,
  updater,
} from "@onestack/desktop";

const documents = await filesystem.paths.documents();
await filesystem.writeText(`${documents}/hello.txt`, "Hello from OneStack");

const settings = await window.create({
  title: "Settings",
  width: 900,
  height: 650,
  route: "/settings",
});

await notifications.show({
  title: "OneStack",
  body: "Desktop build complete",
});
```

Every native command is dispatched through a known IPC namespace and checked against the generated capability manifest before execution.

## Keyed lists

```tsx
import { For, createSignal } from "@onestack/core";

const [users, setUsers] = createSignal([{ id: "a", name: "Ada" }]);

<ul>
  <For each={users} by="id">
    {(user) => <li>{() => user().name}</li>}
  </For>
</ul>
```

## SSR + hydration

```ts
const { html } = renderToString(<App />);
```

```ts
hydrate(<App />, document.querySelector("#app")!);
```

The client reuses SSR host elements and reactive boundaries instead of replacing the entire DOM tree.

## Component import bridge

`onestack import` performs source conversion for the portable subset: it removes React runtime imports, maps common shadcn UI primitives to `@onestack/ui`, rewrites `className` to `class`, and emits a portability report. Browser-only, Canvas/WebGL, raw-HTML and dynamic-code patterns are flagged rather than silently pretending to be universally portable.

## Desktop packaging

`onestack build --target desktop` always builds the native host and application assets for the current OS.

Depending on the host platform and installed packaging tools, OneStack can produce:

- Windows: `.exe`, optional `.msi` through WiX
- macOS: `.app`, `.dmg`
- Linux: executable bundle, `.deb`, optional AppImage

`onestack release --target desktop` uses strict packaging/signing mode. Signing secrets are never stored in the repository; they are provided through environment variables / CI secrets.

## Verification

GitHub Actions validates:

- unit tests
- TypeScript typecheck
- JavaScript/package build
- Rust native host check
- Rust release build on Ubuntu, Windows and macOS

## Platform roadmap

- v0.1: web/full-stack core — shipped
- v0.2: hybrid desktop runtime — Windows/macOS/Linux
- v0.3: native mobile renderer + capability bridge — Android/iOS
- v0.4: production data/auth/storage/payment adapters and deployment presets

## v0.4 universal runtime and services

See the [v0.4 guide](docs/v0.4/README.md) for native Android/iOS builds, SQL/auth/storage/payment adapters, deployment presets, security boundaries and compatibility notes. The [universal example](examples/universal/README.md) demonstrates the shared UI and a real service-backed application.
