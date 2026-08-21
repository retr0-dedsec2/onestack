# OneStack

OneStack is an experimental universal full-stack TypeScript/JSX application framework.

> Write the product once. Choose where it runs.

## v0.1 bootstrap

The current branch establishes the first executable slice of OneStack without React:

- custom JSX runtime
- platform-agnostic VNode model
- fine-grained signals, computed values, effects, batching and untracked reads
- reactive DOM renderer
- functional components and fragments
- reactive children and reactive DOM props
- refs and DOM events
- pnpm monorepo + TypeScript project references
- Vitest coverage for the reactive core
- a Counter example
- GitHub Actions verification

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

## Roadmap

The v0.1 architecture is intended to grow into dedicated packages for compiler transforms, styles, routing, SSR/hydration, server functions/RPC, universal UI primitives, CLI tooling and a component registry/import bridge. Desktop and native mobile renderers come after the web/full-stack core is stable.
