import Stripe from 'stripe';
import type { PaymentsAdapter } from './index.js';

export function createStripePayments(options: { secretKey: string; webhookSecret: string; client?: Stripe }): PaymentsAdapter {
  if (!options.secretKey || !options.webhookSecret) throw new Error('Stripe secret key and webhook secret are required');
  const stripe = options.client ?? new Stripe(options.secretKey);
  function url(input: string) { const parsed = new URL(input); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid payment redirect URL'); return parsed.href; }
  return {
    provider: 'stripe',
    async createCustomer(input) { const customer = await stripe.customers.create(input); return { id: customer.id, email: customer.email ?? undefined }; },
    async createCheckout(input) {
      if (input.quantity !== undefined && (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)) throw new Error('Invalid checkout quantity');
      const session = await stripe.checkout.sessions.create({ mode: input.mode ?? 'subscription', customer: input.customerId, line_items: [{ price: input.priceId, quantity: input.quantity ?? 1 }], success_url: url(input.successUrl), cancel_url: url(input.cancelUrl) });
      if (!session.url) throw new Error('Stripe did not return a hosted checkout URL');
      return { id: session.id, url: session.url };
    },
    async createPortal(customerId, returnUrl) { const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: url(returnUrl) }); return { url: portal.url }; },
    async getSubscription(id) {
      const subscription = await stripe.subscriptions.retrieve(id);
      const end = subscription.items.data[0]?.current_period_end;
      return { id: subscription.id, customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id, status: subscription.status, currentPeriodEnd: end ? new Date(end * 1000).toISOString() : undefined };
    },
    async verifyWebhook(payload, signature) {
      const event = stripe.webhooks.constructEvent(typeof payload === 'string' ? payload : Buffer.from(payload), signature, options.webhookSecret);
      return { id: event.id, type: event.type, data: event.data.object, createdAt: new Date(event.created * 1000).toISOString() };
    },
  };
}
