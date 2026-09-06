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

export default async function handler(request: Request): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  const origin = request.headers.get('origin');
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
  if (origin && allowed.includes(origin)) { headers['access-control-allow-origin'] = origin; headers['access-control-allow-headers'] = 'authorization, content-type'; headers['access-control-allow-methods'] = 'POST, OPTIONS'; }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    await ready;
    const raw = await request.text(); if (raw.length > 20000) return new Response('Too large', { status: 413 });
    const action = new URL(request.url).pathname.slice('/api/'.length);
    if (action === 'webhook') {
      if (!payments) throw new Error('Stripe is not configured');
      const event = await payments.verifyWebhook(raw, request.headers.get('stripe-signature') ?? '');
      // Production fulfillment must deduplicate event.id in durable storage.
      return new Response(JSON.stringify({ received: event.id }), { headers });
    }
    const input = JSON.parse(raw || '{}');
    let token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const auth = createAuth(createLocalAuth({ data: adapter, getToken: () => token, setToken: value => { token = value; } }));
    let result: unknown;
    if (action === 'signup') result = { session: await auth.signUp(input), token };
    else if (action === 'signin') result = { session: await auth.signIn(input), token };
    else if (action === 'signout') { await auth.signOut(); result = { token: null }; }
    else {
      const { user } = await auth.requireSession();
      if (action === 'notes') result = { notes: await saveNote(user.id, String(input.text ?? '')) };
      else if (action === 'upload') result = await storage.upload(`${user.id}/${randomUUID()}.txt`, String(input.text ?? ''), { contentType: 'text/plain' });
      else if (action === 'checkout' || action === 'portal') {
        if (!payments || !process.env.APP_URL || !process.env.STRIPE_PRICE_ID) return new Response(JSON.stringify({ error: 'Configure Stripe and APP_URL on the server' }), { status: 503, headers });
        let [customer] = await adapter.query('billing_customers', { where: { id: user.id } });
        if (!customer) { const created = await payments.createCustomer({ email: user.email }); [customer] = await adapter.insert('billing_customers', { id: user.id, customer_id: created.id }); }
        result = action === 'portal' ? await payments.createPortal(String(customer.customer_id), process.env.APP_URL) : await payments.createCheckout({ priceId: process.env.STRIPE_PRICE_ID, customerId: String(customer.customer_id), successUrl: process.env.APP_URL, cancelUrl: process.env.APP_URL });
      } else return new Response('Not found', { status: 404 });
    }
    return new Response(JSON.stringify(result), { headers });
  } catch { return new Response(JSON.stringify({ error: 'Request failed; check credentials and server configuration' }), { status: 400, headers }); }
}
