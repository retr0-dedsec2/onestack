import { createVNode, type Child, type Component, type VNode } from "@onestack/core";

export interface UniversalProps {
  children?: Child;
  class?: string;
  className?: string;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

function childrenOf(props: UniversalProps): Child[] {
  const children = props.children;
  return children === undefined ? [] : Array.isArray(children) ? children : [children];
}

function hostComponent(tag: string, defaults: Record<string, unknown> = {}) {
  const component = ((props: UniversalProps) => {
    const { children: _children, ...rest } = props;
    return createVNode(tag, { ...defaults, ...rest }, ...childrenOf(props));
  }) as Component<UniversalProps> & { universalType: string };
  Object.defineProperty(component, "universalType", { value: tag, enumerable: true });
  return component;
}

export const View = hostComponent("div");
export const Text = hostComponent("span");
export const Heading = hostComponent("h2");
export const Button = hostComponent("button", { type: "button" });
export const Link = hostComponent("a");
export const Image = hostComponent("img");
export const Stack = hostComponent("div", { style: { display: "flex", flexDirection: "column" } });
export const Grid = hostComponent("div", { style: { display: "grid" } });
export const Container = hostComponent("div");
export const ScrollView = hostComponent("div", { style: { overflow: "auto" } });
export const Input = hostComponent("input");
export const Textarea = hostComponent("textarea");
export const Form = hostComponent("form");
export const Label = hostComponent("label");
export const Card = hostComponent("section");
export const Badge = hostComponent("span");
export const Separator = hostComponent("hr");
export const Skeleton = hostComponent("div", { "aria-hidden": true });

export type UniversalComponent = typeof View;
export type UniversalVNode = VNode;
