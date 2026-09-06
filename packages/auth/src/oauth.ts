import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from './index.js';
export interface OAuthState { verifier: string; expiresAt: number; }
export interface OAuthOptions {
  clientId: string; clientSecret?: string; authorizationUrl: string; tokenUrl: string; userInfoUrl: string; redirectUri: string; scopes: string[];
  saveState(state: string, value: OAuthState): Promise<void>;
  /** Atomically take-and-delete state from request/session-bound durable storage. */
  takeState(state: string): Promise<OAuthState | null>;
  mapUser(profile: unknown): AuthUser;
  fetch?: typeof fetch;
}
/** OAuth2 authorization-code flow with PKCE. Provider profile mapping is explicit. */
export function createOAuthFlow(options: OAuthOptions) {
  for (const input of [options.authorizationUrl, options.tokenUrl, options.userInfoUrl, options.redirectUri]) {
    const url = new URL(input);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('OAuth endpoints require HTTPS');
  }
  const request = options.fetch ?? fetch;
  return {
    async begin() {
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
      await options.saveState(state, { verifier, expiresAt: Date.now() + 600000 });
      const url = new URL(options.authorizationUrl);
      const parameters = { response_type: 'code', client_id: options.clientId, redirect_uri: options.redirectUri, scope: options.scopes.join(' '), state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' };
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      return url.href;
    },
    async complete(code: string, state: string): Promise<AuthUser> {
      if (!code || !state) throw new Error('OAuth code and state required');
      const saved = await options.takeState(state);
      if (!saved || saved.expiresAt <= Date.now()) throw new Error('Invalid or expired OAuth state');
      const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: options.clientId, code, redirect_uri: options.redirectUri, code_verifier: saved.verifier });
      if (options.clientSecret) body.set('client_secret', options.clientSecret);
      const tokenResponse = await request(options.tokenUrl, { method: 'POST', body, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!tokenResponse.ok) throw new Error('OAuth token exchange failed');
      const token = await tokenResponse.json() as { access_token?: string; token_type?: string };
      if (!token.access_token || token.token_type?.toLowerCase() !== 'bearer') throw new Error('Invalid OAuth token response');
      const profile = await request(options.userInfoUrl, { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!profile.ok) throw new Error('OAuth profile request failed');
      const user = options.mapUser(await profile.json());
      if (!user.id) throw new Error('OAuth profile requires a stable provider user ID');
      return user;
    },
  };
}
