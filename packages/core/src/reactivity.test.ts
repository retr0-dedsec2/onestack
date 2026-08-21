import { describe, expect, it, vi } from "vitest";
import { batch, createComputed, createEffect, createSignal, untrack } from "./reactivity.js";

const tick = () => new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));

describe("OneStack reactivity", () => {
  it("tracks signal dependencies", async () => {
    const [count, setCount] = createSignal(0);
    const values: number[] = [];
    const stop = createEffect(() => values.push(count()));

    setCount(1);
    await tick();

    expect(values).toEqual([0, 1]);
    stop();
  });

  it("updates computed signals", async () => {
    const [count, setCount] = createSignal(2);
    const doubled = createComputed(() => count() * 2);

    expect(doubled()).toBe(4);
    setCount(4);
    await tick();
    expect(doubled()).toBe(8);
  });

  it("deduplicates observers in a batch", async () => {
    const [count, setCount] = createSignal(0);
    const observer = vi.fn(() => count());
    createEffect(observer);

    batch(() => {
      setCount(1);
      setCount(2);
      setCount(3);
    });
    await tick();

    expect(observer).toHaveBeenCalledTimes(2);
  });

  it("supports untracked reads", async () => {
    const [tracked, setTracked] = createSignal(0);
    const [ignored, setIgnored] = createSignal(0);
    const observer = vi.fn(() => {
      tracked();
      untrack(() => ignored());
    });

    createEffect(observer);
    setIgnored(1);
    await tick();
    expect(observer).toHaveBeenCalledTimes(1);

    setTracked(1);
    await tick();
    expect(observer).toHaveBeenCalledTimes(2);
  });
});
