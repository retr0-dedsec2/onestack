# OneStack

OneStack is an experimental universal full-stack TypeScript/JSX application framework.

> Write the product once. Choose where it runs.

## v0.1 bootstrap

OneStack is being built without React as the application runtime. The current branch now contains two implementation milestones.

### Runtime foundation

- custom JSX runtime
- platform-agnostic VNode model
- fine-grained signals, computed values, effects, batching and untracked reads
- reactive DOM renderer
- functional components and fragments
- reactive children and reactive DOM props
- refs and DOM events

### Framework foundation

- `@onestack/reconciler`: keyed reconciliation planner with stable subsequence detection
- `@onestack/compiler`: TSX compilation through the OneStack JSX runtime plus Universal IR analysis and server-boundary discovery
- `@onestack/styles`: portable token resolution, Style IR primitives, CSS serialization and a first Tailwind-like utility bridge
- `@onestack/router`: file-route conversion, dynamic/catch-all matching and history-aware runtime router

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

function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createComputed(() => count() * 2);

  return (
    <main>
      <h1>OneStack</h1>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <button onClick={() => setCount((value) => value + 1)}>Increment</button>
    </main>
  );
}

render(<Counter />, document.querySelector("#app")!);
```

Signals can be passed directly as children; the DOM renderer binds them reactively without rerendering the whole component tree.

## Compiler example

```ts
import { compileOneStack } from "@onestack/compiler";

const result = compileOneStack(`
  export const App = () => <Button>Build once</Button>
`);

console.log(result.ir);
console.log(result.code);
```

The Universal IR is intentionally renderer-neutral. Future DOM, SSR, desktop and native renderers will consume the same semantic component tree rather than making application code depend directly on browser APIs.

## Next milestones

1. wire keyed reconciliation into dynamic DOM lists
2. add compile-time static hoisting and richer server/client manifests
3. build nested layouts and generated route manifests
4. add SSR + deterministic hydration
5. add server functions/RPC
6. add universal UI primitives
7. add CLI and component registry/import bridge
8. add desktop and native renderers after the web/full-stack core stabilizes
