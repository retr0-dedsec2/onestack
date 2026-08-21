import { createComputed, createSignal } from "@onestack/core";
import { render } from "@onestack/dom";

function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createComputed(() => count() * 2);

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: "640px", margin: "64px auto", padding: "24px" }}>
      <h1>OneStack Counter</h1>
      <p>This app uses the custom OneStack JSX runtime and reactive DOM renderer.</p>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <button onClick={() => setCount((value) => value + 1)}>Increment</button>
    </main>
  );
}

const root = document.querySelector("#app");
if (!root) throw new Error("Missing #app root element");

render(<Counter />, root);
