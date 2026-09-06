import { createEffect, Fragment, isKeyedList, isVNode, type Child } from '@onestack/core';
import type { MobileNode, MobilePrimitive } from './index.js';

const primitives = new Set(['View', 'Text', 'Image', 'ScrollView', 'Pressable', 'TextInput', 'Switch', 'ActivityIndicator', 'SafeArea', 'WebView']);
const tags: Record<string, MobilePrimitive> = { div: 'View', section: 'View', main: 'View', nav: 'View', header: 'View', footer: 'View', span: 'Text', p: 'Text', h1: 'Text', h2: 'Text', label: 'Text', button: 'Pressable', img: 'Image', textarea: 'TextInput' };
export interface MobileHost { render(node: MobileNode): void; subscribe(handler: (id: string, value: unknown) => void): () => void; }

/** Snapshot renderer: portable VNodes and reactive accessors become native trees. */
export function mountMobile(view: Child, host: MobileHost, options: { allowWebViewFallback?: boolean } = {}) {
  let handlers = new Map<string, (event: unknown) => void>();
  const unsubscribe = host.subscribe((id, value) => handlers.get(id)?.({ target: { value, checked: value }, value, nativeEvent: value }));
  const dispose = createEffect(() => {
    const next = new Map<string, (event: unknown) => void>(); let id = 0;
    function convert(child: Child): MobileNode[] {
      if (child == null || typeof child === 'boolean') return [];
      if (typeof child === 'function') return convert(child());
      if (Array.isArray(child)) return child.flatMap(convert);
      if (isKeyedList(child)) return child.each().flatMap((item, i) => convert(child.children(() => item, () => i)));
      if (!isVNode(child)) return [{ type: 'Text', children: String(child) }];
      if (child.type === Fragment) return child.children.flatMap(convert);
      if (typeof child.type === 'function') return convert(child.type({ ...child.props, children: child.children }));
      let type = primitives.has(child.type) ? child.type as MobilePrimitive : tags[child.type];
      if (child.type === 'input') type = child.props.type === 'checkbox' ? 'Switch' : 'TextInput';
      if (!type) throw new Error(`Unsupported native component: ${child.type}. Use an explicit WebView.`);
      if (type === 'WebView' && !options.allowWebViewFallback) throw new Error('WebView fallback is disabled');
      const props: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(child.props)) {
        if (/^on[A-Z]/.test(key) && typeof value === 'function') { const eventId = `event_${id++}`; next.set(eventId, value as (event: unknown) => void); props[key] = eventId; }
        else props[key] = typeof value === 'function' ? value() : value;
      }
      return [{ type, props, children: child.children.flatMap(convert) }];
    }
    const tree: MobileNode = { type: 'View', children: convert(view) };
    handlers = next; host.render(tree);
  });
  return () => { dispose(); unsubscribe(); handlers.clear(); };
}

export function createNativeHost(): MobileHost {
  const scope = globalThis as typeof globalThis & { OneStackAndroid?: { postMessage(value: string): void }; webkit?: { messageHandlers: { onestack: { postMessage(value: unknown): void } } }; __onestackEvent?: (id: string, value: unknown) => void };
  return {
    render(node) { const message = { type: 'render', node }; if (scope.OneStackAndroid) scope.OneStackAndroid.postMessage(JSON.stringify(message)); else if (scope.webkit) scope.webkit.messageHandlers.onestack.postMessage(message); else throw new Error('Native OneStack host is unavailable'); },
    subscribe(handler) { scope.__onestackEvent = handler; return () => { delete scope.__onestackEvent; }; },
  };
}
