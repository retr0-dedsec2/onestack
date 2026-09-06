import { expect, it } from 'vitest';
import { createSQLiteAdapter } from '../../data/src/sqlite.js';
import { createLocalAuth, authMigrations } from './local.js';
import { createAuth } from './index.js';
it('persists users, isolates sessions, revokes logout and consumes magic links once', async () => {
  const data = createSQLiteAdapter(); await data.migrate!(authMigrations);
  let token: string | undefined, magic = '';
  const adapter = createLocalAuth({ data, getToken: () => token, setToken: value => { token = value; }, sendMagicLink: async (_, value) => { magic = value; } });
  const auth = createAuth(adapter);
  try {
    await auth.signUp({ email: 'person@example.com', password: 'a long test password' });
    expect((await auth.requireSession()).user.email).toBe('person@example.com');
    const independent = createLocalAuth({ data, getToken: () => undefined, setToken: () => {} });
    expect(await independent.getSession()).toBeNull();
    const stored = (await data.query('os_users'))[0]; expect(stored.password).not.toContain('a long test password');
    await auth.signOut(); expect(await auth.getSession()).toBeNull();
    await expect(auth.signIn({ email: 'person@example.com', password: 'incorrect' })).rejects.toThrow('credentials');
    await auth.signIn({ email: 'person@example.com', password: 'a long test password' });
    await auth.magicLink('person@example.com'); await adapter.consumeMagicLink(magic);
    await expect(adapter.consumeMagicLink(magic)).rejects.toThrow();
  } finally { await data.close(); }
});
