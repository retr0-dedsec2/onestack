import { createVNode, Fragment, type Child, type VNodeType } from "./vnode.js";

export { Fragment };

export function jsx(type: VNodeType, props: Record<string, unknown> | null, key?: string | number) {
  const next = props ? { ...props } : {};
  if (key !== undefined) next.key = key;
  return createVNode(type, next);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

export namespace JSX {
  export type Element = import("./vnode.js").VNode | import("./vnode.js").KeyedList<any>;
  export interface IntrinsicElements {
    [element: string]: Record<string, unknown> & { children?: Child };
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
}
