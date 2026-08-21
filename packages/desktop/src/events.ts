import type { DesktopEvent } from "./types.js";

export interface DesktopEventContext<T = unknown> {
  readonly scope: DesktopEvent["scope"];
  readonly name: string;
  readonly target?: string;
  readonly payload: T;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export type DesktopEventListener<T = unknown> = (event: DesktopEventContext<T>) => void;

const listeners = new Map<string, Set<DesktopEventListener<any>>>();

function eventKey(scope: DesktopEvent["scope"], name: string, target?: string) {
  return `${scope}:${name}:${target ?? "*"}`;
}

export function onDesktopEvent<T = unknown>(
  scope: DesktopEvent["scope"],
  name: string,
  listener: DesktopEventListener<T>,
  target?: string,
): () => void {
  const key = eventKey(scope, name, target);
  let bucket = listeners.get(key);
  if (!bucket) {
    bucket = new Set();
    listeners.set(key, bucket);
  }
  bucket.add(listener as DesktopEventListener<any>);
  return () => {
    bucket?.delete(listener as DesktopEventListener<any>);
    if (bucket?.size === 0) listeners.delete(key);
  };
}

export function emitDesktopEvent(event: DesktopEvent): boolean {
  let prevented = false;
  const context: DesktopEventContext = {
    scope: event.scope,
    name: event.name,
    target: event.target,
    payload: event.payload,
    get defaultPrevented() { return prevented; },
    preventDefault() { prevented = true; },
  };
  const keys = [
    eventKey(event.scope, event.name, event.target),
    eventKey(event.scope, event.name),
  ];
  for (const key of new Set(keys)) {
    for (const listener of listeners.get(key) ?? []) listener(context);
  }
  return prevented;
}
