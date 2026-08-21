export const Fragment = Symbol.for("onestack.fragment");

export type PrimitiveChild = string | number | bigint | boolean | null | undefined;
export type Component<P = Record<string, unknown>> = (props: P & { children?: Child }) => Child;
export type VNodeType = string | Component<any> | typeof Fragment;

export type Child =
  | PrimitiveChild
  | VNode
  | Child[]
  | (() => Child);

export interface VNode<P = Record<string, unknown>> {
  readonly __onestackVNode: true;
  type: VNodeType;
  props: P;
  key?: string | number;
  children: Child[];
}

export function createVNode<P extends Record<string, unknown>>(
  type: VNodeType,
  props: P | null,
  ...children: Child[]
): VNode<P> {
  const source = (props ?? {}) as P & { key?: string | number; children?: Child };
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

  return {
    __onestackVNode: true,
    type,
    props: cleanProps as P,
    key,
    children: normalizedChildren,
  };
}

export function isVNode(value: unknown): value is VNode {
  return Boolean(value && typeof value === "object" && (value as Partial<VNode>).__onestackVNode === true);
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
