import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { DataAdapter } from '@onestack/data';
import type { AuthAdapter, AuthSession, AuthUser } from './index.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const key = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, 64, (error, result) => error ? reject(error) : resolve(result)));
const emailAddress = (email: string) => { const value = email.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Invalid email'); return value; };
export const authMigrations = [{ id: 'onestack_auth_1', up: `CREATE TABLE IF NOT EXISTS os_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password TEXT);
CREATE TABLE IF NOT EXISTS os_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES os_users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS os_magic_links (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES os_users(id), expires_at TEXT NOT NULL);` }];

/** Construct per request; token storage and delivery belong to the HTTP/native boundary. */
export function createLocalAuth(options: { data: DataAdapter; getToken(): string | undefined; setToken(token: string | undefined): void; sessionSeconds?: number; sendMagicLink?(email: string, token: string): Promise<void> }): AuthAdapter & { consumeMagicLink(token: string): Promise<AuthSession> } {
  const db = options.data, lifetime = options.sessionSeconds ?? 86400;
  if (!Number.isSafeInteger(lifetime) || lifetime < 1) throw new Error('Invalid session lifetime');
  const publicUser = (row: Record<string, unknown>): AuthUser => ({ id: String(row.id), email: String(row.email), name: row.name ? String(row.name) : undefined });
  async function session(user: AuthUser) {
    const token = randomBytes(32).toString('base64url'), expiresAt = new Date(Date.now() + lifetime * 1000).toISOString();
    await db.insert('os_sessions', { id: digest(token), user_id: user.id, expires_at: expiresAt });
    options.setToken(token); return { user, expiresAt };
  }
  return {
    provider: 'local',
    async getSession() {
      const token = options.getToken(); if (!token) return null;
      const [stored] = await db.query('os_sessions', { where: { id: digest(token) } });
      if (!stored || String(stored.expires_at) <= new Date().toISOString()) return null;
      const [user] = await db.query('os_users', { where: { id: stored.user_id } });
      return user ? { user: publicUser(user), expiresAt: String(stored.expires_at) } : null;
    },
    async signUp(input) {
      if (!input.password || input.password.length < 12 || input.password.length > 1024) throw new Error('Password must contain 12–1024 characters');
      const salt = randomBytes(16).toString('hex'), hash = await key(input.password, salt);
      const [user] = await db.insert('os_users', { id: randomUUID(), email: emailAddress(input.email), name: input.name ?? null, password: `${salt}:${hash.toString('hex')}` });
      return session(publicUser(user));
    },
    async signIn(input) {
      if (input.provider) throw new Error('Configure an OAuth adapter for provider sign-in');
      const [user] = await db.query('os_users', { where: { email: emailAddress(input.email ?? '') } });
      const [salt, expected] = String(user?.password ?? '00000000000000000000000000000000:' + '00'.repeat(64)).split(':');
      const password = input.password ?? ''; if (password.length > 1024) throw new Error('Invalid credentials');
      const actual = await key(password, salt);
      if (!user || !expected || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new Error('Invalid credentials');
      return session(publicUser(user));
    },
    async signOut() { const token = options.getToken(); if (token) await db.delete('os_sessions', { where: { id: digest(token) } }); options.setToken(undefined); },
    async magicLink(email) {
      if (!options.sendMagicLink) throw new Error('Configure sendMagicLink');
      const [user] = await db.query('os_users', { where: { email: emailAddress(email) } });
      if (!user) return;
      const token = randomBytes(32).toString('base64url');
      await db.insert('os_magic_links', { id: digest(token), user_id: user.id, expires_at: new Date(Date.now() + 600000).toISOString() });
      await options.sendMagicLink(email, token);
    },
    async consumeMagicLink(token) {
      const user = await db.transaction(async tx => {
        const [link] = await tx.query('os_magic_links', { where: { id: digest(token) } });
        if (!link || String(link.expires_at) <= new Date().toISOString()) throw new Error('Invalid or expired magic link');
        if (await tx.delete('os_magic_links', { where: { id: digest(token) } }) !== 1) throw new Error('Magic link already consumed');
        const [user] = await tx.query('os_users', { where: { id: link.user_id } }); if (!user) throw new Error('User not found'); return publicUser(user);
      });
      return session(user);
    },
  };
}
