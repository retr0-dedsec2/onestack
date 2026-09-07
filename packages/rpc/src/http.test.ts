import { expect, it } from 'vitest';
import { ApiError, createApiClient, createApiHandler } from './http.js';
type Contract = { echo: { input: { text: string }; output: { text: string } } };
const handler = createApiHandler<Contract>({ echo: { parse(value) { if (typeof (value as any)?.text !== 'string') throw new Error('invalid'); return value as { text: string }; }, handle: input => input } }, { maxBodyBytes: 64, allowedOrigins: ['https://mobile.example'] });
const request = (body: string, headers = {}) => new Request('https://api.example/api/echo', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
it('shares a typed contract over HTTP and validates the request boundary', async () => {
  const client = createApiClient<Contract>({ origin: 'https://api.example', fetch: async (url, init) => handler(new Request(url, init)) });
  expect(await client('echo', { text: 'hello' })).toEqual({ text: 'hello' });
  expect((await handler(request('{'))).status).toBe(400);
  expect((await handler(request('{"text":1}'))).status).toBe(400);
  expect((await handler(request(JSON.stringify({ text: 'x'.repeat(100) })))) .status).toBe(413);
  expect((await handler(request('{}', { origin: 'https://evil.example' })))).toHaveProperty('status', 403);
  expect((await handler(request('{"text":"ok"}', { origin: 'https://mobile.example' }))).headers.get('access-control-allow-origin')).toBe('https://mobile.example');
  expect((await handler(new Request('https://api.example/api/toString'))).status).toBe(404);
});
it('masks internal errors and keeps public errors actionable', async () => {
  const safe = createApiHandler<Contract>({ echo: { parse: () => ({ text: '' }), handle: () => { throw new Error('postgres://secret'); } } });
  expect(await (await safe(request('{}'))).text()).not.toContain('secret');
  let cleared = false;
  const client = createApiClient<Contract>({ onUnauthorized: () => { cleared = true; }, fetch: async () => Response.json({ code: 'AUTH_REQUIRED', error: 'Sign in' }, { status: 401 }) });
  await expect(client('echo', { text: '' })).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  expect(cleared).toBe(true);
});
it('times out and cancels requests without retrying mutations', async () => {
  let calls = 0;
  const client = createApiClient<Contract>({ timeoutMs: 5, fetch: async (_, init) => { calls++; return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')))); } });
  await expect(client('echo', { text: '' })).rejects.toMatchObject({ code: 'TIMEOUT' });
  expect(calls).toBe(1);
  const abort = new AbortController(); abort.abort();
  const real = createApiClient<Contract>({ origin: 'http://localhost:1' });
  await expect(real('echo', { text: '' }, { signal: abort.signal })).rejects.toMatchObject({ code: 'ABORTED' });
});
it('rejects credential-bearing origins and malformed server responses', async () => {
  expect(() => createApiClient({ origin: 'https://user:secret@api.example' })).toThrow();
  const client = createApiClient<Contract>({ fetch: async () => new Response('<html>proxy failed</html>', { status: 502 }) });
  await expect(client('echo', { text: '' })).rejects.toBeInstanceOf(ApiError);
});
