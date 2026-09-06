import type { BridgeRequest, BridgeResponse, MobileBridge } from './index.js';

export function createMobileBridge(send: (request: BridgeRequest) => void, timeoutMs = 10000) {
  let sequence = 0;
  const pending = new Map<string, { resolve(value: unknown): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const bridge: MobileBridge & { receive(response: BridgeResponse): void; dispose(): void } = {
    invoke<T>(namespace: string, method: string, ...args: unknown[]): Promise<T> {
      const id = String(++sequence);
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native bridge request timed out')); }, timeoutMs);
        pending.set(id, { resolve: value => resolve(value as T), reject, timer });
        try { send({ id, namespace, method, args }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    },
    receive(response) {
      if (!response || typeof response.id !== 'string' || typeof response.ok !== 'boolean') throw new Error('Invalid bridge response');
      const request = pending.get(response.id); if (!request) return;
      pending.delete(response.id); clearTimeout(request.timer);
      if (response.ok) request.resolve(response.value); else request.reject(Object.assign(new Error(response.error?.message ?? 'Native bridge failed'), { code: response.error?.code }));
    },
    dispose() { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Native bridge disposed')); } pending.clear(); },
  };
  return bridge;
}
