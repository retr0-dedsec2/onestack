export type Cleanup = () => void;
export type Subscriber = () => void;

let activeObserver: Observer | null = null;
let batchDepth = 0;
const pending = new Set<Observer>();

class Observer {
  deps = new Set<Set<Observer>>();
  cleanup?: Cleanup;
  disposed = false;

  constructor(private readonly fn: () => void) {}

  run() {
    if (this.disposed) return;
    this.detach();
    this.cleanup?.();
    this.cleanup = undefined;

    const previous = activeObserver;
    activeObserver = this;
    try {
      this.fn();
    } finally {
      activeObserver = previous;
    }
  }

  schedule() {
    if (this.disposed) return;
    pending.add(this);
    if (batchDepth === 0) queueMicrotask(flush);
  }

  detach() {
    for (const dep of this.deps) dep.delete(this);
    this.deps.clear();
  }

  dispose() {
    this.disposed = true;
    this.detach();
    this.cleanup?.();
    this.cleanup = undefined;
    pending.delete(this);
  }
}

let flushQueued = false;
function flush() {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    const work = [...pending];
    pending.clear();
    for (const observer of work) observer.run();
  });
}

export interface Signal<T> {
  (): T;
  readonly __onestackSignal: true;
}

export type Setter<T> = (value: T | ((previous: T) => T)) => T;

export function createSignal<T>(initial: T): [Signal<T>, Setter<T>] {
  let value = initial;
  const observers = new Set<Observer>();

  const read = (() => {
    if (activeObserver) {
      observers.add(activeObserver);
      activeObserver.deps.add(observers);
    }
    return value;
  }) as Signal<T>;

  Object.defineProperty(read, "__onestackSignal", { value: true });

  const write: Setter<T> = (next) => {
    const resolved = typeof next === "function"
      ? (next as (previous: T) => T)(value)
      : next;

    if (Object.is(value, resolved)) return value;
    value = resolved;
    for (const observer of observers) observer.schedule();
    return value;
  };

  return [read, write];
}

export function createEffect(effect: () => void | Cleanup): Cleanup {
  const observer = new Observer(() => {
    const cleanup = effect();
    if (typeof cleanup === "function") observer.cleanup = cleanup;
  });
  observer.run();
  return () => observer.dispose();
}

export function createComputed<T>(compute: () => T): Signal<T> {
  const [value, setValue] = createSignal<T>(undefined as T);
  createEffect(() => setValue(compute()));
  return value;
}

export function batch<T>(fn: () => T): T {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0 && pending.size > 0) flush();
  }
}

export function untrack<T>(fn: () => T): T {
  const previous = activeObserver;
  activeObserver = null;
  try {
    return fn();
  } finally {
    activeObserver = previous;
  }
}

export function isSignal(value: unknown): value is Signal<unknown> {
  return typeof value === "function" && (value as Partial<Signal<unknown>>).__onestackSignal === true;
}
