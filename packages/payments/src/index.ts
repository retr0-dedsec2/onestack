export interface CheckoutInput { priceId: string; mode?: "payment" | "subscription"; customerId?: string; successUrl: string; cancelUrl: string; quantity?: number; }
export interface CheckoutSession { id: string; url: string; }
export interface Subscription { id: string; customerId: string; status: string; currentPeriodEnd?: string; }
export interface PaymentEvent { id: string; type: string; data: unknown; createdAt?: string; }
export interface PaymentsAdapter {
  readonly provider: string;
  createCustomer?(input: { email?: string; name?: string }): Promise<{ id: string; email?: string }>;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>;
  getSubscription?(id: string): Promise<Subscription | null>;
  verifyWebhook(payload: string | Uint8Array, signature: string): Promise<PaymentEvent>;
}
export class PaymentsClient {
  constructor(readonly adapter: PaymentsAdapter) {}
  createCustomer(input: { email?: string; name?: string }) { if (!this.adapter.createCustomer) throw new Error("Customer creation unsupported"); return this.adapter.createCustomer(input); }
  async dispatchWebhook(payload: string | Uint8Array, signature: string, handler: (event: PaymentEvent) => Promise<void>) { const event = await this.verifyWebhook(payload, signature); await handler(event); return event; }
  createCheckout(input: CheckoutInput) { return this.adapter.createCheckout(input); }
  createPortal(customerId: string, returnUrl: string) { return this.adapter.createPortal(customerId, returnUrl); }
  getSubscription(id: string) { if (!this.adapter.getSubscription) throw new Error(`OneStack payments: ${this.adapter.provider} does not expose subscriptions.`); return this.adapter.getSubscription(id); }
  verifyWebhook(payload: string | Uint8Array, signature: string) { return this.adapter.verifyWebhook(payload, signature); }
}
export function createPayments(adapter: PaymentsAdapter) { return new PaymentsClient(adapter); }
