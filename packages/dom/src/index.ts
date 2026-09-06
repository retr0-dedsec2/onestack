import { styleToCss, type StyleObject } from "@onestack/styles";
import {
  Fragment,
  createEffect,
  createSignal,
  isKeyedList,
  isVNode,
  normalizeChildren,
  untrack,
  type Child,
  type Key,
  type KeyedList,
  type Setter,
  type Signal,
  type VNode,
} from "@onestack/core";
import { reconcileKeyed } from "@onestack/reconciler";

type Dispose = () => void;

interface MountResult {
  nodes: Node[];
  dispose: Dispose;
}

interface HydrationState {
  root: Element;
  elementId: number;
  boundaryId: number;
}

interface KeyedRecord<T> {
  key: Key;
  item: Signal<T>;
  setItem: Setter<T>;
  index: Signal<number>;
  setIndex: Setter<number>;
  mounted: MountResult;
}

function emptyResult(): MountResult {
  return { nodes: [], dispose: () => {} };
}

function firstNode(result: MountResult) {
  return result.nodes[0] ?? null;
}

function lastNode(result: MountResult) {
  return result.nodes[result.nodes.length - 1] ?? null;
}

function nodesInRange(result: MountResult): Node[] {
  const first = firstNode(result);
  const last = lastNode(result);
  if (!first || !last) return [];
  const nodes: Node[] = [];
  let node: Node | null = first;
  while (node) {
    nodes.push(node);
    if (node === last) break;
    node = node.nextSibling;
  }
  return nodes;
}

function removeMounted(result: MountResult) {
  result.dispose();
  for (const node of nodesInRange(result)) node.parentNode?.removeChild(node);
}

function moveMounted(result: MountResult, parent: Node, before: Node) {
  for (const node of nodesInRange(result)) parent.insertBefore(node, before);
}

function clearBetween(start: Node, end: Node) {
  let node = start.nextSibling;
  while (node && node !== end) {
    const next = node.nextSibling;
    node.parentNode?.removeChild(node);
    node = next;
  }
}

function setProperty(element: HTMLElement, key: string, value: unknown) {
  if (key === "class" || key === "className") {
    element.className = value == null ? "" : String(value);
    return;
  }
  if (key === "style") {
    element.style.cssText = value && typeof value === "object" ? styleToCss(value as StyleObject) : value == null ? "" : String(value);
    return;
  }
  if (key.startsWith("on") && typeof value === "function") {
    const event = key.slice(2).toLowerCase();
    element.addEventListener(event, value as EventListener);
    return;
  }
  if (key === "ref" && typeof value === "function") {
    (value as (node: HTMLElement) => void)(element);
    return;
  }
  if (value === false || value === null || value === undefined) {
    element.removeAttribute(key);
    return;
  }
  if (key in element && key !== "form") {
    try {
      (element as unknown as Record<string, unknown>)[key] = value;
      return;
    } catch {
      // Read-only DOM property; fall back to an attribute.
    }
  }
  element.setAttribute(key, value === true ? "" : String(value));
}

function bindProps(element: HTMLElement, props: Record<string, unknown>) {
  const disposers: Dispose[] = [];
  for (const [key, rawValue] of Object.entries(props)) {
    if (typeof rawValue === "function" && !key.startsWith("on") && key !== "ref") {
      disposers.push(createEffect(() => setProperty(element, key, rawValue())));
    } else {
      setProperty(element, key, rawValue);
    }
  }
  return () => disposers.forEach((dispose) => dispose());
}

function mountDynamic(read: () => Child, parent: Node, before: Node | null): MountResult {
  const start = document.createComment("os:d:start");
  const end = document.createComment("os:d:end");
  parent.insertBefore(start, before);
  parent.insertBefore(end, before);

  let current = emptyResult();
  const stop = createEffect(() => {
    const value = read();
    current.dispose();
    clearBetween(start, end);
    current = mountChild(value, parent, end);
  });

  return {
    nodes: [start, end],
    dispose: () => {
      stop();
      current.dispose();
    },
  };
}

function updateKeyed<T>(list: KeyedList<T>, parent: Node, end: Node, records: KeyedRecord<T>[]) {
  const items = [...list.each()];
  const previousItems = records.map((record) => untrack(record.item));
  const plan = reconcileKeyed(previousItems, items, list.key);
  const byKey = new Map(records.map((record) => [record.key, record]));

  for (const operation of plan.operations) {
    if (operation.type !== "remove") continue;
    const record = byKey.get(operation.key);
    if (record) {
      removeMounted(record.mounted);
      byKey.delete(operation.key);
    }
  }

  const nextRecords = items.map((item, index) => {
    const key = list.key(item, index);
    const existing = byKey.get(key);
    if (existing) {
      existing.setItem(item);
      existing.setIndex(index);
      return existing;
    }

    const [itemSignal, setItem] = createSignal(item);
    const [indexSignal, setIndex] = createSignal(index);
    const child = untrack(() => list.children(itemSignal, indexSignal));
    const mounted = mountChild(child, parent, end);
    return { key, item: itemSignal, setItem, index: indexSignal, setIndex, mounted };
  });

  let cursor: Node = end;
  for (let index = nextRecords.length - 1; index >= 0; index -= 1) {
    const record = nextRecords[index];
    moveMounted(record.mounted, parent, cursor);
    cursor = firstNode(record.mounted) ?? cursor;
  }

  records.splice(0, records.length, ...nextRecords);
}

function mountKeyedList<T>(list: KeyedList<T>, parent: Node, before: Node | null): MountResult {
  const start = document.createComment("os:k:start");
  const end = document.createComment("os:k:end");
  parent.insertBefore(start, before);
  parent.insertBefore(end, before);
  const records: KeyedRecord<T>[] = [];
  const stop = createEffect(() => updateKeyed(list, parent, end, records));

  return {
    nodes: [start, end],
    dispose: () => {
      stop();
      records.forEach((record) => record.mounted.dispose());
    },
  };
}

function mountVNode(vnode: VNode, parent: Node, before: Node | null): MountResult {
  if (vnode.type === Fragment) return mountChildren(vnode.children, parent, before);
  if (typeof vnode.type === "function") {
    return mountChild(vnode.type({ ...(vnode.props as Record<string, unknown>), children: vnode.children }), parent, before);
  }

  const element = document.createElement(vnode.type);
  const disposeProps = bindProps(element, vnode.props as Record<string, unknown>);
  const mountedChildren = mountChildren(vnode.children, element, null);
  parent.insertBefore(element, before);
  return {
    nodes: [element],
    dispose: () => {
      disposeProps();
      mountedChildren.dispose();
    },
  };
}

function mountChildren(children: Child[], parent: Node, before: Node | null): MountResult {
  const results = normalizeChildren(children).map((child) => mountChild(child, parent, before));
  return {
    nodes: results.flatMap((result) => result.nodes),
    dispose: () => results.forEach((result) => result.dispose()),
  };
}

function mountChild(child: Child, parent: Node, before: Node | null): MountResult {
  if (Array.isArray(child)) return mountChildren(child, parent, before);
  if (isKeyedList(child)) return mountKeyedList(child, parent, before);
  if (typeof child === "function") return mountDynamic(child, parent, before);
  if (isVNode(child)) return mountVNode(child, parent, before);
  if (child === null || child === undefined || child === false || child === true) return emptyResult();
  const node = document.createTextNode(String(child));
  parent.insertBefore(node, before);
  return { nodes: [node], dispose: () => {} };
}

function boundaryComment(node: Node | null, prefix: string, id: number) {
  return node?.nodeType === Node.COMMENT_NODE && (node as Comment).data === `${prefix}:${id}`;
}

function findEndBoundary(start: Node, prefix: string, id: number) {
  let node = start.nextSibling;
  while (node) {
    if (boundaryComment(node, `/${prefix}`, id)) return node;
    node = node.nextSibling;
  }
  return null;
}

function hydrateDynamic(read: () => Child, parent: Node, cursor: Node | null, state: HydrationState): MountResult {
  const id = state.boundaryId++;
  const start = cursor;
  const end = cursor && boundaryComment(cursor, "os:d", id) ? findEndBoundary(cursor, "os:d", id) : null;
  if (!start || !end || !boundaryComment(start, "os:d", id)) return mountDynamic(read, parent, cursor);

  let current = hydrateChild(read(), parent, start.nextSibling, state);
  let firstRun = true;
  const stop = createEffect(() => {
    const value = read();
    if (firstRun) {
      firstRun = false;
      return;
    }
    current.dispose();
    clearBetween(start, end);
    current = mountChild(value, parent, end);
  });
  return { nodes: [start, end], dispose: () => { stop(); current.dispose(); } };
}

function hydrateKeyedList<T>(list: KeyedList<T>, parent: Node, cursor: Node | null, state: HydrationState): MountResult {
  const id = state.boundaryId++;
  const start = cursor;
  const end = cursor && boundaryComment(cursor, "os:k", id) ? findEndBoundary(cursor, "os:k", id) : null;
  if (!start || !end || !boundaryComment(start, "os:k", id)) return mountKeyedList(list, parent, cursor);

  const items = [...list.each()];
  const records: KeyedRecord<T>[] = [];
  let childCursor = start.nextSibling;
  items.forEach((item, index) => {
    const [itemSignal, setItem] = createSignal(item);
    const [indexSignal, setIndex] = createSignal(index);
    const child = untrack(() => list.children(itemSignal, indexSignal));
    const mounted = hydrateChild(child, parent, childCursor, state);
    records.push({ key: list.key(item, index), item: itemSignal, setItem, index: indexSignal, setIndex, mounted });
    childCursor = lastNode(mounted)?.nextSibling ?? childCursor;
  });

  let firstRun = true;
  const stop = createEffect(() => {
    list.each();
    if (firstRun) {
      firstRun = false;
      return;
    }
    updateKeyed(list, parent, end, records);
  });

  return { nodes: [start, end], dispose: () => { stop(); records.forEach((record) => record.mounted.dispose()); } };
}

function hydrateVNode(vnode: VNode, parent: Node, cursor: Node | null, state: HydrationState): MountResult {
  if (vnode.type === Fragment) return hydrateChildren(vnode.children, parent, cursor, state);
  if (typeof vnode.type === "function") {
    return hydrateChild(vnode.type({ ...(vnode.props as Record<string, unknown>), children: vnode.children }), parent, cursor, state);
  }

  const id = state.elementId++;
  const element = state.root.querySelector<HTMLElement>(`[data-os-h=\"${id}\"]`);
  if (!element || element.parentNode !== parent || element.tagName.toLowerCase() !== vnode.type) {
    const mounted = mountVNode(vnode, parent, cursor);
    if (cursor && cursor.parentNode === parent) parent.removeChild(cursor);
    return mounted;
  }

  const disposeProps = bindProps(element, vnode.props as Record<string, unknown>);
  const mountedChildren = hydrateChildren(vnode.children, element, element.firstChild, state);
  return { nodes: [element], dispose: () => { disposeProps(); mountedChildren.dispose(); } };
}

function hydrateChildren(children: Child[], parent: Node, cursor: Node | null, state: HydrationState): MountResult {
  const results: MountResult[] = [];
  let current = cursor;
  for (const child of normalizeChildren(children)) {
    const result = hydrateChild(child, parent, current, state);
    results.push(result);
    current = lastNode(result)?.nextSibling ?? current;
  }
  return { nodes: results.flatMap((result) => result.nodes), dispose: () => results.forEach((result) => result.dispose()) };
}

function hydrateChild(child: Child, parent: Node, cursor: Node | null, state: HydrationState): MountResult {
  if (Array.isArray(child)) return hydrateChildren(child, parent, cursor, state);
  if (isKeyedList(child)) return hydrateKeyedList(child, parent, cursor, state);
  if (typeof child === "function") return hydrateDynamic(child, parent, cursor, state);
  if (isVNode(child)) return hydrateVNode(child, parent, cursor, state);
  if (child === null || child === undefined || child === false || child === true) return emptyResult();

  const value = String(child);
  if (cursor?.nodeType === Node.TEXT_NODE) {
    if (cursor.textContent !== value) cursor.textContent = value;
    return { nodes: [cursor], dispose: () => {} };
  }
  const node = document.createTextNode(value);
  parent.insertBefore(node, cursor);
  if (cursor && cursor.parentNode === parent) parent.removeChild(cursor);
  return { nodes: [node], dispose: () => {} };
}

export interface Root {
  render(child: Child): void;
  hydrate(child: Child): void;
  unmount(): void;
}

export function createRoot(container: Element): Root {
  let mounted = emptyResult();
  return {
    render(child) {
      mounted.dispose();
      container.replaceChildren();
      mounted = mountChild(child, container, null);
    },
    hydrate(child) {
      mounted.dispose();
      mounted = hydrateChild(child, container, container.firstChild, { root: container, elementId: 0, boundaryId: 0 });
    },
    unmount() {
      mounted.dispose();
      mounted = emptyResult();
      container.replaceChildren();
    },
  };
}

export function render(child: Child, container: Element): Dispose {
  const root = createRoot(container);
  root.render(child);
  return () => root.unmount();
}

export function hydrate(child: Child, container: Element): Dispose {
  const root = createRoot(container);
  root.hydrate(child);
  return () => root.unmount();
}
