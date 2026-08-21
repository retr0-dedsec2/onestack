export const Fragment = Symbol.for("onestack.fragment");

export type Key = string | number;
export type Accessor<T> = () => T;
export type PrimitiveChild = string | number | bigint | boolean | null | undefined;
export type Component<P = Record<string, unknown>> = (props: P & { children?: Child }) => Child;
export type VNodeType = string | Component<any> | typeof Fragment;

export interface KeyedList<T = unknown> {
  readonly __onestackKeyedList: true;
  readonly each: Accessor<readonly T[]>;
  readonly key: (item: T, index: number) => Key;
  readonly children: ForRenderer<T>;
}

export type Child = PrimitiveChild | VNode | KeyedList<any> | Child[] | (() => Child);
export type ForRenderer<T> = (item: Accessor<T>, index: Accessor<number>) => Child;

export interface VNode<P = Record<string, unknown>> {
  readonly __onestackVNode: true;
  type: VNodeType;
  props: P;
  key?: Key;
  children: Child[];
}

export interface ForProps<T> {
  each: Accessor<readonly T[]>;
  by?: keyof T | ((item: T, index: number) => Key);
  children?: ForRenderer<T> | ForRenderer<T>[];
}

function renderFunction<T>(children: ForProps<T>["children"]): ForRenderer<T> {
  const candidates = Array.isArray(children) ? children : [children];
  const render = candidates.find((child): child is ForRenderer<T> => typeof child === "function");
  if (!render) throw new Error("OneStack <For>: expected a render function child.");
  return render;
}

function defaultKey<T>(item: T, index: number): Key {
  if (typeof item === "string" || typeof item === "number") return item;
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    if (typeof record.id === "string" || typeof record.id === "number") return record.id;
    if (typeof record.key === "string" || typeof record.key === "number") return record.key;
  }
  return index;
}

export function For<T>(props: ForProps<T>): KeyedList<T> {
  const render = renderFunction<T>(props.children);
  const by = props.by;
  const key = typeof by === "function"
    ? by
    : by !== undefined
      ? (item: T, index: number) => {
          if (item && typeof item === "object") {
            const value = (item as Record<PropertyKey, unknown>)[by as PropertyKey];
            if (typeof value === "string" || typeof value === "number") return value;
          }
          return defaultKey(item, index);
        }
      : defaultKey;

  return { __onestackKeyedList: true, each: props.each, key, children: render };
}

export function createVNode<P extends Record<string, unknown>>(
  type: VNodeType,
  props: P | null,
  ...children: Child[]
): VNode<P> {
  const source = (props ?? {}) as P & { key?: Key; children?: Child };
  const key = source.key;
  const propChildren = source.children;
  const normalizedChildren = children.length > 0
    ? children
    : propChildren === undefined
      ? []
      : Array.isArray(propChildren)
        ? propChildren
        : [propChildren];

  const cleanProps = { ...source } as Record<string, unknown>;
  delete cleanProps.key;
  delete cleanProps.children;

  return { __onestackVNode: true, type, props: cleanProps as P, key, children: normalizedChildren };
}

export function isVNode(value: unknown): value is VNode {
  return Boolean(value && typeof value === "object" && (value as Partial<VNode>).__onestackVNode === true);
}

export function isKeyedList(value: unknown): value is KeyedList {
  return Boolean(value && typeof value === "object" && (value as Partial<KeyedList>).__onestackKeyedList === true);
}

export function normalizeChildren(children: Child[]): Child[] {
  const out: Child[] = [];
  const visit = (child: Child) => {
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }
    if (child === true || child === false || child === null || child === undefined) return;
    out.push(child);
  };
  children.forEach(visit);
  return out;
}
