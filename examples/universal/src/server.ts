import { createApiHandler, ApiError } from '@onestack/rpc';
import type { AppApi } from './contract.js';
import { randomUUID } from 'node:crypto';
import { createLocalAuth } from '@onestack/auth/local';
import { createAuth } from '@onestack/auth';
import { server } from '@onestack/server';
import { adapter, ready, storage, payments } from './services.server.js';

// An authenticated server function; identity is supplied by the request boundary.
export const saveNote = server(async (userId: string, text: string) => {
  if (text.length > 10000) throw new Error('Note is too long');
  await adapter.insert('notes', { id: randomUUID(), user_id: userId, text });
  return adapter.query('notes', { where: { user_id: userId } });
}, { id: 'notes.save' });

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected object');
  return input as Record<string, unknown>;
}
function credentials(input: unknown) {
  const value = object(input);
  if (typeof value.email !== 'string' || typeof value.password !== 'string' || value.email.length > 320 || value.password.length > 1024) throw new Error('Invalid credentials');
  return { email: value.email, password: value.password };
}
function noteInput(input: unknown) {
  const value = object(input);
  if (typeof value.text !== 'string' || value.text.length > 10000) throw new Error('Invalid note');
  return { text: value.text };
}
function empty(input: unknown): Record<string, never> { object(input); return {}; }
function authFor(request: Request) {
  let token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  const auth = createAuth(createLocalAuth({ data: adapter, getToken: () => token, setToken: value => { token = value; } }));
  return { auth, token: () => token };
}
async function requireUser(request: Request) {
  await ready;
  try { return (await authFor(request).auth.requireSession()).user; }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'AUTH_REQUIRED') throw new ApiError('AUTH_REQUIRED', 'Sign in to continue', 401);
    throw error;
  }
}
async function billing(request: Request, portal: boolean) {
  const user = await requireUser(request);
  if (!payments || !process.env.APP_URL || !process.env.STRIPE_PRICE_ID) throw new ApiError('NOT_CONFIGURED', 'Configure Stripe and APP_URL on the server', 503);
  let [customer] = await adapter.query('billing_customers', { where: { id: user.id } });
  if (!customer) {
    // A deterministic Stripe idempotency key would be needed for concurrent provisioning in a production app.
    const created = await payments.createCustomer({ email: user.email });
    [customer] = await adapter.insert('billing_customers', { id: user.id, customer_id: created.id });
  }
  return portal ? payments.createPortal(String(customer.customer_id), process.env.APP_URL) : payments.createCheckout({ priceId: process.env.STRIPE_PRICE_ID, customerId: String(customer.customer_id), successUrl: process.env.APP_URL, cancelUrl: process.env.APP_URL });
}
const api = createApiHandler<AppApi>({
  signup: { parse: credentials, async handle(input, request) { await ready; const context = authFor(request); await context.auth.signUp(input); return { token: context.token() }; } },
  signin: { parse: credentials, async handle(input, request) {
    await ready; const context = authFor(request);
    try { await context.auth.signIn(input); } catch { throw new ApiError('SIGNIN_FAILED', 'Unable to sign in with these credentials', 401); }
    return { token: context.token() };
  } },
  signout: { parse: empty, async handle(_, request) { await ready; await authFor(request).auth.signOut(); return { token: null }; } },
  notes: { parse: noteInput, async handle(input, request) { const user = await requireUser(request); return { notes: (await saveNote(user.id, input.text)).map(row => ({ text: String(row.text) })) }; } },
  upload: { parse: noteInput, async handle(input, request) { const user = await requireUser(request); return storage.upload(`${user.id}/${randomUUID()}.txt`, input.text, { contentType: 'text/plain' }); } },
  checkout: { parse: empty, handle: (_, request) => billing(request, false) },
  portal: { parse: empty, handle: (_, request) => billing(request, true) },
}, { allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean), maxBodyBytes: 20000, onError: error => console.error('OneStack API failure', error) });

export default async function handler(request: Request): Promise<Response> {
  if (new URL(request.url).pathname !== '/api/webhook') return api(request);
  if (request.method !== 'POST') return Response.json({ error: 'Use POST' }, { status: 405 });
  if (!payments) return Response.json({ error: 'Stripe is not configured' }, { status: 503 });
  try {
    // Bound the raw webhook bytes before signature verification; never parse/re-serialize them.
    const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (reader) { try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 65536) { await reader.cancel(); return Response.json({ error: 'Too large' }, { status: 413 }); } chunks.push(next.value); } } finally { reader.releaseLock(); } }
    const raw = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
    const event = await payments.verifyWebhook(raw, request.headers.get('stripe-signature') ?? '');
    // Production fulfillment must deduplicate event.id in durable storage.
    return Response.json({ received: event.id });
  } catch { return Response.json({ error: 'Invalid webhook' }, { status: 400 }); }
}
