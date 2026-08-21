import { Fragment, isVNode, normalizeChildren, type Child, type VNode } from "@onestack/core";

const VOID_ELEMENTS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function kebab(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function serializeStyle(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== null && entry !== undefined)
    .map(([key, entry]) => `${kebab(key)}:${String(entry)}`)
    .join(";");
}

function serializeProps(props: Record<string, unknown>, hydrationId?: number) {
  const out: string[] = [];
  if (hydrationId !== undefined) out.push(`data-os-h=\"${hydrationId}\"`);

  for (const [key, rawValue] of Object.entries(props)) {
    if (key === "children" || key === "key" || key === "ref" || key.startsWith("on")) continue;
    const value = typeof rawValue === "function" ? rawValue() : rawValue;
    if (value === false || value === null || value === undefined) continue;
    const name = key === "className" ? "class" : key;
    if (name === "style") {
      const style = serializeStyle(value);
      if (style) out.push(`style=\"${escapeHtml(style)}\"`);
    } else if (value === true) {
      out.push(name);
    } else {
      out.push(`${name}=\"${escapeHtml(value)}\"`);
    }
  }

  return out.length ? ` ${out.join(" ")}` : "";
}

function renderVNode(vnode: VNode, nextHydrationId: () => number): string {
  if (vnode.type === Fragment) return renderChildren(vnode.children, nextHydrationId);
  if (typeof vnode.type === "function") {
    return renderChild(vnode.type({ ...(vnode.props as Record<string, unknown>), children: vnode.children }), nextHydrationId);
  }

  const id = nextHydrationId();
  const props = serializeProps(vnode.props as Record<string, unknown>, id);
  if (VOID_ELEMENTS.has(vnode.type)) return `<${vnode.type}${props}>`;
  return `<${vnode.type}${props}>${renderChildren(vnode.children, nextHydrationId)}</${vnode.type}>`;
}

function renderChildren(children: Child[], nextHydrationId: () => number) {
  return normalizeChildren(children).map((child) => renderChild(child, nextHydrationId)).join("");
}

function renderChild(child: Child, nextHydrationId: () => number): string {
  if (Array.isArray(child)) return renderChildren(child, nextHydrationId);
  if (typeof child === "function") return renderChild(child(), nextHydrationId);
  if (isVNode(child)) return renderVNode(child, nextHydrationId);
  if (child === null || child === undefined || child === false || child === true) return "";
  return escapeHtml(child);
}

export interface RenderToStringResult {
  html: string;
  hydrationNodes: number;
}

export function renderToString(child: Child): RenderToStringResult {
  let hydrationNodes = 0;
  const html = renderChild(child, () => hydrationNodes++);
  return { html, hydrationNodes };
}

export function hydrationSelector(id: number) {
  return `[data-os-h=\"${id}\"]`;
}
