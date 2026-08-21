export interface RouteDefinition<T = unknown> {
  path: string;
  value: T;
}

export interface RouteMatch<T = unknown> {
  route: RouteDefinition<T>;
  params: Record<string, string>;
  pathname: string;
}

export interface Router<T = unknown> {
  current(): RouteMatch<T> | null;
  resolve(pathname: string): RouteMatch<T> | null;
  navigate(to: string, options?: { replace?: boolean }): RouteMatch<T> | null;
  subscribe(listener: (match: RouteMatch<T> | null) => void): () => void;
  dispose(): void;
}

function normalizePath(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function routePathFromFile(filePath: string, routesDir = "src/routes"): string {
  let relative = filePath.replace(/\\/g, "/");
  const marker = `${routesDir.replace(/\\/g, "/").replace(/\/$/, "")}/`;
  const markerIndex = relative.indexOf(marker);
  if (markerIndex >= 0) relative = relative.slice(markerIndex + marker.length);

  relative = relative.replace(/\.(?:t|j)sx?$/, "");
  const segments = relative.split("/").filter(Boolean);
  if (segments.at(-1) === "index") segments.pop();

  const routeSegments = segments.map((segment) => {
    const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
    if (optionalCatchAll) return `*${optionalCatchAll[1]}?`;
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
    if (catchAll) return `*${catchAll[1]}`;
    const dynamic = segment.match(/^\[(.+)\]$/);
    if (dynamic) return `:${dynamic[1]}`;
    return segment;
  });

  return normalizePath(routeSegments.join("/"));
}

export function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const segments = normalizePath(pattern).split("/").filter(Boolean);
  const names: Array<{ name: string; optional: boolean }> = [];
  let source = "^";

  if (segments.length === 0) source += "/";
  for (const segment of segments) {
    if (segment.startsWith(":")) {
      names.push({ name: segment.slice(1), optional: false });
      source += "/([^/]+)";
    } else if (segment.startsWith("*")) {
      const optional = segment.endsWith("?");
      const name = segment.slice(1, optional ? -1 : undefined);
      names.push({ name, optional });
      source += optional ? "(?:/(.*))?" : "/(.+)";
    } else {
      source += `/${escapeRegex(segment)}`;
    }
  }

  source += "/?$";
  const match = new RegExp(source).exec(normalizePath(pathname));
  if (!match) return null;

  const params: Record<string, string> = {};
  names.forEach((entry, index) => {
    const value = match[index + 1];
    if (value !== undefined) params[entry.name] = decodeURIComponent(value);
  });
  return params;
}

export function createRouter<T>(routes: RouteDefinition<T>[], initialPath?: string): Router<T> {
  const listeners = new Set<(match: RouteMatch<T> | null) => void>();
  const browser = typeof window !== "undefined";

  const resolve = (pathname: string): RouteMatch<T> | null => {
    const normalized = normalizePath(pathname.split(/[?#]/, 1)[0]);
    for (const route of routes) {
      const params = matchRoute(route.path, normalized);
      if (params) return { route, params, pathname: normalized };
    }
    return null;
  };

  let active = resolve(initialPath ?? (browser ? window.location.pathname : "/"));
  const notify = () => listeners.forEach((listener) => listener(active));

  const onPopState = () => {
    active = resolve(window.location.pathname);
    notify();
  };

  if (browser) window.addEventListener("popstate", onPopState);

  return {
    current: () => active,
    resolve,
    navigate(to, options = {}) {
      const url = new URL(to, browser ? window.location.href : "http://onestack.local");
      active = resolve(url.pathname);
      if (browser) {
        if (options.replace) window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        else window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
      notify();
      return active;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      if (browser) window.removeEventListener("popstate", onPopState);
    },
  };
}
