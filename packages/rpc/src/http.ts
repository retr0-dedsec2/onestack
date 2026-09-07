export type ApiContract = Record<string, { input: unknown; output: unknown }>;

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 0) { super(message); this.name = 'ApiError'; }
}

/** Shared typed JSON client. Mutations are never retried automatically. */
export function createApiClient<Contract extends ApiContract>(options: {
  origin?: string; timeoutMs?: number; fetch?: typeof fetch;
  token?: () => string | undefined; onUnauthorized?: () => void;
}) {
  const timeout = options.timeoutMs ?? 15000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('timeoutMs must be positive');
  let origin = options.origin ?? '';
  if (origin) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('API origin must be an HTTP(S) origin without credentials or a path');
    origin = url.origin;
  }
  return async <Name extends keyof Contract & string>(name: Name, input: Contract[Name]['input'], options2: { signal?: AbortSignal } = {}): Promise<Contract[Name]['output']> => {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new ApiError('INVALID_ACTION', 'Invalid API action');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    const abort = () => controller.abort();
    options2.signal?.addEventListener('abort', abort, { once: true });
    if (options2.signal?.aborted) abort();
    try {
      const token = options.token?.();
      const response = await (options.fetch ?? fetch)(`${origin}/api/${name}`, {
        method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input),
      });
      if (response.status === 401) options.onUnauthorized?.();
      let value: any;
      try { value = await response.json(); } catch { throw new ApiError('INVALID_RESPONSE', 'The server returned an invalid JSON response', response.status); }
      if (!response.ok) throw new ApiError(typeof value?.code === 'string' ? value.code : 'HTTP_ERROR', typeof value?.error === 'string' ? value.error : `Request failed (${response.status})`, response.status);
      return value as Contract[Name]['output'];
    } catch (error) {
      if (timedOut) throw new ApiError('TIMEOUT', 'The server took too long to respond');
      if (controller.signal.aborted) throw new ApiError('ABORTED', 'Request cancelled');
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR', 'Cannot reach the server');
    } finally { clearTimeout(timer); options2.signal?.removeEventListener('abort', abort); }
  };
}

export type ApiRoutes<C extends ApiContract> = { [K in keyof C]: {
  parse: (input: unknown) => C[K]['input'];
  handle: (input: C[K]['input'], request: Request) => C[K]['output'] | Promise<C[K]['output']>;
} };

/** A Fetch handler with bounded request bodies and safe, consistent failures. */
export function createApiHandler<C extends ApiContract>(routes: ApiRoutes<C>, options: {
  allowedOrigins?: string[]; maxBodyBytes?: number; onError?: (error: unknown) => void;
} = {}) {
  const limit = options.maxBodyBytes ?? 65536;
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('maxBodyBytes must be a positive integer');
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ 'cache-control': 'no-store', 'vary': 'Origin' });
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
    try {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) {
        if (!options.allowedOrigins?.includes(origin)) throw new ApiError('ORIGIN_DENIED', 'Origin is not allowed', 403);
        headers.set('access-control-allow-origin', origin);
        headers.set('access-control-allow-headers', 'authorization, content-type');
        headers.set('access-control-allow-methods', 'POST, OPTIONS');
      }
      const path = new URL(request.url).pathname;
      const name = path.startsWith('/api/') ? path.slice(5) : '';
      if (!Object.hasOwn(routes, name)) throw new ApiError('NOT_FOUND', 'Unknown API action', 404);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') { headers.set('allow', 'POST, OPTIONS'); throw new ApiError('METHOD_NOT_ALLOWED', 'Use POST', 405); }
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ApiError('CONTENT_TYPE', 'Expected application/json', 415);
      const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      if (reader) {
        try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > limit) { await reader.cancel(); throw new ApiError('BODY_TOO_LARGE', 'Request body is too large', 413); } chunks.push(next.value); } }
        finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let input: unknown;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiError('INVALID_JSON', 'Invalid JSON body', 400); }
      const route = routes[name];
      let parsed: unknown;
      try { parsed = route.parse(input); } catch { throw new ApiError('INVALID_INPUT', 'Invalid request fields', 400); }
      return json(await route.handle(parsed, request));
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status <= 599) return json({ code: error.code, error: error.message }, error.status);
      try { options.onError?.(error); } catch { /* Logging cannot break the response boundary. */ }
      return json({ code: 'INTERNAL_ERROR', error: 'The server could not complete the request' }, 500);
    }
  };
}
