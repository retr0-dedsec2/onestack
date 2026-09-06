import { createEffect, untrack, Fragment, isKeyedList, isVNode, type Child } from '@onestack/core';
import type { MobileNode, MobilePrimitive } from './index.js';

const primitives = new Set(['View', 'Text', 'Image', 'ScrollView', 'Pressable', 'TextInput', 'Switch', 'ActivityIndicator', 'SafeArea', 'WebView']);
const tags: Record<string, MobilePrimitive> = { div: 'View', section: 'View', main: 'View', nav: 'View', header: 'View', footer: 'View', span: 'Text', p: 'Text', h1: 'Text', h2: 'Text', label: 'Text', button: 'Pressable', img: 'Image', textarea: 'TextInput' };
export interface MobileHost { render(node: MobileNode): void; subscribe(handler: (id: string, value: unknown) => void): () => void; }

/** Snapshot renderer: portable VNodes and reactive accessors become native trees. */
export function mountMobile(view: Child, host: MobileHost, options: { allowWebViewFallback?: boolean } = {}) {
  const components = new Map<string, { node: unknown; value: Child }>();
  let handlers = new Map<string, (event: unknown) => void>();
  const unsubscribe = host.subscribe((id, value) => handlers.get(id)?.({ target: { value, checked: value }, value, nativeEvent: value }));
  const dispose = createEffect(() => {
    const next = new Map<string, (event: unknown) => void>(); let id = 0; const visited = new Set<string>();
    function convert(child: Child, path = "root"): MobileNode[] {
      if (child == null || typeof child === 'boolean') return [];
      if (typeof child === 'function') return convert(child(), path + "/dynamic");
      if (Array.isArray(child)) return child.flatMap((item, i) => convert(item, path + "/" + i));
      if (isKeyedList(child)) return child.each().flatMap((item, i) => convert(child.children(() => item, () => i), path + "/key/" + child.key(item, i)));
      if (!isVNode(child)) return [{ type: 'Text', children: String(child) }];
      if (child.type === Fragment) return child.children.flatMap((item, i) => convert(item, path + "/" + i));
      if (typeof child.type === 'function') {
        visited.add(path);
        let cached = components.get(path);
        if (!cached || cached.node !== child) {
          const component = child.type;
          cached = { node: child, value: untrack(() => component({ ...child.props, children: child.children })) };
          components.set(path, cached);
        }
        return convert(cached.value, path + '/component');
      }
      const hinted = child.props['data-onestack-native'];
      let type = typeof hinted === 'string' && primitives.has(hinted) ? hinted as MobilePrimitive : primitives.has(child.type) ? child.type as MobilePrimitive : tags[child.type];
      if (child.type === 'input') type = child.props.type === 'checkbox' ? 'Switch' : 'TextInput';
      if (!type) throw new Error(`Unsupported native component: ${child.type}. Use an explicit WebView.`);
      if (type === 'WebView' && !options.allowWebViewFallback) throw new Error('WebView fallback is disabled');
      const props: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(child.props)) {
        if (/^on[A-Z]/.test(key) && typeof value === 'function') { const eventId = `event_${id++}`; next.set(eventId, value as (event: unknown) => void); props[key] = eventId; }
        else props[key] = typeof value === 'function' ? value() : value;
      }
      return [{ type, props, children: child.children.flatMap((item, i) => convert(item, path + "/" + (isVNode(item) && item.key !== undefined ? item.key : i))) }];
    }
    const tree: MobileNode = { type: 'View', children: convert(view) };
    for (const key of components.keys()) if (!visited.has(key)) components.delete(key);
    handlers = next; host.render(tree);
  });
  return () => { dispose(); unsubscribe(); handlers.clear(); components.clear(); };
}

export function createNativeHost(): MobileHost {
  const scope = globalThis as typeof globalThis & { OneStackAndroid?: { postMessage(value: string): void }; webkit?: { messageHandlers: { onestack: { postMessage(value: unknown): void } } }; __onestackEvent?: (id: string, value: unknown) => void };
  return {
    render(node) { const message = { type: 'render', node }; if (scope.OneStackAndroid) scope.OneStackAndroid.postMessage(JSON.stringify(message)); else if (scope.webkit) scope.webkit.messageHandlers.onestack.postMessage(message); else throw new Error('Native OneStack host is unavailable'); },
    subscribe(handler) { scope.__onestackEvent = handler; return () => { delete scope.__onestackEvent; }; },
  };
}
