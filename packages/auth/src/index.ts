export interface AuthUser { id: string; email?: string; name?: string; metadata?: Record<string, unknown>; }
export interface AuthSession { user: AuthUser; expiresAt?: string; token?: string; }
export interface SignInInput { email?: string; password?: string; provider?: string; redirectTo?: string; }
export interface AuthAdapter {
  readonly provider: string;
  getSession(): Promise<AuthSession | null>;
  signIn(input: SignInInput): Promise<AuthSession>;
  signOut(): Promise<void>;
  signUp?(input: { email: string; password?: string; name?: string }): Promise<AuthSession>;
  magicLink?(email: string, redirectTo?: string): Promise<void>;
}
export class AuthClient {
  constructor(readonly adapter: AuthAdapter) {}
  getSession() { return this.adapter.getSession(); }
  signIn(input: SignInInput) { return this.adapter.signIn(input); }
  signOut() { return this.adapter.signOut(); }
  async requireSession(): Promise<AuthSession> { const session = await this.getSession(); if (!session) throw new Error("OneStack auth: authentication required."); return session; }
}
export function createAuth(adapter: AuthAdapter) { return new AuthClient(adapter); }
export async function authGuard(auth: AuthClient) { return auth.requireSession(); }
