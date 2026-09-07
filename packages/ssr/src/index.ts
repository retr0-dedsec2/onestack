import { styleToCss, type StyleObject } from "@onestack/styles";
import { Fragment, isKeyedList, isVNode, normalizeChildren, type Child, type KeyedList, type VNode } from "@onestack/core";

const VOID_ELEMENTS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

interface RenderContext {
  elementId: number;
  boundaryId: number;
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeStyle(value: unknown) {
  return value && typeof value === 'object' ? styleToCss(value as StyleObject) : typeof value === 'string' ? value : '';
}

function serializeProps(props: Record<string, unknown>, hydrationId: number) {
  const out: string[] = [`data-os-h=\"${hydrationId}\"`];
  for (const [key, rawValue] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref" || key.startsWith("on")) continue;
    const value = typeof rawValue === "function" ? rawValue() : rawValue;
    if (value === false || value === null || value === undefined) continue;
    const name = key === "className" ? "class" : key;
    if (name === "style") {
      const style = serializeStyle(value);
      if (style) out.push(`style=\"${escapeHtml(style)}\"`);
    } else if (value === true) out.push(name);
    else out.push(`${name}=\"${escapeHtml(value)}\"`);
  }
  return ` ${out.join(" ")}`;
}

function renderVNode(vnode: VNode, context: RenderContext): string {
  if (vnode.type === Fragment) return renderChildren(vnode.children, context);
  if (typeof vnode.type === "function") {
    return renderChild(vnode.type({ ...(vnode.props as Record<string, unknown>), children: vnode.children }), context);
  }
  const id = context.elementId++;
  const props = serializeProps(vnode.props as Record<string, unknown>, id);
  if (VOID_ELEMENTS.has(vnode.type)) return `<${vnode.type}${props}>`;
  return `<${vnode.type}${props}>${renderChildren(vnode.children, context)}</${vnode.type}>`;
}

function renderKeyedList<T>(list: KeyedList<T>, context: RenderContext) {
  const id = context.boundaryId++;
  const body = [...list.each()]
    .map((item, index) => renderChild(list.children(() => item, () => index), context))
    .join("");
  return `<!--os:k:${id}-->${body}<!--/os:k:${id}-->`;
}

function renderChildren(children: Child[], context: RenderContext) {
  return normalizeChildren(children).map((child) => renderChild(child, context)).join("");
}

function renderChild(child: Child, context: RenderContext): string {
  if (Array.isArray(child)) return renderChildren(child, context);
  if (isKeyedList(child)) return renderKeyedList(child, context);
  if (typeof child === "function") {
    const id = context.boundaryId++;
    return `<!--os:d:${id}-->${renderChild(child(), context)}<!--/os:d:${id}-->`;
  }
  if (isVNode(child)) return renderVNode(child, context);
  if (child === null || child === undefined || child === false || child === true) return "";
  return escapeHtml(child);
}

export interface RenderToStringResult {
  html: string;
  hydrationNodes: number;
  hydrationBoundaries: number;
}

export function renderToString(child: Child): RenderToStringResult {
  const context: RenderContext = { elementId: 0, boundaryId: 0 };
  const html = renderChild(child, context);
  return { html, hydrationNodes: context.elementId, hydrationBoundaries: context.boundaryId };
}

export function hydrationSelector(id: number) {
  return `[data-os-h=\"${id}\"]`;
}
