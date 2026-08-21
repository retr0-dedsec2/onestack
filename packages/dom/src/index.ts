import {
  Fragment,
  createEffect,
  isVNode,
  normalizeChildren,
  type Child,
  type VNode,
} from "@onestack/core";

type Dispose = () => void;

interface MountResult {
  nodes: Node[];
  dispose: Dispose;
}

function emptyResult(): MountResult {
  return { nodes: [], dispose: () => {} };
}

function setProperty(element: HTMLElement, key: string, value: unknown) {
  if (key === "class" || key === "className") {
    element.className = value == null ? "" : String(value);
    return;
  }

  if (key === "style" && value && typeof value === "object") {
    Object.assign(element.style, value);
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
      // Fall through to an attribute for read-only DOM properties.
    }
  }

  element.setAttribute(key, value === true ? "" : String(value));
}

function mountDynamic(read: () => Child, parent: Node, before: Node | null): MountResult {
  const start = document.createComment("os:start");
  const end = document.createComment("os:end");
  parent.insertBefore(start, before);
  parent.insertBefore(end, before);

  let current = emptyResult();
  const stop = createEffect(() => {
    current.dispose();
    let node = start.nextSibling;
    while (node && node !== end) {
      const next = node.nextSibling;
      parent.removeChild(node);
      node = next;
    }
    current = mountChild(read(), parent, end);
  });

  return {
    nodes: [start, end],
    dispose: () => {
      stop();
      current.dispose();
    },
  };
}

function mountVNode(vnode: VNode, parent: Node, before: Node | null): MountResult {
  if (vnode.type === Fragment) {
    return mountChildren(vnode.children, parent, before);
  }

  if (typeof vnode.type === "function") {
    return mountChild(
      vnode.type({ ...(vnode.props as Record<string, unknown>), children: vnode.children }),
      parent,
      before,
    );
  }

  const element = document.createElement(vnode.type);
  const disposers: Dispose[] = [];

  for (const [key, rawValue] of Object.entries(vnode.props as Record<string, unknown>)) {
    if (typeof rawValue === "function" && !key.startsWith("on") && key !== "ref") {
      disposers.push(createEffect(() => setProperty(element, key, rawValue())));
    } else {
      setProperty(element, key, rawValue);
    }
  }

  const mountedChildren = mountChildren(vnode.children, element, null);
  disposers.push(mountedChildren.dispose);
  parent.insertBefore(element, before);

  return {
    nodes: [element],
    dispose: () => disposers.forEach((dispose) => dispose()),
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
  if (typeof child === "function") return mountDynamic(child, parent, before);
  if (isVNode(child)) return mountVNode(child, parent, before);
  if (child === null || child === undefined || child === false || child === true) return emptyResult();

  const node = document.createTextNode(String(child));
  parent.insertBefore(node, before);
  return { nodes: [node], dispose: () => {} };
}

export interface Root {
  render(child: Child): void;
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
