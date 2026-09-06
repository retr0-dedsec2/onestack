import { expect, it, vi } from 'vitest';
import { createOAuthFlow, type OAuthState } from './oauth.js';
it('binds PKCE and rejects reused or unknown OAuth state', async () => {
  const states = new Map<string, OAuthState>();
  const request = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'private', token_type: 'Bearer' })).mockResolvedValueOnce(Response.json({ sub: 'provider-user' }));
  const oauth = createOAuthFlow({ clientId: 'client', authorizationUrl: 'https://provider.example/authorize', tokenUrl: 'https://provider.example/token', userInfoUrl: 'https://provider.example/userinfo', redirectUri: 'https://app.example/callback', scopes: ['profile'], saveState: async (key, value) => { states.set(key, value); }, takeState: async key => { const result = states.get(key); states.delete(key); return result ?? null; }, mapUser: profile => ({ id: (profile as any).sub }), fetch: request });
  const url = new URL(await oauth.begin()), state = url.searchParams.get('state')!;
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(await oauth.complete('code', state)).toEqual({ id: 'provider-user' });
  await expect(oauth.complete('code', state)).rejects.toThrow('state'); expect(request).toHaveBeenCalledTimes(2);
});
