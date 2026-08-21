/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { For, createSignal } from "@onestack/core";
import { hydrate, render } from "./index.js";

const tick = () => new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));

describe("OneStack DOM runtime", () => {
  it("hydrates existing server markup and preserves the host element", async () => {
    const [count, setCount] = createSignal(0);
    const container = document.createElement("div");
    container.innerHTML = `<button data-os-h="0">Count: <!--os:d:0-->0<!--/os:d:0--></button>`;
    const existing = container.firstElementChild;

    hydrate(<button onClick={() => setCount((value) => value + 1)}>Count: {count}</button>, container);
    expect(container.firstElementChild).toBe(existing);

    existing?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(existing?.textContent).toBe("Count: 1");
  });

  it("keeps keyed nodes while reordering a For list", async () => {
    const [items, setItems] = createSignal([{ id: "a", label: "A" }, { id: "b", label: "B" }]);
    const container = document.createElement("div");
    render(
      <ul>
        <For each={items} by="id">
          {(item) => <li data-id={() => item().id}>{() => item().label}</li>}
        </For>
      </ul>,
      container,
    );

    const firstA = container.querySelector('[data-id="a"]');
    setItems([{ id: "b", label: "Bee" }, { id: "a", label: "A" }]);
    await tick();

    expect(container.querySelectorAll("li")[1]).toBe(firstA);
    expect(container.querySelector('[data-id="b"]')?.textContent).toBe("Bee");
  });
});
