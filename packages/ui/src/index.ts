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
export const Image = hostComponent("img", { loading: "lazy" });
export const Stack = hostComponent("div", { style: { display: "flex", flexDirection: "column" } });
export const Grid = hostComponent("div", { style: { display: "grid" } });
export const Container = hostComponent("div");
export const ScrollView = hostComponent("div", { "data-onestack-native": "ScrollView", style: { overflow: "auto" } });
export const Input = hostComponent("input");
export const Textarea = hostComponent("textarea");
export const Form = hostComponent("form");
export const Label = hostComponent("label");
export const Card = hostComponent("section");
export const Badge = hostComponent("span");
export const Separator = hostComponent("hr", { role: "separator" });
export const Skeleton = hostComponent("div", { "aria-hidden": true });

export interface DialogProps extends UniversalProps {
  open?: boolean;
  label?: string;
}

export const Dialog = ((props: DialogProps) => {
  const { children: _children, open = false, label, ...rest } = props;
  return createVNode("div", {
    role: "dialog",
    "aria-modal": true,
    "aria-hidden": open ? undefined : true,
    "aria-label": label,
    hidden: open ? undefined : true,
    ...rest,
  }, ...childrenOf(props));
}) as Component<DialogProps>;

export interface CheckboxProps extends UniversalProps {
  checked?: boolean;
  disabled?: boolean;
}

export const Checkbox = ((props: CheckboxProps) => {
  const { children: _children, ...rest } = props;
  return createVNode("input", { type: "checkbox", ...rest });
}) as Component<CheckboxProps>;

export const Radio = ((props: UniversalProps) => {
  const { children: _children, ...rest } = props;
  return createVNode("input", { type: "radio", ...rest });
}) as Component<UniversalProps>;

export const Select = hostComponent("select");
export const Option = hostComponent("option");
export const Nav = hostComponent("nav");
export const Main = hostComponent("main");
export const Section = hostComponent("section");
export const Header = hostComponent("header");
export const Footer = hostComponent("footer");

export function assertAccessibleProps(component: string, props: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (component === "Image" && typeof props.alt !== "string") issues.push("Image requires an alt prop (use alt=\"\" for decorative images).");
  if (component === "Dialog" && !props.label && !props["aria-labelledby"] && !props["aria-label"]) issues.push("Dialog requires label, aria-label, or aria-labelledby.");
  if ((component === "Input" || component === "Textarea" || component === "Select") && !props["aria-label"] && !props["aria-labelledby"] && !props.id) issues.push(`${component} should have an id associated with Label or an ARIA label.`);
  if (component === "Button" && props.disabled === true && props["aria-disabled"] === false) issues.push("Button disabled and aria-disabled values conflict.");
  return issues;
}

export type UniversalComponent = typeof View;
export type UniversalVNode = VNode;

// Native hints keep these primitives usable by the DOM renderer as well.
export const Pressable = Button;
export const TextInput = Input;
export const Switch = hostComponent("input", { type: "checkbox" });
export const ActivityIndicator = hostComponent("progress", { "data-onestack-native": "ActivityIndicator", "aria-label": "Loading" });
export const SafeArea = hostComponent("div", { "data-onestack-native": "SafeArea" });
export const WebView = hostComponent("iframe", { "data-onestack-native": "WebView", title: "Embedded content", sandbox: "allow-scripts" });
