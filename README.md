# OneStack

OneStack is an experimental universal full-stack TypeScript/JSX application framework.

> Write the product once. Choose where it runs.

## v0.1 foundation

The current branch contains a working framework foundation without React as the application runtime:

- custom JSX runtime and platform-agnostic VNodes
- fine-grained signals, computed values, effects, batching and untracked reads
- reactive DOM renderer
- keyed `<For>` lists that preserve mounted nodes/state while updating item/index signals
- deterministic SSR with client hydration markers and real `hydrate()` reuse
- renderer-neutral Universal IR analysis
- route and server manifest generation
- token-aware portable styles and utility bridge
- file routing and dynamic/catch-all matching
- server functions + transport-neutral typed RPC
- universal UI primitives
- component portability analysis and React/shadcn-style source conversion
- executable CLI with `dev`, `build`, `preview`, `check`, `add`, and `import`

## CLI

```bash
onestack check
onestack dev
onestack build
onestack preview
onestack add button
onestack import ./external/hero.tsx
```

`check`, `dev`, and `build` generate `.onestack/routes.json` and `.onestack/server.json` from the source tree. `dev`, `build`, and `preview` delegate to the project's local Vite installation, so OneStack owns the application model/compiler/runtime while using Vite as the v0.1 bundling transport.

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

Server:

```ts
const { html } = renderToString(<App />);
```

Client:

```ts
hydrate(<App />, document.querySelector("#app")!);
```

The client reuses SSR host elements and reactive boundaries instead of replacing the entire DOM tree.

## Component import bridge

`onestack import` performs a real source conversion for the portable subset: it removes React runtime imports, maps common shadcn UI primitives to `@onestack/ui`, rewrites `className` to `class`, and emits a portability report. Browser-only, Canvas/WebGL, raw-HTML, and dynamic-code patterns are flagged rather than silently pretending to be native-portable.

## Platform roadmap

The v0.1 target is a stable web/full-stack core. Desktop and native mobile renderers will consume the same component model, signals, Style IR, route/server manifests, and Universal IR; they are separate renderer/host milestones rather than fake wrappers hidden behind the CLI.
