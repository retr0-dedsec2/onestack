# OneStack

OneStack is an experimental universal full-stack TypeScript/JSX application framework.

> Write the product once. Choose where it runs.

## v0.1 bootstrap

The current v0.1 branch now contains the first end-to-end framework foundations without React as the application runtime.

### Runtime

- custom JSX runtime and platform-agnostic VNodes
- fine-grained signals, computed values, effects, batching and untracked reads
- reactive DOM renderer, functional components, fragments, refs and events
- keyed reconciliation planner using a longest-increasing-subsequence strategy

### Compiler and design

- TypeScript/TSX compiler entry point targeting the OneStack JSX runtime
- renderer-neutral Universal IR analysis
- server/client boundary discovery
- portable Style IR primitives, theme tokens, CSS serialization and Tailwind-like utility conversion

### Application framework

- file-route conversion and dynamic/catch-all matching
- history-aware router runtime
- deterministic SSR markup and hydration markers
- server-function registry
- typed transport-neutral RPC stubs/handlers
- first universal UI primitives (`View`, `Text`, `Button`, `Stack`, `Grid`, forms and more)
- component registry plus portability analysis for imported JSX/components
- executable `onestack` CLI foundation with `dev`, `build`, `preview`, `check`, `add` and `import` commands registered

## Run the current example

```bash
pnpm install
pnpm --filter @onestack/example-counter dev
```

Then open the Vite URL shown in the terminal.

## Example

```tsx
import { createComputed, createSignal } from "@onestack/core";
import { render } from "@onestack/dom";
import { Button, Stack, Text } from "@onestack/ui";

function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createComputed(() => count() * 2);

  return (
    <Stack>
      <Text>Count: {count}</Text>
      <Text>Doubled: {doubled}</Text>
      <Button onClick={() => setCount((value) => value + 1)}>Increment</Button>
    </Stack>
  );
}

render(<Counter />, document.querySelector("#app")!);
```

## Current architecture

```text
TS/TSX
  |
  v
OneStack compiler -----> Universal IR
  |                         |
  |                         +--> DOM renderer
  |                         +--> SSR renderer
  |                         +--> future desktop renderer
  |                         +--> future native renderer
  |
  +--> route manifest
  +--> style IR
  +--> server-function manifest --> RPC
```

## Next implementation work

The foundations are now represented in code, but several pieces are intentionally not production-complete yet. Next work is to wire keyed reconciliation into live dynamic DOM lists, turn registered CLI commands into a real dev/build pipeline, generate route/server manifests from the compiler, add actual client hydration, and make the registry importer rewrite compatible 21st.dev/shadcn-style components into OneStack primitives.
