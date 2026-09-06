import { expect, it, vi } from 'vitest';
import { createSignal, createVNode } from '@onestack/core';
import { mountMobile } from './renderer.js';
import { createMobileBridge } from './bridge.js';
import { createMobileRuntime, type MobileNode } from './index.js';
it('renders native primitives and updates shared signals through events', async () => {
  const [count, setCount] = createSignal(0); let tree: MobileNode; let emit!: (id: string, value: unknown) => void;
  const dispose = mountMobile(createVNode('button', { onClick: () => setCount(n => n + 1) }, () => String(count())), { render: node => { tree = node; }, subscribe: fn => { emit = fn; return () => {}; } });
  const button = (tree!.children as MobileNode[])[0]; expect(button.type).toBe('Pressable');
  emit(String(button.props!.onClick), null); await Promise.resolve();
  expect(JSON.stringify(tree!)).toContain('"children":"1"'); dispose();
});
it('rejects implicit WebView and mismatched capabilities', () => {
  const bridge = { invoke: vi.fn() }, runtime = createMobileRuntime({ platform: 'android', capabilities: { clipboard: true }, bridge });
  expect(() => runtime.invoke('camera', 'camera', 'open')).toThrow();
  expect(() => runtime.invoke('clipboard', 'filesystem', 'read')).toThrow();
  expect(() => runtime.render({ type: 'View', children: [{ type: 'WebView' }] })).toThrow('disabled');
  expect(bridge.invoke).not.toHaveBeenCalled();
});
it('correlates bridge responses and handles errors/disposal', async () => {
  let id = ''; const bridge = createMobileBridge(request => { id = request.id; });
  const pending = bridge.invoke('system', 'info'); bridge.receive({ id, ok: true, value: 'android' }); expect(await pending).toBe('android');
  const failure = bridge.invoke('system', 'bad'); bridge.receive({ id, ok: false, error: { code: 'UNSUPPORTED', message: 'unsupported' } }); await expect(failure).rejects.toThrow('unsupported');
  const abandoned = bridge.invoke('system', 'info'); bridge.dispose(); await expect(abandoned).rejects.toThrow('disposed');
});
