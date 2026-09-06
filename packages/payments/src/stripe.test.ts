import { expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { createStripePayments } from './stripe.js';
import { createPayments } from './index.js';
it('verifies the raw webhook before any dispatch and rejects altered/stale signatures', async () => {
  const secret = 'whsec_contract_test', stripe = new Stripe('sk_test_contract');
  const payments = createPayments(createStripePayments({ secretKey: 'sk_test_contract', webhookSecret: secret, client: stripe }));
  const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: { id: 'cs_test' } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const handler = vi.fn(async () => {});
  await payments.dispatchWebhook(payload, signature, handler);
  expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_test', data: { id: 'cs_test' } }));
  await expect(payments.dispatchWebhook(payload + ' ', signature, handler)).rejects.toThrow();
  await expect(payments.dispatchWebhook(payload, stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1 }), handler)).rejects.toThrow();
  expect(handler).toHaveBeenCalledTimes(1);
});
